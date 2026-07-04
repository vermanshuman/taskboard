from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..websockets import notify

router = APIRouter(prefix="/api/boards/{board_id}/lists", tags=["lists"])


@router.post("", response_model=schemas.ListOut)
def create_list(
        board_id: int,
        payload: schemas.ListCreate,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    max_pos = (
        db.query(func.max(models.List.position))
        .filter_by(board_id=board_id)
        .scalar()
    )
    new_list = models.List(
        name=payload.name, board_id=board_id, position=(max_pos or 0) + 1
    )
    db.add(new_list)

    # Audit log column list creation
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"created column list '{payload.name}'"
    )
    db.add(log)

    db.commit()
    db.refresh(new_list)
    notify(board_id, {"type": "list_created", "list_id": new_list.id, "refresh_logs": True})
    return new_list


@router.patch("/{list_id}", response_model=schemas.ListOut)
def update_list(
        board_id: int,
        list_id: int,
        payload: schemas.ListUpdate,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    lst = db.query(models.List).filter_by(id=list_id, board_id=board_id).first()
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")

    old_name = lst.name
    if payload.name is not None:
        lst.name = payload.name
    if payload.position is not None:
        lst.position = payload.position

    # Audit log column metadata modifications
    action_msg = f"renamed column from '{old_name}' to '{payload.name}'" if payload.name else f"reordered column position index for '{lst.name}'"
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=action_msg
    )
    db.add(log)

    db.commit()
    db.refresh(lst)
    notify(board_id, {"type": "list_updated", "list_id": lst.id, "refresh_logs": True})
    return lst


@router.delete("/{list_id}", status_code=204)
def delete_list(
        board_id: int,
        list_id: int,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    lst = db.query(models.List).filter_by(id=list_id, board_id=board_id).first()
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")

    # Audit log column list deletion context tracking
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"deleted column list lane '{lst.name}'"
    )
    db.add(log)

    db.delete(lst)
    db.commit()
    notify(board_id, {"type": "list_deleted", "list_id": list_id, "refresh_logs": True})