# Stack Board — frontend (Next.js)

Next.js 16 (App Router) client for the FastAPI backend in `../backend`.

```bash
npm install
npm run dev        # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` in `.env.local` (see `.env.example`) to point at the backend.

## Layout

```
src/
├─ app/
│  ├─ layout.js            # root layout: fonts (next/font) + styles.css
│  ├─ page.js              # /            → boards list
│  ├─ login/               # /login       → LoginForm (email/password + Google OAuth callback)
│  ├─ boards/[id]/         # /boards/:id  → BoardPage
│  ├─ profile/             # /profile     → ProfileForm
│  └─ styles.css           # design system (tokens + components)
├─ components/
│  ├─ RequireAuth.jsx      # client-side auth gate (JWT lives in localStorage)
│  ├─ BoardsPage.jsx
│  ├─ BoardPage.jsx        # kanban + live socket + all panels
│  └─ board/               # BoardCanvas, TaskDrawer, ActivitySidebar, AgentChat, SemanticSearch, BoardStats
└─ lib/api.js              # API client + session helpers + openBoardSocket()
```

Route files under `app/` are server components that set metadata; the interactive
pages are `"use client"` components they render.
