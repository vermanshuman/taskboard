# Stack Board — Full Project Context & Handoff

A complete, self-contained description of this project. Paste this whole file
into another AI assistant (ideally with the `taskboard` source zip attached) to
continue development with full context. Written as of the current build.

---

## 1. What this is

**Stack Board** — a real-time, Trello-style collaborative task board, built as a
portfolio project to demonstrate full-stack range (auth, relational data, REST,
WebSockets, async background jobs, live presence, Docker, deployment).

- **Owner goal:** a credible, deployable, somewhat-unique full-stack app for a
  freelancing/portfolio profile, with a live demo link.
- **Owner background:** full-stack, strong on Python/Java backend. Building this
  with AI assistance; may hire a frontend developer for remaining UI work.
- **Environment:** developing on **Windows**. Runs commands themselves; wants
  complete, ready-to-paste files, not snippets.

## 2. Stack & key decisions

- **Frontend:** React 18 + Vite, React Router. Plain CSS design system (no UI lib).
- **Backend:** FastAPI (Python), SQLAlchemy 2.x ORM, Pydantic v2.
- **DB:** Postgres in Docker/production; **defaults to local SQLite** (`taskboard.db`)
  so it runs with zero setup. Controlled by `DATABASE_URL`.
- **Realtime:** native FastAPI WebSockets, in-process connection manager.
- **Auth:** JWT (PyJWT) + passlib/bcrypt password hashing.
- **Background jobs:** in-process asyncio loop (not Celery yet — see §9).
- **Infra:** Docker Compose (db, redis, backend, frontend). Redis is provisioned
  for future scaling (pub/sub, Celery) but the current code runs single-instance
  without needing it.

Deliberate decisions worth preserving:
- Sync SQLAlchemy + sync route handlers (simple, reliable). WebSocket broadcasts
  from sync code go through a `notify()` bridge using `run_coroutine_threadsafe`
  onto the main loop captured at startup.
- SQLite default keeps local dev frictionless; Postgres via env for prod.

## 3. File tree

```
taskboard/
├─ docker-compose.yml        # db, redis, backend, frontend
├─ README.md                 # run instructions + architecture notes
├─ PROJECT_CONTEXT.md        # this file
├─ .gitignore
├─ backend/
│  ├─ Dockerfile             # seeds then runs uvicorn
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ app/
│     ├─ main.py             # app, CORS, routers, /ws endpoint, startup
│     ├─ config.py           # pydantic-settings (env)
│     ├─ database.py         # engine/session, get_db, Base
│     ├─ models.py           # User, Board, BoardMembership, List, Card
│     ├─ schemas.py          # Pydantic request/response models
│     ├─ security.py         # hash/verify password, JWT encode/decode
│     ├─ deps.py             # get_current_user, require_board_access
│     ├─ websockets.py       # BoardConnectionManager + notify() bridge
│     ├─ tasks.py            # background due-date reminder loop
│     ├─ seed.py             # demo user + sample board (idempotent)
│     └─ routers/
│        ├─ auth.py          # register, login
│        ├─ boards.py        # list/create/get/delete boards
│        ├─ lists.py         # create/update/delete lists
│        ├─ cards.py         # CRUD + move + attachment upload
│        └─ stats.py         # cards-per-list, completed-per-week
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ vite.config.js
   ├─ index.html             # fonts (Bricolage Grotesque + Inter), favicon
   ├─ public/favicon.svg
   └─ src/
      ├─ main.jsx            # entry, imports styles.css
      ├─ App.jsx             # routes + RequireAuth guard
      ├─ styles.css          # full design system (tokens + components)
      ├─ lib/api.js          # API client + session helpers + websocket helper
      └─ pages/
         ├─ Login.jsx        # split-screen auth (register/login)
         ├─ Boards.jsx       # board grid, user chip, empty state
         └─ Board.jsx        # kanban, presence, toasts, due colors, skeleton
```

## 4. Data model (SQLAlchemy)

- **User**: id, email (unique), hashed_password, created_at. → memberships.
- **Board**: id, name, owner_id→users, created_at. → owner, memberships, lists
  (ordered by List.position, cascade delete).
- **BoardMembership**: id, board_id, user_id, role ("owner"|"member"),
  unique(board_id, user_id). Access control is via membership rows.
- **List**: id, name, position (int), board_id. → cards (ordered by position,
  cascade delete).
- **Card**: id, title, description, position (int), due_date (nullable),
  labels (comma-separated string), attachment_path (nullable),
  completed (0/1), reminder_sent (0/1), list_id, created_at.

Cascade: delete a Board → its Lists → their Cards. delete a List → its Cards.

## 5. REST API surface

Base URL defaults to `http://localhost:8000`. All `/api/boards/**` routes require
`Authorization: Bearer <jwt>` and board membership.

Auth:
- `POST /api/auth/register` — JSON `{email, password}` → `{access_token, token_type, user:{id,email}}`
- `POST /api/auth/login` — **form-encoded** `username`(=email) + `password` → same token shape
- `GET /api/me` — current user `{id, email}`
- `GET /api/health` — `{status:"ok"}`

Boards:
- `GET /api/boards` — boards the user is a member of
- `POST /api/boards` — `{name}` → creates board + owner membership
- `GET /api/boards/{id}` — board detail incl. nested lists→cards
- `DELETE /api/boards/{id}` — owner only

Lists (broadcast a WS event on success):
- `POST /api/boards/{bid}/lists` — `{name}`
- `PATCH /api/boards/{bid}/lists/{lid}` — `{name?, position?}`
- `DELETE /api/boards/{bid}/lists/{lid}`

Cards (broadcast a WS event on success):
- `POST /api/boards/{bid}/cards?list_id={lid}` — `{title, description?, due_date?, labels?}`
- `PATCH /api/boards/{bid}/cards/{cid}` — `{title?, description?, due_date?, labels?, completed?}`
- `POST /api/boards/{bid}/cards/{cid}/move` — `{list_id, position}` (drag-and-drop target)
- `POST /api/boards/{bid}/cards/{cid}/attachment` — multipart file upload
- `DELETE /api/boards/{bid}/cards/{cid}`

Stats:
- `GET /api/boards/{bid}/stats` → `{cards_per_list:[{list,count}], completed_per_week:[{week,count}]}`

## 6. WebSocket protocol

- Connect: `ws://<host>/ws/boards/{board_id}?token=<jwt>`
- Server verifies membership before accepting; closes 4401 (bad token) / 4403 (no access).
- Server → client JSON messages (`type` field):
  - `presence` — `{type, viewers:[email...], count}` (sent on every join/leave)
  - `reminder` — `{type, card_id, title, due_date}` (from the background job)
  - `list_created|list_updated|list_deleted` — `{type, list_id}`
  - `card_created` — `{type, card_id, list_id}`
  - `card_updated|card_deleted` — `{type, card_id}`
  - `card_moved` — `{type, card_id, list_id}`
- Current frontend behavior: `presence` updates the avatar bar; `reminder` shows a
  toast; any other event triggers a full board refetch (crude but correct).

## 7. Auth flow

Register/login returns a JWT (sub = user id, 24h expiry). Frontend stores token +
email in localStorage. Every request sends `Authorization: Bearer`. `get_current_user`
decodes and loads the user; `require_board_access(board_id, db, user, owner_only?)`
checks membership (and owner role where needed). WebSocket auth uses the same token
via query param, verified against membership before the socket is accepted.

## 8. Frontend specifics

- **api.js** exports: `api.*` (all endpoints), `openBoardSocket(boardId, onMessage)`,
  and session helpers `getToken/setToken/getEmail/setEmail`. Token+email in localStorage.
- **styles.css** is the design system. CSS variables define the palette and type:
  - ink `#191a23`, accent (indigo) `#5546e1`, surface `#f5f5f8`, danger `#d1435b`,
    column spine tints (`--spine-1..5`), radius `12px`, shadows, gap `16px`.
  - Fonts: display = "Bricolage Grotesque", UI/body = "Inter" (loaded via Google
    Fonts in index.html). Falls back to serif if fonts can't load.
  - Component classes already exist: `.btn/.btn-primary/.btn-ghost`, `.input`,
    `.topbar/.wordmark`, `.auth*` (split login), `.board-tile/.board-grid`,
    `.column/.task/.add-card`, `.presence/.av/.live-dot`, `.toast*`, `.empty`,
    `.skeleton-canvas/.sk-*`, due pills `.due.soon/.due.overdue`.
- **Pages:** Login (split-screen with stacked-card motif), Boards (grid + create +
  user chip + empty state), Board (kanban columns, live presence bar, reminder
  toasts, due-date color coding, loading skeleton, empty state).

## 9. What is built & verified vs. what's pending

**Built and tested (end-to-end + WebSocket tests pass):**
- JWT auth (register/login), membership-based access control
- Boards/Lists/Cards CRUD + card move endpoint + file attachment
- WebSocket live sync; live presence (avatars + count on join/leave)
- Background due-date reminder loop → surfaced as UI toast
- Stats endpoint; seed script (demo@taskboard.dev / demo1234)
- Full design system; all three pages styled and screenshot-verified
- Docker Compose + Dockerfiles; SQLite-default / Postgres-via-env

**Pending / good next steps (roughly by value):**
1. **Deploy live** — frontend → Vercel/Netlify (root `frontend/`), backend →
   Render/Railway (root `backend/`, set `DATABASE_URL` to their Postgres,
   `CORS_ORIGINS` to the frontend URL, `JWT_SECRET`). Highest priority for a portfolio.
2. **Real drag-and-drop** — replace plain card rendering in `Board.jsx` with
   `@hello-pangea/dnd` or `dnd-kit`, calling `api.moveCard(boardId, cardId, listId, position)`.
   CSS classes (`.task`, `.column`) are ready.
3. **Card detail modal** — open a card to edit description, due date, labels,
   upload attachment (endpoints exist).
4. **Stats view** — charts from `api.getStats` (e.g. recharts).
5. **Unique extras discussed:** command palette (Ctrl-K) for quick add/jump;
   card aging / "stale" marker for untouched cards.
6. **Hardening:** move reminders to Celery+Redis for durability; Redis pub/sub so
   presence/broadcast work across multiple backend instances; refresh tokens;
   per-event frontend updates instead of full refetch; tests.

## 10. How to run (Windows)

Backend (PowerShell):
```powershell
cd taskboard\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000
```
Frontend (second window):
```powershell
cd taskboard\frontend
npm install
npm run dev
```
App: http://localhost:5173 · API docs: http://localhost:8000/docs ·
Demo login: demo@taskboard.dev / demo1234.
To see live presence: open the same board in two windows (or two accounts).

Docker (all services): `docker compose up --build` from the `taskboard` folder.

## 11. Repo / deployment notes

- One repo (monorepo) holds both apps. Deploy them as two services, each pointed
  at its subfolder (`frontend/` and `backend/`). The root `docker-compose.yml`
  only works when both live in one repo.
- `.gitignore` already excludes `node_modules/`, `.venv/`, `*.db`, `dist/`, `.env`.

---

## 12. Prompt to resume elsewhere

> I'm continuing a full-stack portfolio project called "Stack Board" — a real-time
> Trello-style collaborative task board. Stack: React (Vite) + FastAPI + SQLAlchemy
> + Postgres (SQLite by default) + WebSockets + Docker. I'm on Windows, I run commands
> myself, and I want complete ready-to-paste files, not snippets, one change at a time.
> The backend is complete and tested (JWT auth with board membership, Boards→Lists→Cards
> CRUD + card move + file upload, WebSocket live sync, live presence, a background
> due-date reminder job surfaced as UI toasts, stats endpoint, seed script). The frontend
> has a full CSS design system and three styled pages (Login, Boards, Board with kanban,
> presence avatars, toasts, due-date colors). [Paste this PROJECT_CONTEXT.md for the full
> API surface, data model, WebSocket protocol, and file tree; attach the source zip if you can.]
> What I want to do next is: [fill in — e.g. deploy to Render+Vercel / add drag-and-drop /
> build the card detail modal / add a Ctrl-K command palette].
