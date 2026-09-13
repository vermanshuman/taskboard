"use client";

import { useState } from "react";
import { api } from "@/lib/api.js";

/**
 * Owner-facing "share this board" dialog. Members see the list read-only
 * plus a "Leave board" action. The board detail already carries `members`
 * and the caller's `role`, so no extra fetch is needed to open it.
 */
export default function ShareDialog({ boardId, board, myUserId, onClose, onChanged, onLeft }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOwner = board.role === "owner";

  async function add() {
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.addMember(boardId, value);
      setEmail("");
      onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.removeMember(boardId, userId);
      if (userId === myUserId) onLeft();
      else onChanged();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Share “{board.name}”</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isOwner && (
          <div className="dialog-row">
            <input
              className="input"
              type="email"
              placeholder="Teammate's email (they must have an account)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              disabled={busy}
            />
            <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !email.trim()}>
              Invite
            </button>
          </div>
        )}

        {error && <p className="form-error" style={{ margin: "0 0 8px" }}>{error}</p>}

        <ul className="member-list">
          {board.members.map((m) => (
            <li key={m.user_id}>
              <span className="av" style={{ background: m.avatar_color }}>
                {(m.full_name || m.email)[0].toUpperCase()}
              </span>
              <div className="member-meta">
                <div className="member-name">{m.full_name || m.email}</div>
                <div className="member-email">{m.email}</div>
              </div>
              <span className={`role-pill ${m.role}`}>{m.role}</span>
              {m.role !== "owner" && (isOwner || m.user_id === myUserId) && (
                <button className="btn btn-ghost btn-sm" onClick={() => remove(m.user_id)} disabled={busy}>
                  {m.user_id === myUserId ? "Leave" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>

        {!isOwner && (
          <p className="dialog-hint">Only the board owner can invite people.</p>
        )}
      </div>
    </div>
  );
}

function friendlyError(err) {
  const msg = String(err.message || "");
  if (msg.startsWith("404")) return "No account with that email. Ask them to sign up first.";
  if (msg.startsWith("409")) return "They're already a member.";
  if (msg.startsWith("403")) return "Only the owner can do that.";
  return "Something went wrong. Please try again.";
}
