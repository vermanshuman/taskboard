from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    user_id = decode_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user = db.query(models.User).get(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


def require_board_access(
    board_id: int, db: Session, user: models.User, owner_only: bool = False
) -> models.Board:
    """Return the board if the user is owner/member, else 403/404."""
    board = db.query(models.Board).get(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")

    membership = (
        db.query(models.BoardMembership)
        .filter_by(board_id=board_id, user_id=user.id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="No access to this board")
    if owner_only and membership.role != "owner":
        raise HTTPException(status_code=403, detail="Owner permission required")
    return board
