"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, useSessionValue } from "@/lib/api.js";
import ConfirmDialog from "@/components/ConfirmDialog.jsx";

const SPINES = [
  "var(--spine-1)",
  "var(--spine-2)",
  "var(--spine-3)",
  "var(--spine-4)",
  "var(--spine-5)",
];

export default function BoardsPage() {
  const [boards, setBoards] = useState([]);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const email = useSessionValue("email") || "";
  const [pendingDelete, setPendingDelete] = useState(null); // board awaiting confirm
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function load() {
    try {
      setBoards(await api.listBoards());
      setLoaded(true);
    } catch {
      clearSession();
      router.replace("/");
    }
  }

  useEffect(() => {
    // load() is async and only sets state after awaiting the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!name.trim()) return;
    await api.createBoard(name.trim());
    setName("");
    load();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteBoard(pendingDelete.id);
      setPendingDelete(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  return (
    <>
      <header className="topbar">
        <Link href="/boards" className="wordmark">
          <span className="dot" /> Stack Board
        </Link>
        <div className="topbar-right">
          {email && (
            <span className="user-chip">
              <span className="av">{email[0]}</span>
              {email}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <div className="page">
        <div className="page-head">
          <div>
            <h1>Your boards</h1>
            <p className="sub">
              {boards.length} {boards.length === 1 ? "board" : "boards"}
            </p>
          </div>
        </div>

        {loaded && boards.length === 0 && (
          <div className="empty">
            <h3>No boards yet</h3>
            <p>Create your first board below to start organizing work.</p>
          </div>
        )}

        <div className="board-grid">
          {boards.map((b, i) => (
            <Link key={b.id} href={`/boards/${b.id}`} className="board-tile">
              <div className="spine" style={{ background: SPINES[i % SPINES.length] }} />
              <div className="name">{b.name}</div>
              <div className="meta">{b.role === "owner" ? "Open board" : "Shared with you"}</div>
              {b.role === "owner" && (
                <button
                  className="tile-delete"
                  aria-label={`Delete ${b.name}`}
                  title="Delete board"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingDelete(b);
                  }}
                >
                  ✕
                </button>
              )}
            </Link>
          ))}

          <div className="board-new">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="New board name"
            />
            <button className="btn btn-primary btn-sm" onClick={create}>
              Create board
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete “${pendingDelete?.name}”?`}
        body="All its lists, cards, attachments and history will be permanently removed for everyone it's shared with."
        confirmLabel="Delete board"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
