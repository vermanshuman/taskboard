import asyncio
from datetime import datetime, timedelta

from .config import settings
from .database import SessionLocal
from . import models
from .websockets import manager


async def reminder_loop() -> None:
    """Periodically check for cards due soon and emit a reminder event.

    When several backend instances share a Redis, a short-lived lock ensures
    only one of them runs each tick so users don't get duplicate reminders.
    Without Redis this is a single-instance loop.
    """
    while True:
        try:
            if await _acquire_tick_lock():
                await _check_due_cards()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # never let the loop die
            print(f"[reminder] error: {exc}")
        await asyncio.sleep(settings.reminder_check_interval_seconds)


async def _acquire_tick_lock() -> bool:
    if not manager.using_redis:
        return True
    # SET NX with a TTL slightly shorter than the interval: whichever instance
    # gets there first owns this tick; the key expires before the next one.
    ttl = max(1, settings.reminder_check_interval_seconds - 5)
    return bool(
        await manager._redis.set("reminder-tick-lock", "1", nx=True, ex=ttl)
    )


async def _check_due_cards() -> None:
    db = SessionLocal()
    try:
        soon = datetime.utcnow() + timedelta(hours=24)
        due = (
            db.query(models.Card)
            .filter(
                models.Card.due_date.isnot(None),
                models.Card.due_date <= soon,
                models.Card.reminder_sent == 0,
                models.Card.completed == 0,
            )
            .all()
        )
        for card in due:
            board_id = card.list.board_id
            await manager.broadcast(
                board_id,
                {
                    "type": "reminder",
                    "card_id": card.id,
                    "title": card.title,
                    "due_date": card.due_date.isoformat(),
                },
            )
            card.reminder_sent = 1
        if due:
            db.commit()
    finally:
        db.close()
