"""Board agent: a streaming, tool-calling assistant scoped to one board.

POST /agent/chat streams Server-Sent Events:
  {"type":"delta","text":...}      partial reply text (streamed as generated)
  {"type":"plan", ...}             actions need confirmation (bulk/destructive/duplicates)
  {"type":"done","reply":...,"applied":[...]}   finished (actions applied, if any)
  {"type":"error","message":...}
POST /agent/confirm applies a previously returned plan (optionally skipping items).
"""
import json
import time
import uuid
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..agent_actions import (
    TOOLS,
    PlannedAction,
    apply_plan,
    board_context,
    build_plan,
    needs_confirmation,
)
from ..config import settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user, require_board_access
from ..embeddings import embed_card_in_background
from ..websockets import notify

router = APIRouter(prefix="/api/boards/{board_id}/agent", tags=["agent"])

MODEL = "gpt-4o-mini"
MAX_HISTORY = 12
RATE_LIMIT = 30  # per user per minute
PLAN_TTL_SECONDS = 15 * 60

_hits: dict[int, deque] = defaultdict(deque)
# plan_id -> {board_id, user_id, plan, prompt, created}
_pending: dict[str, dict] = {}


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_HISTORY)


class ConfirmRequest(BaseModel):
    plan_id: str
    skip: list[int] = []  # indices of actions the user unticked


SYSTEM_PROMPT = """You are the planning assistant for one Stack Board kanban board. You can answer
questions about the board and change it using the tools provided. The full board (lists, cards with
ids, labels, due dates, recent activity) is in the context message.

Acting:
- Use tools for anything that changes the board: create, move, update, complete/reopen, delete cards;
  add or rename columns. Never describe a change without making the tool call.
- Reference cards and lists by the ids in the context. If a request is ambiguous ("the login card" when
  two match), ask which one instead of guessing.
- "Done", "finished", "complete" → move the card to the done column (or set completed if there is none).
- Bulk requests ("move everything overdue to Todo", "delete all completed cards") → one tool call per card.
- New cards: short imperative title; one useful sentence of description when you can infer one; reuse the
  board's existing labels rather than inventing new spellings; only invent a label if the user asked.
- Dates: put the user's phrase in `due` EXACTLY as written ("Friday", "next week", "Sep 20") — never
  convert it yourself. If the user gave no date, leave `due` null; only use `suggested_due` when a date is
  strongly implied.

Answering:
- For questions (what's overdue, what did X do, summarise for standup, how many cards…) answer from the
  context in plain, concise language. Use short bullet lists for more than two items.
- Never invent cards or people that aren't in the context.

Tone: brief and friendly. After tool calls, one short sentence is enough — the app shows the details.
"""


def _check_rate_limit(user_id: int) -> None:
    now = time.time()
    q = _hits[user_id]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests — try again in a minute.")
    q.append(now)


def _bootstrap_empty_board(board: models.Board, db: Session) -> bool:
    if board.lists:
        return False
    for idx, name in enumerate(["Todo", "In Progress", "Done"], start=1):
        db.add(models.List(name=name, board_id=board.id, position=idx))
    db.add(models.ActivityLog(board_id=board.id, user_email="AI Agent",
                              action_text="set up the standard columns (Todo, In Progress, Done)"))
    db.commit()
    db.refresh(board)
    for lst in board.lists:
        notify(board.id, {"type": "list_created", "list_id": lst.id, "refresh_logs": True})
    return True


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _summarise(applied: list[str]) -> str:
    if not applied:
        return ""
    if len(applied) == 1:
        return applied[0] + "."
    return "Done — " + "; ".join(applied[:6]) + ("…" if len(applied) > 6 else "") + "."


@router.post("/chat")
def agent_chat(
    board_id: int,
    payload: ChatRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user)
    if not settings.openai_api_key:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED,
                            detail="OpenAI API key is missing. Add OPENAI_API_KEY to your environment.")
    _check_rate_limit(user.id)
    bootstrapped = _bootstrap_empty_board(board, db)
    user_id = user.id

    history = [{"role": m.role, "content": m.content} for m in payload.messages[-MAX_HISTORY:]]
    prompt = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")

    def stream():
        # The request's session may be closed once streaming starts, so the
        # generator owns its own session and re-loads the board/user in it.
        sdb = SessionLocal()
        try:
            yield from _run(sdb)
        finally:
            sdb.close()

    def _run(sdb: Session):
        board = sdb.get(models.Board, board_id)
        user = sdb.get(models.User, user_id)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": board_context(board, sdb)},
            *history,
        ]
        reply_parts: list[str] = []
        calls: dict[int, dict] = {}  # index -> {id, name, arguments}
        try:
            client = OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client(timeout=60))
            completion = client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOLS, tool_choice="auto",
                temperature=0.3, stream=True,
            )
            if bootstrapped:
                text = "I set up Todo / In Progress / Done columns for you. "
                reply_parts.append(text)
                yield _sse({"type": "delta", "text": text})
            for chunk in completion:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta is None:
                    continue
                if delta.content:
                    reply_parts.append(delta.content)
                    yield _sse({"type": "delta", "text": delta.content})
                for tc in delta.tool_calls or []:
                    slot = calls.setdefault(tc.index, {"id": tc.id, "name": "", "arguments": ""})
                    if tc.id:
                        slot["id"] = tc.id
                    if tc.function and tc.function.name:
                        slot["name"] += tc.function.name
                    if tc.function and tc.function.arguments:
                        slot["arguments"] += tc.function.arguments
        except Exception as exc:
            print(f"[agent] {exc.__class__.__name__}: {exc}")
            yield _sse({"type": "error", "message": "I couldn't reach the AI model. Please try again."})
            return

        tool_calls = []
        for idx in sorted(calls):
            try:
                tool_calls.append((calls[idx]["name"], json.loads(calls[idx]["arguments"] or "{}")))
            except json.JSONDecodeError:
                continue

        reply = "".join(reply_parts).strip()
        if not tool_calls:
            yield _sse({"type": "done", "reply": reply, "applied": []})
            return

        plan = build_plan(tool_calls, board)
        if needs_confirmation(plan):
            plan_id = uuid.uuid4().hex
            _pending[plan_id] = {"board_id": board_id, "user_id": user_id, "plan": plan,
                                 "prompt": prompt, "created": time.time()}
            _prune_pending()
            live = [p for p in plan if not p.error]
            intro = reply or f"I'd make {len(live)} change{'s' if len(live) != 1 else ''}. Please review:"
            yield _sse({"type": "plan", "plan_id": plan_id, "reply": intro,
                        "actions": [p.to_public(i) for i, p in enumerate(plan)]})
            return

        applied, to_embed = apply_plan(plan, board, user, sdb, prompt)
        for cid in to_embed:
            background.add_task(embed_card_in_background, cid)
        skipped = [p.description for p in plan if p.error]
        final = reply or _summarise(applied)
        if skipped:
            final += " (Skipped: " + "; ".join(skipped) + ")"
        yield _sse({"type": "done", "reply": final, "applied": applied})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/confirm")
def agent_confirm(
    board_id: int,
    payload: ConfirmRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user)
    _prune_pending()
    entry = _pending.pop(payload.plan_id, None)
    if entry is None or entry["board_id"] != board_id or entry["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="That plan has expired — ask again.")

    plan: list[PlannedAction] = entry["plan"]
    for i in payload.skip:
        if 0 <= i < len(plan):
            plan[i].error = "skipped by user"

    # The board may have changed since the plan was made; re-validate ids.
    ids_cards = {c.id for l in board.lists for c in l.cards}
    ids_lists = {l.id for l in board.lists}
    for p in plan:
        if p.error:
            continue
        cid = p.args.get("card_id")
        lid = p.args.get("list_id")
        if cid is not None and int(cid) not in ids_cards:
            p.error = "card no longer exists"
        if lid is not None and int(lid) not in ids_lists:
            p.error = "list no longer exists"

    applied, to_embed = apply_plan(plan, board, user, db, entry["prompt"])
    for cid in to_embed:
        background.add_task(embed_card_in_background, cid)
    skipped = [p.description for p in plan if p.error and p.error != "skipped by user"]
    reply = _summarise(applied) or "Nothing was applied."
    if skipped:
        reply += " (Couldn't apply: " + "; ".join(skipped) + ")"
    return {"reply": reply, "applied": applied}


def _prune_pending() -> None:
    cutoff = time.time() - PLAN_TTL_SECONDS
    for k in [k for k, v in _pending.items() if v["created"] < cutoff]:
        _pending.pop(k, None)
