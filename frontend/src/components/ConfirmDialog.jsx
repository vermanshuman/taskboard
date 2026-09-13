"use client";

/** Small modal confirm. Renders nothing when `open` is false. */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={onCancel}>
      <div className="dialog small" onClick={(e) => e.stopPropagation()}>
        <div className={`dialog-head ${danger ? "danger" : ""}`}>
          <h3>{title}</h3>
        </div>
        {body && <div className="dialog-body">{body}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost btn-outline" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={danger ? { background: "var(--danger)" } : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
