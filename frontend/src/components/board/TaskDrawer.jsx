"use client";

import { useRef } from "react";
import ConfirmDialog from "@/components/ConfirmDialog.jsx";

const Icon = {
  card: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
  lines: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" />
      <line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" />
    </svg>
  ),
  tag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="3" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  clip: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
};

/**
 * Card editor. `form` holds the editable fields (title, description, labels,
 * dueDate as YYYY-MM-DD or ""); `attachment` holds upload/download/remove
 * handlers and their busy/error state.
 */
export default function TaskDrawer({
  selectedCard,
  onClose,
  form,
  setForm,
  isSaving,
  onSave,
  cardIdToDelete,
  setCardIdToDelete,
  executeConfirmDelete,
  attachment,
}) {
  const fileInputRef = useRef(null);
  if (!selectedCard) return null;

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <>
      <div className="modal-overlay left" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
              <span className="drawer-label" style={{ marginTop: 4 }}>{Icon.card}</span>
              <input
                className="drawer-title-input"
                value={form.title}
                onChange={set("title")}
                placeholder="Card title"
                aria-label="Card title"
              />
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="drawer-body">
            <div className="drawer-section">
              <label className="drawer-label">{Icon.calendar} Due date</label>
              <div className="due-row">
                <input className="input" type="date" value={form.dueDate} onChange={set("dueDate")} />
                {form.dueDate && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, dueDate: "" })}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="drawer-section">
              <label className="drawer-label">{Icon.lines} Description</label>
              <textarea
                className="textarea"
                placeholder="Add details for this task..."
                value={form.description}
                onChange={set("description")}
              />
            </div>

            <div className="drawer-section">
              <label className="drawer-label">{Icon.tag} Labels</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. bug, critical"
                value={form.labels}
                onChange={set("labels")}
              />
            </div>

            <div className="drawer-section">
              <label className="drawer-label">{Icon.clip} Attachment</label>
              {selectedCard.attachment_name ? (
                <div className="attachment-row">
                  <button className="attachment-link" onClick={attachment.download} disabled={attachment.busy}>
                    {selectedCard.attachment_name}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={attachment.remove} disabled={attachment.busy}>
                    Remove
                  </button>
                </div>
              ) : (
                <div className="attachment-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) attachment.upload(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="btn btn-ghost btn-outline btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attachment.busy}
                  >
                    {attachment.busy ? "Uploading…" : "+ Attach a file"}
                  </button>
                  <span className="dialog-hint">Max 10 MB</span>
                </div>
              )}
              {attachment.error && <p className="form-error" style={{ margin: 0 }}>{attachment.error}</p>}
            </div>
          </div>

          <div className="drawer-foot">
            <button
              className="btn btn-ghost btn-danger-ghost"
              onClick={() => setCardIdToDelete(selectedCard.id)}
              disabled={isSaving}
            >
              Delete card
            </button>
            <div className="spacer" />
            <button className="btn btn-ghost btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onSave} disabled={isSaving || !form.title.trim()}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(cardIdToDelete)}
        title="Delete this card?"
        body="Its description, labels, attachment and history will be permanently removed. This cannot be undone."
        confirmLabel="Yes, delete"
        onConfirm={executeConfirmDelete}
        onCancel={() => setCardIdToDelete(null)}
      />
    </>
  );
}
