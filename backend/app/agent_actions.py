"""Actions the board agent can take, and how they're validated and applied.

The model proposes actions (via OpenAI tool calls); this module turns them
into a validated plan, flags anything worth a second look (duplicates,
deletions, suggested dates), and executes the plan with the same rules the
REST routes use (positions renumbered, completion follows "done" columns,
embeddings refreshed, every step logged to the activity feed).
"""
from __future__ import annotations

import datetime
import difflib
import os
import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .domain import is_done_list, resolve_due_phrase, set_completed, touch
from .embeddings import embed_text, rank_by_similarity
from .websockets import notify

DUPLICATE_EMBED_THRESHOLD = 0.80
DUPLICATE_FUZZY_THRESHOLD = 0.85
BULK_THRESHOLD = 3  # more actions than this → ask first


# ---- OpenAI tool schema --------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "create_card",
            "description": "Create a new card in a list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short imperative title, e.g. 'Fix login redirect'."},
                    "list_id": {"type": "integer", "description": "Target list id from the board context."},
                    "description": {"type": "string", "description": "One helpful sentence of context. Empty string if nothing useful to add."},
                    "labels": {"type": "string", "description": "Comma-separated labels, preferably reusing labels already on the board. Empty string if none."},
                    "due": {"type": ["string", "null"], "description": "The user's date phrase EXACTLY as written ('Friday', 'tomorrow', 'Sep 20'). null if the user gave no date."},
                    "suggested_due": {"type": ["string", "null"], "description": "Only when the user gave NO date but one is clearly implied (e.g. 'this sprint', 'urgent'): a date phrase you suggest. Otherwise null."},
                },
                "required": ["title", "list_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_card",
            "description": "Move a card to a list (and optionally a position within it).",
            "parameters": {
                "type": "object",
                "properties": {
                    "card_id": {"type": "integer"},
                    "list_id": {"type": "integer"},
                    "position": {"type": ["integer", "null"], "description": "1-based position in the target list; null = end."},
                },
                "required": ["card_id", "list_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_card",
            "description": "Change a card's title, description, labels, due date, or completed flag. Only include fields that change.",
            "parameters": {
                "type": "object",
                "properties": {
                    "card_id": {"type": "integer"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "labels": {"type": "string", "description": "The FULL new comma-separated label set (not just additions)."},
                    "due": {"type": ["string", "null"], "description": "New due date phrase exactly as the user wrote it."},
                    "clear_due": {"type": "boolean", "description": "true to remove the due date."},
                    "completed": {"type": "boolean"},
                },
                "required": ["card_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_card",
            "description": "Permanently delete a card.",
            "parameters": {
                "type": "object",
                "properties": {"card_id": {"type": "integer"}},
                "required": ["card_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_list",
            "description": "Add a new column to the board.",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rename_list",
            "description": "Rename a column.",
            "parameters": {
                "type": "object",
                "properties": {"list_id": {"type": "integer"}, "name": {"type": "string"}},
                "required": ["list_id", "name"],
            },
        },
    },
]


# ---- board context for the model --------------------------------------------

def board_context(board: models.Board, db: Session) -> str:
    """Everything the model needs to answer questions and reference ids."""
    today = datetime.date.today()
    lines = [
        f"Board: \"{board.name}\" (id {board.id}). Today is {today.strftime('%A')}, {today.isoformat()}.",
        f"Members: {', '.join(m.user.email for m in board.memberships)}.",
        "",
        "Lists and cards (use these ids in tool calls):",
    ]
    labels: set[str] = set()
    for lst in board.lists:
        in_done = is_done_list(lst.name)
        done = " [done column]" if in_done else ""
        lines.append(f"- List id={lst.id} \"{lst.name}\"{done} ({len(lst.cards)} cards)")
        for c in lst.cards:
            finished = bool(c.completed) or in_done
            bits = [f"  - Card id={c.id} \"{c.title}\""]
            if c.labels:
                bits.append(f"labels={c.labels}")
                labels.update(l.strip() for l in c.labels.split(",") if l.strip())
            if c.due_date:
                d = c.due_date.date()
                status = "OVERDUE" if d < today and not finished else ("due today" if d == today else "")
                bits.append(f"due={d.isoformat()}{' ' + status if status else ''}")
            if finished:
                bits.append("completed")
            else:
                last = c.updated_at or c.created_at
                if last:
                    idle = (datetime.datetime.utcnow() - last).days
                    if idle >= 7:
                        bits.append(f"untouched {idle}d (stale)")
            if c.description:
                bits.append(f"desc=\"{c.description[:80]}\"")
            lines.append(" ".join(bits))
    lines.append("")
    lines.append(f"Labels already used on this board: {', '.join(sorted(labels)) if labels else '(none yet)'}.")

    recent = (
        db.query(models.ActivityLog)
        .filter_by(board_id=board.id)
        .order_by(models.ActivityLog.id.desc())
        .limit(15)
        .all()
    )
    if recent:
        lines.append("")
        lines.append("Recent activity (newest first):")
        for log in recent:
            lines.append(f"- {log.created_at.strftime('%b %d %H:%M')} {log.user_email}: {log.action_text}")
    return "\n".join(lines)


# ---- plan: validated actions + flags -----------------------------------------

@dataclass
class PlannedAction:
    type: str
    args: dict[str, Any]
    description: str  # human-readable, shown in the confirm card
    flags: dict[str, Any] = field(default_factory=dict)  # duplicate, suggested_due, destructive
    error: str | None = None  # set when the action can't be applied (bad id etc.)

    def to_public(self, index: int) -> dict[str, Any]:
        return {
            "index": index,
            "type": self.type,
            "description": self.description,
            "flags": self.flags,
            "error": self.error,
        }


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (t or "").lower()).strip()


def _find_duplicate(title: str, board: models.Board) -> dict[str, Any] | None:
    """Best existing-card match for a new title: fuzzy title first (free),
    then embeddings if configured. Returns {card_id, title, score} or None."""
    cards = [c for lst in board.lists for c in lst.cards]
    if not cards:
        return None

    norm = _norm_title(title)
    best = None
    for c in cards:
        ratio = difflib.SequenceMatcher(None, norm, _norm_title(c.title)).ratio()
        if ratio >= DUPLICATE_FUZZY_THRESHOLD and (best is None or ratio > best["score"]):
            best = {"card_id": c.id, "title": c.title, "score": round(ratio, 2), "via": "title"}
    if best:
        return best

    if not settings.openai_api_key:
        return None
    try:
        q = embed_text(title)
    except Exception:
        return None
    ranked = rank_by_similarity(q, [(c.id, c.embedding) for c in cards if c.embedding], top_k=1)
    if ranked and ranked[0][1] >= DUPLICATE_EMBED_THRESHOLD:
        card = next(c for c in cards if c.id == ranked[0][0])
        return {"card_id": card.id, "title": card.title, "score": round(ranked[0][1], 2), "via": "meaning"}
    return None


def _due_text(phrase: str | None) -> str:
    d = resolve_due_phrase(phrase)
    return f" due {d.strftime('%a %b %d')}" if d else ""


def build_plan(tool_calls: list[tuple[str, dict[str, Any]]], board: models.Board) -> list[PlannedAction]:
    """Validate model tool calls against the board and describe each one."""
    lists = {l.id: l for l in board.lists}
    cards = {c.id: c for l in board.lists for c in l.cards}
    plan: list[PlannedAction] = []

    for name, args in tool_calls:
        a = dict(args)
        try:
            if name == "create_card":
                lst = lists.get(int(a.get("list_id", 0)))
                if lst is None:
                    raise ValueError("unknown list")
                title = (a.get("title") or "").strip()
                if not title:
                    raise ValueError("empty title")
                flags: dict[str, Any] = {}
                dup = _find_duplicate(title, board)
                if dup:
                    flags["duplicate"] = dup
                if a.get("suggested_due") and not a.get("due"):
                    d = resolve_due_phrase(a["suggested_due"])
                    if d:
                        flags["suggested_due"] = d.isoformat()
                desc = f"Create \"{title}\" in {lst.name}{_due_text(a.get('due'))}"
                if a.get("labels"):
                    desc += f" · labels: {a['labels']}"
                plan.append(PlannedAction("create_card", a, desc, flags))

            elif name == "move_card":
                card = cards.get(int(a.get("card_id", 0)))
                lst = lists.get(int(a.get("list_id", 0)))
                if card is None:
                    raise ValueError("unknown card")
                if lst is None:
                    raise ValueError("unknown list")
                where = f" (position {a['position']})" if a.get("position") else ""
                plan.append(PlannedAction("move_card", a, f"Move \"{card.title}\" from {card.list.name} to {lst.name}{where}"))

            elif name == "update_card":
                card = cards.get(int(a.get("card_id", 0)))
                if card is None:
                    raise ValueError("unknown card")
                changes = []
                if "title" in a and a["title"]:
                    changes.append(f"rename to \"{a['title']}\"")
                if "description" in a:
                    changes.append("update description")
                if "labels" in a:
                    changes.append(f"labels → {a['labels'] or '(none)'}")
                if a.get("clear_due"):
                    changes.append("clear due date")
                elif a.get("due"):
                    changes.append(f"set{_due_text(a['due']) or ' due date'}")
                if "completed" in a:
                    changes.append("mark complete" if a["completed"] else "reopen")
                if not changes:
                    raise ValueError("nothing to change")
                plan.append(PlannedAction("update_card", a, f"Update \"{card.title}\": {', '.join(changes)}"))

            elif name == "delete_card":
                card = cards.get(int(a.get("card_id", 0)))
                if card is None:
                    raise ValueError("unknown card")
                plan.append(PlannedAction("delete_card", a, f"Delete \"{card.title}\" (from {card.list.name})", {"destructive": True}))

            elif name == "create_list":
                nm = (a.get("name") or "").strip()
                if not nm:
                    raise ValueError("empty name")
                plan.append(PlannedAction("create_list", a, f"Add column \"{nm}\""))

            elif name == "rename_list":
                lst = lists.get(int(a.get("list_id", 0)))
                if lst is None:
                    raise ValueError("unknown list")
                plan.append(PlannedAction("rename_list", a, f"Rename column \"{lst.name}\" to \"{a.get('name', '')}\""))

            else:
                raise ValueError(f"unknown action {name}")
        except (ValueError, TypeError) as exc:
            plan.append(PlannedAction(name, a, f"{name} (skipped: {exc})", error=str(exc)))
    return plan


def needs_confirmation(plan: list[PlannedAction]) -> bool:
    live = [p for p in plan if not p.error]
    if len(live) > BULK_THRESHOLD:
        return True
    return any(p.flags.get("destructive") or p.flags.get("duplicate") or p.flags.get("suggested_due") for p in live)


# ---- execution ---------------------------------------------------------------

def apply_plan(
    plan: list[PlannedAction], board: models.Board, user: models.User, db: Session, prompt: str
) -> tuple[list[str], list[int]]:
    """Apply every non-errored action. Returns (human-readable results,
    card ids whose embeddings need refreshing in the background)."""
    who = f"AI · {user.email}"
    results: list[str] = []
    lists = {l.id: l for l in board.lists}
    cards = {c.id: c for l in board.lists for c in l.cards}
    embed_later: list[int] = []

    def log(text: str) -> None:
        db.add(models.ActivityLog(board_id=board.id, user_email=who, action_text=text))

    for p in plan:
        if p.error:
            continue
        a = p.args
        if p.type == "create_card":
            lst = lists[int(a["list_id"])]
            due_phrase = a.get("due") or (a.get("suggested_due") if p.flags.get("suggested_due") else None)
            due = resolve_due_phrase(due_phrase)
            max_pos = db.query(func.max(models.Card.position)).filter_by(list_id=lst.id).scalar()
            card = models.Card(
                title=a["title"].strip(),
                description=(a.get("description") or "").strip(),
                labels=(a.get("labels") or "").strip(),
                due_date=datetime.datetime.combine(due, datetime.time(9, 0)) if due else None,
                list_id=lst.id,
                position=(max_pos or 0) + 1,
            )
            set_completed(card, is_done_list(lst.name))
            touch(card)
            db.add(card)
            db.flush()
            cards[card.id] = card
            embed_later.append(card.id)
            log(f"created card '{card.title}' in '{lst.name}'")
            results.append(f"Created \"{card.title}\" in {lst.name}")
            notify(board.id, {"type": "card_created", "card_id": card.id, "list_id": lst.id, "refresh_logs": True})

        elif p.type == "move_card":
            card = cards[int(a["card_id"])]
            target = lists[int(a["list_id"])]
            source = card.list
            source_cards = [c for c in source.cards if c.id != card.id]
            target_cards = source_cards if target.id == source.id else list(target.cards)
            pos = a.get("position")
            index = len(target_cards) if not pos else max(0, min(int(pos) - 1, len(target_cards)))
            target_cards.insert(index, card)
            card.list_id = target.id
            for i, c in enumerate(target_cards, start=1):
                c.position = i
            if target.id != source.id:
                for i, c in enumerate(source_cards, start=1):
                    c.position = i
            set_completed(card, is_done_list(target.name))
            touch(card)
            db.flush()
            db.expire(source, ["cards"])
            db.expire(target, ["cards"])
            log(f"moved card '{card.title}' from '{source.name}' to '{target.name}'")
            results.append(f"Moved \"{card.title}\" to {target.name}")
            notify(board.id, {"type": "card_moved", "card_id": card.id, "list_id": target.id, "refresh_logs": True})

        elif p.type == "update_card":
            card = cards[int(a["card_id"])]
            changed = []
            if a.get("title"):
                card.title = a["title"].strip()
                changed.append("title")
            if "description" in a:
                card.description = (a.get("description") or "").strip()
                changed.append("description")
            if "labels" in a:
                card.labels = (a.get("labels") or "").strip()
                changed.append("labels")
            if a.get("clear_due"):
                card.due_date = None
                changed.append("due date")
            elif a.get("due"):
                d = resolve_due_phrase(a["due"])
                if d:
                    card.due_date = datetime.datetime.combine(d, datetime.time(9, 0))
                    card.reminder_sent = 0
                    changed.append("due date")
            if "completed" in a:
                set_completed(card, bool(a["completed"]))
                changed.append("completion")
            if "title" in changed or "description" in changed:
                embed_later.append(card.id)
            touch(card)
            log(f"updated {', '.join(changed)} on card '{card.title}'")
            results.append(f"Updated \"{card.title}\" ({', '.join(changed)})")
            notify(board.id, {"type": "card_updated", "card_id": card.id, "refresh_logs": True})

        elif p.type == "delete_card":
            card = cards.pop(int(a["card_id"]))
            title, lst = card.title, card.list
            if card.attachment_path and os.path.exists(card.attachment_path):
                try:
                    os.remove(card.attachment_path)
                except OSError:
                    pass
            remaining = [c for c in lst.cards if c.id != card.id]
            db.delete(card)
            for i, c in enumerate(remaining, start=1):
                c.position = i
            db.flush()
            db.expire(lst, ["cards"])
            log(f"deleted card '{title}'")
            results.append(f"Deleted \"{title}\"")
            notify(board.id, {"type": "card_deleted", "card_id": int(a["card_id"]), "refresh_logs": True})

        elif p.type == "create_list":
            max_pos = db.query(func.max(models.List.position)).filter_by(board_id=board.id).scalar()
            lst = models.List(name=a["name"].strip(), board_id=board.id, position=(max_pos or 0) + 1)
            db.add(lst)
            db.flush()
            lists[lst.id] = lst
            log(f"created column '{lst.name}'")
            results.append(f"Added column \"{lst.name}\"")
            notify(board.id, {"type": "list_created", "list_id": lst.id, "refresh_logs": True})

        elif p.type == "rename_list":
            lst = lists[int(a["list_id"])]
            old = lst.name
            lst.name = a["name"].strip()
            log(f"renamed column '{old}' to '{lst.name}'")
            results.append(f"Renamed \"{old}\" to \"{lst.name}\"")
            notify(board.id, {"type": "list_updated", "list_id": lst.id, "refresh_logs": True})

    if results:
        log(f"asked: \"{prompt[:140]}\"")
    db.commit()
    return results, embed_later
