from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..embeddings import embed_text, rank_by_similarity, try_update_card_embedding

router = APIRouter(prefix="/api/boards/{board_id}/search", tags=["search"])


@router.post("/semantic", response_model=schemas.SemanticSearchResponse)
def semantic_search(
        board_id: int,
        payload: schemas.SemanticSearchRequest,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="OpenAI API key is missing. Add OPENAI_API_KEY to your environment."
        )

    query = (payload.query or "").strip()
    if not query:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Query must not be empty")

    try:
        query_vec = embed_text(query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to reach embedding model: {str(e)}"
        )

    # Only pull the two columns we need for scoring; hydrate the winners after.
    candidates = (
        db.query(models.Card.id, models.Card.embedding)
        .join(models.List)
        .filter(models.List.board_id == board_id, models.Card.embedding.isnot(None))
        .all()
    )
    ranked = rank_by_similarity(query_vec, candidates, settings.semantic_search_top_k)
    if not ranked:
        return schemas.SemanticSearchResponse(results=[])

    score_by_id = dict(ranked)
    cards = db.query(models.Card).filter(models.Card.id.in_(score_by_id)).all()
    cards.sort(key=lambda c: -score_by_id[c.id])

    return schemas.SemanticSearchResponse(results=[
        schemas.SemanticSearchResult(
            card_id=c.id,
            title=c.title,
            description=c.description,
            list_id=c.list_id,
            list_name=c.list.name,
            score=round(score_by_id[c.id], 4),
        )
        for c in cards
    ])


@router.post("/reindex")
def reindex_missing_embeddings(
        board_id: int,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    """Backfill embeddings for cards created before this feature, or where a
    prior embed call failed. Idempotent -- only touches embedding IS NULL rows."""
    require_board_access(board_id, db, user)
    if not settings.openai_api_key:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, detail="OpenAI API key is missing.")

    cards = (
        db.query(models.Card)
        .join(models.List)
        .filter(models.List.board_id == board_id, models.Card.embedding.is_(None))
        .all()
    )
    updated = 0
    for card in cards:
        try_update_card_embedding(card, db)
        if card.embedding:
            updated += 1
    db.commit()
    return {"status": "ok", "reindexed": updated, "skipped": len(cards) - updated}
