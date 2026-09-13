import asyncio
import json
from collections import defaultdict

from fastapi import WebSocket

from .config import settings

try:
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover - redis is in requirements, but stay safe
    aioredis = None


class BoardConnectionManager:
    """Tracks WebSocket connections per board and broadcasts events.

    Each connection is tagged with the viewer's email so the board can show
    live presence (who else is here right now).

    Two modes:
    - In-process (default): sockets and presence live in this process only.
    - Redis (when REDIS_URL is reachable at startup): broadcasts are published
      to a Redis channel and every backend instance fans them out to its own
      sockets; presence is kept in a Redis hash so the viewer list is shared
      across instances. Falls back to in-process if Redis is unavailable.
    """

    CHANNEL_PREFIX = "board:"
    PRESENCE_PREFIX = "board-viewers:"

    def __init__(self) -> None:
        # board_id -> { websocket: email }
        self._connections: dict[int, dict[WebSocket, str]] = defaultdict(dict)
        self._lock = asyncio.Lock()
        self._redis = None
        self._subscriber_task: asyncio.Task | None = None

    # ---- lifecycle ----

    async def start(self) -> None:
        """Try to attach Redis. Silent fallback to in-process on failure."""
        if aioredis is None or not settings.redis_url:
            return
        try:
            client = aioredis.from_url(settings.redis_url, decode_responses=True)
            await asyncio.wait_for(client.ping(), timeout=1.5)
        except Exception as exc:
            print(f"[ws] Redis unavailable ({exc.__class__.__name__}); using in-process broadcast")
            return
        self._redis = client
        self._subscriber_task = asyncio.create_task(self._subscribe_loop())
        print("[ws] Redis pub/sub enabled")

    async def stop(self) -> None:
        if self._subscriber_task:
            self._subscriber_task.cancel()
        if self._redis:
            await self._redis.aclose()

    @property
    def using_redis(self) -> bool:
        return self._redis is not None

    # ---- connections ----

    async def connect(self, board_id: int, ws: WebSocket, email: str) -> None:
        async with self._lock:
            self._connections[board_id][ws] = email
        if self._redis:
            await self._redis.hincrby(self._presence_key(board_id), email, 1)

    async def disconnect(self, board_id: int, ws: WebSocket) -> None:
        async with self._lock:
            email = self._connections.get(board_id, {}).pop(ws, None)
        if self._redis and email:
            key = self._presence_key(board_id)
            remaining = await self._redis.hincrby(key, email, -1)
            if remaining <= 0:
                await self._redis.hdel(key, email)

    # ---- broadcast ----

    async def broadcast(self, board_id: int, message: dict) -> None:
        """Send a JSON message to everyone watching this board (all instances)."""
        if self._redis:
            await self._redis.publish(self._channel(board_id), json.dumps(message))
        else:
            await self._send_local(board_id, message)

    async def _send_local(self, board_id: int, message: dict) -> None:
        async with self._lock:
            targets = list(self._connections.get(board_id, {}).keys())
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(board_id, ws)

    async def _subscribe_loop(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe(f"{self.CHANNEL_PREFIX}*")
        try:
            async for item in pubsub.listen():
                if item.get("type") != "pmessage":
                    continue
                try:
                    board_id = int(item["channel"].removeprefix(self.CHANNEL_PREFIX))
                    message = json.loads(item["data"])
                except (ValueError, KeyError, TypeError):
                    continue
                await self._send_local(board_id, message)
        except asyncio.CancelledError:
            await pubsub.aclose()
            raise

    # ---- presence ----

    async def viewers(self, board_id: int) -> list[str]:
        """Unique emails currently viewing the board."""
        if self._redis:
            return sorted((await self._redis.hkeys(self._presence_key(board_id))))
        emails = list(self._connections.get(board_id, {}).values())
        seen: list[str] = []
        for e in emails:  # de-dupe, preserve order (same user, two tabs)
            if e not in seen:
                seen.append(e)
        return seen

    async def broadcast_presence(self, board_id: int) -> None:
        viewers = await self.viewers(board_id)
        await self.broadcast(
            board_id,
            {"type": "presence", "viewers": viewers, "count": len(viewers)},
        )

    # ---- keys ----

    def _channel(self, board_id: int) -> str:
        return f"{self.CHANNEL_PREFIX}{board_id}"

    def _presence_key(self, board_id: int) -> str:
        return f"{self.PRESENCE_PREFIX}{board_id}"


manager = BoardConnectionManager()

# The running event loop, captured at app startup. Lets synchronous CRUD
# routes (which run in a threadpool) schedule broadcasts safely.
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def notify(board_id: int, message: dict) -> None:
    """Fire-and-forget broadcast callable from sync code."""
    if _loop is None:
        return
    asyncio.run_coroutine_threadsafe(manager.broadcast(board_id, message), _loop)
