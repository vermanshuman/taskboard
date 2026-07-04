import React from "react";

const SPINES = ["var(--spine-1)", "var(--spine-2)", "var(--spine-3)", "var(--spine-4)", "var(--spine-5)"];

export default function BoardStats({ isStatsOpen, statsData, totalCardsCount, isSidebarOpen }) {
    if (!isStatsOpen) return null;

    return (
        <div className="stats-drawer-header" style={{ padding: "20px 24px", marginRight: isSidebarOpen ? "360px" : "0px", transition: "all 0.25s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "#172b4d", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Project Health Overview
                </h2>
                <span style={{ fontSize: "13px", color: "#626f86", fontWeight: "500" }}>
          Total Tasks: <strong>{totalCardsCount}</strong>
        </span>
            </div>

            {!statsData ? (
                <div style={{ fontSize: "13px", color: "#626f86" }}>Loading data matrix calculations...</div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
                    {/* Column Loading Density */}
                    <div>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#44546f" }}>Column Distribution Density</h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            {statsData.cards_per_list.map((item, idx) => {
                                const ratio = totalCardsCount > 0 ? (item.count / totalCardsCount) * 100 : 0;
                                return (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <span style={{ fontSize: "13px", width: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#172b4d", fontWeight: "500" }}>{item.list}</span>
                                        <div style={{ flexGrow: 1, height: "8px", backgroundColor: "#e2e4e9", borderRadius: "4px", overflow: "hidden" }}>
                                            <div style={{ width: `${ratio}%`, height: "100%", backgroundColor: SPINES[idx % SPINES.length], borderRadius: "4px" }} />
                                        </div>
                                        <span style={{ fontSize: "12px", width: "24px", textAlign: "right", color: "#44546f", fontWeight: "600" }}>{item.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Weekly Completions Timeline */}
                    <div>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: "#44546f" }}>Task Completions (Last 8 Weeks)</h4>
                        <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
                            {statsData.completed_per_week.map((w, idx) => (
                                <div key={idx} style={{ minWidth: "50px", backgroundColor: "#f4f5f7", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", alignItems: "center", border: "1px solid #e2e4e9" }}>
                                    <span style={{ fontSize: "14px", fontWeight: "700", color: w.count > 0 ? "var(--accent, #5546e1)" : "#626f86" }}>{w.count}</span>
                                    <span style={{ fontSize: "9px", color: "#8590a2", marginTop: "4px", textTransform: "uppercase" }}>{w.week.split("-")[1]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}