import React from "react";

export default function ActivitySidebar({ isSidebarOpen, setIsSidebarOpen, board }) {
    if (!isSidebarOpen) return null;

    return (
        <div className="right-sidebar-container">
            <div style={{ padding: "24px 16px 16px 16px", borderBottom: "1px solid #dcdfe4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#172b4d" }}>Board History</h3>
                <button onClick={() => setIsSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#626f86" }}>
                    ✕
                </button>
            </div>
            <div style={{ flexGrow: 1, overflowY: "auto", backgroundColor: "#fafbfc" }}>
                {(!board.activity_logs || board.activity_logs.length === 0) && (
                    <div style={{ padding: "32px 16px", color: "#626f86", fontSize: "13px" }}>
                        No active events logged yet. Try adding or sliding a card!
                    </div>
                )}
                {board.activity_logs && board.activity_logs.map((log) => (
                    <div key={log.id} className="log-row">
                        <strong style={{ color: "#172b4d" }}>{log.user_email.split("@")[0]}</strong>{" "}
                        {log.action_text}
                        <div style={{ fontSize: "11px", color: "#8590a2", marginTop: "4px" }}>
                            {new Date(log.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}