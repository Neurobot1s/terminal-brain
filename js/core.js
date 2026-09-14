/* ============================================================
   NeuroBot — core.js
   Store, helpers, modal system, graph, quick capture, palette.
   Pure vanilla ES modules. No frameworks.
   ============================================================ */

/* ---------------- Config ---------------- */

export const APP_NAME = "NeuroBot";
export const TAGLINE = "Your Second Brain.";
export const OWNER_CREDIT = "Crafted by TANISHQ LALWANI";
export const SESSION = "v2.1 · gemini";

export const GEMINI_KEY = "AQ.Ab8RN6JvNBW1MK9_Hv41sCU7IjDuDr3MGnrWIVRGEDAACSSiQQ";
export const GEMINI_MODEL = "gemini-2.5-flash";

export const NAV_ITEMS = [
  { to: "#/", label: "Dashboard", icon: "◈", glyph: "~/dash" },
  { to: "#/brain", label: "My Brain", icon: "▚", glyph: "~/brain" },
  { to: "#/notes", label: "Notes", icon: "▤", glyph: "~/notes" },
  { to: "#/ideas", label: "Ideas", icon: "✦", glyph: "~/ideas" },
  { to: "#/knowledge", label: "Knowledge", icon: "◉", glyph: "~/knowledge" },
  { to: "#/goals", label: "Goals", icon: "◎", glyph: "~/goals" },
  { to: "#/connections", label: "Connections", icon: "⇄", glyph: "~/links" },
  { to: "#/settings", label: "Settings", icon: "⚙", glyph: "~/settings" },
];

export const GRAPH_NODES = [
  { id: "ai", label: "Artificial Intelligence", x: 50, y: 22, hub: true },
  { id: "ml", label: "Machine Learning", x: 26, y: 44 },
  { id: "prog", label: "Programming", x: 72, y: 46 },
  { id: "nb", label: "NeuroBot", x: 50, y: 66, hub: true },
  { id: "ent", label: "Entrepreneurship", x: 22, y: 84 },
  { id: "edu", label: "Education", x: 78, y: 82 },
];

export const GRAPH_EDGES = [
  ["ai", "ml"], ["ai", "prog"], ["ai", "nb"], ["ml", "nb"],
  ["prog", "nb"], ["nb", "ent"], ["nb", "edu"], ["ml", "ent"],
  ["prog", "edu"], ["ent", "edu"],
];

/* ---------------- Tiny DOM helpers ---------------- */

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export function formatDay(ts) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function daysUntil(iso) {
  return Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);
}

/* ---------------- Toasts ---------------- */

let toastWrap = null;
export function toast(msg, ms = 3200) {
  if (!toastWrap) {
    toastWrap = el(`<div class="toast-wrap"></div>`);
    document.body.appendChild(toastWrap);
  }
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  toastWrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transition = "opacity .3s";
    setTimeout(() => t.remove(), 320);
  }, ms);
}

/* ---------------- Store (localStorage) ---------------- */

const STORE_KEY = "neurobot.v2.data";
const ACTIVITY_LIMIT = 50;

const seed = () => ({
  notes: [
    { id: uid(), kind: "note", title: "Attention is all you need — key takeaways", body: "Self-attention lets every token attend to every other token. Multi-head = parallel subspaces. Positional encoding injects order.", category: "AI", createdAt: Date.now() - 24 * 60000, pinned: true },
    { id: uid(), kind: "note", title: "Latency budget for v1", body: "p95 under 250ms end-to-end; warm start matters more than cold throughput.", category: "Engineering", createdAt: Date.now() - 5 * 3600000 },
    { id: uid(), kind: "note", title: "Questions after 'Thinking, Fast and Slow'", body: "Which recent decisions were System 1? Keep a decision journal for 30 days.", category: "Psychology", createdAt: Date.now() - 86400000 },
  ],
  ideas: [
    { id: uid(), kind: "idea", title: "Spaced-repetition graph pulses", body: "Nodes softly pulse when their linked notes haven't been reviewed in a while — review becomes ambient.", category: "Learning", status: "exploring", createdAt: Date.now() - 90 * 60000, pinned: true },
    { id: uid(), kind: "idea", title: "Weekly brain digest", body: "Auto-compile the week's captures into a one-screen digest.", category: "Product", status: "new", createdAt: Date.now() - 8 * 3600000 },
    { id: uid(), kind: "idea", title: "Voice capture → auto-linking", body: "60-second voice notes, transcribed and auto-linked to existing nodes.", category: "Product", status: "completed", createdAt: Date.now() - 5 * 86400000 },
  ],
  goals: [
    { id: uid(), kind: "goal", title: "Finish 'Deep Learning' specialization", body: "5 courses, 2 remaining. Notes captured into NeuroBot after each.", progress: 62, deadline: "2026-11-30", status: "active", createdAt: Date.now() - 12 * 86400000, pinned: true },
    { id: uid(), kind: "goal", title: "Publish 10 technical posts", body: "3 down, 7 to go.", progress: 30, deadline: "2026-12-31", status: "active", createdAt: Date.now() - 20 * 86400000 },
    { id: uid(), kind: "goal", title: "Read 24 books this year", body: "Paused until the specialization finishes.", progress: 58, deadline: "2026-12-31", status: "paused", createdAt: Date.now() - 40 * 86400000 },
  ],
  knowledge: [
    { id: uid(), kind: "knowledge", title: "Transformer architecture", body: "Seq2seq model built entirely on attention — no recurrence, no convolutions.", topic: "AI", source: "arXiv 1706.03762", createdAt: Date.now() - 4 * 86400000, pinned: true },
    { id: uid(), kind: "knowledge", title: "Gradient descent variants", body: "SGD, momentum, RMSProp, Adam: adaptive learning rates trade generalization for convergence speed.", topic: "Programming", source: "course notes", createdAt: Date.now() - 6 * 86400000 },
    { id: uid(), kind: "knowledge", title: "Spaced repetition", body: "Expanding intervals at the edge of forgetting maximize retention per review minute.", topic: "Education", source: "SM-2 algorithm", createdAt: Date.now() - 14 * 86400000 },
    { id: uid(), kind: "knowledge", title: "Zettelkasten", body: "Atomic notes + explicit links = emergent structure.", topic: "Education", source: "Luhmann method", createdAt: Date.now() - 16 * 86400000 },
  ],
  activity: [],
  chat: [],
});

let store = null;

export function getStore() {
  if (store) return store;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.notes)) {
        parsed.chat = Array.isArray(parsed.chat) ? parsed.chat : [];
        store = parsed;
        return store;
      }
    }
  } catch { /* corrupted → reseed */ }
  store = seed();
  persist();
  return store;
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* full */ }
}

function logActivity(kind, verb, title) {
  const s = getStore();
  s.activity.unshift({ id: uid(), kind, title: `${verb}: ${title}`, createdAt: Date.now() });
  s.activity = s.activity.slice(0, ACTIVITY_LIMIT);
}

export function addNote(data) {
  const s = getStore();
  const item = { ...data, id: uid(), kind: "note", createdAt: Date.now() };
  s.notes.unshift(item);
  logActivity("note", "Note captured", item.title);
  persist();
  return item;
}
export function updateNote(id, patch) {
  const s = getStore();
  s.notes = s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
  persist();
}
export function removeNote(id) {
  const s = getStore();
  const removed = s.notes.find((n) => n.id === id);
  s.notes = s.notes.filter((n) => n.id !== id);
  persist();
  return () => {
    if (removed && !getStore().notes.some((n) => n.id === id)) {
      getStore().notes.unshift(removed);
      persist();
    }
  };
}

export function addIdea(data) {
  const s = getStore();
  const item = { ...data, id: uid(), kind: "idea", createdAt: Date.now() };
  s.ideas.unshift(item);
  logActivity("idea", "Idea logged", item.title);
  persist();
  return item;
}
export function updateIdea(id, patch) {
  const s = getStore();
  s.ideas = s.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i));
  persist();
}
export function removeIdea(id) {
  const s = getStore();
  const removed = s.ideas.find((i) => i.id === id);
  s.ideas = s.ideas.filter((i) => i.id !== id);
  persist();
  return () => {
    if (removed && !getStore().ideas.some((i) => i.id === id)) {
      getStore().ideas.unshift(removed);
      persist();
    }
  };
}

export function addGoal(data) {
  const s = getStore();
  const item = { ...data, id: uid(), kind: "goal", createdAt: Date.now() };
  s.goals.unshift(item);
  logActivity("goal", "Goal set", item.title);
  persist();
  return item;
}
export function updateGoal(id, patch) {
  const s = getStore();
  s.goals = s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g));
  persist();
}
export function removeGoal(id) {
  const s = getStore();
  const removed = s.goals.find((g) => g.id === id);
  s.goals = s.goals.filter((g) => g.id !== id);
  persist();
  return () => {
    if (removed && !getStore().goals.some((g) => g.id === id)) {
      getStore().goals.unshift(removed);
      persist();
    }
  };
}

export function addKnowledge(data) {
  const s = getStore();
  const item = { ...data, id: uid(), kind: "knowledge", createdAt: Date.now() };
  s.knowledge.unshift(item);
  logActivity("knowledge", "Knowledge captured", item.title);
  persist();
  return item;
}
export function updateKnowledge(id, patch) {
  const s = getStore();
  s.knowledge = s.knowledge.map((k) => (k.id === id ? { ...k, ...patch } : k));
  persist();
}
export function removeKnowledge(id) {
  const s = getStore();
  const removed = s.knowledge.find((k) => k.id === id);
  s.knowledge = s.knowledge.filter((k) => k.id !== id);
  persist();
  return () => {
    if (removed && !getStore().knowledge.some((k) => k.id === id)) {
      getStore().knowledge.unshift(removed);
      persist();
    }
  };
}

export function removeActivity(id) {
  const s = getStore();
  s.activity = s.activity.filter((a) => a.id !== id);
  persist();
}

export function togglePin(kind, id) {
  const s = getStore();
  const list = { note: s.notes, idea: s.ideas, goal: s.goals, knowledge: s.knowledge }[kind];
  const item = list.find((x) => x.id === id);
  if (item) item.pinned = !item.pinned;
  persist();
}

export function resetDemo() {
  store = seed();
  persist();
}

export function clearAll() {
  store = { notes: [], ideas: [], goals: [], knowledge: [], activity: [], chat: [] };
  persist();
}

/* Chat memory */
export function getChat() { return getStore().chat; }
export function setChat(msgs) {
  const s = getStore();
  s.chat = msgs.slice(-40);
  persist();
}

/* ---------------- Item kind metadata ---------------- */

export const ITEM_META = {
  note: { label: "note", plural: "Notes", icon: "▤", tone: "cyan", verb: "captured" },
  idea: { label: "idea", plural: "Ideas", icon: "✦", tone: "amber", verb: "logged" },
  goal: { label: "goal", plural: "Goals", icon: "◎", tone: "violet", verb: "set" },
  knowledge: { label: "knowledge", plural: "Knowledge", icon: "◉", tone: "green", verb: "captured" },
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

/* ---------------- Modal system ---------------- */

export function openModal({ title, subtitle, bodyClass = "", large = false, onClose }) {
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
        <div class="modal-body ${bodyClass}"></div>
      </div>
    </div>
  `);
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  $(".modal-close", backdrop).addEventListener("click", close);
  $(".modal-body", backdrop).innerHTML = title ? "" : "";
  root.appendChild(backdrop);
  return { close, body: $(".modal-body", backdrop), setTitle(t) { $(".modal-head .term-title", backdrop).textContent = t; } };
}

/* ---------------- Capture forms ---------------- */

const TOPICS = ["AI", "Programming", "Science", "Business", "Education"];

function captureForm(kind, item) {
  const m = ITEM_META[kind];
  const isEdit = !!item;
  const v = (field, fallback = "") => (item ? item[field] ?? fallback : fallback);
  let fields = "";
  const catField =
    kind === "knowledge"
      ? `<label>Topic</label><select id="f-topic">${TOPICS.map((t) => `<option ${v("topic") === t ? "selected" : ""}>${t}</option>`).join("")}</select>
         <label>Source</label><input id="f-source" placeholder="paper, course, person…" value="${esc(v("source"))}" />`
      : `<label>Category</label><input id="f-category" placeholder="e.g. AI, Life, Work" value="${esc(v("category"))}" />`;

  if (kind === "note" || kind === "knowledge") {
    fields = `<div class="field"><label>Title</label><input id="f-title" placeholder="${m.label} title…" value="${esc(v("title"))}" required /></div>
      <div class="field"><label>${kind === "note" ? "Note" : "Knowledge"}</label><textarea id="f-body" placeholder="Write it down…">${esc(v("body"))}</textarea></div>
      <div class="field">${catField}</div>`;
  } else if (kind === "idea") {
    fields = `<div class="field"><label>Title</label><input id="f-title" placeholder="Idea title…" value="${esc(v("title"))}" required /></div>
      <div class="field"><label>Description</label><textarea id="f-body" placeholder="Describe the idea…">${esc(v("body"))}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Category</label><input id="f-category" placeholder="e.g. Product" value="${esc(v("category"))}" /></div>
        <div class="field"><label>Status</label><select id="f-status">${IDEA_STATUSES.map((s) => `<option value="${s.value}" ${v("status", "new") === s.value ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>
      </div>`;
  } else {
    fields = `<div class="field"><label>Title</label><input id="f-title" placeholder="Goal title…" value="${esc(v("title"))}" required /></div>
      <div class="field"><label>Description</label><textarea id="f-body" placeholder="What does success look like?">${esc(v("body"))}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Progress %</label><input id="f-progress" type="number" min="0" max="100" value="${esc(v("progress", 0))}" /></div>
        <div class="field"><label>Deadline</label><input id="f-deadline" type="date" value="${esc(v("deadline"))}" /></div>
      </div>
      <div class="field"><label>Status</label><select id="f-status">${GOAL_STATUSES.map((s) => `<option value="${s.value}" ${v("status", "active") === s.value ? "selected" : ""}>${s.label}</option>`).join("")}</select></div>`;
  }

  return `
    <form id="capture-form">
      ${fields}
      <div class="form-actions">
        <button type="button" class="btn btn-outline btn-sm" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm">${isEdit ? "Save changes" : `Save ${m.label}`}</button>
      </div>
    </form>
  `;
}

export function openCapture(kind, item, onSaved) {
  const modal = openModal({
    subtitle: `$ neurobot ${kind} ${item ? "--edit" : "--new"}`,
    title: item ? `Edit ${ITEM_META[kind].label}` : `New ${ITEM_META[kind].label}`,
  });
  modal.body.innerHTML = captureForm(kind, item);
  const form = $("#capture-form", modal.body);
  setTimeout(() => $("#f-title", form)?.focus(), 30);
  $("[data-cancel]", form).addEventListener("click", modal.close);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = (id) => $(id, form)?.value.trim() ?? "";
    if (!val("#f-title")) return;
    if (kind === "note") {
      const data = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General" };
      item ? updateNote(item.id, data) : addNote(data);
    } else if (kind === "idea") {
      const data = { title: val("#f-title"), body: val("#f-body"), category: val("#f-category") || "General", status: val("#f-status") };
      item ? updateIdea(item.id, data) : addIdea(data);
    } else if (kind === "goal") {
      const data = {
        title: val("#f-title"), body: val("#f-body"),
        progress: Math.max(0, Math.min(100, Number(val("#f-progress")) || 0)),
        deadline: val("#f-deadline") || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        status: val("#f-status"),
      };
      item ? updateGoal(item.id, data) : addGoal(data);
    } else {
      const data = { title: val("#f-title"), body: val("#f-body"), topic: val("#f-topic"), source: val("#f-source") };
      item ? updateKnowledge(item.id, data) : addKnowledge(data);
    }
    modal.close();
    toast(item ? `${ITEM_META[kind].label} updated.` : `${ITEM_META[kind].label} captured to your brain.`);
    onSaved && onSaved();
  });
}

/* ---------------- Neural graph (SVG) ---------------- */

export function renderGraph(target, { height = 300 } = {}) {
  const W = 800;
  const H = height;
  const px = (n) => (n.x / 100) * W;
  const py = (n) => (n.y / 100) * H;

  const edges = GRAPH_EDGES.map(([a, b]) => {
    const A = GRAPH_NODES.find((n) => n.id === a);
    const B = GRAPH_NODES.find((n) => n.id === b);
    const x1 = px(A), y1 = py(A), x2 = px(B), y2 = py(B);
    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
    const my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
    return `<path class="graph-edge" d="M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" />`;
  }).join("");

  const nodes = GRAPH_NODES.map((n) => {
    const r = n.hub ? 26 : 17;
    const fs = n.hub ? 10.5 : 9;
    return `<g class="graph-node" transform="translate(${px(n)},${py(n)})">
      <circle r="${r}" />
      <text text-anchor="middle" y="${r + fs + 3}" font-size="${fs}">${esc(n.label)}</text>
    </g>`;
  }).join("");

  target.innerHTML = `
    <svg class="graph-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Knowledge graph (visual demo)">
      ${edges}${nodes}
    </svg>
  `;
}

/* ---------------- Command palette ---------------- */

export function openPalette() {
  const root = $("#cmdk-root");
  root.innerHTML = "";
  const backdrop = el(`
    <div class="cmdk-backdrop open">
      <div class="cmdk" role="dialog" aria-modal="true">
        <input class="cmdk-input" placeholder="Type a command or search memories…" />
        <div class="cmdk-list"></div>
      </div>
    </div>
  `);
  const input = $(".cmdk-input", backdrop);
  const list = $(".cmdk-list", backdrop);
  let items = [];

  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const els = [...list.querySelectorAll(".cmdk-item")];
      const idx = els.findIndex((x) => x.classList.contains("sel"));
      const next = e.key === "ArrowDown" ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
      els.forEach((x) => x.classList.remove("sel"));
      els[next]?.classList.add("sel");
      els[next]?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") {
      const sel = list.querySelector(".cmdk-item.sel") || list.querySelector(".cmdk-item");
      sel?.click();
    }
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  const rebuild = () => {
    const q = input.value.toLowerCase().trim();
    const s = getStore();
    const nav = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ label: n.label, hint: n.glyph, run: () => (location.hash = n.to) }));
    const caps = [
      { label: "New Note", hint: "C N", run: () => openCapture("note") },
      { label: "New Idea", hint: "C I", run: () => openCapture("idea") },
      { label: "Save Thought", hint: "C K", run: () => openCapture("knowledge") },
      { label: "Add Goal", hint: "C G", run: () => openCapture("goal") },
    ].filter((c) => !q || c.label.toLowerCase().includes(q));
    const acts = [
      { label: "◉ NeuroBot Live", hint: "soon", run: () => openLive() },
      { label: "✦ Credits — Tanishq Lalwani", hint: "", run: () => openCredits() },
    ].filter((c) => !q || c.label.toLowerCase().includes(q));
    const mems = [
      ...s.notes.map((n) => ({ label: n.title, kind: "note" })),
      ...s.ideas.map((i) => ({ label: i.title, kind: "idea" })),
      ...s.goals.map((g) => ({ label: g.title, kind: "goal" })),
      ...s.knowledge.map((k) => ({ label: k.title, kind: "knowledge" })),
    ]
      .filter((m) => q && m.label.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({ label: m.label, hint: m.kind, run: () => (location.hash = { note: "#/notes", idea: "#/ideas", goal: "#/goals", knowledge: "#/knowledge" }[m.kind]) }));

    items = [
      { heading: "Capture", list: caps },
      { heading: "Navigate", list: nav },
      { heading: "Actions", list: acts },
      ...(mems.length ? [{ heading: "Memories", list: mems }] : []),
    ].filter((g) => g.list.length);

    list.innerHTML = items.length
      ? items
          .map(
            (g) => `
        <div class="cmdk-group-label">${g.heading}</div>
        ${g.list
          .map(
            (it) => `
          <button class="cmdk-item" data-run>
            <span class="glyph">&gt;</span>
            <span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.label)}</span>
            <span class="hint">${esc(it.hint)}</span>
          </button>`,
          )
          .join("")}
      `,
          )
          .join("")
      : `<div class="cmdk-empty">No results found.</div>`;

    list.querySelectorAll("[data-run]").forEach((b, i) => {
      const flat = items.flatMap((g) => g.list);
      b.addEventListener("click", () => {
        close();
        flat[i] && flat[i].run();
      });
    });
    list.querySelector(".cmdk-item")?.classList.add("sel");
  };

  input.addEventListener("input", rebuild);
  rebuild();
  root.appendChild(backdrop);
  input.focus();
}

/* ---------------- Live / Credits / Keys modals ---------------- */

export function openLive() {
  const modal = openModal({ subtitle: "$ neurobot live --voice", title: "NeuroBot Live" });
  modal.body.innerHTML = `
    <div style="text-align:center;padding:1rem 0">
      <div class="mic-visual">
        <div class="mic-ring"><div class="mic-core">🎙</div></div>
        <div class="mic-bars">${Array.from({ length: 7 }, (_, i) => `<i style="animation-delay:${i * 0.12}s"></i>`).join("")}</div>
      </div>
      <h3 class="mt-2" style="font-size:1.05rem;font-weight:700">NeuroBot Live</h3>
      <p class="text-sm muted" style="margin-top:0.375rem;max-width:20rem;margin-inline:auto">Real-time voice conversations are coming soon.</p>
      <div class="chip amber" style="margin-top:0.875rem">status: in development</div>
      <div style="margin-top:1.25rem"><button class="btn btn-outline btn-sm" data-close>Back to my brain</button></div>
    </div>
  `;
  $("[data-close]", modal.body).addEventListener("click", modal.close);
}

export function openCredits() {
  const modal = openModal({ subtitle: "$ neurobot credits --show", title: "Credits" });
  modal.body.innerHTML = `
    <div style="text-align:center">
      <div class="row" style="justify-content:center;gap:0.625rem">
        <span class="logo-mark" style="width:2.5rem;height:2.5rem;font-size:1.1rem">▚</span>
        <div style="text-align:left">
          <div style="font-weight:700">${APP_NAME}</div>
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-foreground)">${TAGLINE}</div>
        </div>
      </div>
      <div style="margin-top:1.25rem;border:1px solid oklch(0.4744 0.1136 150.86/30%);background:oklch(0.4744 0.1136 150.86/5%);border-radius:var(--radius);padding:1rem">
        <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-foreground)">crafted by</div>
        <div style="margin-top:0.25rem;font-size:1.125rem;font-weight:700;color:var(--primary)">TANISHQ LALWANI<span class="blink">▍</span></div>
        <div style="margin-top:0.5rem;font-size:11px;color:var(--muted-foreground)">✓ designer &amp; builder of this second brain</div>
      </div>
      <div class="row-wrap" style="justify-content:center;margin-top:0.875rem">
        <span class="chip green">${SESSION}</span>
        <span class="chip gray">frontend</span>
        <span class="chip amber">local-first</span>
      </div>
      <p style="margin-top:1rem;font-size:11px;color:var(--muted-foreground)"><span style="color:var(--primary)">$</span> whoami → tanishq</p>
      <button class="btn btn-outline btn-sm" style="margin-top:0.75rem" data-close>Close</button>
    </div>
  `;
  $("[data-close]", modal.body).addEventListener("click", modal.close);
}

export function openKeysHelp() {
  const rows = [
    ["Ctrl K", "Open command palette"],
    ["C N", "New note"],
    ["C I", "New idea"],
    ["C K", "Save a thought"],
    ["C G", "Add a goal"],
    ["?", "Show this help"],
  ];
  const modal = openModal({ subtitle: "$ neurobot keys --list", title: "Keyboard shortcuts" });
  modal.body.innerHTML = `
    <div>${rows.map((r) => `<div class="row" style="padding:0.55rem 0;border-bottom:1px solid oklch(0.8665 0.0097 115/60%)"><kbd>${r[0]}</kbd><span class="muted text-sm">${r[1]}</span></div>`).join("")}</div>
  `;
}

/* ---------------- Global hotkeys ---------------- */

export function initHotkeys() {
  let seq = "";
  let timer;
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("#cmdk-root").childElementCount ? $("#cmdk-root").firstElementChild.remove() : openPalette();
      return;
    }
    if (e.key === "Escape") {
      $("#modal-root").firstElementChild?.remove();
      $("#cmdk-root").firstElementChild?.remove();
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

/* ---------------- Chrome wiring (sidebar/topbar/bottom nav) ---------------- */

export function renderChrome() {
  const path = location.hash || "#/";
  $("#nav").innerHTML = NAV_ITEMS.map(
    (n) => `
    <a class="nav-item ${path === n.to ? "active" : ""}" href="${n.to}">
      <span>${n.icon}</span><span class="nav-label">${n.label}</span><span class="nav-glyph">${n.glyph}</span>
    </a>`,
  ).join("");

  $("#bottom-nav").innerHTML = NAV_ITEMS.slice(0, 5)
    .map((n) => {
      const active = path === n.to;
      return `<a href="${n.to}" class="${active ? "active" : ""}"><span class="bnav-ico">${n.icon}</span><span>${n.label}</span><span class="bnav-bar"></span></a>`;
    })
    .join("") + `<a href="#/settings"><span class="bnav-ico">⋯</span><span>More</span><span class="bnav-bar"></span></a>`;

  // Brain health: based on total items + recent activity.
  const s = getStore();
  const total = s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length;
  const bh = $("#bh-label");
  const dot = $("#bh-dot");
  if (total >= 12) { bh.textContent = "Brain health: excellent"; dot.style.background = "var(--primary)"; }
  else if (total >= 5) { bh.textContent = "Brain health: good"; dot.style.background = "var(--term-amber)"; }
  else { bh.textContent = "Brain health: warming up"; dot.style.background = "var(--term-rose)"; }
}
