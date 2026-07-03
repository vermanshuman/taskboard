import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, setEmail, getEmail } from "../lib/api.js";

const SPINES = [
  "var(--spine-1)",
  "var(--spine-2)",
  "var(--spine-3)",
  "var(--spine-4)",
  "var(--spine-5)",
];

export default function Boards() {
  const [boards, setBoards] = useState([]);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  const email = getEmail();

  async function load() {
    try {
      setBoards(await api.listBoards());
      setLoaded(true);
    } catch {
      setToken(null);
      navigate("/login");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name.trim()) return;
    await api.createBoard(name.trim());
    setName("");
    load();
  }

  function logout() {
    setToken(null);
    setEmail(null);
    navigate("/login");
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark">
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
            <Link key={b.id} to={`/boards/${b.id}`} className="board-tile">
              <div className="spine" style={{ background: SPINES[i % SPINES.length] }} />
              <div className="name">{b.name}</div>
              <div className="meta">Open board</div>
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
    </>
  );
}
