# Collaborative Task Board

A real-time, Trello-style task board. Full-stack portfolio project.

**Stack:** Next.js (React) · FastAPI (Python) · Postgres · Redis · WebSockets · OpenAI · Docker

---

## Features

**Boards & cards**
- Boards → Lists → Cards with drag-and-drop between and within columns
- Inline list rename / delete, board delete (owner), card editor drawer (title, due date, description, labels, attachment)
- Board sharing: owner invites registered users by email; members can leave
- Live sync over WebSockets — every change appears in other open sessions instantly
- Live presence (who else is viewing), reminder toasts for cards due within 24h, due-date colour coding
- Card ageing: cards nobody has touched for 7 / 14 / 30 days fade and yellow like an old sticky note, with a badge
- Client status page: a read-only link per board (no sign-in) with progress, an AI-written summary of what shipped /
  what's next / what's at risk, and recent activity — nothing sensitive leaves the board
- "Since you were here": come back to a board and get a one-line summary of what teammates changed while you were
  away, with the changed cards highlighted
- Activity feed with paging; project-health metrics (cards per column, completed per week)

**AI (needs `OPENAI_API_KEY`)**
- Board agent: chat that creates, moves, edits, completes and deletes cards, adds columns, and answers questions
  about the board ("what's overdue?", "summarise for standup"). Streams replies, remembers context, flags likely
  duplicates, and asks before bulk or destructive changes. Click the mic to talk instead of typing
  (Chrome / Edge / Safari). Drop, paste or pick an image: a photo of sticky notes or a whiteboard becomes
  cards in the right columns; an app screenshot becomes a structured bug card — always previewed first
- Semantic search: find cards by meaning using OpenAI embeddings (written in the background on create/update)

**Landing page**
- Public `/` with product overview, sign-in / sign-up, one-click demo, and a no-login AI guide that answers
  questions and previews how the planning agent would split work into cards

**Auth & infra**
- JWT auth (email/password or Google sign-in), owner vs member roles
- Next.js proxy redirects unauthenticated navigations on the server (token mirrored in a cookie)
- SQLite by default, Postgres via `DATABASE_URL`; startup adds any missing columns automatically
- Optional Redis pub/sub so multiple backend instances share broadcasts and presence
- Seed script: demo user + sample board so the demo is never empty

---

## Run it on Windows

### Option A — Docker (everything at once, recommended)

Requires Docker Desktop for Windows.

```powershell
cd taskboard
docker compose up --build
```

Then open:
- App: http://localhost:3000 (landing page + sign-in; `/boards` once signed in)
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
Open http://localhost:3000

---

## Architecture notes (read these so you can explain it)

**Auth flow:** `POST /api/auth/register|login` returns a JWT. The frontend stores
it and sends `Authorization: Bearer <token>` on every request. `get_current_user`
(in `deps.py`) decodes the token and loads the user; `require_board_access` then
checks the user is a member of the board before any board operation.

**WebSocket flow:** the client opens `ws://.../ws/boards/{id}` and sends
`{"type":"auth","token":"<jwt>"}` as its first message (keeps the token out of
URLs and logs). The server verifies board membership before events flow. CRUD routes run
synchronously in a threadpool; after a change they call `notify(board_id, event)`,
which uses `run_coroutine_threadsafe` to schedule a broadcast on the main event
loop. `BoardConnectionManager` (in `websockets.py`) fans the event out to every
socket watching that board. The frontend refetches the board on any event (debounced);
a production version would apply the specific event.

**Background reminders:** `tasks.py` runs an asyncio loop started at app startup.
Every interval it finds cards due within 24h that haven't been reminded, broadcasts
a `reminder` event, and marks them sent. For durability/scale this can move to a
Celery beat task using the Redis broker already in `docker-compose.yml`.

**Scaling note:** with no Redis, the WebSocket manager and reminder loop are
in-process (one backend instance). If `REDIS_URL` is reachable at startup, broadcasts
go through Redis pub/sub, presence is shared, and a Redis lock stops instances
sending duplicate reminders — so you can run several backends behind a load balancer.

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
   ├─ next.config.mjs
   └─ src/
      ├─ app/             # Next.js App Router: layout, /, /login, /boards/[id], /profile
      ├─ components/      # RequireAuth, BoardsPage, BoardPage, board/* panels
      └─ lib/api.js       # API client + websocket helper
```
