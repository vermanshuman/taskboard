import React from "react";

const SPINES = ["var(--spine-1)", "var(--spine-2)", "var(--spine-3)", "var(--spine-4)", "var(--spine-5)"];

export default function BoardCanvas({
                                        board,
                                        newCard,
                                        setNewCard,
                                        activeDropTargetId,
                                        handleDragStart,
                                        handleDragEnd,
                                        handleDragOver,
                                        handleDragEnter,
                                        handleDrop,
                                        openDetailsModal,
                                        dueInfo,
                                        addCard,
                                        addList,
                                        isSidebarOpen
                                    }) {
    return (
        <div className="board-canvas" style={{ marginRight: isSidebarOpen ? "360px" : "0px", transition: "margin-right 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}>
            {board.lists.length === 0 && (
                <div className="board-empty" style={{ maxWidth: "450px", lineHeight: "1.5" }}>
                    No lists yet. Add a column manually, or open the AI Agent drawer below and say <strong>'Setup'</strong> to initialize columns automatically.
                </div>
            )}

            {board.lists.map((lst, i) => (
                <section
                    className={`column column-dropzone ${activeDropTargetId === lst.id ? "column-dropzone-active" : ""}`}
                    key={lst.id}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, lst.id)}
                    onDrop={(e) => handleDrop(e, lst.id)}
                >
                    <div className="column-head">
                        <span className="spine" style={{ background: SPINES[i % SPINES.length] }} />
                        <span className="title">{lst.name}</span>
                        <span className="count">{lst.cards.length}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minHeight: "60px" }}>
                        {lst.cards.map((c) => {
                            const due = dueInfo(c.due_date);
                            const tagList = c.labels ? c.labels.split(",").map(t => t.trim()).filter(Boolean) : [];
                            return (
                                <article
                                    className="task task-draggable"
                                    id={`card-${c.id}`}
                                    key={c.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, c.id, lst.id)}
                                    onDragEnd={(e) => handleDragEnd(e, c.id)}
                                    onClick={() => openDetailsModal(c)}
                                >
                                    <div style={{ fontWeight: "500", marginBottom: "4px", fontSize: "14px", color: "#172b4d" }}>{c.title}</div>

                                    {tagList.length > 0 && (
                                        <div style={{ marginBottom: "6px", display: "flex", flexWrap: "wrap" }}>
                                            {tagList.map((tag, tIdx) => (
                                                <span key={tIdx} className="badge-tag">{tag}</span>
                                            ))}
                                        </div>
                                    )}

                                    {due && <span className={`due ${due.cls}`}>Due {due.label}</span>}
                                </article>
                            );
                        })}
                    </div>

                    <div className="add-card">
                        <input
                            className="input"
                            value={newCard[lst.id] || ""}
                            onChange={(e) => setNewCard({ ...newCard, [lst.id]: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && addCard(lst.id)}
                            placeholder="+ Add a card"
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => addCard(lst.id)}>
                            Add
                        </button>
                    </div>
                </section>
            ))}

            <div className="column-add">
                <button className="btn btn-ghost" onClick={addList}>
                    + Add list
                </button>
            </div>
        </div>
    );
}