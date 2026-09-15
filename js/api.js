/* ═══════════════════════════════════════════════════════════
   api.js — Convex HTTP client + session + brain state.
   Pure vanilla: talks to Convex over its HTTP JSON API.
   ═══════════════════════════════════════════════════════════ */

const CONVEX_URL = window.CONVEX_URL || "https://hearty-sparrow-702.convex.cloud";

const TOKEN_KEY = "nb_token";
const USER_KEY = "nb_user";

/* ── low-level Convex HTTP calls ── */

async function convexCall(kind, path, args) {
  const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Network error — is the backend reachable?");
  if (data.status === "error") {
    const msg = (data.errorMessage || "Unknown Convex error").replace(/\[Request ID:[^\]]*\]\s*/g, "").trim();
    throw new Error(msg);
  }
  return data.value;
}

export const convex = {
  query: (path, args) => convexCall("query", path, args),
  mutation: (path, args) => convexCall("mutation", path, args),
  action: (path, args) => convexCall("action", path, args),
};

/* ── session helpers ── */

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  state.user = user || null;
}

export function cachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ── auth calls ── */

export async function signUp(email, password, name) {
  const out = await convex.action("accounts:signUp", { email, password, name });
  setSession(out.token, null);
  const me = await convex.query("accountsData:me", { token: out.token });
  setSession(out.token, me);
  return me;
}

export async function signIn(email, password) {
  const out = await convex.action("accounts:signIn", { email, password });
  setSession(out.token, null);
  const me = await convex.query("accountsData:me", { token: out.token });
  setSession(out.token, me);
  return me;
}

export async function signOut() {
  const token = getToken();
  if (token) {
    try {
      await convex.action("accounts:signOut", { token });
    } catch {
      /* session already gone — fine */
    }
  }
  setSession(null, null);
  state.data = emptyData();
  notify();
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  try {
    return await convex.query("accountsData:me", { token });
  } catch {
    return null;
  }
}

/* ── brain state ── */

function emptyData() {
  return { notes: [], ideas: [], goals: [], knowledge: [], activity: [] };
}

export const state = {
  user: cachedUser(),
  data: emptyData(),
  loading: false,
  prefs: loadPrefs(),
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}

function loadPrefs() {
  try {
    return { ...defaultPrefs(), ...JSON.parse(localStorage.getItem("nb_prefs") || "{}") };
  } catch {
    return defaultPrefs();
  }
}

function defaultPrefs() {
  return { motion: true, digest: true, sound: false, density: "comfortable" };
}

export function savePrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  localStorage.setItem("nb_prefs", JSON.stringify(state.prefs));
  notify();
}

/* ── brain data calls ── */

export async function refreshBrain() {
  const token = getToken();
  if (!token) {
    state.data = emptyData();
    notify();
    return state.data;
  }
  state.loading = true;
  notify();
  try {
    const data = await convex.query("brain:listAll", { token });
    state.data = data || emptyData();
  } catch (e) {
    if (String(e.message).includes("Not signed in")) {
      setSession(null, null);
    }
    state.data = emptyData();
    console.error("refreshBrain failed:", e);
  } finally {
    state.loading = false;
  }
  notify();
  return state.data;
}

const KINDS = {
  note: { add: "brain:addNote", update: "brain:updateNote", remove: "brain:removeNote" },
  idea: { add: "brain:addIdea", update: "brain:updateIdea", remove: "brain:removeIdea" },
  goal: { add: "brain:addGoal", update: "brain:updateGoal", remove: "brain:removeGoal" },
  knowledge: { add: "brain:addKnowledge", update: "brain:updateKnowledge", remove: "brain:removeKnowledge" },
};

async function callKind(kind, verb, extra) {
  const map = KINDS[kind];
  if (!map) throw new Error("Unknown kind: " + kind);
  return await convex.mutation(map[verb], { token: getToken(), ...extra });
}

export const brain = {
  add: (kind, fields) => callKind(kind, "add", fields),
  update: (kind, id, patch) => callKind(kind, "update", { id, ...patch }),
  remove: (kind, id) => callKind(kind, "remove", { id }),
  async removeActivity(id) {
    return await convex.mutation("brain:removeActivity", { token: getToken(), id });
  },
  async clearAll() {
    return await convex.mutation("brain:clearAll", { token: getToken() });
  },
  async reseed() {
    return await convex.mutation("brain:reseed", { token: getToken() });
  },
  async ask(question) {
    return await convex.action("ai:ask", { token: getToken(), question });
  },
};

/* ── boot: resolve session once ── */

export async function bootAuth() {
  const token = getToken();
  if (token) {
    const me = await fetchMe();
    if (me) {
      state.user = me;
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      await refreshBrain();
      return me;
    }
    setSession(null, null);
  }
  return null;
}

export const counts = (d) => ({
  knowledge: d.knowledge.length,
  ideas: d.ideas.length,
  goals: d.goals.filter((g) => g.status === "active").length,
  connections: 24,
});
