import {useEffect, useRef, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {api, openBoardSocket} from "../lib/api.js";

// Import modular component tree blocks
import BoardStats from "../components/board/BoardStats.jsx";
import BoardCanvas from "../components/board/BoardCanvas.jsx";
import TaskDrawer from "../components/board/TaskDrawer.jsx";
import ActivitySidebar from "../components/board/ActivitySidebar.jsx";
import AgentChat from "../components/board/AgentChat.jsx";
import SemanticSearch from "../components/board/SemanticSearch.jsx";

const PALETTE_OPTIONS = ["#5546e1", "#1ba9a0", "#e0883b", "#c2497f", "#3b82d0", "#2ecc71", "#e74c3c", "#f1c40f"];

export default function Board() {
    const {id} = useParams();
    const [board, setBoard] = useState(null);
    const [newCard, setNewCard] = useState({});
    const [viewers, setViewers] = useState([]);
    const [toasts, setToasts] = useState([]);

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState([{role: "agent", text: "Hello! I am your board agent."}]);
    const [isAgentLoading, setIsAgentLoading] = useState(false);

    const [selectedCard, setSelectedCard] = useState(null);
    const [modalDescription, setModalDescription] = useState("");
    const [modalLabels, setModalLabels] = useState("");
    const [isSavingModal, setIsSavingModal] = useState(false);
    const [cardIdToDelete, setCardIdToDelete] = useState(null);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isStatsOpen, setIsStatsOpen] = useState(false);
    const [statsData, setStatsData] = useState(null);
    const [activeDropTargetId, setActiveDropTargetId] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [userProfileColor, setUserProfileColor] = useState("#5546e1");
    const [userDisplayName, setUserDisplayName] = useState("User");

    const toastId = useRef(0);
    const chatEndRef = useRef(null);

    function addToast(toast) {
        const tid = ++toastId.current;
        setToasts((t) => [...t, {id: tid, ...toast}]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== tid)), 4500);
    }

    async function load() {
        const freshBoard = await api.getBoard(id);
        setBoard(freshBoard);

        try {
            const activeUser = await api.me();
            if (activeUser) {
                if (activeUser.avatar_color) setUserProfileColor(activeUser.avatar_color);
                if (activeUser.full_name) setUserDisplayName(activeUser.full_name);
            }
        } catch (err) {
        }

        if (isStatsOpen) fetchStats();
    }

    async function fetchStats() {
        try {
            setStatsData(await api.getStats(id));
        } catch (err) {
        }
    }

    useEffect(() => {
        if (isStatsOpen && id) fetchStats();
    }, [isStatsOpen, id]);

    // Drag Handlers
    function handleDragStart(e, cardId, sourceListId) {
        e.dataTransfer.setData("text/plain", cardId.toString());
        e.dataTransfer.effectAllowed = "move";
    }

    function handleDragEnd(e, cardId) {
        setActiveDropTargetId(null);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }

    function handleDragEnter(e, listId) {
        e.preventDefault();
        setActiveDropTargetId(listId);
    }

    async function handleDrop(e, targetListId) {
        e.preventDefault();
        setActiveDropTargetId(null);
        const cardIdStr = e.dataTransfer.getData("text/plain");
        if (!cardIdStr) return;
        const cardId = parseInt(cardIdStr, 10);
        const targetList = board.lists.find((l) => l.id === targetListId);
        await api.moveCard(id, cardId, targetListId, targetList ? targetList.cards.length + 1 : 1);
        load();
    }

    function openDetailsModal(card) {
        setSelectedCard(card);
        setModalDescription(card.description || "");
        setModalLabels(card.labels || "");
    }

    function handleSelectSearchResult(result) {
        const list = board.lists.find((l) => l.id === result.list_id);
        const card = list && list.cards.find((c) => c.id === result.card_id);
        if (card) {
            openDetailsModal(card);
            setTimeout(() => {
                const el = document.getElementById("card-" + card.id);
                if (el) el.scrollIntoView({behavior: "smooth", block: "center"});
            }, 50);
        }
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
            await api.createCard(id, listId, {title: title.trim()});
            setNewCard({...newCard, [listId]: ""});
            load();
        }
    }

    async function handleSendMessage() {
        if (!chatInput.trim() || isAgentLoading) return;
        const txt = chatInput.trim();
        setChatHistory((p) => [...p, {role: "user", text: txt}]);
        setChatInput("");
        setIsAgentLoading(true);
        try {
            const res = await api.askAgent(id, txt);
            setChatHistory((p) => [...p, {role: "agent", text: res.message}]);
            load();
        } catch (err) {
            setChatHistory((p) => [...p, {role: "agent", text: "AI engine connection fault."}]);
        } finally {
            setIsAgentLoading(false);
        }
    }

    async function handleSaveCardDetails() {
        setIsSavingModal(true);
        try {
            await api.updateCard(id, selectedCard.id, {
                description: modalDescription.trim(),
                labels: modalLabels.trim()
            });
            setSelectedCard(null);
            load();
        } catch (err) {
            addToast({kind: "error", text: "Failed to save details."});
        } finally {
            setIsSavingModal(false);
        }
    }

    async function executeConfirmDelete() {
        try {
            await api.deleteCard(id, cardIdToDelete);
            setCardIdToDelete(null);
            setSelectedCard(null);
            load();
        } catch (err) {
            addToast({kind: "error", text: "Failed to delete task."});
        }
    }

    const handleLogout = () => {
        localStorage.clear();
        window.location.href = "/login";
    };

    useEffect(() => {
        load();
        const ws = openBoardSocket(id, () => load());
        return () => ws.close();
    }, [id]);

    if (!board) return <div className="p-4">Loading board data components...</div>;

    const totalCardsCount = board.lists.reduce((acc, current) => acc + current.cards.length, 0);

    return (
        <>
            <style>{`
        @keyframes agentBlink { 0%, 100% { opacity: .2; } 20% { opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .typing-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--ink); margin-right: 4px; animation: agentBlink 1.4s infinite both; }
        .typing-dot:nth-child(2) { animation-delay: .2s; } .typing-dot:nth-child(3) { margin-right: 0; animation-delay: .4s; }
        .task-draggable { cursor: grab; transition: all 0.2s ease; } .task-draggable:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
        .column-dropzone { transition: all 0.2s ease; border: 2px solid transparent; }
        .column-dropzone-active { background-color: #ebecf0 !important; border: 2px dashed var(--accent) !important; transform: scale(1.01); }
        .badge-tag { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; background-color: #eaebf0; margin-right: 6px; margin-top: 4px; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(9, 30, 66, 0.45); backdrop-filter: blur(2px); display: flex; align-items: center; justifyContent: center; z-index: 999; }
        .left-drawer-container { position: fixed; top: 0; left: 0; height: 100vh; width: 520px; max-width: 85%; background-color: #f4f5f7; box-shadow: 4px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; z-index: 999; animation: slideInLeft 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .right-sidebar-container { position: fixed; top: 0; right: 0; height: 100vh; width: 360px; background-color: #fff; box-shadow: -4px 0 24px rgba(0,0,0,0.1); display: flex; flex-direction: column; z-index: 997; border-left: 1px solid #dcdfe4; animation: slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .log-row { padding: 12px 16px; border-bottom: 1px solid #f4f5f8; font-size: 13px; color: #44546f; }
      `}</style>

            <header className="topbar" style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingRight: "24px"
            }}>
                <Link to="/" className="wordmark"><span className="dot"/> Stack Board</Link>
                <button
                    className="btn btn-ghost"
                    onClick={handleLogout}
                    style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: "#ae2e2e",
                        border: "1px solid #dcdfe4",
                        padding: "6px 14px",
                        backgroundColor: "#fff"
                    }}
                >
                    Logout
                </button>
            </header>

            <div className="board-head">
                <Link to="/" className="back">← Boards</Link>
                <h1>{board.name}</h1>

                {/* Profile Settings Accent color Picker */}
                <div className="presence" style={{position: "relative"}}>
                    <span className="live-dot"/>
                    <span className="av" style={{background: userProfileColor, cursor: "pointer", fontWeight: "700"}}
                          onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}>
            {userDisplayName ? userDisplayName[0].toUpperCase() : "U"}
          </span>
                    {isProfileMenuOpen && (
                        <div style={{
                            position: "absolute",
                            top: "42px",
                            left: "0",
                            backgroundColor: "#fff",
                            border: "1px solid #dcdfe4",
                            borderRadius: "8px",
                            padding: "14px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                            zIndex: 1001,
                            width: "190px"
                        }}>
                            <div style={{
                                fontWeight: "600",
                                marginBottom: "4px",
                                fontSize: "13px",
                                color: "#172b4d"
                            }}>{userDisplayName}</div>
                          <Link
                              to="/profile"
                              state={{ from: `/boards/${id}` }}
                              style={{ fontSize: "12px", color: "var(--accent, #5546e1)", display: "block", marginBottom: "10px", textDecoration: "none", fontWeight: "500" }}
                          >
                            Edit Profile Details →
                          </Link>
                            <div style={{
                                borderTop: "1px solid #e2e4e9",
                                paddingTop: "8px",
                                margin: "0 0 10px 0",
                                fontSize: "12px",
                                fontWeight: "600"
                            }}>Select Color
                            </div>
                            <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px"}}>
                                {PALETTE_OPTIONS.map((c) => (
                                    <button key={c} onClick={async () => {
                                        setUserProfileColor(c);
                                        await api.updateProfile(c);
                                        setIsProfileMenuOpen(false);
                                        load();
                                    }} style={{
                                        width: "32px",
                                        height: "32px",
                                        borderRadius: "50%",
                                        backgroundColor: c,
                                        border: userProfileColor === c ? "2.5px solid #172b4d" : "1px solid rgba(0,0,0,0.15)",
                                        cursor: "pointer"
                                    }}/>
                                ))}
                            </div>
                        </div>
                    )}
                  <span className="label" style={{ marginLeft: "8px", color: "#626f86", fontSize: "13px", fontWeight: "500" }}>
  {viewers.length <= 1
      ? `${userDisplayName} (Only you)`
      : `${userDisplayName} + ${others.length} others viewing`
  }
</span>
                </div>

                {/* Dashboard Panels Toggle controls button stack */}
                <div style={{display: "flex", gap: "8px", marginLeft: "16px"}}>
                    <button className="btn btn-ghost" style={{border: "1px solid #c1c7d0", color: "#44546f"}}
                            onClick={() => setIsStatsOpen(!isStatsOpen)}>Dashboard Metrics
                    </button>
                    <button className="btn btn-ghost" style={{border: "1px solid #c1c7d0", color: "#44546f"}}
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}>Activity Feed
                    </button>
                </div>
            </div>

            <BoardStats isStatsOpen={isStatsOpen} statsData={statsData} totalCardsCount={totalCardsCount}
                        isSidebarOpen={isSidebarOpen}/>

            <BoardCanvas
                board={board} newCard={newCard} setNewCard={setNewCard} activeDropTargetId={activeDropTargetId}
                handleDragStart={handleDragStart} handleDragEnd={handleDragEnd} handleDragOver={handleDragOver}
                handleDragEnter={handleDragEnter} handleDrop={handleDrop} openDetailsModal={openDetailsModal}
                dueInfo={(d) => d ? {
                    cls: "",
                    label: new Date(d).toLocaleDateString(undefined, {month: "short", day: "numeric"})
                } : null}
                addCard={addCard} addList={addList} isSidebarOpen={isSidebarOpen}
            />

            <TaskDrawer
                selectedCard={selectedCard} setSelectedCard={setSelectedCard} modalDescription={modalDescription}
                setModalDescription={setModalDescription} modalLabels={modalLabels} setModalLabels={setModalLabels}
                isSavingModal={isSavingModal} handleSaveCardDetails={handleSaveCardDetails}
                cardIdToDelete={cardIdToDelete}
                setCardIdToDelete={setCardIdToDelete} executeConfirmDelete={executeConfirmDelete}
            />

            <ActivitySidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} board={board}/>

            <AgentChat
                isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen} chatInput={chatInput} setChatInput={setChatInput}
                chatHistory={chatHistory} isAgentLoading={isAgentLoading} handleSendMessage={handleSendMessage}
                chatEndRef={chatEndRef} isSidebarOpen={isSidebarOpen}
            />

            <SemanticSearch
                boardId={id} isSidebarOpen={isSidebarOpen} onSelectCard={handleSelectSearchResult}
            />
        </>
    );
}