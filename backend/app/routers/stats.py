from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user, require_board_access

router = APIRouter(prefix="/api/boards/{board_id}/stats", tags=["stats"])


@router.get("")
def board_stats(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user)

    cards_per_list = [
        {"list": lst.name, "count": len(lst.cards)} for lst in board.lists
    ]

    # Completed cards grouped by ISO week of *completion*, last 8 weeks.
    # Cards completed before completed_at existed fall back to created_at.
    all_cards = [c for lst in board.lists for c in lst.cards]
    now = datetime.utcnow()
    weeks: dict[str, int] = {}
    for i in range(7, -1, -1):
        week_start = now - timedelta(weeks=i)
        label = week_start.strftime("%G-W%V")
        weeks[label] = 0
    for c in all_cards:
        if not c.completed:
            continue
        when = c.completed_at or c.created_at
        if when is None:
            continue
        label = when.strftime("%G-W%V")
        if label in weeks:
            weeks[label] += 1

    return {
        "cards_per_list": cards_per_list,
        "completed_per_week": [{"week": k, "count": v} for k, v in weeks.items()],
    }
