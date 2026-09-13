"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api.js";

const SUGGESTIONS = [
  "What can the AI agent do?",
  "How does live collaboration work?",
  "Plan: launch the newsletter by Friday and fix the signup bug",
  "How do I share a board with my team?",
];

const GREETING = {
  role: "assistant",
  content:
    "Hi! I'm the Stack Board guide. Ask me what it does, how it's built, or describe some work and I'll show how the planning agent would split it into cards.",
};

/**
 * Landing-page chat as a floating bubble (bottom-right). No login needed; the
 * backend has product knowledge only and returns optional preview cards when
 * the visitor describes work. `open` is controlled by the page so the nav
 * link and hero button can open it too.
 */
export default function PublicAssistant({ open, onOpenChange }) {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      // Only role/content go to the API; keep the last few turns for context.
      const history = next
        .filter((m) => m !== GREETING)
        .slice(-8)
        .map(({ role, content }) => ({ role, content }));
      const res = await api.publicAssistant(history);
      setMessages((m) => [...m, { role: "assistant", content: res.reply, cards: res.preview_cards }]);
    } catch (err) {
      const msg = String(err.message || "");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: msg.startsWith("429")
            ? "You're going fast — give me a minute and try again."
            : "I couldn't reach the server just now. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`fab fab-agent lp-fab ${open ? "open" : ""}`}
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Close the guide" : "Ask the AI guide"}
        title="Ask the AI guide"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 10h8M8 13h5" strokeWidth="1.6" opacity="0.9" /></svg>
        )}
      </button>
      {!open && <span className="lp-fab-hint">Ask the AI guide</span>}

      {open && (
        <div className="pa pa-float" role="dialog" aria-label="Stack Board guide">
          <div className="pa-head">
            <span className="pa-dot" />
            Stack Board guide
            <span className="pa-tag">no sign-in needed</span>
            <button type="button" className="pa-close" onClick={() => onOpenChange(false)} aria-label="Close">✕</button>
          </div>

          <div className="pa-body">
            {messages.map((m, i) => (
              <div key={i} className={`pa-msg ${m.role}`}>
                <div className="pa-bubble">{m.content}</div>
                {m.cards?.length > 0 && <PreviewBoard cards={m.cards} />}
              </div>
            ))}
            {busy && (
              <div className="pa-msg assistant">
                <div className="pa-bubble typing">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <div className="pa-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pa-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="pa-foot">
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask anything about Stack Board…"
              maxLength={1000}
              disabled={busy}
            />
            <button className="btn btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Mini kanban rendering of the agent's preview cards, grouped by column. */
function PreviewBoard({ cards }) {
  const columns = [];
  for (const c of cards) {
    const name = c.column || "Todo";
    let col = columns.find((x) => x.name === name);
    if (!col) columns.push((col = { name, cards: [] }));
    col.cards.push(c);
  }
  return (
    <div className="pa-preview">
      {columns.map((col) => (
        <div key={col.name} className="pa-col">
          <div className="pa-col-name">{col.name}</div>
          {col.cards.map((c, i) => (
            <div key={i} className="pa-card">
              <div className="pa-card-title">{c.title}</div>
              {(c.labels || c.due_date_iso) && (
                <div className="pa-card-meta">
                  {c.labels && c.labels.split(",").map((l) => l.trim()).filter(Boolean).map((l) => (
                    <span key={l} className="pa-label">{l}</span>
                  ))}
                  {c.due_date_iso && <span className="pa-due">Due {formatDate(c.due_date_iso)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="pa-preview-note">Preview only — sign in and the agent creates these on a real board.</div>
    </div>
  );
}

function formatDate(ymd) {
  const d = new Date(ymd + "T00:00:00");
  return isNaN(d) ? ymd : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
