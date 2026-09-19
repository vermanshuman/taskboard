"use client";

import { useEffect, useRef, useState } from "react";

const SPINES = ["var(--spine-1)", "var(--spine-2)", "var(--spine-3)", "var(--spine-4)", "var(--spine-5)"];

// Card ageing: how long since the last meaningful touch (edit, move,
// attachment). Finished cards never age. Thresholds are days.
const AGE_LEVELS = [
  { days: 30, level: 3 },
  { days: 14, level: 2 },
  { days: 7, level: 1 },
];

function ageInfo(card, inDoneList) {
  if (card.completed || inDoneList) return null;
  const last = card.updated_at || card.created_at;
  if (!last) return null;
  const stamp = new Date(last.endsWith("Z") ? last : last + "Z"); // API times are UTC
  const days = Math.floor((Date.now() - stamp) / 864e5);
  const hit = AGE_LEVELS.find((l) => days >= l.days);
  if (!hit) return null;
  return { days, level: hit.level, label: days >= 60 ? `${Math.floor(days / 30)}mo` : `${days}d` };
}

export default function BoardCanvas({
  board,
  newCard,
  setNewCard,
  drag,
  changedIds,
  openDetailsModal,
  dueInfo,
  addCard,
  addList,
  renameList,
  requestDeleteList,
}) {
  return (
    <div className="board-canvas">
      {board.lists.length === 0 && (
        <div className="board-empty" style={{ maxWidth: "450px", lineHeight: "1.5" }}>
          No lists yet. Add a column, or open the AI agent (bottom-right) and describe your tasks —
          it will set up the standard columns for you.
        </div>
      )}

      {board.lists.map((lst, i) => (
        <Column
          key={lst.id}
          list={lst}
          spine={SPINES[i % SPINES.length]}
          drag={drag}
          changedIds={changedIds}
          newCardTitle={newCard[lst.id] || ""}
          setNewCardTitle={(v) => setNewCard({ ...newCard, [lst.id]: v })}
          addCard={() => addCard(lst.id)}
          openDetailsModal={openDetailsModal}
          dueInfo={dueInfo}
          renameList={(name) => renameList(lst, name)}
          requestDeleteList={() => requestDeleteList(lst)}
        />
      ))}

      <AddListForm onAdd={addList} />
    </div>
  );
}

function Column({
  list,
  spine,
  drag,
  changedIds,
  newCardTitle,
  setNewCardTitle,
  addCard,
  openDetailsModal,
  dueInfo,
  renameList,
  requestDeleteList,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isTarget = drag.targetListId === list.id;
  const dropIndex = isTarget ? drag.dropIndex : null;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function startEdit() {
    setDraft(list.name);
    setEditing(true);
    setMenuOpen(false);
  }

  function commitEdit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== list.name) renameList(name);
  }

  return (
    <section
      className={`column column-dropzone ${isTarget ? "column-dropzone-active" : ""}`}
      onDragOver={(e) => drag.onDragOver(e, list.id)}
      onDragLeave={(e) => drag.onDragLeave(e, list.id)}
      onDrop={(e) => drag.onDrop(e, list.id)}
    >
      <div className="column-head" ref={menuRef}>
        <span className="spine" style={{ background: spine }} />
        {editing ? (
          <input
            className="column-title-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="title" onClick={startEdit} title="Click to rename">
            {list.name}
          </span>
        )}
        <span className="count">{list.cards.length}</span>
        <button className="column-menu-btn" aria-label="List actions" onClick={() => setMenuOpen((v) => !v)}>
          ⋯
        </button>
        {menuOpen && (
          <div className="column-menu">
            <button onClick={startEdit}>Rename</button>
            <button
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                requestDeleteList();
              }}
            >
              Delete list{list.cards.length ? ` (${list.cards.length} cards)` : ""}
            </button>
          </div>
        )}
      </div>

      <div className="column-cards">
        {list.cards.map((c, idx) => {
          const due = dueInfo(c.due_date);
          const age = ageInfo(c, list.is_done);
          const tagList = c.labels ? c.labels.split(",").map((t) => t.trim()).filter(Boolean) : [];
          return (
            <div key={c.id}>
              {dropIndex === idx && <div className="drop-indicator" />}
              <article
                className={`task task-draggable ${drag.draggingId === c.id ? "dragging" : ""} ${age ? `stale stale-${age.level}` : ""} ${changedIds?.has(c.id) ? "changed" : ""}`}
                title={age ? `Untouched for ${age.days} days` : undefined}
                id={`card-${c.id}`}
                data-card-id={c.id}
                draggable
                onDragStart={(e) => drag.onDragStart(e, c.id, list.id)}
                onDragEnd={drag.onDragEnd}
                onClick={() => openDetailsModal(c)}
              >
                <div className="task-title">
                  {c.title}
                  {age && (
                    <span className="stale-badge" aria-label={`Untouched for ${age.days} days`}>
                      {age.label}
                    </span>
                  )}
                </div>
                {tagList.length > 0 && (
                  <div className="task-tags">
                    {tagList.map((tag) => (
                      <span key={tag} className="badge-tag">{tag}</span>
                    ))}
                  </div>
                )}
                {due && <span className={`due ${due.cls}`}>Due {due.label}</span>}
              </article>
            </div>
          );
        })}
        {dropIndex === list.cards.length && <div className="drop-indicator" />}
      </div>

      <div className="add-card">
        <input
          className="input"
          value={newCardTitle}
          onChange={(e) => setNewCardTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCard()}
          placeholder="+ Add a card"
        />
        <button className="btn btn-primary btn-sm" onClick={addCard}>
          Add
        </button>
      </div>
    </section>
  );
}

function AddListForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit() {
    const value = name.trim();
    if (!value) return;
    await onAdd(value);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="column-add">
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>
          + Add list
        </button>
      </div>
    );
  }

  return (
    <div className="column-add column-add-form">
      <input
        className="input"
        autoFocus
        placeholder="List name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
      />
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!name.trim()}>
          Add list
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setName(""); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
