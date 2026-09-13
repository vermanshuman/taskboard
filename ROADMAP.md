# Stack Board — feature backlog

Consolidated list to continue from. Ordered within each group by value; ✅ = done.

## A. Production-workflow features (from the media-company brief, Sept 2026)

Target: make the demo speak to "kanban production board + approvals + payments + calendar" briefs.

| # | Feature | Notes |
|---|---------|-------|
| A1 | **Milestone templates** | Board/card template: columns + a checklist of milestones (Script → Storyboard → Edit → Review → Publish), each with a default role and a due-offset ("T-14 days"). Creating a card from a template stamps out sub-tasks with computed dates. Editable in the UI by non-technical users. Their headline item. |
| A2 | **Assignees, "My tasks", notifications** | Cards get assignee(s); `/my-tasks` across all boards; in-app bell (assigned / due soon / approved). Reuse WS + reminder job. |
| A3 | **Approval step with verdicts** | Card state `Submitted → Approved / Changes requested`, required comment on changes, who/when, verdict drives the workflow (auto-move, unlock next milestone). Optional Google Docs iframe on the card. |
| A4 | **Row-level visibility** | Roles beyond owner/member: *manager* vs *contributor*; contributors see only cards assigned to them and never see restricted fields. Extends `board_memberships`. |
| A5 | **Calendar view** | Month view over the same cards (due dates), drag to reschedule, Board ↔ Calendar toggle. "One dataset, two views." Cheap and visual. |
| A6 | **Payment lines on approval (lite)** | Rate card per task type; manager approval writes an idempotent `payment_line` (approve twice → one line) with amount/currency/contributor; CSV export. Small feature, strongest interview talking point. |
| A7 | **Outgoing webhooks / automation rules** | "When a card is approved → POST to URL / move to column / add label", with retries + delivery log. Doubles as the queued automation rules engine. |

Suggested order: A1 → A2 → A3 → A5 → A6 → A4 → A7.

Not doing: Frame.io / YouTube / Tipalti integrations (they keep those; mocks prove little), timesheets, retainers, multi-entity.

## B. Agent improvements (continuation of the 1–13 list)

| # | Feature | Status |
|---|---------|--------|
| 1–7 | Tool-calling agent: act on the board, answer questions, confirm bulk/destructive, conversation memory, streaming, smarter card content, duplicate check | ✅ done |
| 8 | **Hand off from the landing guide into the app** — after a card preview, "Sign in with the demo and create these": one click logs in, creates a board, and the real agent creates the previewed cards | todo |
| 9 | **Suggested follow-up chips** after each guide answer (2–3, based on what was just discussed) | todo |
| 10 | **Link guide answers to page sections** (#features etc.) or highlight the matching feature | todo |
| 11 | Rate limit + cost cap on the board agent | ✅ 30 req/min per user (cost cap: not yet — add a per-day token budget if the demo goes public) |
| 12 | Log every agent action to the activity feed with the prompt | ✅ logged as "AI · <email>" + an "asked: …" line |
| 13 | **Undo** — "undo that" reverses the last agent action set (needs the action log from #12; store an inverse per applied action) | todo |

## C. Earlier "next steps" still open

- Deploy live (Vercel + Render/Railway, Postgres, `FRONTEND_URL` / `CORS_ORIGINS` / `JWT_SECRET`).
- Optimistic drag-and-drop (move locally before the API confirms).
- pgvector once on Postgres.
- Command palette (Ctrl-K); card aging / "stale" marker.
- Refresh tokens; httpOnly auth cookie set by the backend; per-event frontend patches instead of refetch; automated tests in the repo.
- Commit the current work (everything since the Vite → Next.js migration is uncommitted as of 2026-09-12).
