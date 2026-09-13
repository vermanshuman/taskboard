"""Public (unauthenticated) assistant for the landing page.

Two jobs: answer questions about Stack Board, and on request show how the
planning agent would split a request into cards -- as a preview only. It has
no access to boards or users, and is rate-limited per IP because it's open.
"""
import json
import time
from collections import defaultdict, deque

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from openai import OpenAI
from pydantic import BaseModel, Field

from ..config import settings
from ..domain import resolve_due_phrase

router = APIRouter(prefix="/api/public/assistant", tags=["public"])

RATE_LIMIT = 20  # requests
RATE_WINDOW = 60  # seconds
MAX_MESSAGES = 8  # conversation turns sent to the model
MAX_CONTENT = 1000  # chars per message

_hits: dict[str, deque] = defaultdict(deque)


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=MAX_CONTENT)


class AssistantRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)


class PreviewCard(BaseModel):
    title: str
    column: str = "Todo"
    labels: str = ""
    due: str | None = None  # phrase from the model; resolved into due_date_iso
    due_date_iso: str | None = None


class AssistantResponse(BaseModel):
    reply: str
    preview_cards: list[PreviewCard] = []
    source: str  # "ai" | "faq"


PRODUCT_FACTS = """
Stack Board is a real-time, Trello-style collaborative task board (a portfolio project).

Core features:
- Boards → lists (columns) → cards. Drag cards between and within columns. Inline rename/delete lists.
- Live sync over WebSockets: every change appears instantly for everyone with the board open.
- Live presence: see who else is viewing a board (avatars).
- Sharing: the board owner invites registered users by email; members can leave.
- Cards have a title, description, labels, due date, and one file attachment (up to 10 MB).
- Due-date colouring (overdue red, due within 24h amber) and reminder toasts from a background job.
- Activity feed: every action is logged ("moved card X to Done") with paging.
- Metrics panel: cards per column and completed-per-week.
- Profile: display name and avatar colour.

AI features (OpenAI):
- Planning agent: describe tasks in plain language ("fix the login bug by Friday and write docs") and it
  creates cards in the right columns with labels and dates. On an empty board it creates Todo / In Progress / Done first.
- Semantic search: find cards by meaning using embeddings, even when the words differ.

Auth: email + password, or Google sign-in. JWT sessions.
Demo account: demo@taskboard.dev / demo1234 (pre-seeded with a sample board).

Tech stack: Next.js 16 (App Router, React 19) frontend; FastAPI (Python) + SQLAlchemy 2 backend; SQLite by
default, Postgres in Docker/production; Redis pub/sub optional for multi-instance realtime; OpenAI
(gpt-4o-mini + text-embedding-3-small); Docker Compose.

Things it does NOT have (don't invent them): mobile apps, comments on cards, notifications by email,
Slack/webhook integrations, billing, multiple workspaces, checklists inside cards, calendar view.
"""

SYSTEM_PROMPT = """You are the friendly guide on the Stack Board landing page. Visitors are not signed in.
Answer questions about the product using ONLY the facts below. If asked about something the product
doesn't have, say so plainly and suggest the closest thing it does have. Keep answers short (2-5
sentences), concrete, and in plain language. Never claim to see or change the visitor's data.

If the visitor describes work they want to plan (e.g. "launch the newsletter by Friday"), demonstrate
the planning agent: split it into task cards in `preview_cards` (title, column from Todo / In Progress /
Done, optional labels, and `due` = the visitor's date phrase copied EXACTLY as written, e.g. "Friday",
"tomorrow", "next week", "Sep 20" -- never convert it to a date yourself; null if that task had no date)
and explain in `reply` that this is a preview -- signing in lets the real agent create them on a board.

Respond strictly as JSON: {"reply": "...", "preview_cards": [{"title": "...", "column": "Todo",
"labels": "", "due": null}]}. Use an empty list when no tasks were requested.

Product facts:
""" + PRODUCT_FACTS


# Keyword fallback so the landing page still answers common questions when no
# OpenAI key is configured (e.g. a fresh clone of the repo).
FAQ = [
    (("price", "cost", "free", "billing", "pay"),
     "Stack Board is a free, open portfolio project — there's no billing. Use the demo account or create your own."),
    (("ai", "agent", "assistant", "plan"),
     "The planning agent turns plain language into cards: say \"fix the login bug by Friday and write docs\" and it "
     "creates both cards in the right columns with dates. Semantic search finds cards by meaning, not exact words."),
    (("search",),
     "Semantic search uses OpenAI embeddings, so searching \"login problems\" will find a card called "
     "\"Users can't sign in\". Open a board and click the search button in the corner."),
    (("share", "invite", "team", "collab", "member"),
     "Board owners invite teammates by email from the Share button. Everyone with the board open sees changes "
     "live, plus who else is viewing right now."),
    (("real time", "realtime", "live", "sync", "websocket"),
     "Every change is pushed over a WebSocket to everyone viewing the board, so drags, edits and new cards appear "
     "instantly without refreshing."),
    (("stack", "tech", "built", "technology", "framework", "next", "fastapi", "python"),
     "Next.js 16 on the front, FastAPI (Python) with SQLAlchemy on the back, SQLite or Postgres for data, Redis for "
     "multi-instance realtime, and OpenAI for the AI features. All in Docker Compose."),
    (("demo", "try", "login", "sign in", "account", "password"),
     "Use the demo account — demo@taskboard.dev / demo1234 — or create your own account in the form on this page. "
     "Google sign-in works too."),
    (("attach", "file", "upload"),
     "Each card can carry one file attachment up to 10 MB; only board members can download it."),
    (("due", "deadline", "remind"),
     "Cards can have due dates. Overdue cards turn red, cards due within 24 hours turn amber, and a background job "
     "sends a reminder toast to everyone on the board."),
    (("mobile", "app", "ios", "android"),
     "There's no native mobile app — it's a web app. The board view works best on a laptop-sized screen."),
]


def _faq_answer(text: str) -> str:
    lowered = text.lower()
    for keys, answer in FAQ:
        if any(k in lowered for k in keys):
            return answer
    return ("I can tell you about boards, live collaboration, sharing, the AI planning agent, semantic search, "
            "or the tech stack — what would you like to know? You can also sign in with the demo account to try it.")


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Slow down a little — try again in a minute.")
    q.append(now)


@router.post("", response_model=AssistantResponse)
def public_assistant(payload: AssistantRequest, request: Request):
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "unknown"
    )
    _check_rate_limit(ip)

    last_user = next((m.content for m in reversed(payload.messages) if m.role == "user"), "")

    if not settings.openai_api_key:
        return AssistantResponse(reply=_faq_answer(last_user), source="faq")

    system = SYSTEM_PROMPT
    try:
        client = OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client(timeout=30))
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in payload.messages[-MAX_MESSAGES:]],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        data = json.loads(completion.choices[0].message.content)
        cards = []
        for c in data.get("preview_cards", []):
            if not isinstance(c, dict) or not c.get("title"):
                continue
            card = PreviewCard(**{k: c.get(k) for k in ("title", "column", "labels", "due") if c.get(k) is not None})
            resolved = resolve_due_phrase(card.due)
            card.due_date_iso = resolved.isoformat() if resolved else None
            cards.append(card)
        return AssistantResponse(reply=str(data.get("reply", "")).strip() or _faq_answer(last_user),
                                 preview_cards=cards[:8], source="ai")
    except Exception as exc:
        print(f"[public-assistant] {exc.__class__.__name__}: {exc}")
        return AssistantResponse(reply=_faq_answer(last_user), source="faq")
