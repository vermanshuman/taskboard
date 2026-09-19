// Thin API client for the Task Board backend.
// Token/email/name live in localStorage (browser only). Every accessor is
// guarded so these helpers are safe to import from server-rendered modules.

import { useSyncExternalStore } from "react";

export const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const isBrowser = () => typeof window !== "undefined";

// Components subscribe to session changes via useSessionValue(); every write
// below notifies them so login/logout re-render without prop drilling.
const listeners = new Set();
function subscribe(cb) {
  listeners.add(cb);
  if (isBrowser()) window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (isBrowser()) window.removeEventListener("storage", cb);
  };
}
function emit() {
  listeners.forEach((cb) => cb());
}

/**
 * Read a session key reactively. Returns `undefined` during server render /
 * hydration (value unknown yet), `null` when the key is absent, else the string.
 */
export function useSessionValue(key) {
  return useSyncExternalStore(
    subscribe,
    () => readStorage(key),
    () => undefined
  );
}

function readStorage(key) {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (!isBrowser()) return;
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode etc.) */
  }
  emit();
}

export function getToken() {
  return readStorage("token");
}
// The token is mirrored into a cookie so Next.js proxy.js can redirect
// unauthenticated navigations on the server (localStorage is browser-only).
// It is not httpOnly (set from JS), so the API keeps using the Bearer header.
const TOKEN_COOKIE = "sb_token";
const TOKEN_MAX_AGE = 60 * 60 * 24; // 24h, same as the JWT
export function setToken(t) {
  writeStorage("token", t);
  if (!isBrowser()) return;
  if (t) {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(t)}; Path=/; Max-Age=${TOKEN_MAX_AGE}; SameSite=Lax`;
  } else {
    document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}
export function getEmail() {
  return readStorage("email") || "";
}
export function setEmail(e) {
  writeStorage("email", e);
}
export function getName() {
  return readStorage("full_name") || "";
}
export function setName(n) {
  writeStorage("full_name", n);
}

export function clearSession() {
  setToken(null);
  setEmail(null);
  setName(null);
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let payload;

  if (form) {
    // Let the browser build the multipart body and its boundary header.
    const formData = new FormData();
    Object.keys(form).forEach((key) => formData.append(key, form[key]));
    payload = formData;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // auth
  register: (email, password, fullName) =>
    request("/api/auth/register", {
      method: "POST",
      body: { email, password, full_name: fullName },
    }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", form: { username: email, password } }),
  me: () => request("/api/me"),

  // profile
  updateProfile: (avatarColor, fullName) =>
    request("/api/auth/profile", {
      method: "PUT",
      body: { avatar_color: avatarColor, full_name: fullName },
    }),

  // boards
  listBoards: () => request("/api/boards"),
  createBoard: (name) => request("/api/boards", { method: "POST", body: { name } }),
  getBoard: (id) => request(`/api/boards/${id}`),
  deleteBoard: (id) => request(`/api/boards/${id}`, { method: "DELETE" }),

  getActivity: (boardId, beforeId, limit = 30) =>
    request(
      `/api/boards/${boardId}/activity?limit=${limit}${beforeId ? `&before_id=${beforeId}` : ""}`
    ),

  // client status page
  enableStatusLink: (boardId) => request(`/api/boards/${boardId}/status-link`, { method: "POST" }),
  refreshStatusLink: (boardId) => request(`/api/boards/${boardId}/status-link/refresh`, { method: "POST" }),
  revokeStatusLink: (boardId) => request(`/api/boards/${boardId}/status-link`, { method: "DELETE" }),
  getPublicStatus: (token) => request(`/api/public/status/${encodeURIComponent(token)}`),

  // members (sharing)
  listMembers: (boardId) => request(`/api/boards/${boardId}/members`),
  addMember: (boardId, email) =>
    request(`/api/boards/${boardId}/members`, { method: "POST", body: { email } }),
  removeMember: (boardId, userId) =>
    request(`/api/boards/${boardId}/members/${userId}`, { method: "DELETE" }),

  // lists
  createList: (boardId, name) =>
    request(`/api/boards/${boardId}/lists`, { method: "POST", body: { name } }),
  updateList: (boardId, listId, data) =>
    request(`/api/boards/${boardId}/lists/${listId}`, { method: "PATCH", body: data }),
  deleteList: (boardId, listId) =>
    request(`/api/boards/${boardId}/lists/${listId}`, { method: "DELETE" }),

  // cards
  createCard: (boardId, listId, data) =>
    request(`/api/boards/${boardId}/cards?list_id=${listId}`, { method: "POST", body: data }),
  updateCard: (boardId, cardId, data) =>
    request(`/api/boards/${boardId}/cards/${cardId}`, { method: "PATCH", body: data }),
  moveCard: (boardId, cardId, listId, position) =>
    request(`/api/boards/${boardId}/cards/${cardId}/move`, {
      method: "POST",
      body: { list_id: listId, position },
    }),
  deleteCard: (boardId, cardId) =>
    request(`/api/boards/${boardId}/cards/${cardId}`, { method: "DELETE" }),

  // attachments
  uploadAttachment: (boardId, cardId, file) =>
    request(`/api/boards/${boardId}/cards/${cardId}/attachment`, { method: "POST", form: { file } }),
  deleteAttachment: (boardId, cardId) =>
    request(`/api/boards/${boardId}/cards/${cardId}/attachment`, { method: "DELETE" }),
  // Downloads need the Authorization header, which a plain <a href> can't
  // send, so fetch the bytes and hand the browser a blob URL.
  downloadAttachment: async (boardId, cardId, filename) => {
    const res = await fetch(`${BASE}/api/boards/${boardId}/cards/${cardId}/attachment`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "attachment";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // stats
  getStats: (boardId) => request(`/api/boards/${boardId}/stats`),

  // agent: streamed chat (SSE over fetch) + plan confirmation
  agentChat: (boardId, messages, onEvent, signal) =>
    streamEvents(`/api/boards/${boardId}/agent/chat`, { messages }, onEvent, signal),
  // image (photo of notes / app screenshot) → plan for confirmation
  agentVision: (boardId, file, note = "") =>
    request(`/api/boards/${boardId}/agent/vision`, { method: "POST", form: { file, note } }),
  agentConfirm: (boardId, planId, skip = []) =>
    request(`/api/boards/${boardId}/agent/confirm`, { method: "POST", body: { plan_id: planId, skip } }),

  // public landing-page assistant (no auth)
  publicAssistant: (messages) =>
    request("/api/public/assistant", { method: "POST", body: { messages } }),

  // semantic search
  semanticSearch: (boardId, query) =>
    request(`/api/boards/${boardId}/search/semantic`, { method: "POST", body: { query } }),
  reindexSearch: (boardId) =>
    request(`/api/boards/${boardId}/search/reindex`, { method: "POST" }),
};

/**
 * POST JSON and read a text/event-stream reply, calling onEvent(parsedJson)
 * for every `data:` line. Resolves when the stream ends. EventSource can't
 * send the Authorization header, hence fetch + manual parsing.
 */
async function streamEvents(path, body, onEvent, signal) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    }
  }
}

// Open a live WebSocket for a board. onMessage receives parsed event objects.
// The JWT is sent as the first message rather than in the URL so it stays out
// of server access logs and browser history.
export function openBoardSocket(boardId, onMessage) {
  const wsBase = BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/boards/${boardId}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: getToken() }));
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      /* ignore malformed */
    }
  };
  return ws;
}
