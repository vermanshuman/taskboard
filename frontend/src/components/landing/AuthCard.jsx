"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setToken, setEmail, setName, BASE } from "@/lib/api.js";

const DEMO = { email: "demo@taskboard.dev", password: "demo1234" };

/**
 * Sign in / create account card. Also completes Google OAuth: the backend
 * redirects back to "/?token=&email=&name=" and this picks it up.
 */
export default function AuthCard() {
  const [email, setFormEmail] = useState("");
  const [password, setFormPassword] = useState("");
  const [fullName, setFormFullName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const userEmail = searchParams.get("email");
    const userName = searchParams.get("name");
    if (token && userEmail) {
      setToken(token);
      setEmail(userEmail);
      setName(userName || "Google User");
      router.replace("/boards");
    }
  }, [searchParams, router]);

  async function signIn(creds) {
    setError("");
    setBusy(true);
    try {
      if (isRegister) await api.register(creds.email, creds.password, fullName);
      const res = await api.login(creds.email, creds.password);
      setToken(res.access_token);
      setEmail(res.user?.email || creds.email);
      setName(res.user?.full_name || fullName || creds.email.split("@")[0]);
      router.push("/boards");
    } catch (e) {
      setError(parseError(e));
      setBusy(false);
    }
  }

  function handleGoogleLogin() {
    // Leave the SPA: the backend (a different origin) owns the OAuth handshake.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${BASE}/api/auth/google/login`;
  }

  const onKeyDown = (e) => e.key === "Enter" && signIn({ email, password });

  return (
    <div className="auth-card lp-card" id="signin">
      <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
      <p className="lp-card-sub">
        {isRegister ? "Free, takes ten seconds." : "Sign in to open your boards."}
      </p>

      <button type="button" onClick={handleGoogleLogin} className="google-btn" disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.11C18.28 1.845 15.45.986 12.24.986c-6.077 0-11 4.923-11 11s4.923 11 11 11c6.34 0 10.557-4.444 10.557-10.742 0-.724-.077-1.277-.174-1.66H12.24z"/></svg>
        Continue with Google
      </button>

      <div className="lp-or"><span>or use email</span></div>

      {isRegister && (
        <div className="field">
          <input className="input" value={fullName} onChange={(e) => setFormFullName(e.target.value)} onKeyDown={onKeyDown} placeholder="Full name" type="text" autoComplete="name" />
        </div>
      )}
      <div className="field">
        <input className="input" value={email} onChange={(e) => setFormEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="Email" type="email" autoComplete="email" />
      </div>
      <div className="field">
        <input className="input" type="password" value={password} onChange={(e) => setFormPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="Password" autoComplete={isRegister ? "new-password" : "current-password"} />
      </div>

      <button className="btn btn-primary" onClick={() => signIn({ email, password })} disabled={busy}>
        {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
      </button>

      {error && <p className="form-error">{error}</p>}

      {!isRegister && (
        <button type="button" className="btn btn-ghost lp-demo-btn" onClick={() => signIn(DEMO)} disabled={busy}>
          Skip sign-up — open the live demo
        </button>
      )}

      <p className="auth-switch">
        {isRegister ? "Already have an account? " : "New here? "}
        <span className="auth-link" onClick={() => { setIsRegister(!isRegister); setError(""); }}>
          {isRegister ? "Sign in" : "Create one"}
        </span>
      </p>
    </div>
  );
}

function parseError(e) {
  const msg = String(e.message || e);
  if (msg.startsWith("401")) return "That email and password don't match.";
  if (msg.startsWith("400")) return "That email is already registered.";
  if (msg.startsWith("422")) return "Please enter a valid email and password.";
  return "Something went wrong. Check the server is running.";
}
