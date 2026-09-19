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

## D. Unique / differentiating features (suggested 2026-09-17, not yet built)

Ranked by impact per day of work. Top picks for a freelance demo: D1, D7, D2.

| # | Feature | Notes | Effort |
|---|---------|-------|--------|
| D1 | **Voice-driven board** ✅ | Hold-to-talk mic in the board agent (`lib/useVoiceInput.js`) → Web Speech API → same `/agent/chat` endpoint. Chrome/Edge/Safari; button hidden where unsupported (Firefox). | done 2026-09-17 |
| D2 | **Visible card ageing** ✅ | `Card.updated_at` set by `domain.touch()` on edit/move/attachment (not on sibling renumbering). UI: 7/14/30-day levels fade + yellow with an "Nd" badge and tooltip; finished cards and done-column cards never age; agent context shows "untouched Nd (stale)". | done 2026-09-18 |
| D3 | **Standup mode** | Guided 3-min meeting: each member's done / doing / blocked in turn, timer, agent writes the summary to the activity log. | 1 day |
| D4 | **"Explain this board"** | First open of a shared board → 5-line agent briefing (purpose, what's hot, overdue, most active). Zero new backend. | 2 h |
| D5 | **Time-travel slider** | Scrub to see the board as it was yesterday / last week, rebuilt from the activity log. Requires log entries to carry structured data (entity, before/after), not just text. | 1 day |
| D6 | **Smart split** | Drop a big card → agent proposes sub-cards with ordering/dependencies as a preview → one click creates. Extends the plan/confirm flow. | ½ day |
| D7 | **Paste-in intake** | Paste an email / meeting notes / Slack thread → agent extracts action items into cards with owners and dates. Same tool-calling, new prompt + UI box. | ½ day |
| D8 | **Live cursors** | Figma-style pointers of other viewers with names. Presence + WebSockets exist; add a throttled `cursor` event. | ½ day |
| D9 | **Board health score** | 0–100 per board tile from overdue ratio, stale cards, WIP per column, load balance; click to see why. | ½ day |
| D10 | **Focus view** | Ctrl-K → "focus": only your cards due this week, sorted by urgency, with a pomodoro timer. Depends on the command palette (C) and assignees (A2). | ½ day |

## E. AI-first features (suggested 2026-09-18)

| # | Feature | Notes | Status |
|---|---------|-------|--------|
| E1 | **Photo → board** ✅ | Photo of sticky notes / whiteboard / printed list → one card per item, headings mapped to existing columns, date phrases moved into `due`. `POST /agent/vision` (gpt-4o-mini vision, `create_card` tool only) → always a confirm plan. UI: camera button, paste (Ctrl+V) or drop an image into the agent panel; optional note in the input goes along as instructions. | done 2026-09-18 |
| E2 | **Screenshot → bug card** ✅ | Same endpoint; an app screenshot / error / circled UI becomes ONE card with Where / Steps / Expected / Actual, label `bug`, exact error text quoted. | done 2026-09-18 |
| E3 | **"What changed since you were here"** ✅ | `BoardMembership.last_seen_at` stamped when the member's last board socket closes (leaving, not loading). `GET /boards/{id}/since` → changed card ids (by `updated_at`), activity entries, and a one-line narration (model for ≥4 entries with exact-count rules, deterministic below). UI: dismissible banner on the board + changed cards glow for 9s. First visit only sets the baseline. `app/since.py`. | done 2026-09-19 |
| E4 | Ask a card "why are you stuck?" | Per-card agent thread with that card's history + related cards via embeddings. | todo |
| E5 | Natural-language filter | "overdue bugs nobody touched in 2 weeks" → live board filter. | todo |
| E6 | Risk radar | Predictive ⚠ on cards likely to slip (vague title, no owner, near due, idle, similar cards slipped before). | todo |
| E7 | **Client status page** ✅ | Owner creates a link from the Share dialog → public `/status/<token>` (no sign-in, `noindex`): progress bar, agent-written summary / shipped this week / in progress / next / risks, per-column counts, recent activity. Titles only — no descriptions, attachments or emails (activity text is scrubbed). Narrative cached on the board (`status_narrative`), regenerated lazily when the board changed, throttled to 10 min; owner can regenerate or turn off. Data-only fallback without an OpenAI key. `app/status_report.py`. | done 2026-09-19 |
| E8 | Weekly retro | Agent-written retro from the activity log. | todo |
| E9 | Handoff notes | On column change, agent drafts a handoff note from the card's history. | todo |
| E10 | Meeting mode | Continuous voice during a call → proposed cards/moves to tick afterwards. | todo |
| E11 | Cross-board duplicate radar | Embeddings across all boards. | todo |
| E12 | Board-to-board agent | Several boards in one agent context. | todo |
| E13 | WIP coach | Column WIP limits + agent advice on what to finish/pull back. | todo |
| E14 | Auto-triage inbox | Catch-all Inbox column; anything dropped gets titled, labelled, dated, sorted by the agent, with undo. | todo |

## C. Earlier "next steps" still open

- Deploy live (Vercel + Render/Railway, Postgres, `FRONTEND_URL` / `CORS_ORIGINS` / `JWT_SECRET`).
- Optimistic drag-and-drop (move locally before the API confirms).
- pgvector once on Postgres.
- Command palette (Ctrl-K).
- Refresh tokens; httpOnly auth cookie set by the backend; per-event frontend patches instead of refetch; automated tests in the repo.
- Commit the current work (everything since the Vite → Next.js migration is uncommitted as of 2026-09-12).
