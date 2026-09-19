"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api.js";

/**
 * Public, read-only client status page. No login; the token in the URL is
 * the only credential. Shows numbers, an agent-written narrative, and the
 * last few activity lines (titles only — nothing sensitive leaves the board).
 */
export default function StatusPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getPublicStatus(token)
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err.message || "");
        setError(
          msg.startsWith("404")
            ? "This status page doesn't exist or has been turned off."
            : msg.startsWith("429")
              ? "Too many requests — please try again in a minute."
              : "Couldn't load the status page right now."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="sp">
        <div className="sp-card sp-error">
          <h1>Status unavailable</h1>
          <p>{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sp">
        <div className="sp-card">
          <div className="sk-line" style={{ width: 240, height: 28 }} />
          <div className="sk-line" style={{ width: "100%", height: 12 }} />
          <div className="sk-line" style={{ width: "80%", height: 12 }} />
        </div>
      </div>
    );
  }

  const { board_name, generated_at, narrative, stats, recent } = data;
  const tone = stats.overdue > 0 ? "warn" : stats.percent >= 80 ? "good" : "";

  return (
    <div className="sp">
      <header className="sp-head">
        <span className="wordmark"><span className="dot" /> Stack Board</span>
        <span className="sp-badge">Client status</span>
      </header>

      <main className="sp-card">
        <p className="sp-eyebrow">Project status</p>
        <h1>{board_name}</h1>
        <p className="sp-when">
          Updated {generated_at ? formatWhen(generated_at) : "just now"}
        </p>

        <div className={`sp-progress ${tone}`}>
          <div className="sp-progress-bar"><div style={{ width: `${stats.percent}%` }} /></div>
          <div className="sp-progress-meta">
            <strong>{stats.percent}%</strong> complete · {stats.done} of {stats.total} items
            {stats.overdue > 0 && <span className="sp-pill warn">{stats.overdue} overdue</span>}
            {stats.due_soon > 0 && <span className="sp-pill">{stats.due_soon} due this week</span>}
          </div>
        </div>

        <p className="sp-summary">{narrative.summary}</p>

        <div className="sp-grid">
          <Section title="Shipped this week" items={narrative.shipped} empty="Nothing closed in the last 7 days." icon="✓" />
          <Section title="In progress" items={narrative.in_progress} empty="Nothing in progress right now." icon="→" />
          <Section title="Up next" items={narrative.next} empty="Queue is empty." icon="•" />
          <Section title="Risks & attention" items={narrative.risks} empty="No risks flagged." icon="!" tone="warn" />
        </div>

        <div className="sp-columns">
          {stats.per_list.map((l) => (
            <div key={l.name} className={`sp-col ${l.is_done ? "done" : ""}`}>
              <span className="n">{l.count}</span>
              <span className="name">{l.name}</span>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="sp-recent">
            <h3>Recent activity</h3>
            <ul>
              {recent.map((r, i) => (
                <li key={i}>
                  <span className="who">{r.who}</span> {r.text}
                  <span className="when">{formatWhen(r.when)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, items, empty, icon, tone = "" }) {
  return (
    <section className={`sp-section ${tone}`}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="sp-empty">{empty}</p>
      ) : (
        <ul>
          {items.map((t, i) => (
            <li key={i}><span className="ic">{icon}</span>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer className="sp-foot">
      This page is generated from the live board and updates automatically. Read-only.
    </footer>
  );
}

function formatWhen(iso) {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const diffH = (Date.now() - d) / 36e5;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
