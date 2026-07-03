import asyncio
from collections import defaultdict

from fastapi import WebSocket


class BoardConnectionManager:
    """Tracks active WebSocket connections per board and broadcasts events.

    Each connection is tagged with the viewer's email so the board can show
    live presence (who else is here right now).

    For a single backend instance this in-memory manager is enough. To scale
    across multiple instances, back this with Redis pub/sub (the redis client
    is already wired in config) so events fan out to every instance.
    """

    def __init__(self) -> None:
        # board_id -> { websocket: email }
        self._connections: dict[int, dict[WebSocket, str]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def connect(self, board_id: int, ws: WebSocket, email: str) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[board_id][ws] = email

    async def disconnect(self, board_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.get(board_id, {}).pop(ws, None)

    async def broadcast(self, board_id: int, message: dict) -> None:
        """Send a JSON message to everyone watching this board."""
        async with self._lock:
            targets = list(self._connections.get(board_id, {}).keys())
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(board_id, ws)

    def viewers(self, board_id: int) -> list[str]:
        """Unique emails currently viewing the board."""
        emails = list(self._connections.get(board_id, {}).values())
        # de-dupe while preserving order (same user may have two tabs open)
        seen: list[str] = []
        for e in emails:
            if e not in seen:
                seen.append(e)
        return seen

    async def broadcast_presence(self, board_id: int) -> None:
        viewers = self.viewers(board_id)
        await self.broadcast(
            board_id,
            {"type": "presence", "viewers": viewers, "count": len(viewers)},
        )


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
