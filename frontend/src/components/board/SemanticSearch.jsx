import React, {useState} from "react";
import {api} from "../../lib/api.js";

export default function SemanticSearch({boardId, isSidebarOpen, onSelectCard}) {
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
            if (msg.startsWith("501")) setError("AI search isn't configured (missing OpenAI API key).");
            else setError("Search failed. Please try again.");
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
            {/* Floating Action Activation Node Icon */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: "fixed",
                    bottom: "92px",
                    right: isSidebarOpen ? "384px" : "24px",
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "var(--ink, #191a23)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(25, 26, 35, 0.3)",
                    zIndex: 998,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
            >
                {isOpen ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                )}
            </button>

            {/* Floating Panel Window Drawer */}
            {isOpen && (
                <div style={{position: "fixed", bottom: "160px", right: isSidebarOpen ? "384px" : "24px", width: "380px", height: "520px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", zIndex: 998, overflow: "hidden", border: "1px solid var(--surface, #f5f5f8)", transition: "right 0.25s ease"}}>
                    <div style={{padding: "16px", backgroundColor: "var(--ink, #191a23)", color: "#fff", fontWeight: "bold", fontSize: "15px"}}>
                        AI Semantic Search
                    </div>
                    <div style={{padding: "12px", borderBottom: "1px solid var(--surface, #f5f5f8)", display: "flex", gap: "8px"}}>
                        <input
                            className="input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && runSearch()}
                            placeholder="Search cards by meaning..."
                            disabled={isLoading}
                            style={{width: "100%", margin: 0}}
                        />
                        <button className="btn btn-primary" onClick={runSearch} disabled={isLoading}>
                            {isLoading ? "..." : "Search"}
                        </button>
                    </div>
                    <div style={{flexGrow: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px"}}>
                        {error && (
                            <div style={{backgroundColor: "#fdecea", color: "#ae2e2e", padding: "10px 12px", borderRadius: "8px", fontSize: "13px"}}>
                                {error}
                            </div>
                        )}

                        {!error && results === null && (
                            <div style={{color: "#626f86", fontSize: "13px"}}>
                                Type a natural-language query (e.g. "login problems") and find matching cards even if the words don't match exactly.
                            </div>
                        )}

                        {!error && results !== null && results.length === 0 && (
                            <div style={{color: "#626f86", fontSize: "13px"}}>No matching cards found.</div>
                        )}

                        {results && results.map((r) => (
                            <div
                                key={r.card_id}
                                onClick={() => handleSelect(r)}
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    backgroundColor: "var(--surface, #f5f5f8)",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                <div style={{fontWeight: "500", color: "#172b4d"}}>{r.title}</div>
                                <div style={{display: "flex", justifyContent: "space-between", marginTop: "4px"}}>
                                    <span className="badge-tag">{r.list_name}</span>
                                    <span style={{color: "#626f86", fontSize: "12px"}}>match {(r.score * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}
