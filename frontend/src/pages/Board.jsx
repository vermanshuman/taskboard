import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, openBoardSocket, getEmail } from "../lib/api.js";

const SPINES = [
  "var(--spine-1)",
  "var(--spine-2)",
  "var(--spine-3)",
  "var(--spine-4)",
  "var(--spine-5)",
];
const AVATAR_COLORS = ["#5546e1", "#1ba9a0", "#e0883b", "#c2497f", "#3b82d0"];

function avatarColor(email) {
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export default function Board() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [newCard, setNewCard] = useState({});
  const [viewers, setViewers] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Interactive Chat Agent State Configurations
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: "agent", text: "Hello! I am your board agent. You can ask me to add multiple tasks at once, handle dates natively, or set up columns automatically if your board is empty." }
  ]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  // Card Detail Modal State Metrics
  const [selectedCard, setSelectedCard] = useState(null);
  const [modalDescription, setModalDescription] = useState("");
  const [modalLabels, setModalLabels] = useState("");
  const [isSavingModal, setIsSavingModal] = useState(false);

  // Custom Delete Confirmation State
  const [cardIdToDelete, setCardIdToDelete] = useState(null);

  const toastId = useRef(0);
  const chatEndRef = useRef(null);

  function addToast(toast) {
    const tid = ++toastId.current;
    setToasts((t) => [...t, { id: tid, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== tid)), 4500);
  }

  async function load() {
    const freshBoard = await api.getBoard(id);
    setBoard(freshBoard);

    if (selectedCard) {
      for (const lst of freshBoard.lists) {
        const found = lst.cards.find(c => c.id === selectedCard.id);
        if (found) {
          if (!isSavingModal) {
            setSelectedCard(found);
          }
          break;
        }
      }
    }
  }

  // Handle HTML5 Drag and Drop Interactions
  function handleDragStart(e, cardId, sourceListId) {
    e.dataTransfer.setData("text/plain", cardId.toString());
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      const el = document.getElementById(`card-${cardId}`);
      if (el) el.style.opacity = "0.4";
    }, 0);
  }

  function handleDragEnd(e, cardId) {
    const el = document.getElementById(`card-${cardId}`);
    if (el) el.style.opacity = "1";
  }

  async function handleDrop(e, targetListId) {
    e.preventDefault();
    const cardIdStr = e.dataTransfer.getData("text/plain");
    if (!cardIdStr) return;

    const cardId = parseInt(cardIdStr, 10);
    const targetList = board.lists.find(l => l.id === targetListId);
    const newPosition = targetList ? targetList.cards.length + 1 : 1;

    try {
      await api.moveCard(id, cardId, targetListId, newPosition);
      load();
    } catch (err) {
      addToast({
        kind: "error",
        title: "Move Failed",
        text: "Could not persist card transition position changes."
      });
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function openDetailsModal(card) {
    setSelectedCard(card);
    setModalDescription(card.description || "");
    setModalLabels(card.labels || "");
  }

  async function handleSaveCardDetails() {
    if (!selectedCard || isSavingModal) return;
    setIsSavingModal(true);

    try {
      await api.updateCard(id, selectedCard.id, {
        description: modalDescription.trim(),
        labels: modalLabels.trim()
      });
      addToast({
        kind: "success",
        title: "Saved",
        text: "Task specifications modified successfully."
      });
      setIsSavingModal(false);
      setSelectedCard(null);
      load();
    } catch (err) {
      addToast({
        kind: "error",
        title: "Update Error",
        text: "Failed to persist card attribute additions."
      });
      setIsSavingModal(false);
    }
  }

  async function executeConfirmDelete() {
    if (!cardIdToDelete) return;
    try {
      await api.deleteCard(id, cardIdToDelete);
      setCardIdToDelete(null);
      setSelectedCard(null);
      load();
      addToast({
        kind: "success",
        title: "Deleted",
        text: "Card removed successfully."
      });
    } catch (err) {
      addToast({
        kind: "error",
        title: "Delete Failed",
        text: "Could not remove the card entity from database storage."
      });
    }
  }

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isAgentLoading, isChatOpen]);

  useEffect(() => {
    load();
    const ws = openBoardSocket(id, (msg) => {
      if (msg.type === "presence") {
        setViewers(msg.viewers || []);
      } else if (msg.type === "reminder") {
        addToast({
          kind: "reminder",
          title: "Due soon",
          text: `"${msg.title}" is due within 24 hours.`,
        });
        load();
      } else {
        load();
      }
    });
    return () => ws.close();
  }, [id]);

  if (!board) {
    return (
        <>
          <Topbar />
          <div className="skeleton-canvas">
            {[0, 1, 2].map((i) => (
                <div className="sk-col" key={i}>
                  <div className="sk-line" />
                  <div className="sk-card" />
                  <div className="sk-card" />
                </div>
            ))}
          </div>
        </>
    );
  }

  async function addList() {
    const name = prompt("List name");
    if (name) {
      await api.createList(id, name);
      load();
    }
  }

  async function addCard(listId) {
    const title = newCard[listId];
    if (title && title.trim()) {
      await api.createCard(id, listId, { title: title.trim() });
      setNewCard({ ...newCard, [listId]: "" });
      load();
    }
  }

  async function handleSendMessage() {
    if (!chatInput || !chatInput.trim() || isAgentLoading) return;

    const userText = chatInput.trim();
    setChatHistory((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setIsAgentLoading(true);

    try {
      const response = await api.askAgent(id, userText);
      setChatHistory((prev) => [...prev, { role: "agent", text: response.message }]);
      load();
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        { role: "agent", text: "Something went wrong communicating with the AI cluster. Ensure your credentials match." }
      ]);
    } finally {
      setIsAgentLoading(false);
    }
  }

  function dueInfo(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const days = (d - now) / 86400000;
    const cls = days < 0 ? "overdue" : days < 2 ? "soon" : "";
    const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { cls, label };
  }

  const others = viewers.filter((v) => v !== getEmail());

  return (
      <>
        <style>{`
        @keyframes agentBlink {
          0% { opacity: .2; }
          20% { opacity: 1; }
          100% { opacity: .2; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--ink, #191a23);
          margin-right: 4px;
          animation: agentBlink 1.4s infinite both;
        }
        .typing-dot:nth-child(2) { animation-delay: .2s; }
        .typing-dot:nth-child(3) { margin-right: 0; animation-delay: .4s; }
        
        .task-draggable {
          cursor: grab;
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.15s ease;
        }
        .task-draggable:active {
          cursor: grabbing;
        }
        .task-draggable:hover {
          border-color: var(--accent, #5546e1);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
        .column-dropzone {
          transition: background-color 0.2s ease, border-color 0.2s ease;
        }
        
        .badge-tag {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          background-color: #eaebf0;
          color: #4a4a6a;
          margin-right: 6px;
          margin-top: 4px;
          transition: filter 0.2s ease;
        }
        .badge-tag:hover {
          filter: brightness(0.95);
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(9, 30, 66, 0.45);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justifyContent: center;
          zIndex: 999;
        }
        
        /* Left-aligned sliding animation window */
        .left-drawer-container {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          width: 520px;
          max-width: 85%;
          background-color: #f4f5f7;
          box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
          z-index: 999;
          border-right: 1px solid #dcdfe4;
          animation: slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

        <Topbar />

        <div className="board-head">
          <Link to="/" className="back">
            ← Boards
          </Link>
          <h1>{board.name}</h1>

          <div className="presence">
            <span className="live-dot" />
            <div className="stack">
              {viewers.slice(0, 4).map((v) => (
                  <span
                      className="av"
                      key={v}
                      style={{ background: avatarColor(v) }}
                      title={v}
                  >
                {v[0]}
              </span>
              ))}
            </div>
            <span className="label">
            {viewers.length <= 1
                ? "Only you"
                : others.length === 1
                    ? "1 other viewing"
                    : `${others.length} others viewing`}
          </span>
          </div>
        </div>

        <div className="board-canvas">
          {board.lists.length === 0 && (
              <div className="board-empty" style={{ maxWidth: "450px", lineHeight: "1.5" }}>
                No lists yet. Add a column manually, or open the AI Agent drawer below and say <strong>'Setup'</strong> to initialize columns automatically.
              </div>
          )}

          {board.lists.map((lst, i) => (
              <section
                  className="column column-dropzone"
                  key={lst.id}
                  onDragOver={handleDragOver}
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

        {/* Floating Chat Agent Button */}
        <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "var(--accent, #5546e1)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              boxShadow: isChatOpen ? "0 2px 8px rgba(85, 70, 225, 0.2)" : "0 4px 16px rgba(85, 70, 225, 0.3)",
              zIndex: 998,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, box-shadow 0.25s ease",
              transform: isChatOpen ? "rotate(90deg)" : "rotate(0deg)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = isChatOpen ? "rotate(90deg) scale(1.05)" : "translateY(-4px) scale(1.05)";
              e.currentTarget.style.backgroundColor = "#4335c7";
              const sparkle = e.currentTarget.querySelector(".ai-sparkle");
              if (sparkle) sparkle.style.transform = "translate(1px, -1px) scale(1.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = isChatOpen ? "rotate(90deg)" : "translateY(0px) scale(1)";
              e.currentTarget.style.backgroundColor = "var(--accent, #5546e1)";
              const sparkle = e.currentTarget.querySelector(".ai-sparkle");
              if (sparkle) sparkle.style.transform = "translate(0px, 0px) scale(1)";
            }}
            title="Ask AI Agent"
        >
          {isChatOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
          ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <path className="ai-sparkle" d="M12 7v4M10 9h4" strokeWidth="1.5" opacity="0.9" style={{ transformOrigin: "12px 9px", transition: "transform 0.25s ease" }}></path>
              </svg>
          )}
        </button>

        {/* Slide-out Interactive Chat Panel Layout */}
        {isChatOpen && (
            <div
                style={{
                  position: "fixed",
                  bottom: "92px",
                  right: "24px",
                  width: "380px",
                  height: "520px",
                  backgroundColor: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  zIndex: 998,
                  overflow: "hidden",
                  border: "1px solid var(--surface, #f5f5f8)"
                }}
            >
              <div style={{ padding: "16px", backgroundColor: "var(--ink, #191a23)", color: "#fff", fontWeight: "bold", fontSize: "15px" }}>
                Stack Board Planning Agent
              </div>

              <div style={{ flexGrow: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                {chatHistory.map((msg, idx) => (
                    <div
                        key={idx}
                        style={{
                          alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                          backgroundColor: msg.role === "user" ? "var(--accent, #5546e1)" : "var(--surface, #f5f5f8)",
                          color: msg.role === "user" ? "#fff" : "var(--ink, #191a23)",
                          padding: "10px 14px",
                          borderRadius: "12px",
                          maxWidth: "85%",
                          fontSize: "14px",
                          lineHeight: "1.45",
                          whiteSpace: "pre-wrap"
                        }}
                    >
                      {msg.text}
                    </div>
                ))}

                {isAgentLoading && (
                    <div style={{ alignSelf: "flex-start", backgroundColor: "var(--surface, #f5f5f8)", padding: "12px 16px", borderRadius: "12px", display: "flex", alignItems: "center" }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div style={{ padding: "12px", borderTop: "1px solid var(--surface, #f5f5f8)", display: "flex", gap: "8px", backgroundColor: "#fff" }}>
                <input
                    className="input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="E.g., 'Add task A to Todo and task B tomorrow'"
                    disabled={isAgentLoading}
                    style={{ width: "100%", margin: 0 }}
                />
                <button
                    className="btn btn-primary"
                    onClick={handleSendMessage}
                    disabled={isAgentLoading}
                >
                  Send
                </button>
              </div>
            </div>
        )}

        {/* Modern Slide-out Left-Aligned Context Drawer */}
        {selectedCard && (
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
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#626f86", padding: "6px", borderRadius: "50%", display: "flex", transition: "background-color 0.2s" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e2e4e9"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    ✕
                  </button>
                </div>

                {/* Drawer Body Contents */}
                <div style={{ flexGrow: 1, padding: "24px", display: "flex", flexDirection: "column", gap: "24px", overflowY: "auto" }}>
                  {/* Description Section */}
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

                  {/* Labels Chip Grid Config */}
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
                        placeholder="e.g. bug, critical (split with commas)"
                        value={modalLabels}
                        onChange={(e) => setModalLabels(e.target.value)}
                    />
                  </div>
                </div>

                {/* Fixed Drawer Footer Control Actions Panel */}
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
                  <button
                      className="btn btn-ghost"
                      style={{ border: "1px solid #dcdfe4", backgroundColor: "#f4f5f7" }}
                      onClick={() => setSelectedCard(null)}
                      disabled={isSavingModal}
                  >
                    Cancel
                  </button>
                  <button
                      className="btn btn-primary"
                      onClick={handleSaveCardDetails}
                      disabled={isSavingModal}
                  >
                    {isSavingModal ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Custom Designed Delete Confirmation Alert Dialog */}
        {cardIdToDelete && (
            <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setCardIdToDelete(null)}>
              <div
                  style={{
                    backgroundColor: "#fff",
                    width: "400px",
                    borderRadius: "8px",
                    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                    border: "1px solid #dcdfe4"
                  }}
                  onClick={(e) => e.stopPropagation()}
              >
                <div style={{ padding: "20px 24px 12px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#ffebee", padding: "8px", borderRadius: "50%" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c62828" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </div>
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#172b4d" }}>
                    Delete this card?
                  </h4>
                </div>

                <div style={{ padding: "0 24px 20px 24px", fontSize: "14px", color: "#44546f", lineHeight: "1.5" }}>
                  All history, label bindings, and descriptive details tied to this task card will be permanently erased from database clusters. This action cannot be undone.
                </div>

                <div style={{ padding: "12px 24px", backgroundColor: "#f4f5f7", borderTop: "1px solid #dcdfe4", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                      className="btn btn-ghost"
                      style={{ border: "1px solid #dcdfe4", backgroundColor: "#fff" }}
                      onClick={() => setCardIdToDelete(null)}
                  >
                    Keep Card
                  </button>
                  <button
                      className="btn btn-primary"
                      style={{ backgroundColor: "#c62828", border: "none" }}
                      onClick={executeConfirmDelete}
                  >
                    Yes, Delete
                  </button>
                </div>
              </div>
            </div>
        )}

        <div className="toast-wrap">
          {toasts.map((t) => (
              <div className={`toast ${t.kind || ""}`} key={t.id}>
                {t.title && <span className="t-title">{t.title}</span>}
                {t.text}
              </div>
          ))}
        </div>
      </>
  );
}

function Topbar() {
  return (
      <header className="topbar">
        <Link to="/" className="wordmark">
          <span className="dot" /> Stack Board
        </Link>
      </header>
  );
}