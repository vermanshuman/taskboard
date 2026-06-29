from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_board_access

router = APIRouter(prefix="/api/boards", tags=["boards"])


@router.get("", response_model=list[schemas.BoardOut])
def list_boards(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    board_ids = [
        m.board_id
        for m in db.query(models.BoardMembership).filter_by(user_id=user.id).all()
    ]
    if not board_ids:
        return []
    return db.query(models.Board).filter(models.Board.id.in_(board_ids)).all()


@router.post("", response_model=schemas.BoardOut)
def create_board(
    payload: schemas.BoardCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = models.Board(name=payload.name, owner_id=user.id)
    db.add(board)
    db.flush()  # get board.id before creating membership
    db.add(
        models.BoardMembership(board_id=board.id, user_id=user.id, role="owner")
    )
    db.commit()
    db.refresh(board)
    return board


@router.get("/{board_id}", response_model=schemas.BoardDetail)
def get_board(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return require_board_access(board_id, db, user)


@router.delete("/{board_id}", status_code=204)
def delete_board(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user, owner_only=True)
    db.delete(board)
    db.commit()
