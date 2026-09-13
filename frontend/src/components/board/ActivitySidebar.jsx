"use client";

import { useState } from "react";
import { api } from "@/lib/api.js";

/**
 * Activity feed. The board payload carries the newest ~30 entries; older
 * pages are fetched on demand with keyset pagination (before_id).
 */
export default function ActivitySidebar({ boardId, isOpen, onClose, recent }) {
  const [older, setOlder] = useState([]); // pages fetched beyond `recent`
  const [nextBefore, setNextBefore] = useState(undefined); // undefined = unknown yet
  const [loading, setLoading] = useState(false);

  // When the live feed refreshes, the paged tail may overlap; reset it.
  // (React's "adjust state when a prop changes" pattern -- no effect needed.)
  const [prevRecent, setPrevRecent] = useState(recent);
  if (recent !== prevRecent) {
    setPrevRecent(recent);
    setOlder([]);
    setNextBefore(undefined);
  }

  const all = [...recent, ...older];
  const oldestId = all.length ? all[all.length - 1].id : null;
  const canLoadMore = oldestId !== null && nextBefore !== null && (nextBefore === undefined || nextBefore);

  async function loadMore() {
    if (loading || !oldestId) return;
    setLoading(true);
    try {
      const page = await api.getActivity(boardId, oldestId);
      setOlder((o) => [...o, ...page.items]);
      setNextBefore(page.next_before_id);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <h3>Board history</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="sidebar-body">
        {all.length === 0 && (
          <div className="log-row" style={{ padding: "32px 16px" }}>
            Nothing logged yet. Try adding or moving a card.
          </div>
        )}
        {all.map((log) => (
          <div key={log.id} className="log-row">
            <strong>{log.user_email.split("@")[0]}</strong> {log.action_text}
            <div className="when">{formatWhen(log.created_at)}</div>
          </div>
        ))}
        {canLoadMore && (
          <div className="sidebar-more">
            <button className="btn btn-ghost btn-outline btn-sm" onClick={loadMore} disabled={loading}>
              {loading ? "Loading…" : "Load older activity"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso) {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z"); // API times are UTC
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}
