"""Small domain rules shared by routers and the AI agents."""
import re
from datetime import date, datetime, timedelta

# Column names that mean "this work is finished". Matched case-insensitively
# on the whole name so "Done" and "Completed ✅" both count but "Undone" doesn't.
DONE_LIST_NAMES = {
    "done", "completed", "complete", "finished", "shipped", "closed",
    "released", "resolved", "live", "deployed",
}


def is_done_list(name: str | None) -> bool:
    if not name:
        return False
    cleaned = "".join(ch for ch in name.lower() if ch.isalnum() or ch == " ").strip()
    return cleaned in DONE_LIST_NAMES


def touch(card) -> None:
    """Record a meaningful change to a card (for ageing / stale markers)."""
    card.updated_at = datetime.utcnow()


def set_completed(card, completed: bool) -> None:
    """Flip completion and keep completed_at in sync."""
    was = bool(card.completed)
    card.completed = 1 if completed else 0
    if completed and not was:
        card.completed_at = datetime.utcnow()
    elif not completed:
        card.completed_at = None


# ---- due-date phrases ---------------------------------------------------
# The AI agents hand back the user's date expression verbatim ("Friday",
# "tomorrow", "next week", "Sep 20", "2026-09-18") and we resolve it here.
# Small models are unreliable at weekday arithmetic; code isn't.

_WEEKDAYS = {
    "monday": 0, "mon": 0, "tuesday": 1, "tue": 1, "tues": 1, "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3, "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5, "sunday": 6, "sun": 6,
}
_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4,
    "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9, "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_IN_N = re.compile(r"(?:in\s+)?(\d+)\s+(day|days|week|weeks)")
_MONTH_DAY = re.compile(r"([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?")
_DAY_MONTH = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)")


def _next_weekday(today: date, weekday: int) -> date:
    delta = (weekday - today.weekday()) % 7
    return today + timedelta(days=delta or 7)


def _end_of_month(d: date) -> date:
    first_next = (d.replace(day=1) + timedelta(days=32)).replace(day=1)
    return first_next - timedelta(days=1)


def resolve_due_phrase(phrase: str | None, today: date | None = None) -> date | None:
    """Turn a natural-language due phrase into a date, or None if unparseable."""
    if not phrase:
        return None
    today = today or date.today()
    text = phrase.strip().lower()
    text = re.sub(r"^(by|on|due|before|until|till|for)\s+", "", text)
    text = re.sub(r"^(the|this|coming)\s+", "", text)

    m = _ISO.search(text)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None

    if text in ("today", "tonight", "eod", "end of day"):
        return today
    if text in ("tomorrow", "tmrw", "tmr"):
        return today + timedelta(days=1)
    if text in ("day after tomorrow",):
        return today + timedelta(days=2)
    if text in ("end of week", "end of the week", "eow", "this week"):
        return today if today.weekday() == 4 else _next_weekday(today, 4)
    if text in ("next week",):
        return today + timedelta(days=(7 - today.weekday()))  # Monday after the coming Sunday
    if text in ("end of month", "end of the month", "eom", "this month"):
        return _end_of_month(today)
    if text in ("next month",):
        return (today.replace(day=1) + timedelta(days=32)).replace(day=1)

    m = _IN_N.fullmatch(text)
    if m:
        n = int(m[1])
        return today + timedelta(days=n * (7 if m[2].startswith("week") else 1))

    key = text[5:] if text.startswith("next ") else text
    if key in _WEEKDAYS:
        # "next Friday" is read as the coming Friday -- the common intent.
        return _next_weekday(today, _WEEKDAYS[key])

    m = _MONTH_DAY.fullmatch(text) or _DAY_MONTH.fullmatch(text)
    if m:
        a, b = m[1], m[2]
        month_name, day_str = (a, b) if a in _MONTHS else (b, a)
        if month_name in _MONTHS:
            try:
                d = date(today.year, _MONTHS[month_name], int(day_str))
            except ValueError:
                return None
            return d if d >= today else d.replace(year=today.year + 1)

    return None
