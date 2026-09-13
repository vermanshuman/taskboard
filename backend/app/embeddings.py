import json

import httpx
import numpy as np
from openai import OpenAI

from .config import settings
from .database import SessionLocal
from . import models


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client())


def embed_text(text: str) -> list[float]:
    """Raises on failure -- callers must catch."""
    client = get_openai_client()
    resp = client.embeddings.create(model=settings.embedding_model, input=text or " ")
    return resp.data[0].embedding


def serialize_embedding(vec: list[float]) -> str:
    return json.dumps(vec)


def deserialize_embedding(raw: str) -> list[float]:
    return json.loads(raw)


def card_embedding_text(title: str, description: str) -> str:
    combined = (title or "") + "\n" + (description or "")
    return combined.strip()


def rank_by_similarity(query_vec: list[float], candidates: list[tuple[int, str]], top_k: int) -> list[tuple[int, float]]:
    """Score (card_id, raw_embedding_json) pairs against the query in one
    vectorized pass. Returns [(card_id, score)] sorted best-first.

    Embeddings are stored as JSON in a text column, which is portable across
    SQLite and Postgres but means every candidate is loaded per query. For
    boards with thousands of cards, the next step is pgvector (Postgres) so
    the database does the nearest-neighbour search itself.
    """
    ids: list[int] = []
    rows: list[list[float]] = []
    for card_id, raw in candidates:
        if not raw:
            continue
        try:
            rows.append(deserialize_embedding(raw))
            ids.append(card_id)
        except (ValueError, TypeError):
            continue
    if not rows:
        return []

    matrix = np.asarray(rows, dtype=np.float32)
    q = np.asarray(query_vec, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(q)
    norms[norms == 0] = np.inf  # zero vectors score 0 instead of NaN
    scores = matrix @ q / norms

    order = np.argsort(-scores)[:top_k]
    return [(ids[i], float(scores[i])) for i in order]


def try_update_card_embedding(card, db) -> None:
    """Synchronous best-effort refresh (used by the explicit reindex route).
    Never raises -- callers must not fail because OpenAI is unreachable."""
    if not settings.openai_api_key:
        return
    text = card_embedding_text(card.title, card.description)
    if not text:
        return
    try:
        card.embedding = serialize_embedding(embed_text(text))
    except Exception:
        pass


def embed_card_in_background(card_id: int) -> None:
    """Runs after the HTTP response is sent (FastAPI BackgroundTasks), so card
    create/update never wait on the OpenAI round-trip. Opens its own session
    because the request's session is closed by the time this executes."""
    if not settings.openai_api_key:
        return
    db = SessionLocal()
    try:
        card = db.get(models.Card, card_id)
        if card is None:
            return
        text = card_embedding_text(card.title, card.description)
        if not text:
            return
        card.embedding = serialize_embedding(embed_text(text))
        db.commit()
    except Exception as exc:
        print(f"[embeddings] card {card_id}: {exc.__class__.__name__}: {exc}")
    finally:
        db.close()
