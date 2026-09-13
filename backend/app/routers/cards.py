import os
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..domain import is_done_list, set_completed
from ..embeddings import embed_card_in_background
from ..websockets import notify

router = APIRouter(prefix="/api/boards/{board_id}/cards", tags=["cards"])

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB


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


def _renumber(cards: list[models.Card]) -> None:
    """Assign positions 1..n in the given order."""
    for i, c in enumerate(cards, start=1):
        c.position = i


@router.post("", response_model=schemas.CardOut)
def create_card(
    board_id: int,
    list_id: int,
    payload: schemas.CardCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    lst = db.query(models.List).filter_by(id=list_id, board_id=board_id).first()
    if lst is None:
        raise HTTPException(status_code=404, detail="List not found")
    max_pos = db.query(func.max(models.Card.position)).filter_by(list_id=list_id).scalar()
    card = models.Card(
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        labels=payload.labels,
        list_id=list_id,
        position=(max_pos or 0) + 1,
    )
    set_completed(card, is_done_list(lst.name))
    db.add(card)
    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=f"added card '{payload.title}' to column '{lst.name}'",
        )
    )
    db.commit()
    db.refresh(card)

    # Embedding happens after the response so the UI never waits on OpenAI.
    background.add_task(embed_card_in_background, card.id)
    notify(board_id, {"type": "card_created", "card_id": card.id, "list_id": list_id, "refresh_logs": True})
    return card


@router.patch("/{card_id}", response_model=schemas.CardOut)
def update_card(
    board_id: int,
    card_id: int,
    payload: schemas.CardUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    data = payload.model_dump(exclude_unset=True)
    if "completed" in data:
        set_completed(card, bool(data.pop("completed")))
    for field, value in data.items():
        setattr(card, field, value)

    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=f"updated card '{card.title}'",
        )
    )
    db.commit()
    db.refresh(card)

    if "title" in data or "description" in data:
        background.add_task(embed_card_in_background, card.id)
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
    """Move a card to (list_id, position) and renumber both lists so positions
    stay a contiguous 1..n with no gaps or duplicates. position is 1-based and
    clamped to the target's length."""
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    target = db.query(models.List).filter_by(id=payload.list_id, board_id=board_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="Target list not found")

    source = card.list
    source_cards = [c for c in source.cards if c.id != card.id]
    if target.id == source.id:
        target_cards = source_cards
    else:
        target_cards = list(target.cards)

    index = max(0, min(payload.position - 1, len(target_cards)))
    target_cards.insert(index, card)
    card.list_id = target.id
    _renumber(target_cards)
    if target.id != source.id:
        _renumber(source_cards)

    # Completion follows the destination column: dropping into a "done"-style
    # column completes the card, dragging it back out re-opens it.
    set_completed(card, is_done_list(target.name))

    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=(
                f"reordered card '{card.title}' in '{target.name}'"
                if target.id == source.id
                else f"moved card '{card.title}' from '{source.name}' to '{target.name}'"
            ),
        )
    )
    db.commit()
    db.refresh(card)
    notify(board_id, {"type": "card_moved", "card_id": card.id, "list_id": target.id, "refresh_logs": True})
    return card


# ---- attachments ----


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "file")
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120] or "file"


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

    data = file.file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment too large (max 10 MB)")

    os.makedirs(settings.upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.upload_dir, stored_name)
    with open(path, "wb") as f:
        f.write(data)

    # Replace any previous file so uploads don't pile up on disk.
    if card.attachment_path and os.path.exists(card.attachment_path):
        try:
            os.remove(card.attachment_path)
        except OSError:
            pass

    card.attachment_path = path
    card.attachment_name = _safe_filename(file.filename)
    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=f"attached '{card.attachment_name}' to card '{card.title}'",
        )
    )
    db.commit()
    db.refresh(card)
    notify(board_id, {"type": "card_updated", "card_id": card.id, "refresh_logs": True})
    return card


@router.get("/{card_id}/attachment")
def download_attachment(
    board_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Stream the card's attachment. Requires board membership like every
    other card route, so files are never publicly reachable."""
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    if not card.attachment_path or not os.path.exists(card.attachment_path):
        raise HTTPException(status_code=404, detail="No attachment on this card")
    return FileResponse(
        card.attachment_path,
        filename=card.attachment_name or os.path.basename(card.attachment_path),
    )


@router.delete("/{card_id}/attachment", response_model=schemas.CardOut)
def delete_attachment(
    board_id: int,
    card_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)
    card = _get_card_in_board(db, board_id, card_id)
    if card.attachment_path and os.path.exists(card.attachment_path):
        try:
            os.remove(card.attachment_path)
        except OSError:
            pass
    card.attachment_path = None
    card.attachment_name = None
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
    db.add(
        models.ActivityLog(
            board_id=board_id,
            user_email=user.email,
            action_text=f"deleted card '{card.title}'",
        )
    )
    if card.attachment_path and os.path.exists(card.attachment_path):
        try:
            os.remove(card.attachment_path)
        except OSError:
            pass
    remaining = [c for c in card.list.cards if c.id != card.id]
    db.delete(card)
    _renumber(remaining)
    db.commit()
    notify(board_id, {"type": "card_deleted", "card_id": card_id, "refresh_logs": True})
