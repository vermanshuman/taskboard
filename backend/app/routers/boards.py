from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..websockets import notify

router = APIRouter(prefix="/api/boards", tags=["boards"])

ACTIVITY_PREVIEW = 30  # logs embedded in the board payload
ACTIVITY_PAGE_MAX = 100


def _member_out(m: models.BoardMembership) -> schemas.MemberOut:
    return schemas.MemberOut(
        user_id=m.user_id,
        email=m.user.email,
        full_name=m.user.full_name,
        avatar_color=m.user.avatar_color,
        role=m.role,
    )


def _board_detail(board: models.Board, role: str, db: Session) -> schemas.BoardDetail:
    # Built field-by-field (not model_validate(board)) so the unbounded
    # activity_logs relationship is never loaded -- only a capped preview is.
    recent = (
        db.query(models.ActivityLog)
        .filter_by(board_id=board.id)
        .order_by(models.ActivityLog.id.desc())
        .limit(ACTIVITY_PREVIEW)
        .all()
    )
    return schemas.BoardDetail(
        id=board.id,
        name=board.name,
        owner_id=board.owner_id,
        role=role,
        lists=[schemas.ListOut.model_validate(l) for l in board.lists],
        members=[_member_out(m) for m in board.memberships],
        activity_logs=[schemas.ActivityLogOut.model_validate(l) for l in recent],
    )


@router.get("", response_model=list[schemas.BoardOut])
def list_boards(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    memberships = (
        db.query(models.BoardMembership).filter_by(user_id=user.id).all()
    )
    out = []
    for m in memberships:
        b = schemas.BoardOut.model_validate(m.board)
        b.role = m.role
        out.append(b)
    return out


@router.post("", response_model=schemas.BoardOut)
def create_board(
    payload: schemas.BoardCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = models.Board(name=payload.name, owner_id=user.id)
    db.add(board)
    db.flush()  # get board.id before creating membership
    db.add(models.BoardMembership(board_id=board.id, user_id=user.id, role="owner"))
    db.add(
        models.ActivityLog(
            board_id=board.id,
            user_email=user.email,
            action_text=f"created the board '{payload.name}'",
        )
    )
    db.commit()
    db.refresh(board)
    out = schemas.BoardOut.model_validate(board)
    out.role = "owner"
    return out


@router.get("/{board_id}", response_model=schemas.BoardDetail)
def get_board(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user)
    membership = next(m for m in board.memberships if m.user_id == user.id)
    return _board_detail(board, membership.role, db)


@router.get("/{board_id}/activity", response_model=schemas.ActivityPage)
def board_activity(
    board_id: int,
    before_id: int | None = Query(default=None, description="Return entries older than this id"),
    limit: int = Query(default=ACTIVITY_PREVIEW, ge=1, le=ACTIVITY_PAGE_MAX),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Keyset-paginated activity feed, newest first."""
    require_board_access(board_id, db, user)
    q = db.query(models.ActivityLog).filter_by(board_id=board_id)
    if before_id is not None:
        q = q.filter(models.ActivityLog.id < before_id)
    rows = q.order_by(models.ActivityLog.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return schemas.ActivityPage(
        items=[schemas.ActivityLogOut.model_validate(r) for r in rows],
        next_before_id=rows[-1].id if has_more and rows else None,
    )


@router.delete("/{board_id}", status_code=204)
def delete_board(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user, owner_only=True)
    db.delete(board)
    db.commit()


# ---- members (sharing) ----


@router.get("/{board_id}/members", response_model=list[schemas.MemberOut])
def list_members(
    board_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    board = require_board_access(board_id, db, user)
    return [_member_out(m) for m in board.memberships]


@router.post("/{board_id}/members", response_model=schemas.MemberOut, status_code=201)
def add_member(
    board_id: int,
    payload: schemas.MemberAdd,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Owner shares the board with another registered user by email."""
    require_board_access(board_id, db, user, owner_only=True)
    target = db.query(models.User).filter_by(email=payload.email).first()
    if target is None:
        raise HTTPException(status_code=404, detail="No account with that email")
    existing = (
        db.query(models.BoardMembership)
        .filter_by(board_id=board_id, user_id=target.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already a member of this board")

    membership = models.BoardMembership(board_id=board_id, user_id=target.id, role="member")
    db.add(membership)
    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=f"shared the board with {target.email}",
        )
    )
    db.commit()
    db.refresh(membership)
    notify(board_id, {"type": "members_changed", "refresh_logs": True})
    return _member_out(membership)


@router.delete("/{board_id}/members/{user_id}", status_code=204)
def remove_member(
    board_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Owner removes a member, or a member removes themselves (leave)."""
    board = require_board_access(board_id, db, user)
    if user_id != user.id and board.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Owner permission required")
    if user_id == board.owner_id:
        raise HTTPException(status_code=400, detail="The owner cannot be removed")

    membership = (
        db.query(models.BoardMembership)
        .filter_by(board_id=board_id, user_id=user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")

    removed_email = membership.user.email
    db.delete(membership)
    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=(
                "left the board" if user_id == user.id else f"removed {removed_email} from the board"
            ),
        )
    )
    db.commit()
    notify(board_id, {"type": "members_changed", "refresh_logs": True})
