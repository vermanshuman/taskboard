"use client";

import { useState } from "react";
import AuthCard from "./AuthCard.jsx";
import PublicAssistant from "./PublicAssistant.jsx";

const FEATURES = [
  {
    icon: "⚡",
    title: "Live for everyone",
    text: "Drag a card and teammates see it move instantly. WebSockets keep every open tab in sync — no refresh, no polling.",
  },
  {
    icon: "🪄",
    title: "AI planning agent",
    text: "Type \"fix the login bug by Friday and write the docs\" — it creates the cards, picks columns, sets dates.",
  },
  {
    icon: "🔎",
    title: "Search by meaning",
    text: "Semantic search finds \"users can't sign in\" when you search \"login problems\". Powered by embeddings.",
  },
  {
    icon: "👥",
    title: "Share & see who's here",
    text: "Invite teammates by email. Live presence shows who's viewing, and an activity feed records every change.",
  },
  {
    icon: "📎",
    title: "Cards that carry context",
    text: "Description, labels, due dates with overdue colouring, one file attachment, and reminder toasts before deadlines.",
  },
  {
    icon: "📊",
    title: "Know where work stands",
    text: "Cards per column and completions per week, one click away. Move a card to Done and the stats follow.",
  },
];

const STEPS = [
  { n: "1", title: "Create a board", text: "Name it, add columns — or let the agent set up Todo / In Progress / Done." },
  { n: "2", title: "Add work your way", text: "Type cards in, drag them around, or describe the week to the agent and let it fill the board." },
  { n: "3", title: "Invite the team", text: "Share by email. Everyone sees the same board, live, with a history of who did what." },
];

export default function Landing() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="lp">
      <nav className="lp-nav">
        <a href="#top" className="wordmark"><span className="dot" /> Stack Board</a>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <button type="button" className="lp-nav-btn" onClick={() => setGuideOpen(true)}>Ask the guide</button>
        </div>
        <a href="#signin" className="btn btn-primary btn-sm">Sign in</a>
      </nav>

      <header className="lp-hero" id="top">
        <div className="lp-hero-copy">
          <p className="auth-eyebrow">Collaborative task boards</p>
          <h1 className="lp-h1">Move work forward, together and in real time.</h1>
          <p className="lp-sub">
            A Trello-style board where every change appears live for the whole team — with an AI agent
            that turns plain language into tasks, and search that understands what you mean.
          </p>
          <ul className="lp-proof">
            <li>Free demo account</li>
            <li>Google sign-in</li>
            <li>Nothing to install</li>
          </ul>
          <button type="button" className="btn btn-ghost lp-guide-cta" onClick={() => setGuideOpen(true)}>
            <ChatIcon /> Have a question? Ask the AI guide
          </button>
          <MiniBoard />
        </div>
        <div className="lp-hero-form">
          <AuthCard />
        </div>
      </header>

      <section className="lp-section" id="features">
        <p className="auth-eyebrow">What it does</p>
        <h2 className="lp-h2">Everything a small team needs, nothing it doesn&apos;t.</h2>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature">
              <span className="lp-feature-icon" aria-hidden="true">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-alt" id="how">
        <p className="auth-eyebrow">How it works</p>
        <h2 className="lp-h2">Up and running in a minute.</h2>
        <div className="lp-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="lp-step">
              <span className="lp-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-foot">
        <span className="wordmark"><span className="dot" /> Stack Board</span>
        <span>Built as a full-stack portfolio project · Real-time boards · AI planning · Semantic search</span>
        <a href="#signin">Sign in</a>
      </footer>

      <PublicAssistant open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Decorative kanban illustration for the hero (pure CSS, no data). */
function MiniBoard() {
  const cols = [
    { name: "Backlog", cards: [{ w: 80 }, { w: 60, tag: "design" }, { w: 70 }] },
    { name: "In progress", cards: [{ w: 75, tag: "bug", hot: true }, { w: 55 }] },
    { name: "Done", cards: [{ w: 65 }, { w: 80 }, { w: 50 }, { w: 70 }] },
  ];
  return (
    <div className="lp-mini" aria-hidden="true">
      {cols.map((c, i) => (
        <div key={c.name} className="lp-mini-col">
          <div className="lp-mini-head"><span className={`spine s${i + 1}`} />{c.name}</div>
          {c.cards.map((card, j) => (
            <div key={j} className={`lp-mini-card ${card.hot ? "hot" : ""}`}>
              <span className="line" style={{ width: `${card.w}%` }} />
              {card.tag && <span className="tag">{card.tag}</span>}
            </div>
          ))}
        </div>
      ))}
      <div className="lp-mini-presence">
        <span className="av a">A</span><span className="av b">M</span><span className="av c">J</span>
        <span className="txt">3 viewing · live</span>
      </div>
    </div>
  );
}
