import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, openBoardSocket } from "../lib/api.js";

const SPINES = [
  "var(--spine-1)",
  "var(--spine-2)",
  "var(--spine-3)",
  "var(--spine-4)",
  "var(--spine-5)",
];

// STARTER board view, now styled. It renders lists + cards and reloads live on
// WebSocket events. FE developer's job: swap the plain card rendering for real
// drag-and-drop (e.g. @hello-pangea/dnd or dnd-kit) calling api.moveCard, add a
// card detail modal (description, due date, labels, file upload), and a stats
// view from api.getStats. The CSS classes (.column, .task, etc.) are ready.
export default function Board() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [newCard, setNewCard] = useState({});

  async function load() {
    setBoard(await api.getBoard(id));
  }

  useEffect(() => {
    load();
    const ws = openBoardSocket(id, () => load()); // crude: reload on any event
    return () => ws.close();
  }, [id]);

  if (!board) return <p className="loading">Loading board…</p>;

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

  function fmtDue(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark">
          <span className="dot" /> Stack Board
        </Link>
      </header>

      <div className="board-head">
        <Link to="/" className="back">
          ← Boards
        </Link>
        <h1>{board.name}</h1>
      </div>

      <div className="board-canvas">
        {board.lists.map((lst, i) => (
          <section className="column" key={lst.id}>
            <div className="column-head">
              <span className="spine" style={{ background: SPINES[i % SPINES.length] }} />
              <span className="title">{lst.name}</span>
              <span className="count">{lst.cards.length}</span>
            </div>

            {lst.cards.map((c) => (
              <article className="task" key={c.id}>
                {c.title}
                {c.due_date && <span className="due">Due {fmtDue(c.due_date)}</span>}
              </article>
            ))}

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
    </>
  );
}
