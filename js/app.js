/* ═══════════════════════════════════════════════════════════════
   NeuroBot — Your Second Brain · app.js
   Complete vanilla app: Convex client, auth, views, modals, router.
   No frameworks, no build step.
   ═══════════════════════════════════════════════════════════════ */

/* ═════════ Convex client ═════════ */

const CONVEX_URL = "https://hearty-sparrow-702.convex.cloud";
const TOKEN_KEY = "nb_token";
const USER_KEY = "nb_user";

async function convexCall(kind, path, args) {
  const res = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Network error — could not reach the NeuroBot backend.");
  if (data.status === "error") {
    const msg = (data.errorMessage || "Unknown error").replace(/\[Request ID:[^\]]*\]\s*/g, "").trim();
    throw new Error(msg);
  }
  return data.value;
}

const api = {
  query: (p, a) => convexCall("query", p, a),
  mutation: (p, a) => convexCall("mutation", p, a),
  action: (p, a) => convexCall("action", p, a),
};

/* ═════════ state ═════════ */

function emptyData() {
  return { notes: [], ideas: [], goals: [], knowledge: [], activity: [] };
}

function loadPrefs() {
  try {
    return { motion: true, digest: true, sound: false, density: "comfortable", ...JSON.parse(localStorage.getItem("nb_prefs") || "{}") };
  } catch { return { motion: true, digest: true, sound: false, density: "comfortable" }; }
}

const state = {
  user: (() => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } })(),
  data: emptyData(),
  prefs: loadPrefs(),
};

const listeners = new Set();
function notify() { for (const fn of listeners) fn(state); }

function setSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  state.user = user || null;
}

function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }

async function refreshBrain() {
  const token = getToken();
  if (!token) { state.data = emptyData(); notify(); return; }
  try {
    const data = await api.query("brain:listAll", { token });
    state.data = data || emptyData();
  } catch (e) {
    if (String(e.message || "").includes("Not signed in")) setSession(null, null);
    state.data = emptyData();
  }
  notify();
}

async function bootAuth() {
  const token = getToken();
  if (!token) return null;
  try {
    const me = await api.query("accountsData:me", { token });
    if (me) { setSession(token, me); await refreshBrain(); return me; }
  } catch { /* fallthrough */ }
  setSession(null, null);
  return null;
}

async function signUp(email, password, name) {
  const out = await api.action("accounts:signUp", { email, password, name });
  const me = await api.query("accountsData:me", { token: out.token });
  setSession(out.token, me);
  await refreshBrain();
  return me;
}

async function signIn(email, password) {
  const out = await api.action("accounts:signIn", { email, password });
  const me = await api.query("accountsData:me", { token: out.token });
  setSession(out.token, me);
  await refreshBrain();
  return me;
}

async function signOut() {
  const token = getToken();
  if (token) { try { await api.action("accounts:signOut", { token }); } catch { /* ok */ } }
  setSession(null, null);
  state.data = emptyData();
}

function savePrefs(patch) {
  state.prefs = { ...state.prefs, ...patch };
  localStorage.setItem("nb_prefs", JSON.stringify(state.prefs));
  notify();
}

const KINDS = {
  note: { add: "brain:addNote", update: "brain:updateNote", remove: "brain:removeNote" },
  idea: { add: "brain:addIdea", update: "brain:updateIdea", remove: "brain:removeIdea" },
  goal: { add: "brain:addGoal", update: "brain:updateGoal", remove: "brain:removeGoal" },
  knowledge: { add: "brain:addKnowledge", update: "brain:updateKnowledge", remove: "brain:removeKnowledge" },
};

const brain = {
  add: async (kind, fields) => api.mutation(KINDS[kind].add, { token: getToken(), ...fields }),
  update: async (kind, id, patch) => api.mutation(KINDS[kind].update, { token: getToken(), id, ...patch }),
  remove: async (kind, id) => api.mutation(KINDS[kind].remove, { token: getToken(), id }),
  removeActivity: (id) => api.mutation("brain:removeActivity", { token: getToken(), id }),
  clearAll: () => api.mutation("brain:clearAll", { token: getToken() }),
  reseed: () => api.mutation("brain:reseed", { token: getToken() }),
  ask: (question) => api.action("ai:ask", { token: getToken(), question }),
};

/* ═════════ tiny DOM kit ═════════ */

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function mdLite(text) {
  let t = esc(text);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  return t;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else if (k === "checked") node.checked = !!v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

const SVG = (paths) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ico = {
  dashboard: SVG('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  brain: SVG('<path d="M12 4a3 3 0 0 0-3 3 3 3 0 0 0-3 3c0 1 .4 1.9 1.1 2.5A3 3 0 0 0 9 18a3 3 0 0 0 3-1 3 3 0 0 0 3 1 3 3 0 0 0 1.9-5.5A3 3 0 0 0 18 10a3 3 0 0 0-3-3 3 3 0 0 0-3-3Z"/><path d="M12 4v13"/>'),
  note: SVG('<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>'),
  bulb: SVG('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.7.6-1 1.4-1 2.5h-6c0-1.1-.3-1.9-1-2.5A6 6 0 0 1 12 3Z"/>'),
  book: SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-2.5"/>'),
  target: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  share: SVG('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9 15.8 7.1M8.2 13.1l7.6 3.8"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  mic: SVG('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  send: SVG('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'),
  trash: SVG('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
  spark: SVG('<path d="M12 2l1.9 5.7L20 9.6l-5.1 3.4L16 19l-4-3-4 3 1.1-6L4 9.6l6.1-1.9Z"/>'),
  eye: SVG('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  check: SVG('<path d="m5 13 4 4L19 7"/>'),
  x: SVG('<path d="M18 6 6 18M6 6l12 12"/>'),
};

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDate(str) {
  if (!str) return "—";
  const d = new Date(str + (str.length === 10 ? "T12:00:00" : ""));
  return isNaN(d) ? str : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ═════════ toasts / modals ═════════ */

function toast(msg, type = "ok") {
  const root = $("#toast-root");
  if (!root) return;
  const t = el("div", { class: `toast ${type}` },
    el("span", { class: "ico", html: type === "err" ? ico.x : ico.check }),
    el("span", { html: mdLite(msg) }));
  root.append(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s, transform .25s";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 260);
  }, 3200);
}

function openModal({ title, body, foot, onClose }) {
  const root = $("#modal-root");
  const backdrop = el("div", { class: "modal-backdrop" });
  const close = () => { backdrop.remove(); document.removeEventListener("keydown", escH); if (onClose) onClose(); };
  const escH = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escH);

  const box = el("div", { class: "modal", role: "dialog", "aria-modal": "true" },
    el("div", { class: "modal-head" },
      el("h3", { html: title }),
      el("button", { class: "icon-btn", "aria-label": "Close", onclick: close, html: ico.x })),
    el("div", { class: "modal-body" }, body),
    foot ? el("div", { class: "modal-foot" }, foot) : null);

  backdrop.append(box);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  root.append(backdrop);
  const first = box.querySelector("input, textarea, select");
  if (first) setTimeout(() => first.focus(), 60);
  return { close, box };
}

function confirmModal(title, message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    let decided = false;
    const foot = el("div", { style: "display:flex;gap:9px" });
    const { close } = openModal({
      title,
      body: el("p", { style: "margin:0;color:var(--muted);font-size:13.5px" }, message),
      foot,
      onClose: () => { if (!decided) resolve(false); },
    });
    foot.append(
      el("button", { class: "btn ghost", onclick: () => { decided = true; resolve(false); close(); } }, "Cancel"),
      el("button", { class: "btn danger", onclick: () => { decided = true; resolve(true); close(); } }, confirmLabel));
  });
}

function field(label, input) {
  return el("label", { class: "field" }, el("span", {}, label), input);
}

function emptyState(msg) {
  return el("div", { class: "empty" }, msg);
}

/* ═════════ graph ═════════ */

const DEMO_NODES = [
  { id: "ai", label: "Artificial Intelligence", x: 0.50, y: 0.42, r: 30, color: "#7c9cff" },
  { id: "ml", label: "Machine Learning", x: 0.26, y: 0.28, r: 22, color: "#a88bff" },
  { id: "prog", label: "Programming", x: 0.75, y: 0.24, r: 22, color: "#4ade80" },
  { id: "nb", label: "NeuroBot", x: 0.50, y: 0.14, r: 20, color: "#fbbf24" },
  { id: "entre", label: "Entrepreneurship", x: 0.76, y: 0.66, r: 20, color: "#f87171" },
  { id: "edu", label: "Education", x: 0.24, y: 0.70, r: 20, color: "#38bdf8" },
];
const DEMO_EDGES = [["ai","ml"],["ai","prog"],["ai","nb"],["ai","entre"],["ai","edu"],["ml","edu"],["prog","entre"],["nb","prog"],["ml","nb"],["edu","entre"]];

function mountGraph(container, opts = {}) {
  const height = opts.height || 380;
  const wrap = el("div", { class: "graph-wrap" });
  const canvas = el("canvas");
  wrap.append(canvas);
  if (opts.legend !== false) {
    const legend = el("div", { class: "graph-legend" });
    for (const n of DEMO_NODES) {
      const s = el("span");
      const i = el("i");
      i.style.background = n.color;
      s.append(i, document.createTextNode(n.label));
      legend.append(s);
    }
    wrap.append(legend);
  }
  container.append(wrap);

  const ctx = canvas.getContext("2d");
  let W = 0, H = height, dpr = 1, raf = null;
  let hovered = null;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = wrap.clientWidth || 600;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  const pos = (n) => ({
    x: n.x * W + Math.sin(Date.now() / 1600 + n.x * 7) * 6,
    y: n.y * H + Math.cos(Date.now() / 1900 + n.y * 5) * 5,
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const [a, b] of DEMO_EDGES) {
      const na = pos(DEMO_NODES.find((n) => n.id === a));
      const nb = pos(DEMO_NODES.find((n) => n.id === b));
      const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
      const dx = nb.x - na.x, dy = nb.y - na.y;
      const len = Math.hypot(-dy, dx) || 1;
      const cx = mx + (-dy / len) * 26, cy = my + (dx / len) * 26;
      const active = hovered === a || hovered === b;
      const grad = ctx.createLinearGradient(na.x, na.y, nb.x, nb.y);
      grad.addColorStop(0, active ? "rgba(124,156,255,.75)" : "rgba(124,156,255,.22)");
      grad.addColorStop(1, active ? "rgba(168,139,255,.65)" : "rgba(168,139,255,.16)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = active ? 2.1 : 1.1;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.quadraticCurveTo(cx, cy, nb.x, nb.y);
      ctx.stroke();
      const t = ((Date.now() / 2200) + (a.length + b.length) * 0.09) % 1;
      const px = (1-t)*(1-t)*na.x + 2*(1-t)*t*cx + t*t*nb.x;
      const py = (1-t)*(1-t)*na.y + 2*(1-t)*t*cy + t*t*nb.y;
      ctx.beginPath();
      ctx.arc(px, py, active ? 2.6 : 1.6, 0, Math.PI * 2);
      ctx.fillStyle = active ? "rgba(200,215,255,.95)" : "rgba(180,200,255,.5)";
      ctx.fill();
    }
    for (const n of DEMO_NODES) {
      const p = pos(n);
      const isHover = hovered === n.id;
      const r = n.r * (isHover ? 1.12 : 1);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
      glow.addColorStop(0, n.color + (isHover ? "66" : "2e"));
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(13,17,28,.9)";
      ctx.fill();
      ctx.strokeStyle = isHover ? n.color : n.color + "aa";
      ctx.lineWidth = isHover ? 2.4 : 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.font = `${isHover ? 600 : 500} ${isHover ? 12.5 : 11.5}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHover ? "#fff" : "rgba(232,236,244,.85)";
      ctx.fillText(n.label, p.x, p.y + r + 16);
    }
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    hovered = null;
    canvas.style.cursor = "default";
    for (const n of DEMO_NODES) {
      const p = pos(n);
      if (Math.hypot(mx - p.x, my - p.y) < n.r + 8) { hovered = n.id; canvas.style.cursor = "pointer"; break; }
    }
  });
  canvas.addEventListener("mouseleave", () => { hovered = null; });

  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) { cancelAnimationFrame(raf); ro.disconnect(); obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

/* ═════════ shared card builder ═════════ */

const KIND_META = {
  note: { icon: ico.note, tag: "blue", label: "Note" },
  idea: { icon: ico.bulb, tag: "purple", label: "Idea" },
  goal: { icon: ico.target, tag: "green", label: "Goal" },
  knowledge: { icon: ico.book, tag: "amber", label: "Knowledge" },
};

function tag(text, cls) { return el("span", { class: `tag ${cls || ""}` }, text); }

function brainCard(kind, item, rerender) {
  const meta = KIND_META[kind];
  const extras = [];
  if (kind === "idea") extras.push(tag(item.status, item.status === "completed" ? "green" : item.status === "building" ? "blue" : item.status === "exploring" ? "purple" : ""));
  if (kind === "goal") extras.push(tag(`${item.progress}%`, "green"));
  if (item.category) extras.push(tag(item.category, meta.tag));
  if (kind === "knowledge" && item.topic) extras.push(tag(item.topic, meta.tag));

  return el("div", { class: "item-card" + (item.pinned ? " pinned-card" : "") },
    el("button", { class: "pin" + (item.pinned ? " on" : ""), title: "Pin", html: "★", onclick: async (e) => {
      e.stopPropagation();
      await brain.update(kind, item.id, { pinned: !item.pinned });
      rerender();
    }}),
    el("div", { class: "row" }, tag(meta.label, meta.tag), ...extras),
    el("h4", {}, item.title),
    el("p", { class: "body" }, item.body.length > 140 ? item.body.slice(0, 140) + "…" : item.body),
    el("div", { class: "row" }, el("span", { class: "goal-date" }, timeAgo(item.createdAt))),
    el("div", { class: "actions" },
      el("button", { class: "btn sm", onclick: () => openEdit(kind, item, rerender) }, "Edit"),
      el("button", { class: "btn sm danger", onclick: async () => {
        const ok = await confirmModal(`Delete ${meta.label.toLowerCase()}?`, `"${item.title}" will be permanently removed.`, "Delete");
        if (!ok) return;
        await brain.remove(kind, item.id);
        toast(`${meta.label} deleted.`);
        rerender();
      }}, "Delete")));
}

/* ═════════ capture / edit modals ═════════ */

const IDEA_STATUS_OPTS = ["new", "exploring", "building", "completed"];

function openCapture(kind, onDone) {
  if (kind === "thought") return openThought(onDone);
  const conf = {
    note: { title: "New Note", icon: ico.note },
    idea: { title: "New Idea", icon: ico.bulb },
    goal: { title: "New Goal", icon: ico.target },
    knowledge: { title: "Add Knowledge", icon: ico.book },
  }[kind];
  if (!conf) return;

  const title = el("input", { type: "text", placeholder: conf.title + " title…" });
  const body = el("textarea", { placeholder: "Write everything down — your brain will do the connecting." });
  const category = el("input", { type: "text", placeholder: "e.g. AI, Health, Business…" });
  const topic = el("input", { type: "text", placeholder: "e.g. AI, Programming, Science…" });
  const source = el("input", { type: "text", placeholder: "Where did this come from? (optional)" });
  const status = el("select", {}, ...IDEA_STATUS_OPTS.map((s) => el("option", { value: s }, s)));
  const progress = el("input", { type: "number", min: "0", max: "100", value: "0" });
  const deadline = el("input", { type: "date" });
  const err = el("div", { class: "auth-err hidden" });

  const form = el("form", {},
    field("Title", title),
    field("Details", body),
    (kind === "note" || kind === "idea") ? field("Category", category) : null,
    kind === "idea" ? field("Status", status) : null,
    kind === "knowledge" ? field("Topic", topic) : null,
    kind === "knowledge" ? field("Source", source) : null,
    kind === "goal" ? field("Deadline", deadline) : null,
    kind === "goal" ? field("Starting progress %", progress) : null,
    err);

  const saveBtn = el("button", { class: "btn primary", type: "submit" }, `Save ${conf.title.replace("New ", "")}`);
  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    saveBtn);
  const modal = openModal({ title: `${conf.icon} ${conf.title}`, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { err.textContent = "Give it a title first."; err.classList.remove("hidden"); return; }
    saveBtn.disabled = true;
    try {
      if (kind === "note") await brain.add("note", { title: t, body: body.value.trim(), category: category.value.trim() || "General" });
      if (kind === "idea") await brain.add("idea", { title: t, body: body.value.trim(), category: category.value.trim() || "General", status: status.value });
      if (kind === "goal") await brain.add("goal", {
        title: t, body: body.value.trim(),
        progress: Math.max(0, Math.min(100, Number(progress.value) || 0)),
        deadline: deadline.value || "No deadline",
        status: "active",
      });
      if (kind === "knowledge") await brain.add("knowledge", { title: t, body: body.value.trim(), topic: topic.value.trim() || "General", source: source.value.trim() });
      toast(`${conf.title.replace("New ", "")} saved to your brain.`);
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
      saveBtn.disabled = false;
    }
  });
}

function openThought(onDone) {
  const ta = el("textarea", { placeholder: "What's on your mind? One thought, saved forever.", style: "min-height:110px" });
  const cat = el("input", { type: "text", placeholder: "Optional tag (e.g. shower thought, lecture, book)" });
  const err = el("div", { class: "auth-err hidden" });
  const form = el("form", {}, field("Thought", ta), field("Tag", cat), err);
  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", type: "submit" }, "Save thought"));
  const modal = openModal({ title: `${ico.spark} Save a thought`, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) { err.textContent = "Type your thought first."; err.classList.remove("hidden"); return; }
    const firstLine = text.split("\n")[0].slice(0, 60);
    try {
      await brain.add("note", {
        title: firstLine.length > 52 ? firstLine.slice(0, 52) + "…" : firstLine,
        body: text,
        category: cat.value.trim() || "Thoughts",
      });
      toast("Thought saved to your brain.");
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
    }
  });
}

function openEdit(kind, item, onDone) {
  const conf = { note: "Edit Note", idea: "Edit Idea", goal: "Edit Goal", knowledge: "Edit Knowledge" }[kind];
  const title = el("input", { type: "text", value: item.title });
  const body = el("textarea", {}, item.body || "");
  const category = el("input", { type: "text", value: item.category || "" });
  const topic = el("input", { type: "text", value: item.topic || "" });
  const source = el("input", { type: "text", value: item.source || "" });
  const status = el("select", {}, ...IDEA_STATUS_OPTS.map((s) => el("option", { value: s }, s)));
  if (kind === "idea") status.value = item.status;
  const progress = el("input", { type: "number", min: "0", max: "100", value: String(item.progress ?? 0) });
  const deadline = el("input", { type: "date", value: /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || "") ? item.deadline : "" });
  const err = el("div", { class: "auth-err hidden" });

  const form = el("form", {},
    field("Title", title),
    field("Details", body),
    (kind === "note" || kind === "idea") ? field("Category", category) : null,
    kind === "idea" ? field("Status", status) : null,
    kind === "knowledge" ? field("Topic", topic) : null,
    kind === "knowledge" ? field("Source", source) : null,
    kind === "goal" ? field("Deadline", deadline) : null,
    kind === "goal" ? field("Progress %", progress) : null,
    err);

  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", type: "submit" }, "Save changes"));
  const modal = openModal({ title: conf, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { err.textContent = "Title can't be empty."; err.classList.remove("hidden"); return; }
    try {
      if (kind === "note") await brain.update("note", item.id, { title: t, body: body.value.trim(), category: category.value.trim() || "General" });
      if (kind === "idea") await brain.update("idea", item.id, { title: t, body: body.value.trim(), category: category.value.trim() || "General", status: status.value });
      if (kind === "goal") await brain.update("goal", item.id, {
        title: t, body: body.value.trim(),
        progress: Math.max(0, Math.min(100, Number(progress.value) || 0)),
        deadline: deadline.value || "No deadline",
      });
      if (kind === "knowledge") await brain.update("knowledge", item.id, { title: t, body: body.value.trim(), topic: topic.value.trim() || "General", source: source.value.trim() });
      toast("Changes saved.");
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
    }
  });
}

/* ═════════ command palette ═════════ */

function openPalette() {
  const root = $("#cmdk-root");
  root.innerHTML = "";
  const backdrop = el("div", { class: "cmdk-backdrop" });
  const input = el("input", { type: "text", placeholder: "Search your brain or type a command…" });
  const list = el("div", { class: "cmdk-list" });

  const close = () => { backdrop.remove(); document.removeEventListener("keydown", keyHandler); };
  const keyHandler = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", keyHandler);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });

  backdrop.append(el("div", { class: "cmdk" }, input, list));
  root.append(backdrop);
  setTimeout(() => input.focus(), 40);

  const d = state.data;
  const cmds = [
    { icon: ico.note, label: "New Note", hint: "capture", run: () => openCapture("note", route) },
    { icon: ico.bulb, label: "New Idea", hint: "capture", run: () => openCapture("idea", route) },
    { icon: ico.spark, label: "Save Thought", hint: "capture", run: () => openCapture("thought", route) },
    { icon: ico.target, label: "New Goal", hint: "capture", run: () => openCapture("goal", route) },
    { icon: ico.book, label: "Add Knowledge", hint: "capture", run: () => openCapture("knowledge", route) },
    { icon: ico.dashboard, label: "Go to Dashboard", hint: "navigate", run: () => (location.hash = "#/") },
    { icon: ico.brain, label: "Go to My Brain", hint: "navigate", run: () => (location.hash = "#/brain") },
    { icon: ico.note, label: "Go to Notes", hint: "navigate", run: () => (location.hash = "#/notes") },
    { icon: ico.bulb, label: "Go to Ideas", hint: "navigate", run: () => (location.hash = "#/ideas") },
    { icon: ico.book, label: "Go to Knowledge", hint: "navigate", run: () => (location.hash = "#/knowledge") },
    { icon: ico.target, label: "Go to Goals", hint: "navigate", run: () => (location.hash = "#/goals") },
    { icon: ico.share, label: "Go to Connections", hint: "navigate", run: () => (location.hash = "#/connections") },
    { icon: ico.gear, label: "Go to Settings", hint: "navigate", run: () => (location.hash = "#/settings") },
    ...d.notes.map((n) => ({ icon: ico.note, label: n.title, hint: "note", run: () => (location.hash = "#/notes") })),
    ...d.ideas.map((i) => ({ icon: ico.bulb, label: i.title, hint: "idea", run: () => (location.hash = "#/ideas") })),
    ...d.goals.map((g) => ({ icon: ico.target, label: g.title, hint: "goal", run: () => (location.hash = "#/goals") })),
    ...d.knowledge.map((k) => ({ icon: ico.book, label: k.title, hint: "knowledge", run: () => (location.hash = "#/knowledge") })),
  ];

  let sel = 0;
  function draw() {
    const q = input.value.trim().toLowerCase();
    const items = (q ? cmds.filter((c) => c.label.toLowerCase().includes(q)) : cmds).slice(0, 12);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = "";
    if (!items.length) { list.append(el("div", { class: "cmdk-empty" }, "Nothing found in your brain.")); return; }
    items.forEach((c, idx) => {
      const b = el("button", { class: "cmdk-item" + (idx === sel ? " sel" : "") },
        el("span", { class: "ico", html: c.icon }),
        el("span", {}, c.label),
        el("span", { class: "hint" }, c.hint || ""));
      b.addEventListener("click", () => { close(); c.run(); });
      b.addEventListener("mousemove", () => { if (sel !== idx) { sel = idx; [...list.children].forEach((n, i) => n.classList.toggle("sel", i === sel)); } });
      list.append(b);
    });
    list._items = items;
  }

  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    const items = list._items || [];
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); }
    else if (e.key === "Enter") { e.preventDefault(); const item = items[sel]; if (item) { close(); item.run(); } return; }
    else return;
    [...list.children].forEach((n, i) => n.classList.toggle("sel", i === sel));
  });
  draw();
}

/* ═════════ views ═════════ */

function head(title, sub, actions) {
  return el("div", { class: "page-head" },
    el("div", {}, el("h1", {}, title), sub ? el("p", {}, sub) : null),
    actions ? el("div", { class: "head-actions" }, actions) : null);
}

function renderDashboard(root) {
  const c = {
    knowledge: state.data.knowledge.length,
    ideas: state.data.ideas.length,
    goals: state.data.goals.filter((g) => g.status === "active").length,
    connections: 24,
  };

  root.append(el("div", { class: "hero" },
    el("h1", { html: `${greeting()} <span class="wave">👋</span>` }),
    el("p", {}, "Your second brain is ready.")));

  // Ask-your-brain
  const answerBox = el("div", { class: "ask-answer hidden" });
  const input = el("input", { type: "text", placeholder: "Ask your brain anything…", "aria-label": "Ask your brain" });
  const mic = el("button", { class: "ask-btn mic", title: "Voice (demo)", html: ico.mic, onclick: () => {
    mic.classList.add("listening");
    toast("Voice input is coming with NeuroBot Live.", "ok");
    setTimeout(() => mic.classList.remove("listening"), 1400);
  }});
  const send = el("button", { class: "ask-btn", title: "Ask", html: ico.send, onclick: ask });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
  root.append(el("div", { class: "askbox" },
    el("div", { class: "askbox-row" }, input, mic, send), answerBox));

  let asking = false;
  async function ask() {
    const q = input.value.trim();
    if (!q || asking) return;
    asking = true;
    answerBox.classList.remove("hidden", "err");
    answerBox.innerHTML = `<span class="who">NeuroBot is thinking…</span>Reading your notes, ideas, goals and knowledge…`;
    try {
      const out = await brain.ask(q);
      answerBox.innerHTML = `<span class="who">NeuroBot · ${esc(out.model)}</span>` + mdLite(out.answer);
      input.value = "";
    } catch (e) {
      answerBox.classList.add("err");
      answerBox.textContent = e.message || "Something went wrong.";
    } finally {
      asking = false;
    }
  }

  // stats
  const stat = (icon, num, label) => el("div", { class: "stat" },
    el("span", { class: "ico", html: icon }), el("span", { class: "num" }, String(num)), el("span", { class: "lbl" }, label));
  root.append(el("div", { class: "stats" },
    stat(ico.brain, c.knowledge, "Knowledge items"),
    stat(ico.bulb, c.ideas, "Ideas saved"),
    stat(ico.target, c.goals, "Active goals"),
    stat(ico.share, c.connections, "Connections")));

  // quick capture
  root.append(el("div", { class: "card" },
    el("div", { class: "panel-head" }, el("h3", {}, "Quick capture"), tag("just click", "")),
    el("div", { class: "quick-capture" },
      el("button", { class: "qc-btn", onclick: () => openCapture("note", route) }, el("span", { class: "ico", html: ico.note }), "New Note"),
      el("button", { class: "qc-btn", onclick: () => openCapture("idea", route) }, el("span", { class: "ico", html: ico.bulb }), "New Idea"),
      el("button", { class: "qc-btn", onclick: () => openCapture("thought", route) }, el("span", { class: "ico", html: ico.spark }), "Save Thought"),
      el("button", { class: "qc-btn", onclick: () => openCapture("goal", route) }, el("span", { class: "ico", html: ico.target }), "Add Goal"))));

  // NeuroVision
  root.append(el("div", { class: "neurovision" },
    el("div", {}, el("h4", {}, "🫧 NeuroVision"), el("p", {}, "Let NeuroBot understand what's on your screen.")),
    el("button", { class: "btn", onclick: () => {
      openModal({
        title: "NeuroVision",
        body: el("div", { class: "live-modal" },
          el("div", { class: "mic-orb", html: ico.eye }),
          el("p", {}, "NeuroVision is coming soon. Screen understanding will let NeuroBot read what you see and connect it to your brain.")),
        foot: el("button", { class: "btn primary", onclick: () => $(".modal-backdrop")?.remove() }, "Got it"),
      });
    }}, "Try NeuroVision")));

  // activity + graph
  const actCol = el("div", { class: "card" },
    el("div", { class: "panel-head" }, el("h3", {}, "Recent activity")),
    renderActivity());

  const graphCol = el("div", { class: "card" },
    el("div", { class: "panel-head" },
      el("h3", {}, "Knowledge map"),
      el("a", { href: "#/connections", class: "btn sm ghost" }, "Open Connections →")),
    el("div", { class: "graph-slot" }));

  root.append(el("div", { class: "dash-grid" }, graphCol, actCol));
  mountGraph($(".graph-slot", graphCol), { height: 300, legend: false });

  function renderActivity() {
    const acts = state.data.activity.slice(0, 8);
    if (!acts.length) return emptyState("Nothing captured yet. Try Quick capture above.");
    const list = el("div", {});
    for (const a of acts) {
      const meta = KIND_META[a.kind] || KIND_META.note;
      list.append(el("div", { class: "activity-item" },
        el("span", { class: "ico", html: meta.icon }),
        el("div", { class: "meta" },
          el("strong", {}, a.title),
          el("em", {}, `${meta.label} · ${timeAgo(a.createdAt)}`)),
        el("button", { class: "del", title: "Delete entry", html: ico.trash, onclick: async () => {
          const ok = await confirmModal("Remove entry?", `"${a.title}" will be removed from your activity feed.`, "Remove");
          if (!ok) return;
          await brain.removeActivity(a.id);
          toast("Activity entry removed.");
          route();
        }})));
    }
    return list;
  }
}

function renderBrain(root) {
  root.append(head("My Brain", "Everything you've captured — searchable in one place."));
  const q = el("input", { type: "search", placeholder: "Search titles and content…" });
  const kindSel = el("select", {},
    el("option", { value: "all" }, "All types"),
    el("option", { value: "note" }, "Notes"),
    el("option", { value: "idea" }, "Ideas"),
    el("option", { value: "goal" }, "Goals"),
    el("option", { value: "knowledge" }, "Knowledge"));
  const results = el("div", { class: "grid c2" });
  root.append(el("div", { class: "toolbar" }, q, kindSel), results);

  function draw() {
    const query = q.value.trim().toLowerCase();
    const kind = kindSel.value;
    results.innerHTML = "";
    const pools = [];
    if (kind === "all" || kind === "note") state.data.notes.forEach((n) => pools.push({ kind: "note", item: n }));
    if (kind === "all" || kind === "idea") state.data.ideas.forEach((n) => pools.push({ kind: "idea", item: n }));
    if (kind === "all" || kind === "goal") state.data.goals.forEach((n) => pools.push({ kind: "goal", item: n }));
    if (kind === "all" || kind === "knowledge") state.data.knowledge.forEach((n) => pools.push({ kind: "knowledge", item: n }));
    const filtered = pools.filter(({ item }) =>
      !query || item.title.toLowerCase().includes(query) || String(item.body).toLowerCase().includes(query));
    filtered.sort((a, b) => b.item.createdAt - a.item.createdAt);
    if (!filtered.length) { results.append(emptyState("No matches in your brain yet.")); return; }
    for (const { kind: k, item } of filtered.slice(0, 60)) results.append(brainCard(k, item, route));
  }
  q.addEventListener("input", draw);
  kindSel.addEventListener("change", draw);
  draw();
}

function renderNotes(root) {
  root.append(head("Notes", "Capture, edit and organize everything you learn.",
    el("button", { class: "btn primary", html: `${ico.plus} New note`, onclick: () => openCapture("note", route) })));
  const q = el("input", { type: "search", placeholder: "Search notes…" });
  const catSel = el("select", {});
  const grid = el("div", { class: "grid c3" });
  root.append(el("div", { class: "toolbar" }, q, catSel), grid);

  function draw() {
    const cats = [...new Set(state.data.notes.map((n) => n.category).filter(Boolean))].sort();
    catSel.innerHTML = "";
    catSel.append(el("option", { value: "all" }, "All categories"));
    for (const cat of cats) catSel.append(el("option", { value: cat }, cat));
    const query = q.value.trim().toLowerCase();
    const cat = catSel.value;
    const notes = state.data.notes
      .filter((n) => (cat === "all" || n.category === cat) &&
        (!query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
    grid.innerHTML = "";
    if (!notes.length) { grid.append(emptyState("No notes yet — create your first one.")); return; }
    for (const n of notes) grid.append(brainCard("note", n, route));
  }
  q.addEventListener("input", draw);
  catSel.addEventListener("change", draw);
  draw();
}

function renderIdeas(root) {
  root.append(head("Ideas", "Your idea board — move ideas from spark to shipped.",
    el("button", { class: "btn primary", html: `${ico.plus} New idea`, onclick: () => openCapture("idea", route) })));
  const chips = el("div", { class: "chips" });
  const board = el("div", { class: "grid c2" });
  root.append(chips, board);
  let filter = "all";

  function drawChips() {
    chips.innerHTML = "";
    for (const s of ["all", ...IDEA_STATUS_OPTS]) {
      chips.append(el("button", { class: "chip" + (filter === s ? " on" : ""), onclick: () => { filter = s; drawChips(); draw(); } },
        s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)));
    }
  }

  function draw() {
    board.innerHTML = "";
    const ideas = state.data.ideas
      .filter((i) => filter === "all" || i.status === filter)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
    if (!ideas.length) { board.append(emptyState("No ideas here yet. Every big thing starts small.")); return; }
    for (const idea of ideas) {
      const card = brainCard("idea", idea, route);
      const statusBtns = el("div", { class: "actions" });
      for (const s of IDEA_STATUS_OPTS) {
        if (s === idea.status) continue;
        statusBtns.append(el("button", { class: "btn sm ghost", title: `Move to ${s}`, onclick: async () => {
          await brain.update("idea", idea.id, { status: s });
          toast(`Idea moved to ${s}.`);
          route();
        }}, s));
      }
      card.querySelector(".actions").prepend(statusBtns);
      board.append(card);
    }
  }
  drawChips();
  draw();
}

function renderKnowledge(root) {
  root.append(head("Knowledge", "What you know, grouped by topic.",
    el("button", { class: "btn primary", html: `${ico.plus} Add knowledge`, onclick: () => openCapture("knowledge", route) })));
  const q = el("input", { type: "search", placeholder: "Search knowledge…" });
  const wrap = el("div", {});
  root.append(el("div", { class: "toolbar" }, q), wrap);

  function draw() {
    const query = q.value.trim().toLowerCase();
    const kbs = state.data.knowledge
      .filter((k) => !query || k.title.toLowerCase().includes(query) || k.body.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt - a.createdAt);
    wrap.innerHTML = "";
    if (!kbs.length) { wrap.append(emptyState("No knowledge saved yet.")); return; }
    const groups = new Map();
    for (const k of kbs) {
      const topic = k.topic || "General";
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push(k);
    }
    for (const [topic, items] of groups) {
      const g = el("section", { class: "kb-group" },
        el("h3", {}, `${topic} · ${items.length}`),
        el("div", { class: "grid c3" }));
      for (const k of items) {
        const card = brainCard("knowledge", k, route);
        if (k.source) card.querySelector(".row").append(tag(k.source, ""));
        $(".grid", g).append(card);
      }
      wrap.append(g);
    }
  }
  q.addEventListener("input", draw);
  draw();
}

function renderGoals(root) {
  root.append(head("Goals", "Where your attention is going.",
    el("button", { class: "btn primary", html: `${ico.plus} New goal`, onclick: () => openCapture("goal", route) })));
  const grid = el("div", { class: "grid c2" });
  root.append(grid);

  const goals = state.data.goals.slice().sort((a, b) =>
    (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) || b.createdAt - a.createdAt);
  if (!goals.length) { grid.append(emptyState("No goals yet. Set one and give your brain a direction.")); return; }

  for (const g of goals) {
    const overdue = g.status === "active" && g.deadline && g.deadline !== "No deadline" && new Date(g.deadline) < new Date();
    grid.append(el("div", { class: "item-card" + (g.pinned ? " pinned-card" : "") },
      el("button", { class: "pin" + (g.pinned ? " on" : ""), html: "★", onclick: async () => {
        await brain.update("goal", g.id, { pinned: !g.pinned });
        route();
      }}),
      el("div", { class: "goal-top" },
        el("h4", {}, g.title),
        el("span", { class: "goal-date" }, (overdue ? "⚠ " : "") + fmtDate(g.deadline))),
      el("p", { class: "body" }, g.body),
      el("div", { class: "row" },
        tag(g.status, g.status === "completed" ? "green" : g.status === "paused" ? "amber" : "blue"),
        overdue ? tag("overdue", "red") : null),
      el("div", { class: "progress", title: `${g.progress}%` }, el("i", { style: `width:${g.progress}%` })),
      el("div", { class: "row" }, el("span", { class: "goal-date" }, `${g.progress}% complete`)),
      el("div", { class: "actions" },
        el("button", { class: "btn sm", onclick: async () => {
          const next = Math.min(100, g.progress + 10);
          await brain.update("goal", g.id, { progress: next, status: next >= 100 ? "completed" : g.status });
          toast(next >= 100 ? "Goal complete! 🎉" : `Progress: ${next}%`);
          route();
        }}, "+10%"),
        g.progress > 0 ? el("button", { class: "btn sm ghost", onclick: async () => {
          await brain.update("goal", g.id, { progress: Math.max(0, g.progress - 10) });
          route();
        }}, "−10%") : null,
        g.status !== "completed" ? el("button", { class: "btn sm ghost", onclick: async () => {
          await brain.update("goal", g.id, { status: "completed", progress: 100 });
          toast("Goal complete! 🎉");
          route();
        }}, "Complete") : null,
        el("button", { class: "btn sm", onclick: () => openEdit("goal", g, route) }, "Edit"),
        el("button", { class: "btn sm danger", onclick: async () => {
          const ok = await confirmModal("Delete goal?", `"${g.title}" will be permanently removed.`, "Delete");
          if (!ok) return;
          await brain.remove("goal", g.id);
          toast("Goal deleted.");
          route();
        }}, "Delete"))));
  }
}

function renderConnections(root) {
  root.append(head("Connections", "How your knowledge relates — a living map of your second brain."));
  const graphSlot = el("div", {});
  const panel = el("aside", { class: "side-panel" },
    el("div", { class: "card" },
      el("h3", {}, "What are connections?"),
      el("p", {}, "Connections represent relationships between information in your second brain. As NeuroBot grows, it will surface links between your notes, ideas and knowledge automatically."),
      el("div", { class: "kv" }, el("span", {}, "Topics"), el("b", {}, "6")),
      el("div", { class: "kv" }, el("span", {}, "Concepts"), el("b", {}, String(state.data.knowledge.length + state.data.notes.length))),
      el("div", { class: "kv" }, el("span", {}, "Links drawn"), el("b", {}, "10")),
      el("div", { class: "kv" }, el("span", {}, "Generated by"), el("b", {}, "Demo map"))),
    el("div", { class: "card" },
      el("h3", {}, "Coming next"),
      el("p", {}, "In Phase 2, NeuroBot will analyze your content and propose real connections — surfacing non-obvious relationships across everything you've saved."),
      tag("Prototype visualization", "purple")));
  root.append(el("div", { class: "conn-grid" }, el("div", {}, graphSlot), panel));
  mountGraph(graphSlot, { height: 480 });
}

function renderSettings(root) {
  const prefs = state.prefs;
  const row = (title, sub, control) => el("div", { class: "set-row" },
    el("div", { class: "meta" }, el("strong", {}, title), el("em", {}, sub)), control);
  const toggle = (key) => {
    const input = el("input", { type: "checkbox" });
    input.checked = !!prefs[key];
    input.addEventListener("change", async () => {
      savePrefs({ [key]: input.checked });
      toast("Preference saved.");
    });
    return el("label", { class: "switch" }, input, el("i", {}));
  };
  const density = el("select", {},
    el("option", { value: "comfortable" }, "Comfortable"),
    el("option", { value: "compact" }, "Compact"));
  density.value = prefs.density;
  density.addEventListener("change", () => { savePrefs({ density: density.value }); toast("Appearance updated."); });

  const total = state.data.notes.length + state.data.ideas.length + state.data.goals.length + state.data.knowledge.length;

  root.append(
    head("Settings", "Tune NeuroBot to your taste."),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🎨 Appearance"),
      row("Theme", "NeuroBot's signature dark theme", tag("Dark", "blue")),
      row("Density", "Spacing of lists and cards", density),
      row("Motion", "Ambient animations and pulses", toggle("motion"))),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🔔 Notifications"),
      row("Weekly digest", "A summary of what you captured each week", toggle("digest")),
      row("Sound effects", "Subtle audio cues on capture", toggle("sound"))),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🗄 Data"),
      row("Your data", `${total} items · notes, ideas, goals & knowledge`, tag("Cloud synced", "green")),
      row("Load demo content", "Replace everything with sample data", el("button", { class: "btn sm", onclick: async () => {
        const ok = await confirmModal("Load demo content?", "Your current data will be replaced with a fresh demo brain.", "Load demo");
        if (!ok) return;
        await brain.reseed();
        toast("Demo brain loaded.");
        route();
      }}, "Load demo")),
      row("Delete everything", "Permanently remove all captured items", el("button", { class: "btn sm danger", onclick: async () => {
        const ok = await confirmModal("Delete everything?", "All notes, ideas, goals and knowledge will be permanently deleted. This cannot be undone.", "Delete all");
        if (!ok) return;
        await brain.clearAll();
        toast("Your brain is empty again.");
        route();
      }}, "Delete all"))),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🔒 Privacy"),
      el("p", { class: "sub", style: "margin:0 0 8px" },
        "Your second brain is stored per-account in the NeuroBot database. AI questions send your saved content to Gemini only to generate an answer."),
      row("Session", "Signed in as " + (state.user?.email || "unknown"),
        el("button", { class: "btn sm danger", onclick: async () => {
          const ok = await confirmModal("Sign out?", "You'll need your email and password to sign back in.", "Sign out");
          if (!ok) return;
          await signOut();
          location.reload();
        }}, "Sign out"))),
    el("div", { class: "card" },
      el("h3", { style: "margin-bottom:6px" }, "ℹ About NeuroBot"),
      el("p", { class: "sub", style: "margin:0" },
        "NeuroBot — Your Second Brain. Version 1.0. An AI-powered personal knowledge system: capture, organize, connect and retrieve your knowledge, ideas and goals."),
      el("p", { class: "sub", style: "margin:10px 0 0" }, el("strong", {}, "Crafted by Tanishq Lalwani"))));
}

/* ═════════ live modal ═════════ */

function openLive() {
  openModal({
    title: "NeuroBot Live",
    body: el("div", { class: "live-modal" },
      el("div", { class: "mic-orb" }, "🎙️"),
      el("p", {}, "Real-time voice conversations are coming soon."),
      el("p", { style: "font-size:12px;color:var(--faint)" }, "Talk to your second brain — ask questions, capture thoughts, review goals — just by speaking.")),
    foot: el("button", { class: "btn primary", onclick: () => $(".modal-backdrop")?.remove() }, "Can't wait ✨"),
  });
}

/* ═════════ auth screen ═════════ */

function renderAuth(mode) {
  const root = $("#auth-root");
  root.classList.remove("hidden");
  $("#app-root").classList.add("hidden");
  root.innerHTML = "";

  const isSignUp = mode === "signup";
  const email = el("input", { type: "email", placeholder: "you@school.edu", autocomplete: "email" });
  const password = el("input", { type: "password", placeholder: "At least 6 characters", autocomplete: isSignUp ? "new-password" : "current-password" });
  const name = el("input", { type: "text", placeholder: "Your name (optional)" });
  const err = el("div", { class: "auth-err hidden" });
  const submit = el("button", { class: "btn primary", type: "submit", style: "width:100%" }, isSignUp ? "Create my brain 🧠" : "Sign in →");
  const form = el("form", {},
    isSignUp ? el("div", { class: "field" }, el("span", {}, "Name"), name) : null,
    el("div", { class: "field" }, el("span", {}, "Email"), email),
    el("div", { class: "field" }, el("span", {}, "Password"), password),
    err, submit);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.classList.add("hidden");
    submit.disabled = true;
    submit.textContent = isSignUp ? "Building your brain…" : "Unlocking…";
    try {
      if (isSignUp) await signUp(email.value.trim(), password.value, name.value.trim());
      else await signIn(email.value.trim(), password.value);
      enterApp();
      showCredit();
    } catch (e2) {
      err.textContent = e2.message || "Something went wrong.";
      err.classList.remove("hidden");
      submit.disabled = false;
      submit.textContent = isSignUp ? "Create my brain 🧠" : "Sign in →";
    }
  });

  root.append(
    el("div", { class: "auth-card" },
      el("div", { class: "auth-brand" },
        el("span", { class: "logo-mark" }, "▚"),
        el("div", {}, el("h1", {}, "NeuroBot"), el("em", {}, "Your Second Brain."))),
      el("h2", {}, isSignUp ? "Create your account" : "Welcome back"),
      el("p", { class: "auth-sub" }, isSignUp
        ? "One account. Every note, idea, goal and thought — synced to your own private brain."
        : "Sign in to reconnect with your second brain."),
      form,
      el("p", { class: "auth-alt" },
        isSignUp ? "Already have an account? " : "New to NeuroBot? ",
        el("button", { type: "button", onclick: () => renderAuth(isSignUp ? "signin" : "signup") },
          isSignUp ? "Sign in" : "Create one")),
      el("div", { class: "demo-note" }, "Your data is stored privately in the NeuroBot database — only you can see it."),
      el("div", { class: "auth-foot" }, "Crafted by ", el("strong", {}, "Tanishq Lalwani"))));

  setTimeout(() => (isSignUp ? name : email).focus(), 80);
}

/* ═════════ router + shell ═════════ */

const NAV = [
  { hash: "#/", label: "Dashboard", icon: ico.dashboard },
  { hash: "#/brain", label: "My Brain", icon: ico.brain },
  { hash: "#/notes", label: "Notes", icon: ico.note },
  { hash: "#/ideas", label: "Ideas", icon: ico.bulb },
  { hash: "#/knowledge", label: "Knowledge", icon: ico.book },
  { hash: "#/goals", label: "Goals", icon: ico.target },
  { hash: "#/connections", label: "Connections", icon: ico.share },
  { hash: "#/settings", label: "Settings", icon: ico.gear },
];

const ROUTES = {
  "#/": renderDashboard,
  "#/brain": renderBrain,
  "#/notes": renderNotes,
  "#/ideas": renderIdeas,
  "#/knowledge": renderKnowledge,
  "#/goals": renderGoals,
  "#/connections": renderConnections,
  "#/settings": renderSettings,
};

function buildNav(current) {
  const nav = $("#nav");
  nav.innerHTML = "";
  for (const item of NAV) {
    nav.append(el("a", { href: item.hash, class: current === item.hash ? "active" : "" },
      el("span", { class: "ico", html: item.icon }),
      el("span", { class: "nav-label" }, item.label)));
  }
}

function updateIdentity() {
  const u = state.user || {};
  const nameEl = $("#user-name"), emailEl = $("#user-email"), avatar = $("#avatar");
  if (!nameEl) return;
  nameEl.textContent = u.name || "Explorer";
  emailEl.textContent = u.email || "";
  avatar.textContent = (u.name || u.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

  const d = state.data;
  const total = d.notes.length + d.ideas.length + d.goals.length + d.knowledge.length;
  const dot = $("#bh-dot"), label = $("#bh-label");
  if (total === 0) {
    dot.style.background = "var(--warn)";
    dot.style.boxShadow = "0 0 10px rgba(251,191,36,.6)";
    label.textContent = "Brain warming up";
  } else if (total < 8) {
    dot.style.background = "var(--accent)";
    dot.style.boxShadow = "0 0 10px rgba(124,156,255,.6)";
    label.textContent = `Brain healthy · ${total} items`;
  } else {
    dot.style.background = "var(--ok)";
    dot.style.boxShadow = "0 0 10px rgba(74,222,128,.65)";
    label.textContent = `Brain thriving · ${total} items`;
  }
}

function route() {
  let hash = location.hash || "#/";
  if (!ROUTES[hash]) hash = "#/";
  buildNav(hash);
  const view = $("#view");
  view.innerHTML = "";
  ROUTES[hash](view);
  window.scrollTo({ top: 0 });
  closeMobileNav();
}

function closeMobileNav() {
  $("#app-root")?.classList.remove("side-open");
  $("#scrim")?.classList.remove("show");
}

function enterApp() {
  $("#auth-root").classList.add("hidden");
  $("#app-root").classList.remove("hidden");
  updateIdentity();
  route();
}

function wireShell() {
  const app = $("#app-root");

  $("#menu-btn").addEventListener("click", () => {
    app.classList.add("side-open");
    $("#scrim").classList.add("show");
  });
  $("#scrim").addEventListener("click", closeMobileNav);

  $("#side-collapse").addEventListener("click", () => {
    app.classList.toggle("collapsed");
    localStorage.setItem("nb_side", app.classList.contains("collapsed") ? "1" : "0");
  });
  if (localStorage.getItem("nb_side") === "1") app.classList.add("collapsed");

  $("#search-btn").addEventListener("click", openPalette);
  $("#notif-btn").addEventListener("click", () => {
    const n = state.data.activity.length;
    toast(n ? `${n} recent captures in your brain.` : "No notifications yet.", "ok");
  });
  $("#live-btn").addEventListener("click", openLive);
  $("#brain-health").addEventListener("click", () => (location.hash = "#/connections"));
  $("#profile-chip").addEventListener("click", async () => {
    const ok = confirm("Sign out of NeuroBot?");
    if (ok) { await signOut(); location.reload(); }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    }
  });

  window.addEventListener("hashchange", route);
  listeners.add(() => { if (!$("#app-root").classList.contains("hidden")) updateIdentity(); });
}

function showCredit() {
  if (sessionStorage.getItem("nb_credit")) return;
  sessionStorage.setItem("nb_credit", "1");
  setTimeout(() => {
    const t = el("div", { class: "toast" },
      el("span", { html: "✨" }),
      el("span", { html: `Crafted by <strong>Tanishq Lalwani</strong> — NeuroBot, Your Second Brain.` }));
    $("#toast-root").append(t);
    setTimeout(() => {
      t.style.transition = "opacity .4s, transform .4s";
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      setTimeout(() => t.remove(), 420);
    }, 5200);
  }, 900);
}

/* ═════════ boot ═════════ */

async function boot() {
  wireShell();
  const user = await bootAuth();
  if (user) {
    enterApp();
    showCredit();
  } else {
    renderAuth("signin");
  }
}

boot();
