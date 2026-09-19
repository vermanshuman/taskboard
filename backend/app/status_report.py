"""Client-facing status report for a board.

Builds the numbers deterministically and asks the model for a short
narrative (summary / shipped / in progress / next / risks). The narrative is
cached on the board and refreshed lazily when the board has changed since,
with a throttle so a public page being hammered can't run up the bill.
Falls back to a data-only narrative when no OpenAI key is configured.
"""
from __future__ import annotations

import datetime
import json

import httpx
from openai import OpenAI
from sqlalchemy.orm import Session

from . import models
from .agent_actions import board_context
from .config import settings
from .domain import is_done_list

REGEN_THROTTLE = datetime.timedelta(minutes=10)
WEEK = datetime.timedelta(days=7)

NARRATIVE_PROMPT = """You write short, honest status updates for a client who does not use the board.
From the board context, produce JSON:
{
  "summary": "2-3 plain sentences on where the project stands — momentum, what matters this week.",
  "shipped": ["ONLY items from the provided shipped_last_7_days list, reworded briefly (max 6); [] if that list is empty"],
  "in_progress": ["what is actively being worked on now (max 6)"],
  "next": ["what is queued next, most important first (max 5)"],
  "risks": ["overdue, stale, or blocked items and why they matter (max 4); empty list if none"]
}
Rules: client-friendly language, no ids, no emails, no internal jargon; never invent work that isn't
in the context; "shipped" must not include anything completed earlier than 7 days ago even if it sits in
a Done column; keep each line under 90 characters; don't mention that you are an AI.
"""


def _shipped_recently(board: models.Board, now: datetime.datetime) -> list[str]:
    since = now - WEEK
    out = []
    for lst in board.lists:
        for c in lst.cards:
            done_at = c.completed_at
            if (c.completed or is_done_list(lst.name)) and done_at and done_at >= since:
                out.append(c.title)
    return out[:6]


def compute_stats(board: models.Board) -> dict:
    today = datetime.date.today()
    total = done = overdue = due_soon = stale = 0
    per_list = []
    for lst in board.lists:
        in_done = is_done_list(lst.name)
        per_list.append({"name": lst.name, "count": len(lst.cards), "is_done": in_done})
        for c in lst.cards:
            total += 1
            finished = bool(c.completed) or in_done
            if finished:
                done += 1
                continue
            if c.due_date:
                d = c.due_date.date()
                if d < today:
                    overdue += 1
                elif (d - today).days <= 3:
                    due_soon += 1
            last = c.updated_at or c.created_at
            if last and (datetime.datetime.utcnow() - last).days >= 14:
                stale += 1
    return {
        "total": total, "done": done, "open": total - done, "overdue": overdue,
        "due_soon": due_soon, "stale": stale,
        "percent": round(100 * done / total) if total else 0,
        "per_list": per_list,
        "shipped_last_7_days": _shipped_recently(board, datetime.datetime.utcnow()),
    }


def _fallback_narrative(board: models.Board, stats: dict) -> dict:
    now = datetime.datetime.utcnow()
    today = datetime.date.today()
    in_progress, nxt, risks = [], [], []
    for lst in board.lists:
        if is_done_list(lst.name):
            continue
        name = lst.name.lower()
        for c in lst.cards:
            if c.completed:
                continue
            if c.due_date and c.due_date.date() < today:
                risks.append(f"{c.title} is overdue (was due {c.due_date.strftime('%b %d')})")
            last = c.updated_at or c.created_at
            if last and (now - last).days >= 14:
                risks.append(f"{c.title} hasn't moved in {(now - last).days} days")
            if "progress" in name or "doing" in name or "review" in name:
                in_progress.append(c.title)
            else:
                nxt.append(c.title)
    shipped = _shipped_recently(board, now)
    summary = (
        f"{stats['done']} of {stats['total']} items are complete ({stats['percent']}%). "
        f"{len(in_progress)} in progress, {len(nxt)} queued."
        + (f" {stats['overdue']} overdue." if stats["overdue"] else "")
    )
    return {"summary": summary, "shipped": shipped, "in_progress": in_progress[:6],
            "next": nxt[:5], "risks": risks[:4]}


def generate_narrative(board: models.Board, db: Session, stats: dict) -> dict:
    fallback = _fallback_narrative(board, stats)
    if not settings.openai_api_key:
        return fallback
    try:
        client = OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client(timeout=45))
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": NARRATIVE_PROMPT},
                {"role": "system", "content": board_context(board, db)},
                {"role": "user", "content": f"Numbers: {json.dumps(stats)}. Write the status update."},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        data = json.loads(completion.choices[0].message.content)
        out = {}
        for key in ("summary", "shipped", "in_progress", "next", "risks"):
            val = data.get(key, fallback[key])
            if key == "summary":
                out[key] = str(val).strip() or fallback["summary"]
            else:
                out[key] = [str(x).strip() for x in (val if isinstance(val, list) else []) if str(x).strip()][:6]
        return out
    except Exception as exc:
        print(f"[status] narrative fallback: {exc.__class__.__name__}: {exc}")
        return fallback


def _last_change(board: models.Board, db: Session) -> datetime.datetime | None:
    log = (
        db.query(models.ActivityLog)
        .filter_by(board_id=board.id)
        .order_by(models.ActivityLog.id.desc())
        .first()
    )
    return log.created_at if log else None


def ensure_narrative(board: models.Board, db: Session, force: bool = False) -> dict:
    """Return the cached narrative, regenerating if the board changed since
    (throttled) or when forced. Persists on the board."""
    stats = compute_stats(board)
    now = datetime.datetime.utcnow()
    changed = _last_change(board, db)
    cached = None
    if board.status_narrative:
        try:
            cached = json.loads(board.status_narrative)
        except ValueError:
            cached = None
    gen_at = board.status_generated_at
    is_stale = cached is None or (changed is not None and gen_at is not None and changed > gen_at)
    throttled = gen_at is not None and (now - gen_at) < REGEN_THROTTLE

    if cached is not None and (not force) and (not is_stale or throttled):
        return cached

    narrative = generate_narrative(board, db, stats)
    board.status_narrative = json.dumps(narrative)
    board.status_generated_at = now
    db.commit()
    return narrative
