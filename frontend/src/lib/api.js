// Thin API client for the Task Board backend.
// Token is kept in memory + localStorage. The FE dev builds UI on top of this.

export const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function getToken() {
  return localStorage.getItem("token");
}
export function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}
export function getEmail() {
  return localStorage.getItem("email") || "";
}
export function setEmail(e) {
  if (e) localStorage.setItem("email", e);
  else localStorage.removeItem("email");
}
export function getName() {
  return localStorage.getItem("full_name") || "";
}
export function setName(n) {
  if (n) localStorage.setItem("full_name", n);
  else localStorage.removeItem("full_name");
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let payload;

  if (form) {
    // This forces the browser to build a true multipart/form-data payload
    // identical to Postman's '--form' data structure.
    const formData = new FormData();
    Object.keys(form).forEach((key) => {
      formData.append(key, form[key]);
    });
    payload = formData;

    // IMPORTANT: Do NOT set a "Content-Type" header string here.
    // Leaving it empty tells the browser to automatically compute the
    // correct multipart boundaries that Render's proxy demands.
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
      request("/api/auth/register", { method: "POST", body: { email, password, full_name: fullName } }),
  login: (email, password) =>
      request("/api/auth/login", { method: "POST", form: { username: email, password } }),
  oauthShortcut: (email, fullName, provider) =>
      request("/api/auth/oauth-shortcut", { method: "POST", body: { email, full_name: fullName, provider } }),
  me: () => request("/api/me"),

  // profile updates
  updateProfile: (avatarColor, fullName) =>
      request("/api/auth/profile", { method: "PUT", body: { avatar_color: avatarColor, full_name: fullName } }),

  // boards
  listBoards: () => request("/api/boards"),
  createBoard: (name) => request("/api/boards", { method: "POST", body: { name } }),
  getBoard: (id) => request(`/api/boards/${id}`),
  deleteBoard: (id) => request(`/api/boards/${id}`, { method: "DELETE" }),

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

  // stats
  getStats: (boardId) => request(`/api/boards/${boardId}/stats`),

  // agent
  askAgent: (boardId, prompt) =>
      request(`/api/boards/${boardId}/agent/create-card`, { method: "POST", body: { prompt } }),
};

// Open a live WebSocket for a board. onMessage receives parsed event objects.
export function openBoardSocket(boardId, onMessage) {
  const wsBase = BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/boards/${boardId}?token=${getToken()}`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      /* ignore malformed */
    }
  };
  return ws;
}