import React from "react";

function AgentChat({
                       isChatOpen,
                       setIsChatOpen,
                       chatInput,
                       setChatInput,
                       chatHistory,
                       isAgentLoading,
                       handleSendMessage,
                       chatEndRef,
                       isSidebarOpen
                   }) {
    return (
        <>
            {/* Floating Action Activation Node Icon */}
            <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                style={{
                    position: "fixed",
                    bottom: "24px",
                    right: isSidebarOpen ? "384px" : "24px",
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "var(--accent, #5546e1)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(85, 70, 225, 0.3)",
                    zIndex: 998,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    transform: isChatOpen ? "rotate(90deg)" : "rotate(0deg)"
                }}
            >
                {isChatOpen ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M12 7v4M10 9h4" strokeWidth="1.5" opacity="0.9"></path></svg>
                )}
            </button>

            {/* Floating Panel Window Drawer */}
            {isChatOpen && (
                <div style={{ position: "fixed", bottom: "92px", right: isSidebarOpen ? "384px" : "24px", width: "380px", height: "520px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", zIndex: 998, overflow: "hidden", border: "1px solid var(--surface, #f5f5f8)", transition: "right 0.25s ease" }}>
                    <div style={{ padding: "16px", backgroundColor: "var(--ink, #191a23)", color: "#fff", fontWeight: "bold", fontSize: "15px" }}>
                        Stack Board Planning Agent
                    </div>
                    <div style={{ flexGrow: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", backgroundColor: msg.role === "user" ? "var(--accent, #5546e1)" : "var(--surface, #f5f5f8)", color: msg.role === "user" ? "#fff" : "var(--ink, #191a23)", padding: "10px 14px", borderRadius: "12px", maxWidth: "85%", fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap" }}>
                                {msg.text}
                            </div>
                        ))}
                        {isAgentLoading && (
                            <div style={{ alignSelf: "flex-start", backgroundColor: "var(--surface, #f5f5f8)", padding: "12px 16px", borderRadius: "12px", display: "flex", alignItems: "center" }}>
                                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    <div style={{ padding: "12px", borderTop: "1px solid var(--surface, #f5f5f8)", display: "flex", gap: "8px", backgroundColor: "#fff" }}>
                        <input className="input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} placeholder="Ask AI Agent..." disabled={isAgentLoading} style={{ width: "100%", margin: 0 }} />
                        <button className="btn btn-primary" onClick={handleSendMessage} disabled={isAgentLoading}>Send</button>
                    </div>
                </div>
            )}
        </>
    );
}

// Explicit default export assignment
export default AgentChat;