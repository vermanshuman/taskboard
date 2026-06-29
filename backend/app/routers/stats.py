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

    # completed cards grouped by ISO week, last 8 weeks
    all_cards = [c for lst in board.lists for c in lst.cards]
    now = datetime.utcnow()
    weeks: dict[str, int] = {}
    for i in range(7, -1, -1):
        week_start = now - timedelta(weeks=i)
        label = week_start.strftime("%Y-W%V")
        weeks[label] = 0
    for c in all_cards:
        if c.completed and c.created_at:
            label = c.created_at.strftime("%Y-W%V")
            if label in weeks:
                weeks[label] += 1

    return {
        "cards_per_list": cards_per_list,
        "completed_per_week": [{"week": k, "count": v} for k, v in weeks.items()],
    }
