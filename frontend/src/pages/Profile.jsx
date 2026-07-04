import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api.js";

export default function Profile() {
    const navigate = useNavigate();
    const location = useLocation();
    const returnPath = location.state?.from || "/";
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [color, setColor] = useState("#5546e1");
    const [message, setMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        async function getProfileData() {
            try {
                const u = await api.me();
                if (u) {
                    setFullName(u.full_name || "");
                    setEmail(u.email || "");
                    setColor(u.avatar_color || "#5546e1");
                }
            } catch (e) {
                console.error("Failed to fetch profile settings", e);
            }
        }
        getProfileData();
    }, []);

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);

        try {
            await api.updateProfile(color, fullName);
            localStorage.setItem("full_name", fullName); // Keep client state in sync
            setMessage("Account details saved successfully! Redirecting...");

            // Short delay so the user can register the success confirmation message
            setTimeout(() => {
                setIsSaving(false);
                navigate(returnPath); // Redirect cleanly to your main boards dashboard page
            }, 1200);
        } catch (err) {
            setMessage("Error processing data overrides.");
            setIsSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: "600px", margin: "60px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
            <Link to={returnPath} style={{ color: "#626f86", textDecoration: "none", fontSize: "14px", fontWeight: "500" }}>
                ← Back
            </Link>
            <h1 style={{ fontSize: "28px", fontWeight: "700", marginTop: "16px", color: "#172b4d" }}>
                Account Profile Settings
            </h1>

            {message && (
                <div style={{ padding: "12px", backgroundColor: "#eef0f8", borderRadius: "6px", color: "var(--accent, #5546e1)", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
                    {message}
                </div>
            )}

            <form onSubmit={handleUpdate} style={{ backgroundColor: "#fff", padding: "32px", borderRadius: "8px", border: "1px solid #dcdfe4", display: "flex", flexDirection: "column", gap: "20px", marginTop: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#44546f", marginBottom: "6px" }}>
                        Email Address (Read-Only)
                    </label>
                    <input className="input" type="text" value={email} disabled style={{ width: "100%", backgroundColor: "#f4f5f7", cursor: "not-allowed" }} />
                </div>

                <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#44546f", marginBottom: "6px" }}>
                        Full Identity Name
                    </label>
                    <input className="input" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Pankaj Verma" style={{ width: "100%" }} required disabled={isSaving} />
                </div>

                <button className="btn btn-primary" type="submit" style={{ alignSelf: "flex-start", marginTop: "8px" }} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Configuration Changes"}
                </button>
            </form>
        </div>
    );
}