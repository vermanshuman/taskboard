import json
import math

import httpx
from openai import OpenAI

from .config import settings


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


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def card_embedding_text(title: str, description: str) -> str:
    combined = (title or "") + "\n" + (description or "")
    return combined.strip()


def try_update_card_embedding(card, db) -> None:
    """Best-effort embedding refresh. Never raises -- card create/update must
    succeed even if OpenAI is unreachable or misconfigured."""
    if not settings.openai_api_key:
        return
    text = card_embedding_text(card.title, card.description)
    if not text:
        return
    try:
        vec = embed_text(text)
        card.embedding = serialize_embedding(vec)
    except Exception:
        pass
