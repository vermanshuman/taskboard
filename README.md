# Collaborative Task Board

A real-time, Trello-style task board. Full-stack portfolio project.

**Stack:** React (Vite) · FastAPI (Python) · Postgres · Redis · WebSockets · Docker

---

## What's already built (backend — done & tested)

- JWT auth: register / login, owner vs member roles
- Boards → Lists → Cards relational model with cascade deletes
- Full REST CRUD for boards, lists, cards
- Card move/reorder endpoint (drag-and-drop target)
- File attachment upload per card
- WebSocket live sync — every change broadcasts to other open sessions
- Live presence — see who else is viewing a board in real time (avatars + count)
- Reminder toasts — the background due-date job surfaces as a toast in the UI
- Due-date color coding — overdue (red) and due-soon (amber) cards
- Background due-date reminder job (in-process; Redis/Celery-ready)
- Stats endpoint: cards per list + completed-per-week
- Seed script: demo user + sample board so the demo is never empty

## What the frontend developer continues

The frontend is a **runnable starter**, not finished. It already has:
- API client wrapping every endpoint (`src/lib/api.js`)
- WebSocket helper (`openBoardSocket`)
- Auth flow, board list, and a basic board view that reloads live on changes

The FE developer's job:
- Real **drag-and-drop** (e.g. `@hello-pangea/dnd` or `dnd-kit`) calling `api.moveCard`
- Card detail modal: description, due date, labels, file upload
- Stats view (charts) from `api.getStats`
- Styling / responsive layout

---

## Run it on Windows

### Option A — Docker (everything at once, recommended)

Requires Docker Desktop for Windows.

```powershell
cd taskboard
docker compose up --build
```

Then open:
- App: http://localhost:5173
- API docs: http://localhost:8000/docs

The backend auto-seeds on startup. Log in with **demo@taskboard.dev / demo1234**.

### Option B — Run backend and frontend separately (no Docker)

**Backend** (PowerShell):
```powershell
cd taskboard\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000
```
Backend uses a local sqlite file by default — no database install needed.
API docs at http://localhost:8000/docs

**Frontend** (a second PowerShell window):
```powershell
cd taskboard\frontend
npm install
npm run dev
```
Open http://localhost:5173

---

## Architecture notes (read these so you can explain it)

**Auth flow:** `POST /api/auth/register|login` returns a JWT. The frontend stores
it and sends `Authorization: Bearer <token>` on every request. `get_current_user`
(in `deps.py`) decodes the token and loads the user; `require_board_access` then
checks the user is a member of the board before any board operation.

**WebSocket flow:** the client opens `ws://.../ws/boards/{id}?token=<jwt>`. The
server verifies board membership before accepting the socket. CRUD routes run
synchronously in a threadpool; after a change they call `notify(board_id, event)`,
which uses `run_coroutine_threadsafe` to schedule a broadcast on the main event
loop. `BoardConnectionManager` (in `websockets.py`) fans the event out to every
socket watching that board. The starter frontend reloads the board on any event;
a production version would apply the specific event.

**Background reminders:** `tasks.py` runs an asyncio loop started at app startup.
Every interval it finds cards due within 24h that haven't been reminded, broadcasts
a `reminder` event, and marks them sent. For durability/scale this can move to a
Celery beat task using the Redis broker already in `docker-compose.yml`.

**Scaling note:** the WebSocket manager and reminder loop are in-process, fine for
one backend instance. For multiple instances, back them with Redis pub/sub.

---

## Project layout

```
taskboard/
├─ docker-compose.yml
├─ backend/
│  ├─ Dockerfile
│  ├─ requirements.txt
│  └─ app/
│     ├─ main.py          # app + websocket endpoint + startup
│     ├─ config.py        # env settings
│     ├─ database.py      # SQLAlchemy engine/session
│     ├─ models.py        # User, Board, Membership, List, Card
│     ├─ schemas.py       # Pydantic request/response models
│     ├─ security.py      # password hashing + JWT
│     ├─ deps.py          # current user + board access guards
│     ├─ websockets.py    # connection manager + sync→async notify
│     ├─ tasks.py         # background reminder loop
│     ├─ seed.py          # demo data
│     └─ routers/         # auth, boards, lists, cards, stats
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ vite.config.js
   ├─ index.html
   └─ src/
      ├─ main.jsx
      ├─ App.jsx          # routes + auth guard
      ├─ lib/api.js       # API client + websocket helper
      └─ pages/           # Login, Boards, Board
```
