"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getEmail, openBoardSocket } from "@/lib/api.js";

import BoardStats from "@/components/board/BoardStats.jsx";
import BoardCanvas from "@/components/board/BoardCanvas.jsx";
import TaskDrawer from "@/components/board/TaskDrawer.jsx";
import ActivitySidebar from "@/components/board/ActivitySidebar.jsx";
import AgentChat from "@/components/board/AgentChat.jsx";
import SemanticSearch from "@/components/board/SemanticSearch.jsx";
import ShareDialog from "@/components/board/ShareDialog.jsx";
import ConfirmDialog from "@/components/ConfirmDialog.jsx";

const PALETTE_OPTIONS = ["#5546e1", "#1ba9a0", "#e0883b", "#c2497f", "#3b82d0", "#2ecc71", "#e74c3c", "#f1c40f"];
const REFETCH_DEBOUNCE_MS = 150;

function dueInfo(d) {
  if (!d) return null;
  const due = new Date(d);
  const hoursLeft = (due - new Date()) / 36e5;
  const cls = hoursLeft < 0 ? "overdue" : hoursLeft < 24 ? "soon" : "";
  return { cls, label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}

// "2026-09-15T00:00:00" → "2026-09-15" for the date input; "" when unset.
const toDateInput = (iso) => (iso ? iso.slice(0, 10) : "");
// Date input → ISO datetime at 09:00 local, or null to clear.
const fromDateInput = (ymd) => (ymd ? `${ymd}T09:00:00` : null);

export default function BoardPage({ id }) {
  const router = useRouter();
  const [board, setBoard] = useState(null);
  const [newCard, setNewCard] = useState({});
  const [viewers, setViewers] = useState([]);
  const [toasts, setToasts] = useState([]);

  const [isChatOpen, setIsChatOpen] = useState(false);

  const [selectedCard, setSelectedCard] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", labels: "", dueDate: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [cardIdToDelete, setCardIdToDelete] = useState(null);
  const [listToDelete, setListToDelete] = useState(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [userProfileColor, setUserProfileColor] = useState("#5546e1");
  const [userDisplayName, setUserDisplayName] = useState("User");
  const [myUserId, setMyUserId] = useState(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  // drag state: which card, which list is hovered, and where in it
  const [dragState, setDragState] = useState({ draggingId: null, targetListId: null, dropIndex: null });

  const toastId = useRef(0);
  const refetchTimer = useRef(null);
  // Mirrors isStatsOpen so load() can read it without becoming a new
  // function on every toggle (which would tear down the socket effect).
  const statsOpenRef = useRef(false);

  function addToast(toast) {
    const tid = ++toastId.current;
    setToasts((t) => [...t, { id: tid, ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== tid)), 4500);
  }

  const load = useCallback(async () => {
    try {
      setBoard(await api.getBoard(id));
      if (statsOpenRef.current) setStatsData(await api.getStats(id));
    } catch (err) {
      // 401 = token expired/invalid; anything else (403/404) → back to the list.
      if (String(err.message).startsWith("401")) {
        clearSession();
        router.replace("/");
      } else {
        router.replace("/boards");
      }
    }
  }, [id, router]);

  // Coalesce bursts of socket events (e.g. the agent creating five cards)
  // into one refetch instead of five.
  const scheduleRefetch = useCallback(() => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(load, REFETCH_DEBOUNCE_MS);
  }, [load]);

  async function toggleStats() {
    const opening = !isStatsOpen;
    setIsStatsOpen(opening);
    statsOpenRef.current = opening;
    if (opening) {
      try {
        setStatsData(await api.getStats(id));
      } catch {
        /* panel keeps its loading state */
      }
    }
  }

  useEffect(() => {
    // load() is async and only sets state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    api
      .me()
      .then((me) => {
        if (me?.avatar_color) setUserProfileColor(me.avatar_color);
        if (me?.full_name) setUserDisplayName(me.full_name);
        if (me?.id) setMyUserId(me.id);
      })
      .catch(() => {});

    const ws = openBoardSocket(id, (msg) => {
      if (msg.type === "presence") setViewers(msg.viewers || []);
      else if (msg.type === "reminder") addToast({ kind: "reminder", text: `Due soon: ${msg.title}` });
      else scheduleRefetch(); // card_*, list_*, members_changed
    });
    ws.onclose = (e) => {
      if (e.code === 4403) router.replace("/boards"); // removed from the board while viewing
    };
    return () => {
      ws.close();
      clearTimeout(refetchTimer.current);
    };
  }, [id, load, scheduleRefetch, router]);

  // ---- drag and drop ----
  const drag = {
    draggingId: dragState.draggingId,
    targetListId: dragState.targetListId,
    dropIndex: dragState.dropIndex,
    onDragStart: (e, cardId) => {
      e.dataTransfer.setData("text/plain", String(cardId));
      e.dataTransfer.effectAllowed = "move";
      setDragState({ draggingId: cardId, targetListId: null, dropIndex: null });
    },
    onDragEnd: () => setDragState({ draggingId: null, targetListId: null, dropIndex: null }),
    onDragOver: (e, listId) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const index = computeDropIndex(e.currentTarget, e.clientY, dragState.draggingId);
      if (dragState.targetListId !== listId || dragState.dropIndex !== index) {
        setDragState((s) => ({ ...s, targetListId: listId, dropIndex: index }));
      }
    },
    onDragLeave: (e, listId) => {
      // Only clear when actually leaving the column, not moving between children.
      if (!e.currentTarget.contains(e.relatedTarget) && dragState.targetListId === listId) {
        setDragState((s) => ({ ...s, targetListId: null, dropIndex: null }));
      }
    },
    onDrop: async (e, listId) => {
      e.preventDefault();
      const cardId = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const index = computeDropIndex(e.currentTarget, e.clientY, cardId);
      setDragState({ draggingId: null, targetListId: null, dropIndex: null });
      if (!cardId) return;
      await api.moveCard(id, cardId, listId, index + 1); // API positions are 1-based
      load();
    },
  };

  // ---- card details ----
  function openDetailsModal(card) {
    setSelectedCard(card);
    setForm({
      title: card.title,
      description: card.description || "",
      labels: card.labels || "",
      dueDate: toDateInput(card.due_date),
    });
    setAttachmentError("");
  }

  function handleSelectSearchResult(result) {
    const list = board.lists.find((l) => l.id === result.list_id);
    const card = list && list.cards.find((c) => c.id === result.card_id);
    if (card) {
      openDetailsModal(card);
      setTimeout(() => {
        document.getElementById("card-" + card.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }

  async function handleSaveCardDetails() {
    if (!form.title.trim()) return;
    setIsSaving(true);
    try {
      await api.updateCard(id, selectedCard.id, {
        title: form.title.trim(),
        description: form.description.trim(),
        labels: form.labels.trim(),
        due_date: fromDateInput(form.dueDate),
      });
      setSelectedCard(null);
      load();
    } catch {
      addToast({ kind: "error", text: "Failed to save details." });
    } finally {
      setIsSaving(false);
    }
  }

  async function executeConfirmDelete() {
    try {
      await api.deleteCard(id, cardIdToDelete);
      setCardIdToDelete(null);
      setSelectedCard(null);
      load();
    } catch {
      addToast({ kind: "error", text: "Failed to delete card." });
    }
  }

  // ---- lists ----
  async function addList(name) {
    await api.createList(id, name);
    load();
  }

  async function addCard(listId) {
    const title = newCard[listId];
    if (title && title.trim()) {
      await api.createCard(id, listId, { title: title.trim() });
      setNewCard({ ...newCard, [listId]: "" });
      load();
    }
  }

  async function renameList(list, name) {
    await api.updateList(id, list.id, { name });
    load();
  }

  async function confirmDeleteList() {
    if (!listToDelete) return;
    try {
      await api.deleteList(id, listToDelete.id);
      setListToDelete(null);
      load();
    } catch {
      addToast({ kind: "error", text: "Failed to delete list." });
    }
  }

  // ---- attachments ----
  const attachment = {
    busy: attachmentBusy,
    error: attachmentError,
    upload: async (file) => {
      setAttachmentBusy(true);
      setAttachmentError("");
      try {
        setSelectedCard(await api.uploadAttachment(id, selectedCard.id, file));
        load();
      } catch (err) {
        setAttachmentError(
          String(err.message).startsWith("413") ? "That file is over 10 MB." : "Upload failed. Please try again."
        );
      } finally {
        setAttachmentBusy(false);
      }
    },
    remove: async () => {
      setAttachmentBusy(true);
      setAttachmentError("");
      try {
        setSelectedCard(await api.deleteAttachment(id, selectedCard.id));
        load();
      } catch {
        setAttachmentError("Couldn't remove the attachment.");
      } finally {
        setAttachmentBusy(false);
      }
    },
    download: async () => {
      setAttachmentBusy(true);
      setAttachmentError("");
      try {
        await api.downloadAttachment(id, selectedCard.id, selectedCard.attachment_name);
      } catch {
        setAttachmentError("Download failed.");
      } finally {
        setAttachmentBusy(false);
      }
    },
  };

  function handleLogout() {
    clearSession();
    router.replace("/");
  }

  if (!board) return <BoardSkeleton />;

  const totalCardsCount = board.lists.reduce((acc, l) => acc + l.cards.length, 0);
  const myEmail = getEmail();
  const others = viewers.filter((v) => v !== myEmail);

  return (
    <div className={`board-shell ${isSidebarOpen ? "sidebar-open" : ""}`}>
      <header className="topbar">
        <Link href="/boards" className="wordmark"><span className="dot" /> Stack Board</Link>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm btn-outline btn-danger-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="board-head">
        <Link href="/boards" className="back">← Boards</Link>
        <h1>{board.name}</h1>

        <div className="presence" style={{ position: "relative" }}>
          <span className="live-dot" />
          <span
            className="av"
            style={{ background: userProfileColor, cursor: "pointer", fontWeight: 700 }}
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            title={userDisplayName}
          >
            {userDisplayName ? userDisplayName[0].toUpperCase() : "U"}
          </span>
          {others.map((email) => (
            <span key={email} className="av" title={email} style={{ background: "var(--muted)" }}>
              {email[0].toUpperCase()}
            </span>
          ))}

          {isProfileMenuOpen && (
            <div className="column-menu" style={{ left: 0, right: "auto", top: 42, width: 190, padding: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: "var(--ink)" }}>{userDisplayName}</div>
              <Link
                href={`/profile?from=/boards/${id}`}
                style={{ fontSize: 12, color: "var(--accent)", display: "block", marginBottom: 10, textDecoration: "none", fontWeight: 500 }}
              >
                Edit profile →
              </Link>
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                Avatar colour
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {PALETTE_OPTIONS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Use colour ${c}`}
                    onClick={async () => {
                      setUserProfileColor(c);
                      setIsProfileMenuOpen(false);
                      await api.updateProfile(c);
                    }}
                    style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: c, border: userProfileColor === c ? "2.5px solid var(--ink)" : "1px solid rgba(0,0,0,0.15)", cursor: "pointer", padding: 0 }}
                  />
                ))}
              </div>
            </div>
          )}

          <span className="label">
            {others.length === 0
              ? `${userDisplayName} (only you)`
              : `${userDisplayName} + ${others.length} ${others.length === 1 ? "other" : "others"} viewing`}
          </span>
        </div>

        <div className="board-head-actions">
          <button className="btn btn-primary" onClick={() => setIsShareOpen(true)}>
            {board.role === "owner" ? "Share" : `Members (${board.members.length})`}
          </button>
          <button className="btn btn-ghost btn-outline" onClick={toggleStats}>
            Metrics
          </button>
          <button className="btn btn-ghost btn-outline" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            Activity
          </button>
        </div>
      </div>

      <BoardStats isOpen={isStatsOpen} stats={statsData} totalCards={totalCardsCount} />

      <BoardCanvas
        board={board}
        newCard={newCard}
        setNewCard={setNewCard}
        drag={drag}
        openDetailsModal={openDetailsModal}
        dueInfo={dueInfo}
        addCard={addCard}
        addList={addList}
        renameList={renameList}
        requestDeleteList={setListToDelete}
      />

      <TaskDrawer
        selectedCard={selectedCard}
        onClose={() => setSelectedCard(null)}
        form={form}
        setForm={setForm}
        isSaving={isSaving}
        onSave={handleSaveCardDetails}
        cardIdToDelete={cardIdToDelete}
        setCardIdToDelete={setCardIdToDelete}
        executeConfirmDelete={executeConfirmDelete}
        attachment={attachment}
      />

      <ConfirmDialog
        open={Boolean(listToDelete)}
        title={`Delete “${listToDelete?.name}”?`}
        body={
          listToDelete?.cards?.length
            ? `The ${listToDelete.cards.length} card${listToDelete.cards.length === 1 ? "" : "s"} in this list will be deleted too.`
            : "This list is empty."
        }
        confirmLabel="Delete list"
        onConfirm={confirmDeleteList}
        onCancel={() => setListToDelete(null)}
      />

      {isShareOpen && (
        <ShareDialog
          boardId={id}
          board={board}
          myUserId={myUserId}
          onClose={() => setIsShareOpen(false)}
          onChanged={load}
          onLeft={() => router.replace("/boards")}
        />
      )}

      <ActivitySidebar
        boardId={id}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        recent={board.activity_logs}
      />

      <AgentChat boardId={id} isOpen={isChatOpen} setIsOpen={setIsChatOpen} onBoardChanged={load} />

      <SemanticSearch boardId={id} onSelectCard={handleSelectSearchResult} />

      {toasts.length > 0 && (
        <div className="toast-wrap" style={{ bottom: 160, right: "calc(96px + var(--sidebar-w))" }}>
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind || ""}`}>
              {t.kind === "reminder" && <span className="t-title">Reminder</span>}
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Where in the column the pointer is: the index of the first card whose
 * vertical midpoint is below the cursor. The card being dragged is skipped
 * so dropping it just above/below itself resolves to its own slot.
 */
function computeDropIndex(columnEl, clientY, draggingId) {
  const cards = [...columnEl.querySelectorAll("article[data-card-id]")].filter(
    (el) => Number(el.dataset.cardId) !== draggingId
  );
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return cards.length;
}

function BoardSkeleton() {
  return (
    <>
      <header className="topbar">
        <span className="wordmark"><span className="dot" /> Stack Board</span>
      </header>
      <div className="board-head">
        <span className="back">← Boards</span>
        <div className="sk-line" style={{ width: 220, height: 22, margin: 0 }} />
      </div>
      <div className="skeleton-canvas" aria-busy="true" aria-label="Loading board">
        {[3, 2, 4].map((n, i) => (
          <div key={i} className="sk-col">
            <div className="sk-line" />
            {Array.from({ length: n }).map((_, j) => <div key={j} className="sk-card" />)}
          </div>
        ))}
      </div>
    </>
  );
}
