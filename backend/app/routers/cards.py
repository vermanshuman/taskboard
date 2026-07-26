import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..embeddings import try_update_card_embedding
from ..websockets import notify

router = APIRouter(prefix="/api/boards/{board_id}/cards", tags=["cards"])


def _get_card_in_board(db: Session, board_id: int, card_id: int) -> models.Card:
    card = (
        db.query(models.Card)
        .join(models.List)
        .filter(models.Card.id == card_id, models.List.board_id == board_id)
        .first()
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.post("", response_model=schemas.CardOut)
def create_card(
        board_id: int,
        list_id: int,
        payload: schemas.CardCreate,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    lst = db.query(models.List).filter_by(id=list_id, board_id=board_id).first()
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    max_pos = (
        db.query(func.max(models.Card.position)).filter_by(list_id=list_id).scalar()
    )
    card = models.Card(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        labels=payload.labels,
        list_id=list_id,
        position=(max_pos or 0) + 1,
    )
    db.add(card)
    try_update_card_embedding(card, db)

    # Audit log creation
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"added card '{payload.title}' to column '{lst.name}'"
    )
    db.add(log)

    db.commit()
    db.refresh(card)

    notify(board_id, {"type": "card_created", "card_id": card.id, "list_id": list_id, "refresh_logs": True})
    return card


@router.patch("/{card_id}", response_model=schemas.CardOut)
def update_card(
        board_id: int,
        card_id: int,
        payload: schemas.CardUpdate,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(card, field, value)
    if "title" in data or "description" in data:
        try_update_card_embedding(card, db)

    # Audit log update
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"updated metadata specifications for card '{card.title}'"
    )
    db.add(log)

    db.commit()
    db.refresh(card)
    notify(board_id, {"type": "card_updated", "card_id": card.id, "refresh_logs": True})
    return card


@router.post("/{card_id}/move", response_model=schemas.CardOut)
def move_card(
        board_id: int,
        card_id: int,
        payload: schemas.CardMove,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    target = (
        db.query(models.List).filter_by(id=payload.list_id, board_id=board_id).first()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Target list not found")

    source_list_name = card.list.name if card.list else "Unknown"
    card.list_id = payload.list_id
    card.position = payload.position

    # Automatically toggle completion status based on the destination column name
    if target.name.lower() == "done":
        card.completed = 1
    else:
        card.completed = 0

    # Audit log dynamic move tracking
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"moved card '{card.title}' from '{source_list_name}' to '{target.name}'"
    )
    db.add(log)

    db.commit()
    db.refresh(card)
    notify(
        board_id,
        {"type": "card_moved", "card_id": card.id, "list_id": payload.list_id, "refresh_logs": True},
    )
    return card


@router.post("/{card_id}/attachment", response_model=schemas.CardOut)
def upload_attachment(
        board_id: int,
        card_id: int,
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, name)
    with open(path, "wb") as f:
        f.write(file.file.read())
    card.attachment_path = path

    # Audit log attachment upload
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"attached document repository resource '{file.filename}' to card '{card.title}'"
    )
    db.add(log)

    db.commit()
    db.refresh(card)
    notify(board_id, {"type": "card_updated", "card_id": card.id, "refresh_logs": True})
    return card


@router.delete("/{card_id}", status_code=204)
def delete_card(
        board_id: int,
        card_id: int,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)

    # Audit log deletion event (must capture context before database commit wipeout)
    log = models.ActivityLog(
        board_id=board_id,
        user_email=user.email,
        action_text=f"permanently deleted card '{card.title}'"
    )
    db.add(log)

    db.delete(card)
    db.commit()
    notify(board_id, {"type": "card_deleted", "card_id": card_id, "refresh_logs": True})