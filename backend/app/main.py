import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import models, schemas
from .config import settings
from .database import SessionLocal, ensure_schema
from .deps import get_current_user
from .routers import auth, boards, cards, lists, stats, agent, search, public_agent
from .security import decode_token
from .tasks import reminder_loop
from .websockets import manager, set_loop

# How long a freshly opened socket has to send its auth message.
WS_AUTH_TIMEOUT_SECONDS = 5


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_schema()
    set_loop(asyncio.get_running_loop())
    await manager.start()
    reminder_task = asyncio.create_task(reminder_loop())
    try:
        yield
    finally:
        reminder_task.cancel()
        await manager.stop()


app = FastAPI(title="Collaborative Task Board API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(boards.router)
app.include_router(lists.router)
app.include_router(cards.router)
app.include_router(stats.router)
app.include_router(agent.router)
app.include_router(search.router)
app.include_router(public_agent.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "realtime": "redis" if manager.using_redis else "in-process"}


@app.get("/api/me", response_model=schemas.UserOut)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.websocket("/ws/boards/{board_id}")
async def board_ws(websocket: WebSocket, board_id: int):
    """Live board updates.

    Auth protocol: the socket is accepted, then the client must send
    {"type": "auth", "token": "<jwt>"} as its first message within a few
    seconds. Keeping the token out of the URL keeps it out of access logs and
    browser history. Close codes: 4401 bad/missing token, 4403 not a member.
    """
    await websocket.accept()
    try:
        first = await asyncio.wait_for(
            websocket.receive_json(), timeout=WS_AUTH_TIMEOUT_SECONDS
        )
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError):
        await websocket.close(code=4401)
        return

    token = first.get("token") if isinstance(first, dict) else None
    user_id = decode_token(token or "")
    if user_id is None:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        member = (
            db.query(models.BoardMembership)
            .filter_by(board_id=board_id, user_id=user_id)
            .first()
        )
        user = db.get(models.User, user_id)
        email = user.email if user else "unknown"
    finally:
        db.close()
    if member is None:
        await websocket.close(code=4403)
        return

    await manager.connect(board_id, websocket, email)
    await manager.broadcast_presence(board_id)
    try:
        while True:
            # Clients don't need to send anything else; this keeps the socket open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(board_id, websocket)
        await manager.broadcast_presence(board_id)
