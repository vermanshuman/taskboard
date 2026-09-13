"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, setName } from "@/lib/api.js";

const PALETTE_OPTIONS = ["#5546e1", "#1ba9a0", "#e0883b", "#c2497f", "#3b82d0", "#2ecc71", "#e74c3c", "#f1c40f"];

export default function ProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to go after saving; the Board page links here with ?from=/boards/<id>.
  const returnPath = searchParams.get("from") || "/boards";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [color, setColor] = useState("#5546e1");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setFullName(u.full_name || "");
        setEmail(u.email || "");
        setColor(u.avatar_color || "#5546e1");
      })
      .catch((e) => console.error("Failed to fetch profile settings", e));
  }, []);

  async function handleUpdate(e) {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await api.updateProfile(color, fullName);
      setName(fullName);
      setMessage("Account details saved. Redirecting...");
      setTimeout(() => router.push(returnPath), 1000);
    } catch {
      setMessage("Could not save your changes. Please try again.");
      setIsSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: "600px", margin: "60px auto", padding: "0 24px" }}>
      <Link href={returnPath} style={{ color: "#626f86", textDecoration: "none", fontSize: "14px", fontWeight: "500" }}>
        ← Back
      </Link>
      <h1 style={{ fontSize: "28px", fontWeight: "700", marginTop: "16px", color: "#172b4d" }}>
        Account Profile Settings
      </h1>

      {message && (
        <div style={{ padding: "12px", backgroundColor: "#eef0f8", borderRadius: "6px", color: "var(--accent)", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          {message}
        </div>
      )}

      <form onSubmit={handleUpdate} style={{ backgroundColor: "#fff", padding: "32px", borderRadius: "8px", border: "1px solid #dcdfe4", display: "flex", flexDirection: "column", gap: "20px", marginTop: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div>
          <label style={labelStyle}>Email Address (Read-Only)</label>
          <input className="input" type="text" value={email} disabled style={{ width: "100%", backgroundColor: "#f4f5f7", cursor: "not-allowed" }} />
        </div>

        <div>
          <label style={labelStyle}>Full Name</label>
          <input className="input" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={{ width: "100%" }} required disabled={isSaving} />
        </div>

        <div>
          <label style={labelStyle}>Avatar Color</label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {PALETTE_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Use color ${c}`}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  backgroundColor: c,
                  border: color === c ? "3px solid #172b4d" : "1px solid rgba(0,0,0,0.15)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start", marginTop: "8px" }} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: "13px", fontWeight: "600", color: "#44546f", marginBottom: "6px" };
