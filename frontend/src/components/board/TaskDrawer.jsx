import React from "react";

export default function TaskDrawer({
                                       selectedCard,
                                       setSelectedCard,
                                       modalDescription,
                                       setModalDescription,
                                       modalLabels,
                                       setModalLabels,
                                       isSavingModal,
                                       handleSaveCardDetails,
                                       cardIdToDelete,
                                       setCardIdToDelete,
                                       executeConfirmDelete
                                   }) {
    if (!selectedCard) return null;

    return (
        <>
            <div className="modal-overlay" style={{ justifyContent: "flex-start" }} onClick={() => setSelectedCard(null)}>
                <div className="left-drawer-container" onClick={(e) => e.stopPropagation()}>
                    {/* Drawer Header */}
                    <div style={{ padding: "28px 24px 16px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #dcdfe4" }}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#44546f" strokeWidth="2" style={{ marginTop: "2px" }}>
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="9" y1="3" x2="9" y2="21"></line>
                            </svg>
                            <div>
                                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#172b4d", lineHeight: "1.3" }}>
                                    {selectedCard.title}
                                </h3>
                                {selectedCard.due_date && (
                                    <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#44546f", textTransform: "uppercase", letterSpacing: "0.5px" }}>Due Date</span>
                                        <span style={{ fontSize: "12px", padding: "2px 8px", backgroundColor: "#e2e4e9", borderRadius: "4px", color: "#172b4d", fontWeight: "500" }}>
                      {new Date(selectedCard.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedCard(null)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#626f86", padding: "6px", borderRadius: "50%", display: "flex" }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Drawer Body */}
                    <div style={{ flexGrow: 1, padding: "24px", display: "flex", flexDirection: "column", gap: "24px", overflowY: "auto" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#44546f" strokeWidth="2">
                                    <line x1="21" y1="10" x2="3" y2="10"></line>
                                    <line x1="21" y1="6" x2="3" y2="6"></line>
                                    <line x1="21" y1="14" x2="3" y2="14"></line>
                                    <line x1="21" y1="18" x2="3" y2="18"></line>
                                </svg>
                                <label style={{ fontSize: "14px", fontWeight: "600", color: "#172b4d" }}>Description</label>
                            </div>
                            <textarea
                                className="input"
                                style={{ minHeight: "140px", padding: "12px", resize: "vertical", width: "100%", backgroundColor: "#fff", border: "1px solid #c1c7d0", borderRadius: "6px", fontSize: "14px", color: "#172b4d", lineHeight: "1.5" }}
                                placeholder="Add details for this task..."
                                value={modalDescription}
                                onChange={(e) => setModalDescription(e.target.value)}
                            />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#44546f" strokeWidth="2">
                                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                                    <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3"></line>
                                </svg>
                                <label style={{ fontSize: "14px", fontWeight: "600", color: "#172b4d" }}>Labels</label>
                            </div>
                            <input
                                type="text"
                                className="input"
                                style={{ width: "100%", backgroundColor: "#fff", border: "1px solid #c1c7d0", borderRadius: "6px", padding: "10px 12px", fontSize: "14px", color: "#172b4d" }}
                                placeholder="e.g. bug, critical"
                                value={modalLabels}
                                onChange={(e) => setModalLabels(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Drawer Actions Footer */}
                    <div style={{ padding: "16px 24px", backgroundColor: "#fff", borderTop: "1px solid #dcdfe4", display: "flex", gap: "12px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                            className="btn btn-ghost"
                            style={{ color: "#ae2e2e", fontWeight: "600" }}
                            onClick={() => setCardIdToDelete(selectedCard.id)}
                            disabled={isSavingModal}
                        >
                            Delete Card
                        </button>
                        <div style={{ flexGrow: 1 }} />
                        <button className="btn btn-ghost" style={{ border: "1px solid #dcdfe4", backgroundColor: "#f4f5f7" }} onClick={() => setSelectedCard(null)}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleSaveCardDetails} disabled={isSavingModal}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* Styled Delete Confirmation Dialog */}
            {cardIdToDelete && (
                <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setCardIdToDelete(null)}>
                    <div style={{ backgroundColor: "#fff", width: "400px", borderRadius: "8px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)", overflow: "hidden", border: "1px solid #dcdfe4" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: "20px 24px 12px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffebee", padding: "8px", borderRadius: "50%" }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                </svg>
                            </div>
                            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#172b4d" }}>Delete this card?</h4>
                        </div>
                        <div style={{ padding: "0 24px 20px 24px", fontSize: "14px", color: "#44546f", lineHeight: "1.5" }}>
                            All history, label bindings, and descriptive details tied to this task card will be permanently erased. This action cannot be undone.
                        </div>
                        <div style={{ padding: "12px 24px", backgroundColor: "#f4f5f7", borderTop: "1px solid #dcdfe4", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button className="btn btn-ghost" style={{ border: "1px solid #dcdfe4", backgroundColor: "#fff" }} onClick={() => setCardIdToDelete(null)}>
                                Keep Card
                            </button>
                            <button className="btn btn-primary" style={{ backgroundColor: "#c62828", border: "none" }} onClick={executeConfirmDelete}>
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}