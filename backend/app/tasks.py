import asyncio
from datetime import datetime, timedelta

from .config import settings
from .database import SessionLocal
from . import models
from .websockets import manager


async def reminder_loop() -> None:
    """Periodically check for cards due soon and emit a reminder event.

    v1 keeps this in-process for simplicity. To make it durable / horizontally
    scalable, move this to a Celery beat task using the Redis broker that is
    already provisioned in docker-compose.
    """
    while True:
        try:
            await _check_due_cards()
        except Exception as exc:  # never let the loop die
            print(f"[reminder] error: {exc}")
        await asyncio.sleep(settings.reminder_check_interval_seconds)


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
