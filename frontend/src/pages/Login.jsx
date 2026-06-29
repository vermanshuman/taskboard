import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api.js";

export default function Login() {
  const [email, setEmail] = useState("demo@taskboard.dev");
  const [password, setPassword] = useState("demo1234");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit() {
    setError("");
    try {
      const res = isRegister
        ? await api.register(email, password)
        : await api.login(email, password);
      setToken(res.access_token);
      navigate("/");
    } catch (e) {
      setError(parseError(e));
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") submit();
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <span className="wordmark">
          <span className="dot" /> Stack Board
        </span>
        <div>
          <p className="auth-eyebrow">Collaborative task boards</p>
          <h1 className="auth-headline">Move work forward, together and in real time.</h1>
          <p className="auth-sub">
            Boards, lists, and cards that sync live across everyone who has them open.
          </p>
          <div className="motif" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <span style={{ color: "#7d7ea0", fontSize: 13 }}>Built with React + FastAPI</span>
      </aside>

      <main className="auth-form-side">
        <div className="auth-card">
          <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
          <div className="field">
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Email"
              type="email"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-primary" onClick={submit}>
            {isRegister ? "Create account" : "Log in"}
          </button>
          {error && <p className="form-error">{error}</p>}
          <p className="auth-switch">
            {isRegister ? "Already have an account? " : "New here? "}
            <span className="auth-link" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? "Log in" : "Create one"}
            </span>
          </p>
          <div className="auth-hint">
            Demo login: <strong>demo@taskboard.dev</strong> / <strong>demo1234</strong>
          </div>
        </div>
      </main>
    </div>
  );
}

function parseError(e) {
  const msg = String(e.message || e);
  if (msg.startsWith("401")) return "That email and password don't match.";
  if (msg.startsWith("400")) return "That email is already registered.";
  return "Something went wrong. Check the server is running.";
}
