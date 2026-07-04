import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom"; // Add useSearchParams
import { api, setToken, setEmail, BASE } from "../lib/api.js";

export default function Login() {
  const [email, setFormEmail] = useState("demo@taskboard.dev");
  const [password, setFormPassword] = useState("demo1234");
  const [fullName, setFormFullName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Listen for the incoming callback token parameters from Google after redirection
  useEffect(() => {
    const token = searchParams.get("token");
    const userEmail = searchParams.get("email");
    const userName = searchParams.get("name");

    if (token && userEmail) {
      setToken(token);
      setEmail(userEmail);
      localStorage.setItem("full_name", userName || "Google User");
      navigate("/");
    }
  }, [searchParams, navigate]);

  const handleRealGoogleLogin = () => {
    // Navigate out of the SPA directly to the FastAPI route that triggers the Google OAuth Screen
    window.location.href = `${BASE}/api/auth/google/login`;
  };

  async function submit() {
    setError("");
    try {
      if (isRegister) {
        await api.register(email, password, fullName);
        const res = await api.login(email, password);
        setToken(res.access_token);
        setEmail(res.user?.email || email);
        localStorage.setItem("full_name", res.user?.full_name || fullName);
      } else {
        const res = await api.login(email, password);
        setToken(res.access_token);
        setEmail(res.user?.email || email);
        localStorage.setItem("full_name", res.user?.full_name || "Pankaj Verma");
      }
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
          <span className="wordmark"><span className="dot" /> Stack Board</span>
          <div>
            <p className="auth-eyebrow">Collaborative task boards</p>
            <h1 className="auth-headline">Move work forward, together and in real time.</h1>
            <p className="auth-sub">Boards, lists, and cards that sync live across everyone who has them open.</p>
          </div>
          <span style={{ color: "#7d7ea0", fontSize: 13 }}>Built with React + FastAPI</span>
        </aside>

        <main className="auth-form-side">
          <div className="auth-card" style={{ maxWidth: "400px", width: "100%" }}>
            <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>

            {/* Real Live Google Sign In Button */}
            <div style={{ marginBottom: "20px" }}>
              <button
                  type="button"
                  onClick={handleRealGoogleLogin}
                  style={{ width: "100%", padding: "10px 16px", border: "1px solid #c1c7d0", backgroundColor: "#fff", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", fontWeight: "600", color: "#44546f", fontSize: "14px", transition: "background-color 0.15s ease" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#fafbfc"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fff"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.28 1.845 15.45.986 12.24.986c-6.077 0-11 4.923-11 11s4.923 11 11 11c6.34 0 10.557-4.444 10.557-10.742 0-.724-.077-1.277-.174-1.66H12.24z"/></svg>
                Sign in with Google
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", textTransform: "uppercase", fontSize: "11px", color: "#8590a2", fontWeight: "700", margin: "16px 0", gap: "10px" }}>
              <div style={{ flexGrow: 1, height: "1px", backgroundColor: "#e2e4e9" }} />
              or use email password
              <div style={{ flexGrow: 1, height: "1px", backgroundColor: "#e2e4e9" }} />
            </div>

            {isRegister && (
                <div className="field">
                  <input className="input" value={fullName} onChange={(e) => setFormFullName(e.target.value)} onKeyDown={onKeyDown} placeholder="Full Name" type="text" />
                </div>
            )}

            <div className="field">
              <input className="input" value={email} onChange={(e) => setFormEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="Email" type="email" />
            </div>

            <div className="field">
              <input className="input" type="password" value={password} onChange={(e) => setFormPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="Password" />
            </div>

            <button className="btn btn-primary" onClick={submit}>
              {isRegister ? "Create account" : "Log in"}
            </button>

            {error && <p className="form-error">{error}</p>}

            <p className="auth-switch">
              {isRegister ? "Already have an account? " : "New here? "}
              <span className="auth-link" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
              {isRegister ? "Log in" : "Create one"}
            </span>
            </p>
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