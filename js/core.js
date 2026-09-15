/* ============================================================
   NeuroBot — core.js
   Store (localStorage), constants, modals, toasts, hotkeys.
   Pure vanilla ES modules. No build step.
   ============================================================ */

export const APP_NAME = "NeuroBot";
export const TAGLINE = "Your Second Brain.";
export const SESSION = "school-project-2026";

/* ---------------- Constants ---------------- */

export const NAV_ITEMS = [
  { to: "#/", label: "Dashboard", icon: "◉", glyph: "D" },
  { to: "#/brain", label: "My Brain", icon: "▤", glyph: "B" },
  { to: "#/notes", label: "Notes", icon: "✎", glyph: "N" },
  { to: "#/ideas", label: "Ideas", icon: "✦", glyph: "I" },
  { to: "#/knowledge", label: "Knowledge", icon: "◈", glyph: "K" },
  { to: "#/goals", label: "Goals", icon: "◎", glyph: "G" },
  { to: "#/connections", label: "Connections", icon: "⌬", glyph: "C" },
  { to: "#/settings", label: "Settings", icon: "⚙", glyph: "S" },
];

export const ITEM_META = {
  note: { label: "Note", plural: "Notes", icon: "▤", tone: "cyan", verb: "captured" },
  idea: { label: "Idea", plural: "Ideas", icon: "✦", tone: "amber", verb: "logged" },
  goal: { label: "Goal", plural: "Goals", icon: "◎", tone: "violet", verb: "set" },
  knowledge: { label: "Knowledge", plural: "Knowledge", icon: "◈", tone: "green", verb: "captured" },
};

export const IDEA_STATUSES = [
  { value: "new", label: "New", tone: "gray" },
  { value: "exploring", label: "Exploring", tone: "cyan" },
  { value: "building", label: "Building", tone: "amber" },
  { value: "completed", label: "Completed", tone: "green" },
];

export const GOAL_STATUSES = [
  { value: "active", label: "Active", tone: "green" },
  { value: "paused", label: "Paused", tone: "amber" },
  { value: "completed", label: "Completed", tone: "gray" },
];

export const TOPICS = ["AI", "Programming", "Science", "Business", "Education"];
const CATEGORIES = ["General", "AI", "Engineering", "Product", "Business", "Learning", "Psychology"];

/* ---------------- Tiny DOM helpers ---------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function timeAgo(ts) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const dd = Math.floor(h / 24);
  return dd === 1 ? "yesterday" : dd + "d ago";
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso + "T00:00:00").getTime();
  return Math.ceil((t - Date.now()) / 86400000);
}

/* ---------------- Store (localStorage) ---------------- */

const KEY = "neurobot.v1.data";
const ACTIVITY_LIMIT = 50;

let _store = null;
const listeners = new Set();

function seed() {
  const now = Date.now();
  const min = (n) => now - n * 60000;
  const hour = (n) => now - n * 3600000;
  const day = (n) => now - n * 86400000;
  return {
    notes: [
      { id: uid(), kind: "note", title: "Attention is all you need — key takeaways", body: "Self-attention lets every token attend to every other token. Multi-head = parallel subspaces.", category: "AI", createdAt: min(24), pinned: true },
      { id: uid(), kind: "note", title: "Latency budget for v1", body: "p95 under 250ms end-to-end. Cache the graph snapshot, invalidate on write.", category: "Engineering", createdAt: hour(5) },
      { id: uid(), kind: "note", title: "Questions after 'Thinking, Fast and Slow'", body: "Which recent decisions were System 1? Keep a decision journal for 30 days.", category: "Psychology", createdAt: day(1) },
      { id: uid(), kind: "note", title: "Design partner call — notes", body: "They want Markdown export and an offline mode before adopting.", category: "Business", createdAt: day(2) },
    ],
    ideas: [
      { id: uid(), kind: "idea", title: "Spaced-repetition graph pulses", body: "Nodes softly pulse when their linked notes haven't been reviewed in a while.", category: "Learning", status: "exploring", createdAt: min(90), pinned: true },
      { id: uid(), kind: "idea", title: "Weekly brain digest", body: "Auto-compile the week's captures into a one-screen digest.", category: "Product", status: "new", createdAt: hour(8) },
      { id: uid(), kind: "idea", title: "Local-first sync engine", body: "CRDT-backed sync so the brain works offline and merges without conflicts.", category: "Engineering", status: "building", createdAt: day(3) },
      { id: uid(), kind: "idea", title: "Voice capture → auto-linking", body: "60-second voice notes, transcribed and auto-linked to existing nodes.", category: "Product", status: "completed", createdAt: day(5) },
    ],
    goals: [
      { id: uid(), kind: "goal", title: "Finish 'Deep Learning' specialization", body: "5 courses, 2 remaining. Target: 3 sessions/week.", progress: 62, deadline: "2026-11-30", status: "active", createdAt: day(12), pinned: true },
      { id: uid(), kind: "goal", title: "Publish 10 technical posts", body: "3 down, 7 to go. One post per topic in the knowledge graph.", progress: 30, deadline: "2026-12-31", status: "active", createdAt: day(20) },
      { id: uid(), kind: "goal", title: "Prototype the connection engine", body: "Ship the first real similarity pass over captured notes.", progress: 15, deadline: "2026-10-15", status: "active", createdAt: day(6) },
      { id: uid(), kind: "goal", title: "Read 24 books this year", body: "Paused until the specialization finishes. Currently on book 14.", progress: 58, deadline: "2026-12-31", status: "paused", createdAt: day(40) },
    ],
    knowledge: [
      { id: uid(), kind: "knowledge", title: "Transformer architecture", body: "Seq2seq model built entirely on attention — no recurrence, no convolutions.", topic: "AI", source: "arXiv 1706.03762", createdAt: day(4), pinned: true },
      { id: uid(), kind: "knowledge", title: "Gradient descent variants", body: "SGD, momentum, RMSProp, Adam: adaptive learning rates trade generalization for convergence speed.", topic: "Programming", source: "course notes", createdAt: day(6) },
      { id: uid(), kind: "knowledge", title: "CRDTs", body: "Conflict-free replicated data types merge concurrent edits without coordination.", topic: "Programming", source: "Ink & Switch", createdAt: day(8) },
      { id: uid(), kind: "knowledge", title: "Diffusion models 101", body: "Learn to add noise, learn to reverse it. Sampling is iterative denoising.", topic: "AI", source: "paper summary", createdAt: day(9) },
      { id: uid(), kind: "knowledge", title: "Compositional memory", body: "Episodic vs semantic memory maps onto notes vs distilled knowledge.", topic: "Science", source: "reading notes", createdAt: day(11) },
      { id: uid(), kind: "knowledge", title: "Second-brain methodology", body: "Capture → organize → distill → express. Value is retrieval speed.", topic: "Business", source: "BASB", createdAt: day(13) },
      { id: uid(), kind: "knowledge", title: "Spaced repetition", body: "Expanding intervals at the edge of forgetting maximize retention.", topic: "Education", source: "SM-2 algorithm", createdAt: day(14) },
      { id: uid(), kind: "knowledge", title: "Zettelkasten", body: "Atomic notes + explicit links = emergent structure.", topic: "Education", source: "Luhmann method", createdAt: day(16) },
    ],
    activity: [
      { id: uid(), kind: "note", title: "Note captured: Attention is all you need — key takeaways", createdAt: min(24) },
      { id: uid(), kind: "idea", title: "Idea logged: Spaced-repetition graph pulses", createdAt: min(90) },
      { id: uid(), kind: "note", title: "Note edited: Latency budget for v1", createdAt: hour(5) },
      { id: uid(), kind: "knowledge", title: "Knowledge captured: Transformer architecture", createdAt: day(4) },
      { id: uid(), kind: "goal", title: "Goal updated: Prototype the connection engine", createdAt: day(6) },
      { id: uid(), kind: "note", title: "Note captured: Design partner call — notes", createdAt: day(2) },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.notes) && Array.isArray(p.ideas) && Array.isArray(p.goals) && Array.isArray(p.knowledge)) {
        p.activity = Array.isArray(p.activity) ? p.activity : [];
        return p;
      }
    }
  } catch (e) {
    /* corrupted -> reseed */
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    /* storage full or blocked — demo continues in memory */
  }
}

export function getStore() {
  if (!_store) _store = load();
  return _store;
}

export function setStore(next) {
  _store = next;
  persist(_store);
  listeners.forEach((fn) => fn());
}

export function onStoreChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function mutate(fn) {
  const s = getStore();
  setStore(fn(s));
}

function logActivity(kind, title) {
  const s = getStore();
  const entry = { id: uid(), kind, title, createdAt: Date.now() };
  return { ...s, activity: [entry, ...s.activity].slice(0, ACTIVITY_LIMIT) };
}

/* CRUD — sync, localStorage-backed */
export const addNote = (d) => mutate((s) => logActivity({ ...s, notes: [{ id: uid(), kind: "note", createdAt: Date.now(), ...d }, ...s.notes] }, "note", `Note captured: ${d.title}`));
export const updateNote = (id, patch) => mutate((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
export const removeNote = (id) => mutate((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));

export const addIdea = (d) => mutate((s) => logActivity({ ...s, ideas: [{ id: uid(), kind: "idea", createdAt: Date.now(), ...d }, ...s.ideas] }, "idea", `Idea logged: ${d.title}`));
export const updateIdea = (id, patch) => mutate((s) => ({ ...s, ideas: s.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
export const removeIdea = (id) => mutate((s) => ({ ...s, ideas: s.ideas.filter((i) => i.id !== id) }));

export const addGoal = (d) => mutate((s) => logActivity({ ...s, goals: [{ id: uid(), kind: "goal", createdAt: Date.now(), ...d }, ...s.goals] }, "goal", `Goal set: ${d.title}`));
export const updateGoal = (id, patch) => mutate((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
export const removeGoal = (id) => mutate((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));

export const addKnowledge = (d) => mutate((s) => logActivity({ ...s, knowledge: [{ id: uid(), kind: "knowledge", createdAt: Date.now(), ...d }, ...s.knowledge] }, "knowledge", `Knowledge captured: ${d.title}`));
export const updateKnowledge = (id, patch) => mutate((s) => ({ ...s, knowledge: s.knowledge.map((k) => (k.id === id ? { ...k, ...patch } : k)) }));
export const removeKnowledge = (id) => mutate((s) => ({ ...s, knowledge: s.knowledge.filter((k) => k.id !== id) }));

export const removeActivity = (id) => mutate((s) => ({ ...s, activity: s.activity.filter((a) => a.id !== id) }));

export const togglePin = (kind, id) =>
  mutate((s) => {
    const list = s[kind + "s"];
    if (!list) return s;
    const key = kind === "knowledge" ? "knowledge" : kind + "s";
    return { ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) };
  });

export const resetDemo = () => setStore(seed());
export const clearAll = () => setStore({ notes: [], ideas: [], goals: [], knowledge: [], activity: [] });

export const totalItems = () => {
  const s = getStore();
  return s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length;
};

/* ---------------- Toast ---------------- */

export function toast(msg, tone = "ok") {
  const root = $("#toast-root");
  if (!root) return;
  const t = el(`<div class="toast ${tone}">${esc(msg)}</div>`);
  root.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

/* ---------------- Modal system ---------------- */

export function openModal({ title, subtitle, large = false }) {
  const root = $("#modal-root");
  root.innerHTML = "";
  const backdrop = el(`
    <div class="modal-backdrop open">
      <div class="modal ${large ? "modal-lg" : ""}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <span class="term-dots"><i></i><i></i><i></i></span>
          <span class="term-title">${esc(subtitle || "neurobot")}</span>
          <button class="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>`);
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  $(".modal-close", backdrop).addEventListener("click", close);
  root.appendChild(backdrop);
  const body = $(".modal-body", backdrop);
  return { close, body, head: $(".term-title", backdrop) };
}

/* ---------------- Capture form ---------------- */

function optionList(list, selected) {
  return list
    .map((o) => {
      const value = typeof o === "string" ? o : o.value;
      const label = typeof o === "string" ? o : o.label;
      return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
}

function captureFormHTML(kind, item) {
  const m = ITEM_META[kind];
  const v = (f, fb = "") => (item ? item[f] ?? fb : fb);
  const catField =
    kind === "knowledge"
      ? `<div class="field"><label>Topic</label><select id="f-topic">${optionList(TOPICS, v("topic", TOPICS[0]))}</select></div>
         <div class="field"><label>Source</label><input id="f-source" placeholder="paper, course, person…" value="${esc(v("source"))}" /></div>`
      : `<div class="field"><label>Category</label><select id="f-category">${optionList(CATEGORIES, v("category", "General"))}</select></div>`;

  if (kind === "note" || kind === "knowledge") {
    return `<div class="field"><label>Title</label><input id="f-title" placeholder="${m.label} title…" value="${esc(v("title"))}" required /></div>
      <div class="field"><label>${kind === "note" ? "Note" : "Knowledge"}</label><textarea id="f-body" placeholder="Write it down…">${esc(v("body"))}</textarea></div>
      <div class="field">${catField}</div>`;
  }
  if (kind === "idea") {
    return `<div class="field"><label>Title</label><input id="f-title" placeholder="Idea title…" value="${esc(v("title"))}" required /></div>
      <div class="field"><label>Description</label><textarea id="f-body" placeholder="Describe the idea…">${esc(v("body"))}</textarea></div>
      <div class="field-row">
        <div class="field">${catField}</div>
        <div class="field"><label>Status</label><select id="f-status">${optionList(IDEA_STATUSES, v("status", "new"))}</select></div>
      </div>`;
  }
  return `<div class="field"><label>Title</label><input id="f-title" placeholder="Goal title…" value="${esc(v("title"))}" required /></div>
    <div class="field"><label>Description</label><textarea id="f-body" placeholder="What does success look like?">${esc(v("body"))}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Progress %</label><input id="f-progress" type="number" min="0" max="100" value="${esc(v("progress", 0))}" /></div>
      <div class="field"><label>Deadline</label><input id="f-deadline" type="date" value="${esc(v("deadline"))}" /></div>
    </div>
    <div class="field-row">
      <div class="field">${catField}</div>
      <div class="field"><label>Status</label><select id="f-status">${optionList(GOAL_STATUSES, v("status", "active"))}</select></div>
    </div>`;
}

export function openCapture(kind, item, onSaved) {
  const modal = openModal({
    subtitle: `$ neurobot ${kind} ${item ? "--edit" : "--new"}`,
    title: item ? `Edit ${ITEM_META[kind].label}` : `New ${ITEM_META[kind].label}`,
  });
  modal.body.innerHTML = `
    <form id="capture-form" class="grid">${captureFormHTML(kind, item)}
      <div class="form-actions">
        <button type="button" class="btn btn-outline btn-sm" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">${item ? "Save changes" : `Save ${ITEM_META[kind].label}`}</button>
      </div>
    </form>`;
  const form = $("#capture-form", modal.body);
  setTimeout(() => $("#f-title", form)?.focus(), 30);
  $("[data-cancel]", form).addEventListener("click", modal.close);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = (sel) => $(sel, form)?.value.trim() ?? "";
    if (!val("#f-title")) return;
    if (kind === "note") {
      const d = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General" };
      item ? updateNote(item.id, d) : addNote(d);
    } else if (kind === "idea") {
      const d = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General", status: val("#f-status") };
      item ? updateIdea(item.id, d) : addIdea(d);
    } else if (kind === "goal") {
      const d = {
        title: val("#f-title"), body: val("#f-body"),
        progress: Math.max(0, Math.min(100, Number(val("#f-progress")) || 0)),
        deadline: val("#f-deadline") || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        status: val("#f-status"),
      };
      item ? updateGoal(item.id, d) : addGoal(d);
    } else {
      const d = { title: val("#f-title"), body: val("#f-body"), topic: val("#f-topic"), source: val("#f-source") || "captured manually" };
      item ? updateKnowledge(item.id, d) : addKnowledge(d);
    }
    modal.close();
    toast(item ? `${ITEM_META[kind].label} updated.` : `${ITEM_META[kind].label} captured to your brain.`);
    onSaved && onSaved();
  });
}

/* ---------------- Neural graph (SVG) ---------------- */

export const GRAPH_NODES = [
  { id: "ai", label: "Artificial Intelligence", x: 50, y: 30, hub: true },
  { id: "ml", label: "Machine Learning", x: 27, y: 52 },
  { id: "prog", label: "Programming", x: 74, y: 50 },
  { id: "nb", label: "NeuroBot", x: 50, y: 74, hub: true },
  { id: "ent", label: "Entrepreneurship", x: 20, y: 22 },
  { id: "edu", label: "Education", x: 82, y: 20 },
];

export const GRAPH_EDGES = [
  ["ai", "ml"], ["ai", "prog"], ["ai", "ent"], ["ai", "edu"], ["ai", "nb"],
  ["ml", "prog"], ["ml", "nb"], ["prog", "nb"], ["edu", "prog"], ["ent", "ml"],
];

export function renderGraph(target, { height = 320 } = {}) {
  const W = 800;
  const H = height;
  const px = (n) => (n.x / 100) * W;
  const py = (n) => (n.y / 100) * H;
  const edges = GRAPH_EDGES
    .map(([a, b]) => {
      const A = GRAPH_NODES.find((n) => n.id === a);
      const B = GRAPH_NODES.find((n) => n.id === b);
      const x1 = px(A), y1 = py(A), x2 = px(B), y2 = py(B);
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
      const my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
      return `<path class="graph-edge" d="M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" />`;
    })
    .join("");
  const nodes = GRAPH_NODES.map((n) => {
    const r = n.hub ? 26 : 17;
    const fs = n.hub ? 10.5 : 9;
    return `<g class="graph-node ${n.hub ? "hub" : ""}" transform="translate(${px(n)},${py(n)})">
      <circle r="${r}" /><text text-anchor="middle" y="${r + fs + 3}" font-size="${fs}">${esc(n.label)}</text>
    </g>`;
  }).join("");
  target.innerHTML = `<svg class="graph-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Knowledge graph (visual demo)">${edges}${nodes}</svg>`;
}

/* ---------------- Hotkeys ---------------- */

export function initHotkeys(openPalette, openKeysHelp) {
  let seq = "";
  let timer;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "?") { openKeysHelp(); return; }
    if (e.key.toLowerCase() === "c") {
      seq = "c";
      clearTimeout(timer);
      timer = setTimeout(() => (seq = ""), 1200);
      return;
    }
    if (seq === "c") {
      const map = { n: "note", i: "idea", k: "knowledge", g: "goal" };
      const kind = map[e.key.toLowerCase()];
      seq = "";
      if (kind) { e.preventDefault(); openCapture(kind); }
    }
  });
}
