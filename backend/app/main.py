import asyncio

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import Base, engine, get_db
from .deps import get_current_user
from .routers import auth, boards, cards, lists, stats
from .security import decode_token
from .tasks import reminder_loop
from .websockets import manager, set_loop

app = FastAPI(title="Collaborative Task Board API")

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


@app.on_event("startup")
async def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    set_loop(asyncio.get_running_loop())
    asyncio.create_task(reminder_loop())


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/me", response_model=None)
def me(user: models.User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}


@app.websocket("/ws/boards/{board_id}")
async def board_ws(websocket: WebSocket, board_id: int, token: str = ""):
    """Live board updates. Client connects with ?token=<jwt>.

    Access is verified against board membership before accepting the socket.
    """
    user_id = decode_token(token)
    if user_id is None:
        await websocket.close(code=4401)
        return

    db: Session = next(get_db())
    try:
        member = (
            db.query(models.BoardMembership)
            .filter_by(board_id=board_id, user_id=user_id)
            .first()
        )
    finally:
        db.close()
    if member is None:
        await websocket.close(code=4403)
        return

    await manager.connect(board_id, websocket)
    try:
        while True:
            # We don't require client messages; keep the socket open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(board_id, websocket)
