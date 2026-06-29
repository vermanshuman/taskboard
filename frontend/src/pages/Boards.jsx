import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api.js";

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
  const navigate = useNavigate();

  async function load() {
    try {
      setBoards(await api.listBoards());
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
    navigate("/login");
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="wordmark">
          <span className="dot" /> Stack Board
        </Link>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Log out
        </button>
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
