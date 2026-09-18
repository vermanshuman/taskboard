"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api.js";
import { useVoiceInput } from "@/lib/useVoiceInput.js";

const GREETING = {
  role: "assistant",
  text: "Hi! Tell me what to add, move, finish or clean up — or ask me what's overdue, what's in progress, or for a standup summary.",
};

const SUGGESTIONS = [
  "What's overdue?",
  "Summarise this board for standup",
  "Move everything that's finished to Done",
];

/**
 * Board agent chat. Streams replies; when the backend wants confirmation
 * (bulk / destructive / possible duplicates / suggested dates) it renders a
 * plan card with per-action checkboxes and Apply / Cancel.
 */
export default function AgentChat({ boardId, isOpen, setIsOpen, onBoardChanged }) {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const abortRef = useRef(null);
  const sendRef = useRef(null);
  const imageInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Click-to-talk: interim words show in the input; when you pause, the final text is sent.
  const voice = useVoiceInput({
    onTranscript: (t) => setInput(t),
    onFinal: (t) => sendRef.current?.(t),
    onError: (code) =>
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          error: true,
          text:
            code === "not-allowed" || code === "service-not-allowed"
              ? "Microphone access was blocked. Allow it in the browser's site settings to talk to the agent."
              : "Voice input failed — try again or type instead.",
        },
      ]),
  });

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy, isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function patchLast(updater) {
    setMessages((m) => {
      const next = [...m];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const history = [...messages, { role: "user", text: content }];
    setMessages([...history, { role: "assistant", text: "", streaming: true }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = history
      .filter((m) => m !== GREETING && !m.plan)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text || "(no reply)" }));

    let touchedBoard = false;
    try {
      await api.agentChat(
        boardId,
        payload,
        (ev) => {
          if (ev.type === "delta") {
            patchLast((m) => ({ ...m, text: m.text + ev.text }));
          } else if (ev.type === "plan") {
            patchLast((m) => ({
              ...m,
              streaming: false,
              text: ev.reply,
              plan: { id: ev.plan_id, actions: ev.actions, skip: new Set(), status: "pending" },
            }));
          } else if (ev.type === "done") {
            touchedBoard = ev.applied.length > 0;
            patchLast((m) => ({ ...m, streaming: false, text: ev.reply || m.text, applied: ev.applied }));
          } else if (ev.type === "error") {
            patchLast((m) => ({ ...m, streaming: false, text: ev.message, error: true }));
          }
        },
        controller.signal
      );
    } catch (err) {
      const msg = String(err.message || "");
      const text = msg.startsWith("501")
        ? "The AI agent isn't configured (missing OpenAI API key)."
        : msg.startsWith("429")
          ? "Too many requests — give it a minute."
          : "Couldn't reach the AI agent. Please try again.";
      patchLast((m) => ({ ...m, streaming: false, text, error: true }));
    } finally {
      setBusy(false);
      if (touchedBoard) onBoardChanged();
    }
  }

  useEffect(() => {
    sendRef.current = send;
  });

  /**
   * Image → plan. A photo of sticky notes / a whiteboard becomes one card per
   * item; an app screenshot becomes a single structured bug card. Always goes
   * through the confirm card. Any text in the input is sent along as a note.
   */
  async function sendImage(file) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setMessages((m) => [...m, { role: "assistant", error: true, text: "That isn't an image — try a PNG, JPEG or WebP." }]);
      return;
    }
    const note = input.trim();
    const preview = URL.createObjectURL(file);
    setMessages((m) => [
      ...m,
      { role: "user", text: note, image: preview, imageName: file.name },
      { role: "assistant", text: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    let touchedBoard = false;
    try {
      const ev = await api.agentVision(boardId, file, note);
      if (ev.type === "plan") {
        patchLast((m) => ({
          ...m,
          streaming: false,
          text: ev.reply,
          plan: { id: ev.plan_id, actions: ev.actions, skip: new Set(), status: "pending" },
        }));
      } else {
        touchedBoard = (ev.applied || []).length > 0;
        patchLast((m) => ({ ...m, streaming: false, text: ev.reply, applied: ev.applied }));
      }
    } catch (err) {
      const msg = String(err.message || "");
      const text = msg.startsWith("413")
        ? "That image is over 6 MB — try a smaller one."
        : msg.startsWith("415")
          ? "Please use a PNG, JPEG, WebP or GIF."
          : msg.startsWith("501")
            ? "The AI agent isn't configured (missing OpenAI API key)."
            : "Couldn't read that image. Please try again.";
      patchLast((m) => ({ ...m, streaming: false, text, error: true }));
    } finally {
      setBusy(false);
      if (touchedBoard) onBoardChanged();
    }
  }

  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      sendImage(item.getAsFile());
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) sendImage(file);
  }

  function toggleSkip(msgIndex, actionIndex) {
    setMessages((m) =>
      m.map((msg, i) => {
        if (i !== msgIndex || !msg.plan) return msg;
        const skip = new Set(msg.plan.skip);
        if (skip.has(actionIndex)) skip.delete(actionIndex);
        else skip.add(actionIndex);
        return { ...msg, plan: { ...msg.plan, skip } };
      })
    );
  }

  async function applyPlan(msgIndex) {
    const msg = messages[msgIndex];
    if (!msg?.plan || busy) return;
    setBusy(true);
    try {
      const res = await api.agentConfirm(boardId, msg.plan.id, [...msg.plan.skip]);
      setMessages((m) => [
        ...m.map((x, i) => (i === msgIndex ? { ...x, plan: { ...x.plan, status: "applied" } } : x)),
        { role: "assistant", text: res.reply, applied: res.applied },
      ]);
      if (res.applied.length) onBoardChanged();
    } catch (err) {
      const expired = String(err.message).startsWith("404");
      setMessages((m) => [
        ...m.map((x, i) => (i === msgIndex ? { ...x, plan: { ...x.plan, status: "cancelled" } } : x)),
        { role: "assistant", text: expired ? "That plan expired — just ask again." : "Couldn't apply the changes.", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function cancelPlan(msgIndex) {
    setMessages((m) => [
      ...m.map((x, i) => (i === msgIndex ? { ...x, plan: { ...x.plan, status: "cancelled" } } : x)),
      { role: "assistant", text: "Okay, nothing changed." },
    ]);
  }

  return (
    <>
      <button
        className={`fab fab-agent ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close AI agent" : "Open AI agent"}
        title="AI planning agent"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 7v4M10 9h4" strokeWidth="1.5" opacity="0.9" /></svg>
        )}
      </button>

      {isOpen && (
        <div
          className={`panel panel-agent ${dragOver ? "drag-over" : ""}`}
          onPaste={onPaste}
          onDragOver={(e) => {
            if ([...(e.dataTransfer?.types || [])].includes("Files")) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
          }}
          onDrop={onDrop}
        >
          <div className="panel-head">Board agent</div>
          {dragOver && <div className="drop-hint">Drop an image — sticky notes, a whiteboard, or a bug screenshot</div>}
          <div className="panel-body">
            {messages.map((m, i) => (
              <div key={i} className={`chat-row ${m.role}`}>
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="chat-image" src={m.image} alt={m.imageName || "uploaded image"} />
                )}
                {(m.text || m.streaming) && (
                  <div className={`chat-msg ${m.role} ${m.error ? "error" : ""}`}>
                    {m.text}
                    {m.streaming && <span className="cursor" />}
                  </div>
                )}
                {m.applied?.length > 0 && (
                  <ul className="chat-applied">
                    {m.applied.map((a, j) => <li key={j}>{a}</li>)}
                  </ul>
                )}
                {m.plan && (
                  <PlanCard
                    plan={m.plan}
                    busy={busy}
                    onToggle={(idx) => toggleSkip(i, idx)}
                    onApply={() => applyPlan(i)}
                    onCancel={() => cancelPlan(i)}
                  />
                )}
              </div>
            ))}
            {busy && !messages[messages.length - 1]?.streaming && (
              <div className="typing">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <div className="pa-chips" style={{ paddingTop: 4 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pa-chip light" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="panel-foot">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) sendImage(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="mic-btn"
              title="Add from image — sticky notes, whiteboard, or a bug screenshot"
              aria-label="Add from image"
              disabled={busy || voice.listening}
              onClick={() => imageInputRef.current?.click()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="12" cy="12" r="3.5" />
                <path d="M8 5l1-2h6l1 2" />
              </svg>
            </button>
            {voice.supported && (
              <button
                type="button"
                className={`mic-btn ${voice.listening ? "listening" : ""}`}
                title={voice.listening ? "Listening… click to stop" : "Click and speak"}
                aria-label={voice.listening ? "Listening — click to stop" : "Click and speak"}
                aria-pressed={voice.listening}
                disabled={busy}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
                </svg>
              </button>
            )}
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={voice.listening ? "Listening… speak, then pause" : "Ask or instruct…"}
              disabled={busy || voice.listening}
              maxLength={2000}
            />
            <button className="btn btn-primary" onClick={() => send()} disabled={busy || voice.listening || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PlanCard({ plan, busy, onToggle, onApply, onCancel }) {
  const live = plan.actions.filter((a) => !a.error);
  const selected = live.filter((a) => !plan.skip.has(a.index)).length;
  const settled = plan.status !== "pending";

  return (
    <div className={`plan-card ${settled ? "settled" : ""}`}>
      <div className="plan-head">
        {plan.status === "applied" ? "Applied" : plan.status === "cancelled" ? "Cancelled" : "Review changes"}
        <span className="plan-count">{selected} of {live.length} selected</span>
      </div>
      <ul className="plan-list">
        {plan.actions.map((a) => (
          <li key={a.index} className={`${a.error ? "invalid" : ""} ${plan.skip.has(a.index) ? "skipped" : ""}`}>
            <label>
              <input
                type="checkbox"
                disabled={settled || Boolean(a.error)}
                checked={!a.error && !plan.skip.has(a.index)}
                onChange={() => onToggle(a.index)}
              />
              <span className="plan-text">
                {a.description}
                {a.flags?.destructive && <em className="plan-flag danger">deletes</em>}
                {a.flags?.suggested_due && <em className="plan-flag">suggested due {a.flags.suggested_due}</em>}
                {a.flags?.duplicate && (
                  <em className="plan-flag warn">
                    looks like “{a.flags.duplicate.title}” ({Math.round(a.flags.duplicate.score * 100)}% match)
                  </em>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!settled && (
        <div className="plan-actions">
          <button className="btn btn-ghost btn-sm btn-outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onApply} disabled={busy || selected === 0}>
            {busy ? "Applying…" : `Apply ${selected}`}
          </button>
        </div>
      )}
    </div>
  );
}
