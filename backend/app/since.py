"""'What changed since you were here' — per-member board diff.

Baseline is BoardMembership.last_seen_at, stamped when the member's board
socket closes (they left). Changed cards come from Card.updated_at; the
story comes from the activity log. A short narration is written by the
model when there's enough to summarise, otherwise assembled from the log.
"""
from __future__ import annotations

import datetime
import json
import re

import httpx
from openai import OpenAI
from sqlalchemy.orm import Session

from . import models
from .config import settings

MAX_ENTRIES = 40
NARRATE_WITH_MODEL_FROM = 4  # fewer entries than this → deterministic sentence

NARRATION_PROMPT = """Summarise what changed on a kanban board while a teammate was away, in ONE or TWO short
sentences addressed to that teammate. Every line in the input is one change; be exact about counts and
card names — never state a number or an action that is not literally in the list. Group identical kinds
of change together, name people by first name, and call out the specifics that matter (deadline changes,
deletions, new columns). Plain language, no ids, no emails, no bullet points, under 220 characters.
Output JSON: {"text": "..."}."""

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


Names = dict[str, str]  # email (lower) -> display name, from the board's members


def _who(user_email: str, names: Names) -> str:
    if user_email.startswith("AI"):
        return "the assistant"
    return names.get(user_email.lower()) or user_email.split("@")[0].replace(".", " ").title()


def _clean(text: str, names: Names) -> str:
    return _EMAIL.sub(lambda m: _who(m.group(0), names), text)


def _deterministic(entries: list[models.ActivityLog], names: Names) -> str:
    parts = [f"{_who(e.user_email, names)} {_clean(e.action_text, names)}" for e in entries[:3]]
    text = "; ".join(parts)
    if len(entries) > 3:
        text += f"; and {len(entries) - 3} more"
    return text[:1].upper() + text[1:] + "."


def narrate(entries: list[models.ActivityLog], names: Names) -> str:
    if not entries:
        return ""
    if len(entries) < NARRATE_WITH_MODEL_FROM or not settings.openai_api_key:
        return _deterministic(entries, names)
    lines = "\n".join(
        f"- {e.created_at.strftime('%a %H:%M')} {_who(e.user_email, names)}: {_clean(e.action_text, names)}"
        for e in entries
    )
    try:
        client = OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client(timeout=20))
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": NARRATION_PROMPT},
                      {"role": "user", "content": f"{len(entries)} changes:\n{lines}"}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        text = str(json.loads(completion.choices[0].message.content).get("text", "")).strip()
        return text or _deterministic(entries, names)
    except Exception as exc:
        print(f"[since] narration fallback: {exc.__class__.__name__}: {exc}")
        return _deterministic(entries, names)


def changes_since(board: models.Board, membership: models.BoardMembership, db: Session) -> dict:
    names: Names = {m.user.email.lower(): m.user.full_name.strip() for m in board.memberships if m.user.full_name}
    since = membership.last_seen_at
    now = datetime.datetime.utcnow()
    if since is None:
        # First visit: establish a baseline, nothing to report.
        membership.last_seen_at = now
        db.commit()
        return {"since": None, "first_visit": True, "changed_card_ids": [], "entries": [], "narration": "", "count": 0}

    entries = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.board_id == board.id, models.ActivityLog.created_at > since)
        .order_by(models.ActivityLog.id.asc())
        .limit(MAX_ENTRIES)
        .all()
    )
    changed = [
        c.id
        for lst in board.lists
        for c in lst.cards
        if (c.updated_at or c.created_at) and (c.updated_at or c.created_at) > since
    ]
    return {
        "since": since,
        "first_visit": False,
        "changed_card_ids": changed,
        "entries": [
            {"id": e.id, "when": e.created_at, "who": _who(e.user_email, names), "text": _clean(e.action_text, names)}
            for e in entries
        ],
        "narration": narrate(entries, names),
        "count": len(entries),
    }


def mark_seen(board_id: int, user_id: int, db: Session) -> None:
    m = db.query(models.BoardMembership).filter_by(board_id=board_id, user_id=user_id).first()
    if m is not None:
        m.last_seen_at = datetime.datetime.utcnow()
        db.commit()
