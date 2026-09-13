"use client";

import { useState } from "react";
import { api } from "@/lib/api.js";

export default function SemanticSearch({ boardId, onSelectCard }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSearch() {
    if (!query.trim() || isLoading) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await api.semanticSearch(boardId, query.trim());
      setResults(res.results);
    } catch (err) {
      const msg = String(err.message || "");
      setError(
        msg.startsWith("501")
          ? "AI search isn't configured (missing OpenAI API key)."
          : "Search failed. Please try again."
      );
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelect(result) {
    onSelectCard(result);
    setIsOpen(false);
  }

  return (
    <>
      <button
        className="fab fab-search"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close search" : "Open AI search"}
        title="Semantic search"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        )}
      </button>

      {isOpen && (
        <div className="panel panel-search">
          <div className="panel-head">AI semantic search</div>
          <div className="panel-foot" style={{ borderTop: "none", borderBottom: "1px solid var(--line)" }}>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search cards by meaning…"
              disabled={isLoading}
            />
            <button className="btn btn-primary" onClick={runSearch} disabled={isLoading || !query.trim()}>
              {isLoading ? "…" : "Search"}
            </button>
          </div>
          <div className="panel-body" style={{ gap: "10px" }}>
            {error && <div className="panel-error">{error}</div>}

            {!error && results === null && (
              <div className="panel-hint">
                Type a natural-language query (e.g. {"“login problems”"}) and find matching cards
                even when the words don&apos;t match exactly.
              </div>
            )}

            {!error && results !== null && results.length === 0 && (
              <div className="panel-hint">No matching cards found.</div>
            )}

            {results && results.map((r) => (
              <div key={r.card_id} className="search-result" onClick={() => handleSelect(r)}>
                <div className="title">{r.title}</div>
                <div className="meta">
                  <span className="badge-tag" style={{ margin: 0 }}>{r.list_name}</span>
                  <span className="score">match {(r.score * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
