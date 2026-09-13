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

- **Frontend:** Next.js 16 (App Router) + React 19. Plain CSS design system (no UI lib).
  Auth token lives in localStorage, so route guarding is a client component (`RequireAuth`).
- **Backend:** FastAPI (Python), SQLAlchemy 2.x ORM, Pydantic v2.
- **DB:** Postgres in Docker/production; **defaults to local SQLite** (`taskboard.db`)
  so it runs with zero setup. Controlled by `DATABASE_URL`.
- **Realtime:** native FastAPI WebSockets. In-process by default; if `REDIS_URL` is
  reachable at startup, broadcasts go through Redis pub/sub and presence lives in a
  Redis hash, so multiple backend instances stay in sync (`/api/health` reports which).
- **Auth:** JWT (PyJWT) + passlib/bcrypt password hashing.
- **Background jobs:** in-process asyncio loop for reminders (Redis lock prevents
  duplicates across instances); FastAPI `BackgroundTasks` for OpenAI embeddings.
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
│     ├─ domain.py           # done-column synonyms, completed_at, resolve_due_phrase()
│     ├─ agent_actions.py    # board agent tools, context, plan validation/execution
│     └─ routers/
│        ├─ auth.py          # register, login
│        ├─ boards.py        # list/create/get/delete boards
│        ├─ lists.py         # create/update/delete lists
│        ├─ agent.py         # streaming tool-calling board agent + plan confirm
│        ├─ public_agent.py  # no-login landing-page guide
│        ├─ search.py        # semantic search + reindex
│        ├─ cards.py         # CRUD + move + attachments
│        └─ stats.py         # cards-per-list, completed-per-week
└─ frontend/                 # Next.js 16, App Router
   ├─ Dockerfile
   ├─ package.json
   ├─ next.config.mjs
   ├─ public/favicon.svg
   └─ src/
      ├─ app/
      │  ├─ layout.js         # fonts via next/font (Bricolage Grotesque + Inter), styles.css
      │  ├─ styles.css        # full design system (tokens + components)
      │  ├─ page.js           # /             → Landing (public: hero + AuthCard + features + guide)
      │  ├─ login/            # /login        → redirect to /#signin (kept for old links)
      │  ├─ boards/page.js    # /boards       → BoardsPage
      │  ├─ boards/[id]/      # /boards/:id   → BoardPage
      │  └─ profile/          # /profile      → ProfileForm
      ├─ components/
      │  ├─ RequireAuth.jsx   # client auth gate
      │  ├─ BoardsPage.jsx
      │  ├─ BoardPage.jsx     # kanban, DnD, presence, toasts, all panels
      │  ├─ board/            # BoardCanvas, TaskDrawer, ActivitySidebar, AgentChat, SemanticSearch, BoardStats, ShareDialog
      │  └─ landing/          # Landing, AuthCard, PublicAssistant
      └─ lib/api.js           # API client + session helpers + websocket helper
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
  labels (comma-separated string), attachment_path + attachment_name (nullable),
  completed (0/1), completed_at (nullable), reminder_sent (0/1), embedding
  (JSON text, nullable), list_id, created_at.
- **ActivityLog**: id, board_id (CASCADE), user_email, action_text, created_at.

Cascade: delete a Board → its Lists → their Cards, memberships and activity logs.
delete a List → its Cards. SQLite has `PRAGMA foreign_keys=ON` so DB-level cascades work.

Schema changes: `ensure_schema()` (database.py) runs at startup and adds any model
column missing from the DB — enough for additive changes without Alembic.

"Done" columns: any list whose name is in `domain.DONE_LIST_NAMES` (done, completed,
finished, shipped, closed, …) marks cards moved into it complete and sets `completed_at`.

## 5. REST API surface

Base URL defaults to `http://localhost:8000`. All `/api/boards/**` routes require
`Authorization: Bearer <jwt>` and board membership.

Public (no auth):
- `POST /api/public/assistant` — `{messages:[{role,content}]}` → `{reply, preview_cards, source}`; landing-page guide,
  rate-limited 20/min per IP; falls back to a keyword FAQ when no OpenAI key.

Auth:
- `POST /api/auth/register` — JSON `{email, password}` → `{access_token, token_type, user:{id,email}}`
- `POST /api/auth/login` — **form-encoded** `username`(=email) + `password` → same token shape
- `GET /api/me` — current user `{id, email}`
- `GET /api/health` — `{status:"ok"}`

Boards:
- `GET /api/boards` — boards the user is a member of
- `POST /api/boards` — `{name}` → creates board + owner membership
- `GET /api/boards/{id}` — board detail incl. nested lists→cards, `members`, the caller's `role`, and the newest 30 `activity_logs`
- `GET /api/boards/{id}/activity?limit=&before_id=` — keyset-paginated history `{items, next_before_id}`
- `DELETE /api/boards/{id}` — owner only

Members (sharing):
- `GET /api/boards/{bid}/members` — `[{user_id, email, full_name, avatar_color, role}]`
- `POST /api/boards/{bid}/members` — `{email}`; owner only; 404 unknown email, 409 already a member
- `DELETE /api/boards/{bid}/members/{user_id}` — owner removes anyone; a member can remove themselves (leave)

Lists (broadcast a WS event on success):
- `POST /api/boards/{bid}/lists` — `{name}`
- `PATCH /api/boards/{bid}/lists/{lid}` — `{name?, position?}`
- `DELETE /api/boards/{bid}/lists/{lid}`

Cards (broadcast a WS event on success):
- `POST /api/boards/{bid}/cards?list_id={lid}` — `{title, description?, due_date?, labels?}`
- `PATCH /api/boards/{bid}/cards/{cid}` — `{title?, description?, due_date?, labels?, completed?}`
- `POST /api/boards/{bid}/cards/{cid}/move` — `{list_id, position}` (1-based; both lists are renumbered 1..n)
- `POST /api/boards/{bid}/cards/{cid}/attachment` — multipart file upload (max 10 MB, replaces previous)
- `GET /api/boards/{bid}/cards/{cid}/attachment` — download (member-only; sends original filename)
- `DELETE /api/boards/{bid}/cards/{cid}/attachment`
- `DELETE /api/boards/{bid}/cards/{cid}`

Board agent (needs `OPENAI_API_KEY`):
- `POST /api/boards/{bid}/agent/chat` — `{messages:[{role,content}]}` (last 12 turns) → **SSE stream**:
  `delta` (reply text as generated), then `done {reply, applied[]}` or `plan {plan_id, reply, actions[]}`
  when confirmation is needed (more than 3 changes, any delete, a possible duplicate, or a suggested date).
  Tool-calling with create/move/update/delete card + create/rename list; answers questions from full
  board context; bootstraps Todo/In Progress/Done on an empty board; 30 req/min per user.
- `POST /api/boards/{bid}/agent/confirm` — `{plan_id, skip:[indices]}` applies a pending plan (15-min TTL).
- Logic lives in `app/agent_actions.py` (tool schema, board context, plan validation, duplicate check via
  fuzzy title ≥0.85 or embedding ≥0.80, executor that logs as "AI · <email>").

Stats:
- `GET /api/boards/{bid}/stats` → `{cards_per_list:[{list,count}], completed_per_week:[{week,count}]}`

## 6. WebSocket protocol

- Connect: `ws://<host>/ws/boards/{board_id}`, then send `{"type":"auth","token":"<jwt>"}`
  as the first message within 5s (keeps the JWT out of URLs/logs).
- Server closes 4401 (bad/missing token) / 4403 (not a member).
- Server → client JSON messages (`type` field):
  - `presence` — `{type, viewers:[email...], count}` (sent on every join/leave)
  - `reminder` — `{type, card_id, title, due_date}` (from the background job)
  - `list_created|list_updated|list_deleted` — `{type, list_id}`
  - `card_created` — `{type, card_id, list_id}`
  - `card_updated|card_deleted` — `{type, card_id}`
  - `card_moved` — `{type, card_id, list_id}`
  - `members_changed` — `{type}` (someone was invited/removed)
- Current frontend behavior: `presence` updates the avatar bar; `reminder` shows a
  toast; any other event schedules a board refetch, debounced 150ms so bursts
  (the agent adding five cards) cost one request.

## 7. Auth flow

Routes: `/` is the public landing page (sign-in form + product info + public guide); `/boards` is the app.
`proxy.js` redirects on the `sb_token` cookie: no cookie → `/#signin`, cookie on `/` → `/boards`.

Register/login returns a JWT (sub = user id, 24h expiry). Frontend stores token +
email in localStorage. Every request sends `Authorization: Bearer`. `get_current_user`
decodes and loads the user; `require_board_access(board_id, db, user, owner_only?)`
checks membership (and owner role where needed). WebSocket auth uses the same token
sent as the first socket message, verified against membership before events flow.

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

**Also done (Sept 2026):** Landing page at `/` (dark brand design, sign-in card, features, how-it-works,
stack, and a public no-login guide assistant with card previews); due-date phrases resolved in code
(`domain.resolve_due_phrase`) instead of by the model.

**Earlier (Sept 2026):** Next.js migration; board sharing; attachment download; WS auth via
first message; background embeddings + numpy scoring; `completed_at`; proper reorder; SQLite FK
pragma; lifespan; optional Redis mode; done-column synonyms; agent bootstraps empty boards and
knows today's weekday; activity paging; inline list rename/delete; board delete; drawer edits
title/due date; drop indicator for intra-column reorder; token cookie + `proxy.js`; error boundary
+ skeleton; design-token CSS classes replace most inline styles.

**Pending / good next steps (roughly by value):**
1. **Deploy live** — frontend → Vercel/Netlify (root `frontend/`), backend →
   Render/Railway (root `backend/`, set `DATABASE_URL` to their Postgres,
   `CORS_ORIGINS` and `FRONTEND_URL` to the frontend URL, `JWT_SECRET`). Highest priority for a portfolio.
2. **Automation rules engine** (queued next) — "when a card moves to X, do Y" (Slack/webhook).
3. **Optimistic drag-and-drop** — move the card in local state before the API confirms;
   today the board refetches after each drop (~100ms flicker).
4. **pgvector** for semantic search once on Postgres; today embeddings are JSON text
   scored with numpy per query.
5. **Unique extras discussed:** command palette (Ctrl-K) for quick add/jump;
   card aging / "stale" marker for untouched cards.
6. **Hardening:** refresh tokens; httpOnly auth cookie set by the backend; per-event
   frontend patches instead of refetch; automated tests (the scripted API checks used
   during development live outside the repo).

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
App: http://localhost:3000 · API docs: http://localhost:8000/docs ·
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
> Trello-style collaborative task board. Stack: Next.js (App Router) + FastAPI + SQLAlchemy
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
