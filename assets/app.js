/* ============================================================
   NeuroBot v4 — static app. No framework, no build step.
   Sections: config → utils → store → prefs → toasts → overlays
   → graph → shell render → pages → router → hotkeys → boot.
   ============================================================ */
"use strict";

/* ================= 1. Config ================= */

const APP_NAME = "NeuroBot";
const TAGLINE = "Your Second Brain.";
const VERSION = "v4.0 · static";
const OWNER_NAME = "Tanishq Lalwani";
const OWNER_CREDIT = "Crafted by Tanishq Lalwani";

const NAV = [
  { id: "dashboard",   path: "#/",            label: "Dashboard",   glyph: "~/dash",     icon: "▦" },
  { id: "brain",       path: "#/brain",       label: "My Brain",    glyph: "~/brain",    icon: "◉" },
  { id: "notes",       path: "#/notes",       label: "Notes",       glyph: "~/notes",    icon: "▤" },
  { id: "ideas",       path: "#/ideas",       label: "Ideas",       glyph: "~/ideas",    icon: "✦" },
  { id: "knowledge",   path: "#/knowledge",   label: "Knowledge",   glyph: "~/knowledge",icon: "▣" },
  { id: "goals",       path: "#/goals",       label: "Goals",       glyph: "~/goals",    icon: "◎" },
  { id: "connections", path: "#/connections", label: "Connections", glyph: "~/links",    icon: "⁂" },
  { id: "settings",    path: "#/settings",    label: "Settings",    glyph: "~/settings", icon: "⚙" },
];

const KINDS = {
  note:      { label: "note",      plural: "Notes",      icon: "▤", tone: "cyan",   verb: "captured", page: "#/notes" },
  idea:      { label: "idea",      plural: "Ideas",      icon: "✦", tone: "amber",  verb: "logged",   page: "#/ideas" },
  goal:      { label: "goal",      plural: "Goals",      icon: "◎", tone: "violet", verb: "set",      page: "#/goals" },
  knowledge: { label: "knowledge", plural: "Knowledge",  icon: "▣", tone: "green",  verb: "captured", page: "#/knowledge" },
};

const IDEA_STATUSES = [
  { value: "new",       label: "New",       tone: "gray"  },
  { value: "exploring", label: "Exploring", tone: "cyan"  },
  { value: "building",  label: "Building",  tone: "amber" },
  { value: "completed", label: "Completed", tone: "green" },
];

const GOAL_STATUSES = [
  { value: "active",    label: "Active",    tone: "green" },
  { value: "paused",    label: "Paused",    tone: "amber" },
  { value: "completed", label: "Completed", tone: "gray"  },
];

const CATEGORIES = ["General", "AI", "Engineering", "Product", "Business", "Learning", "Psychology"];
const TOPICS = ["AI", "Programming", "Science", "Business", "Education"];

const TOPIC_COLORS = {
  AI: "#20707f", Programming: "#5b5ea6", Business: "#a86b1a",
  Education: "#2e7d54", Science: "#b3402f",
};

/* Knowledge graph demo data — positions for desktop (1000×560) and
   mobile (480×760) coordinate spaces. Visual demo only. */
const GRAPH_NODES = [
  { id: "ai",       label: "Artificial Intelligence", topic: "AI",          value: 3, dx: 500, dy: 120, mx: 240, my: 90  },
  { id: "ml",       label: "Machine Learning",        topic: "AI",          value: 2, dx: 330, dy: 210, mx: 110, my: 215 },
  { id: "llm",      label: "LLMs",                    topic: "AI",          value: 1, dx: 620, dy: 220, mx: 370, my: 205 },
  { id: "prog",     label: "Programming",             topic: "Programming", value: 3, dx: 180, dy: 330, mx: 95,  my: 350 },
  { id: "neurobot", label: "NeuroBot",                topic: "Business",    value: 3, dx: 700, dy: 340, mx: 300, my: 340 },
  { id: "founder",  label: "Entrepreneurship",        topic: "Business",    value: 2, dx: 860, dy: 230, mx: 395, my: 465 },
  { id: "product",  label: "Product Design",          topic: "Business",    value: 1, dx: 840, dy: 450, mx: 215, my: 480 },
  { id: "edu",      label: "Education",               topic: "Education",   value: 2, dx: 420, dy: 430, mx: 110, my: 565 },
  { id: "zettel",   label: "Zettelkasten",            topic: "Education",   value: 1, dx: 300, dy: 520, mx: 280, my: 600 },
  { id: "crdt",     label: "Local-first",             topic: "Programming", value: 1, dx: 120, dy: 460, mx: 80,  my: 690 },
];

const GRAPH_EDGES = [
  ["ai", "ml"], ["ai", "llm"], ["ml", "prog"], ["ai", "neurobot"],
  ["neurobot", "founder"], ["neurobot", "product"], ["neurobot", "edu"],
  ["edu", "zettel"], ["prog", "crdt"], ["prog", "edu"], ["founder", "prog"],
];

/* ================= 2. Utils ================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d + "d ago";
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDay(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(iso) {
  return Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function toneClass(tone) {
  return { green: "green", amber: "amber", cyan: "cyan", violet: "violet", rose: "rose", gray: "" }[tone] || "";
}

function chip(text, tone) {
  return '<span class="chip ' + toneClass(tone) + '">' + esc(text) + "</span>";
}

/* ================= 3. Store (localStorage) ================= */

const STORE_KEY = "neurobot.static.v4.data";
const ACTIVITY_LIMIT = 60;

function seedData() {
  const now = Date.now();
  const min = (n) => now - n * 60000;
  const hour = (n) => now - n * 3600000;
  const day = (n) => now - n * 86400000;

  return {
    notes: [
      { id: uid(), kind: "note", title: "Attention is all you need — key takeaways", body: "Self-attention lets every token attend to every other token. Multi-head = parallel subspaces. Positional encoding injects order. One idea reshaped NLP.", category: "AI", createdAt: min(24), pinned: true },
      { id: uid(), kind: "note", title: "Latency budget for v1", body: "p95 under 250ms end-to-end; warm start matters more than cold throughput. Cache the graph snapshot, invalidate on write.", category: "Engineering", createdAt: hour(5) },
      { id: uid(), kind: "note", title: "Questions after 'Thinking, Fast and Slow'", body: "Which recent decisions were System 1? Where do I over-trust small samples? Keep a decision journal for 30 days.", category: "Psychology", createdAt: day(1) },
      { id: uid(), kind: "note", title: "Design partner call — notes", body: "They want Markdown export and an offline mode before adopting. Both feasible post-v1. Follow up Friday with a one-pager.", category: "Business", createdAt: day(2) },
    ],
    ideas: [
      { id: uid(), kind: "idea", title: "Spaced-repetition graph pulses", body: "Nodes softly pulse when their linked notes haven't been reviewed in a while — review becomes ambient instead of a chore.", category: "Learning", status: "exploring", createdAt: min(90), pinned: true },
      { id: uid(), kind: "idea", title: "Weekly brain digest", body: "Auto-compile the week's captures into a one-screen digest: 3 ideas, 2 connections, 1 open goal. Plain text to match the terminal aesthetic.", category: "Product", status: "new", createdAt: hour(8) },
      { id: uid(), kind: "idea", title: "Local-first sync engine", body: "CRDT-backed sync so the brain works offline and merges without conflicts. The server becomes a dumb relay.", category: "Engineering", status: "building", createdAt: day(3) },
      { id: uid(), kind: "idea", title: "Voice capture → auto-linking", body: "60-second voice notes, transcribed and auto-linked to existing nodes. Pairs with the upcoming Live mode.", category: "Product", status: "completed", createdAt: day(5) },
    ],
    goals: [
      { id: uid(), kind: "goal", title: "Finish 'Deep Learning' specialization", body: "5 courses, 2 remaining. Target: 3 sessions/week, notes captured into NeuroBot after each.", progress: 62, deadline: "2026-11-30", status: "active", createdAt: day(12), pinned: true },
      { id: uid(), kind: "goal", title: "Publish 10 technical posts", body: "3 down, 7 to go. One post per topic in the knowledge graph — writing tied back into the brain.", progress: 30, deadline: "2026-12-31", status: "active", createdAt: day(20) },
      { id: uid(), kind: "goal", title: "Prototype the connection engine", body: "Ship the first real (non-demo) similarity pass over captured notes.", progress: 15, deadline: "2026-10-15", status: "active", createdAt: day(6) },
      { id: uid(), kind: "goal", title: "Read 24 books this year", body: "Paused until the specialization finishes. Currently on book 14.", progress: 58, deadline: "2026-12-31", status: "paused", createdAt: day(40) },
    ],
    knowledge: [
      { id: uid(), kind: "knowledge", title: "Transformer architecture", body: "Seq2seq model built entirely on attention — no recurrence, no convolutions. Enables massive parallelism during training.", topic: "AI", source: "arXiv 1706.03762", createdAt: day(4), pinned: true },
      { id: uid(), kind: "knowledge", title: "Gradient descent variants", body: "SGD, momentum, RMSProp, Adam: adaptive learning rates trade generalization for convergence speed.", topic: "Programming", source: "course notes", createdAt: day(6) },
      { id: uid(), kind: "knowledge", title: "CRDTs", body: "Conflict-free replicated data types merge concurrent edits without coordination — the backbone of local-first software.", topic: "Programming", source: "Ink & Switch", createdAt: day(8) },
      { id: uid(), kind: "knowledge", title: "Diffusion models 101", body: "Learn to add noise, learn to reverse it. Sampling is iterative denoising; guidance steers the trajectory.", topic: "AI", source: "paper summary", createdAt: day(9) },
      { id: uid(), kind: "knowledge", title: "Compositional memory", body: "Episodic vs semantic memory in humans maps cleanly onto notes vs distilled knowledge in a second brain.", topic: "Science", source: "reading notes", createdAt: day(11) },
      { id: uid(), kind: "knowledge", title: "Second-brain methodology", body: "Capture → organize → distill → express. The value is in retrieval speed, not storage.", topic: "Business", source: "BASB", createdAt: day(13) },
      { id: uid(), kind: "knowledge", title: "Spaced repetition", body: "Expanding intervals at the edge of forgetting maximize retention per review minute.", topic: "Education", source: "SM-2 algorithm", createdAt: day(14) },
      { id: uid(), kind: "knowledge", title: "Zettelkasten", body: "Atomic notes + explicit links = emergent structure. Writing is thinking made visible.", topic: "Education", source: "Luhmann method", createdAt: day(16) },
    ],
    activity: [
      { id: uid(), kind: "note", title: "Note captured: Attention is all you need — key takeaways", createdAt: min(24) },
      { id: uid(), kind: "idea", title: "Idea logged: Spaced-repetition graph pulses", createdAt: min(90) },
      { id: uid(), kind: "note", title: "Note edited: Latency budget for v1", createdAt: hour(5) },
      { id: uid(), kind: "knowledge", title: "Knowledge captured: Transformer architecture", createdAt: day(4) },
      { id: uid(), kind: "goal", title: "Goal updated: Prototype the connection engine", createdAt: day(6) },
      { id: uid(), kind: "note", title: "Note captured: Design partner call — notes", createdAt: day(2) },
      { id: uid(), kind: "idea", title: "Idea logged: Local-first sync engine", createdAt: day(3) },
      { id: uid(), kind: "note", title: "Note captured: Questions after 'Thinking, Fast and Slow'", createdAt: day(1) },
    ],
  };
}

function blankData() {
  return { notes: [], ideas: [], goals: [], knowledge: [], activity: [] };
}

const store = {
  data: null,
  listeners: new Set(),

  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.notes) && Array.isArray(p.ideas) && Array.isArray(p.goals)
          && Array.isArray(p.knowledge) && Array.isArray(p.activity)) {
          this.data = p;
          return;
        }
      }
    } catch (e) { /* corrupted → reseed */ }
    this.data = seedData();
    this.persist();
  },

  persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* full/blocked */ }
  },

  onChange(fn) { this.listeners.add(fn); },

  emit() {
    this.persist();
    this.listeners.forEach((fn) => fn());
  },

  list(kind) { return this.data[kind === "knowledge" ? "knowledge" : kind + "s"]; },

  find(kind, id) { return this.list(kind).find((x) => x.id === id); },

  add(kind, fields) {
    const now = Date.now();
    const item = Object.assign({ id: uid(), kind, createdAt: now }, fields);
    this.list(kind).unshift(item);
    this.data.activity.unshift({
      id: uid(), kind,
      title: KINDS[kind].label[0].toUpperCase() + KINDS[kind].label.slice(1) + " " + KINDS[kind].verb + ": " + item.title,
      createdAt: now,
    });
    this.data.activity = this.data.activity.slice(0, ACTIVITY_LIMIT);
    this.emit();
    return item;
  },

  update(kind, id, patch) {
    const item = this.find(kind, id);
    if (item) Object.assign(item, patch);
    this.emit();
  },

  /* Remove + return an undo closure restoring the item at its old index. */
  remove(kind, id) {
    const arr = this.list(kind);
    const idx = arr.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const removed = arr[idx];
    arr.splice(idx, 1);
    this.emit();
    return () => {
      if (arr.some((x) => x.id === id)) return;
      arr.splice(Math.min(idx, arr.length), 0, removed);
      this.emit();
    };
  },

  removeActivity(id) {
    this.data.activity = this.data.activity.filter((a) => a.id !== id);
    this.emit();
  },

  togglePin(kind, id) {
    const item = this.find(kind, id);
    if (item) { item.pinned = !item.pinned; this.emit(); }
  },

  resetDemo() { this.data = seedData(); this.emit(); },
  clearAll() { this.data = blankData(); this.emit(); },
};

function computeStats(data) {
  const all = [...data.notes, ...data.ideas, ...data.goals, ...data.knowledge];
  const counts = new Map();
  for (const it of all) {
    const k = dayKey(it.createdAt);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayKey(Date.now() - i * 86400000));
  const sparkline = days.map((d) => counts.get(d) || 0);

  let streak = 0;
  if (sparkline[13] > 0 || sparkline[12] > 0) {
    for (let i = sparkline[13] > 0 ? 13 : 12; i >= 0; i--) {
      if (sparkline[i] > 0) streak++;
      else break;
    }
  }
  return { total: all.length, streak, sparkline, monthTotal: sparkline.reduce((a, b) => a + b, 0) };
}

function pinnedItems() {
  const out = [];
  for (const kind of ["note", "idea", "goal", "knowledge"]) {
    for (const it of store.list(kind)) {
      if (it.pinned) out.push({ kind, id: it.id, title: it.title, createdAt: it.createdAt });
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/* ================= 4. Prefs ================= */

const PREFS_KEY = "neurobot.static.v4.prefs";

const prefs = {
  compact: false, grid: true, motion: true, collapsed: false,
  notifications: { digest: true, connections: true, goals: false },
  privacy: { localOnly: true, telemetry: false },

  load() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) Object.assign(this, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    this.apply();
  },

  save() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        compact: this.compact, grid: this.grid, motion: this.motion,
        collapsed: this.collapsed, notifications: this.notifications, privacy: this.privacy,
      }));
    } catch (e) { /* ignore */ }
  },

  apply() {
    const de = document.documentElement;
    de.dataset.compact = this.compact ? "on" : "off";
    de.dataset.grid = this.grid ? "on" : "off";
    de.dataset.motion = this.motion ? "on" : "off";
  },

  set(key, value) {
    this[key] = value;
    this.save();
    this.apply();
  },
};

/* ================= 5. Toasts ================= */

function toast(msg, opts = {}) {
  const wrap = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = "<span>" + esc(msg) + "</span>" +
    (opts.undo ? '<button class="undo" type="button">Undo</button>' : "");
  if (opts.undo) {
    $(".undo", el).addEventListener("click", () => {
      opts.undo();
      dismiss();
    });
  }
  wrap.appendChild(el);
  let gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }
  setTimeout(dismiss, opts.undo ? 6000 : 3200);
}

/* ================= 6. Overlays (modal / palette / drawer) ================= */

function openOverlay(html, opts = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = '<div class="modal ' + (opts.wide ? "wide " : "") + (opts.cls || "") +
    '" role="dialog" aria-modal="true">' + html + "</div>";
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) closeOverlay();
  });
  $("#overlay").appendChild(backdrop);
  const prev = document.activeElement;
  overlayState.push({ backdrop, prev });
  const focusable = $("input, select, textarea, button", backdrop);
  if (focusable && !opts.noAutoFocus) focusable.focus();
  return backdrop;
}

const overlayState = [];

function closeOverlay() {
  const top = overlayState.pop();
  if (!top) return;
  top.backdrop.remove();
  if (top.prev && top.prev.focus) top.prev.focus();
}

function closeAllOverlays() {
  while (overlayState.length) closeOverlay();
}

function modalShell(title, sub, bodyHtml, footHtml, wide) {
  return '<div class="modal-head"><div><div class="t">' + esc(title) + '</div>' +
    (sub ? '<div class="sub">$ ' + esc(sub) + "</div>" : "") +
    '</div><button class="x" type="button" data-action="close-overlay" aria-label="Close">✕</button></div>' +
    '<div class="modal-body">' + bodyHtml + "</div>" +
    (footHtml ? '<div class="modal-foot">' + footHtml + "</div>" : "");
}

/* Confirm dialog → Promise<boolean> */
function confirmDialog({ title, body, confirmLabel, danger }) {
  return new Promise((resolve) => {
    const backdrop = openOverlay(
      modalShell(title, "confirm --danger=" + (danger ? "true" : "false"),
        '<p class="confirm-body">' + esc(body) + "</p>",
        '<button class="btn ghost sm" type="button" data-x="no">Cancel</button>' +
        '<button class="btn sm ' + (danger ? "danger" : "primary") + '" type="button" data-x="yes">' + esc(confirmLabel || "Confirm") + "</button>"),
      { noAutoFocus: true },
    );
    $("[data-x='no']", backdrop).addEventListener("click", () => { closeOverlay(); resolve(false); });
    $("[data-x='yes']", backdrop).addEventListener("click", () => { closeOverlay(); resolve(true); });
  });
}

/* ---------- Capture / edit modal ---------- */

function captureModal(kind, editId) {
  const meta = KINDS[kind];
  const item = editId ? store.find(kind, editId) : null;
  const isGoal = kind === "goal";
  const isIdea = kind === "idea";
  const isKnow = kind === "knowledge";

  const catOpts = (sel) => CATEGORIES.map((c) =>
    '<option value="' + esc(c) + '"' + (c === sel ? " selected" : "") + ">" + esc(c) + "</option>").join("");
  const topicOpts = (sel) => TOPICS.map((t) =>
    '<option value="' + esc(t) + '"' + (t === sel ? " selected" : "") + ">" + esc(t) + "</option>").join("");
  const ideaStOpts = (sel) => IDEA_STATUSES.map((s) =>
    '<option value="' + s.value + '"' + (s.value === sel ? " selected" : "") + ">" + s.label + "</option>").join("");
  const goalStOpts = (sel) => GOAL_STATUSES.map((s) =>
    '<option value="' + s.value + '"' + (s.value === sel ? " selected" : "") + ">" + s.label + "</option>").join("");

  let fields = "";
  fields += '<div class="field"><label>' + (isKnow ? "Concept" : "Title") + '</label>' +
    '<input name="title" required maxlength="120" placeholder="' +
    (isIdea ? "What surfaced?" : isKnow ? "e.g. Transformer architecture" : "Title…") +
    '" value="' + esc(item ? item.title : "") + '"></div>';
  fields += '<div class="field"><label>Details</label>' +
    '<textarea name="body" rows="3" placeholder="Add context so future-you can retrieve it…">' + esc(item ? item.body || "" : "") + "</textarea></div>";

  if (isKnow) {
    fields += '<div class="form-row">' +
      '<div class="field"><label>Topic</label><select name="topic">' + topicOpts(item ? item.topic : TOPICS[0]) + "</select></div>" +
      '<div class="field"><label>Source (optional)</label><input name="source" placeholder="book, paper, url…" value="' + esc(item ? item.source : "") + '"></div></div>';
  } else if (!isGoal) {
    fields += '<div class="field"><label>Category</label><select name="category">' + catOpts(item ? item.category : "General") + "</select></div>";
  }
  if (isIdea) {
    fields += '<div class="field"><label>Status</label><select name="status">' + ideaStOpts(item ? item.status : "new") + "</select></div>";
  }
  if (isGoal) {
    fields += '<div class="form-row">' +
      '<div class="field"><label>Progress — <span class="prog-val">' + (item ? item.progress : 0) + '</span>%</label>' +
      '<div class="range-row"><input type="range" name="progress" min="0" max="100" step="5" value="' + (item ? item.progress : 0) + '"></div></div>' +
      '<div class="field"><label>Deadline</label><input type="date" name="deadline" value="' + esc(item ? item.deadline : "") + '"></div></div>';
    fields += '<div class="field"><label>Status</label><select name="status">' + goalStOpts(item ? item.status : "active") + "</select></div>";
  }

  const foot = '<button class="btn ghost sm" type="button" data-action="close-overlay">Cancel</button>' +
    '<button class="btn primary sm" type="submit">' + (item ? "Save changes" : "Save to brain") + "</button>";

  const backdrop = openOverlay(modalShell(
    item ? "Edit " + meta.label : "New " + meta.label,
    item ? "neurobot edit --kind " + kind : "neurobot capture --kind " + kind,
    '<form id="capture-form">' + fields + "</form>",
    foot,
  ));
  const form = $("#capture-form", backdrop);
  const range = form.querySelector("input[name=progress]");
  if (range) {
    range.addEventListener("input", () => {
      $(".prog-val", form).textContent = range.value;
    });
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    if (!title) return;
    const body = String(fd.get("body") || "").trim();

    if (kind === "note") {
      const fields2 = { title, body, category: String(fd.get("category") || "General") };
      item ? store.update("note", item.id, fields2) : store.add("note", fields2);
    } else if (kind === "idea") {
      const fields2 = { title, body, category: String(fd.get("category") || "General"), status: String(fd.get("status") || "new") };
      item ? store.update("idea", item.id, fields2) : store.add("idea", fields2);
    } else if (kind === "goal") {
      const fields2 = {
        title, body,
        progress: Number(fd.get("progress") || 0),
        deadline: String(fd.get("deadline") || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
        status: String(fd.get("status") || "active"),
      };
      item ? store.update("goal", item.id, fields2) : store.add("goal", fields2);
    } else {
      const fields2 = {
        title, body,
        topic: String(fd.get("topic") || TOPICS[0]),
        source: String(fd.get("source") || "").trim() || "captured manually",
      };
      item ? store.update("knowledge", item.id, fields2) : store.add("knowledge", fields2);
    }
    closeOverlay();
    toast(item ? meta.label + " updated." : meta.label + " captured to your brain.");
  });
}

/* ---------- Live modal ---------- */

function liveModal() {
  const bars = Array.from({ length: 14 }, (_, i) =>
    '<span class="bar" style="height:' + (18 + (i % 5) * 9) + 'px;animation-delay:' + (i * 0.09).toFixed(2) + 's"></span>').join("");
  openOverlay(modalShell("NeuroBot Live", "live --mode voice",
    '<div class="live-pop"><p class="live-lede">Real-time voice conversations are coming soon.</p>' +
    '<div class="mic-visual" aria-hidden="true">' + bars + "</div>" +
    '<p class="live-note">Phase 2 will let you talk to your brain out loud. For now, everything works through capture — no fake demos here.</p></div>',
    '<button class="btn primary sm" type="button" data-action="close-overlay">Got it</button>'));
}

/* ---------- Credits popup ---------- */

function creditsModal() {
  openOverlay(modalShell("Credits", "whoami",
    '<div class="credit-pop">' +
    '<div class="who">' +
    '<div class="crafted">Crafted by</div>' +
    '<div class="name">' + esc(OWNER_NAME.toUpperCase()) + '<span class="caret">▍</span></div>' +
    '<div class="role">designer &amp; builder of this second brain</div></div>' +
    '<div class="chips">' + chip("terminal ui", "green") + chip("knowledge graph", "cyan") + chip("local-first", "violet") + chip("v4 static", "amber") + "</div>" +
    '<div class="term-line"><span class="cmd">$ whoami</span> → ' + esc(OWNER_NAME.toLowerCase().replace(" ", "")) + "</div>" +
    "</div>",
    '<button class="btn primary sm" type="button" data-action="close-overlay">Close</button>'));
}

/* ---------- Command palette ---------- */

let paletteSel = 0;
let paletteItems = [];

function paletteData() {
  const q = ($("#palette-input")?.value || "").trim().toLowerCase();
  const pages = NAV.map((n) => ({
    group: "Navigate", icon: n.icon, label: n.label, hint: n.glyph,
    run: () => { location.hash = n.path; },
  }));
  const captures = Object.keys(KINDS).map((k) => ({
    group: "Capture", icon: KINDS[k].icon, label: "New " + KINDS[k].label, hint: "c " + k[0],
    run: () => captureModal(k),
  }));
  const actions = [
    { group: "Actions", icon: "⌁", label: "NeuroBot Live", hint: "voice soon", run: liveModal },
    { group: "Actions", icon: "✍", label: "Credits", hint: "whoami", run: creditsModal },
    { group: "Actions", icon: "?", label: "Keyboard shortcuts", hint: "?", run: shortcutsModal },
    { group: "Actions", icon: "⤓", label: "Export brain as JSON", hint: "settings", run: exportJson },
  ];
  let memories = [];
  if (q) {
    for (const kind of ["note", "idea", "goal", "knowledge"]) {
      for (const it of store.list(kind)) {
        const hay = (it.title + " " + (it.body || "")).toLowerCase();
        if (hay.includes(q)) {
          memories.push({
            group: "Memories", icon: KINDS[kind].icon, label: it.title, hint: KINDS[kind].label,
            run: () => { location.hash = KINDS[kind].page; },
          });
        }
      }
    }
    memories = memories.slice(0, 6);
  }
  const all = [...pages, ...captures, ...actions, ...memories];
  return q
    ? all.filter((i) => i.group === "Memories" || i.label.toLowerCase().includes(q))
    : all;
}

function renderPaletteList() {
  const list = $("#palette-list");
  if (!list) return;
  paletteItems = paletteData();
  paletteSel = Math.min(paletteSel, Math.max(0, paletteItems.length - 1));
  if (!paletteItems.length) {
    list.innerHTML = '<div class="palette-empty">no matches — try another word</div>';
    return;
  }
  let html = "";
  let lastGroup = null;
  paletteItems.forEach((item, i) => {
    if (item.group !== lastGroup) {
      html += '<div class="group">' + item.group + "</div>";
      lastGroup = item.group;
    }
    html += '<div class="item' + (i === paletteSel ? " sel" : "") + '" data-idx="' + i + '">' +
      '<span class="icon">' + item.icon + '</span><span class="lbl">' + esc(item.label) + '</span>' +
      '<span class="hint">' + esc(item.hint || "") + "</span></div>";
  });
  list.innerHTML = html;
  const sel = $(".item.sel", list);
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  openOverlay(
    '<div class="palette-search"><input id="palette-input" placeholder="Search pages, memories, actions…" autocomplete="off"></div>' +
    '<div class="palette-list" id="palette-list"></div>' +
    '<div class="palette-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> navigate</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">esc</span> close</span></div>',
    { cls: "palette" },
  );
  paletteSel = 0;
  renderPaletteList();
  const input = $("#palette-input");
  input.addEventListener("input", () => { paletteSel = 0; renderPaletteList(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); renderPaletteList(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPaletteList(); }
    else if (e.key === "Enter") { e.preventDefault(); const it = paletteItems[paletteSel]; if (it) { closeOverlay(); it.run(); } }
  });
  $$("#palette-list .item").forEach((el) => {
    el.addEventListener("click", () => {
      const it = paletteItems[Number(el.dataset.idx)];
      if (it) { closeOverlay(); it.run(); }
    });
  });
}

/* ---------- Shortcuts dialog ---------- */

function shortcutsModal() {
  const rows = [
    ["⌘K / Ctrl K", "Open command palette"],
    ["g then d/b/n/i/k/g/c/s", "Go to Dashboard / Brain / Notes / Ideas / Knowledge / Goals / Connections / Settings"],
    ["c then n/i/k/g", "Capture a new note / idea / knowledge / goal"],
    ["?", "This dialog"],
    ["Esc", "Close any overlay or drawer"],
  ];
  openOverlay(modalShell("Keyboard shortcuts", "help --keys",
    '<div class="shortcut-rows">' + rows.map((r) =>
      '<div class="sc-row"><span class="kbd">' + esc(r[0]) + '</span><span class="sc-desc">' + esc(r[1]) + "</span></div>").join("") + "</div>",
    '<button class="btn primary sm" type="button" data-action="close-overlay">Close</button>'));
}

/* ================= 7. Knowledge graph (SVG) ================= */

let graphRO = null;
let graphBucket = "";

function edgePath(ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const sx = ax + (dx / len) * ra, sy = ay + (dy / len) * ra;
  const ex = bx - (dx / len) * rb, ey = by - (dy / len) * rb;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const cx = mx - (dy / len) * len * 0.16;
  const cy = my + (dx / len) * len * 0.16;
  return "M " + sx.toFixed(1) + " " + sy.toFixed(1) + " Q " + cx.toFixed(1) + " " + cy.toFixed(1) + " " + ex.toFixed(1) + " " + ey.toFixed(1);
}

function renderGraph(container, variant) {
  const w = container.clientWidth || 800;
  const mobile = w < 560;
  const bucket = mobile ? "m" : "d";
  if (graphBucket === bucket && $("svg", container)) return;

  const vw = mobile ? 480 : 1000;
  const vh = mobile ? 760 : 560;
  const pos = (n) => mobile ? [n.mx, n.my] : [n.dx, n.dy];
  const radius = (n) => 11 + n.value * 5;
  const byId = Object.fromEntries(GRAPH_NODES.map((n) => [n.id, n]));

  let edgesHtml = "";
  for (const [a, b] of GRAPH_EDGES) {
    const na = byId[a], nb = byId[b];
    const [ax, ay] = pos(na), [bx, by] = pos(nb);
    edgesHtml += '<path class="g-edge" data-a="' + a + '" data-b="' + b + '" d="' +
      edgePath(ax, ay, bx, by, radius(na), radius(nb)) + '" stroke="' + (TOPIC_COLORS[na.topic] || "#888") + '" stroke-opacity="0.5" fill="none" stroke-width="1.5"/>';
  }

  let nodesHtml = "";
  for (const n of GRAPH_NODES) {
    const [x, y] = pos(n);
    const r = radius(n);
    const color = TOPIC_COLORS[n.topic] || "#888";
    const labelAbove = mobile ? y > vh - 110 : y > 430;
    const ly = labelAbove ? -r - 10 : r + 17;
    nodesHtml += '<g class="g-node" data-id="' + n.id + '" transform="translate(' + x + "," + y + ')">' +
      '<circle r="' + (r + 6) + '" fill="' + color + '" fill-opacity="0.08" stroke="none"/>' +
      '<circle class="core" r="' + r + '" fill="' + color + '" fill-opacity="0.16" stroke="' + color + '" stroke-width="2"/>' +
      '<circle r="' + Math.max(3, r * 0.22) + '" fill="' + color + '"/>' +
      '<text y="' + ly + '" text-anchor="middle" font-size="' + (mobile ? 11 : 12.5) + '">' + esc(n.label) + "</text></g>";
  }

  const pulsePath = edgePath(...pos(byId.ai), ...pos(byId.neurobot), radius(byId.ai), radius(byId.neurobot));
  const pulse = prefs.motion
    ? '<circle r="4" fill="#2e7d54" opacity="0.9"><animateMotion dur="7s" repeatCount="indefinite" path="' + pulsePath + '"/></circle>'
    : "";

  container.innerHTML =
    '<svg viewBox="0 0 ' + vw + " " + vh + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Knowledge graph (visual demo)">' +
    edgesHtml + nodesHtml + pulse + "</svg>" +
    '<span class="graph-hint">visual demo — links illustrative</span>';
  container.style.aspectRatio = mobile ? "480/700" : "16/10";

  const svg = $("svg", container);
  const wrap = container;
  const setLinked = (id) => {
    svg.classList.add("hovering");
    $$(".g-edge", svg).forEach((p) => {
      if (p.dataset.a === id || p.dataset.b === id) p.classList.add("linked");
    });
    $$(".g-node", svg).forEach((g) => {
      if (g.dataset.id === id ||
        GRAPH_EDGES.some(([a, b]) => (a === id && b === g.dataset.id) || (b === id && a === g.dataset.id))) {
        g.classList.add("linked");
      }
    });
  };
  const clearLinked = () => {
    svg.classList.remove("hovering");
    $$(".linked", svg).forEach((el) => el.classList.remove("linked"));
  };
  $$(".g-node", svg).forEach((g) => {
    g.addEventListener("mouseenter", () => setLinked(g.dataset.id));
    g.addEventListener("mouseleave", clearLinked);
    g.addEventListener("click", () => { clearLinked(); setLinked(g.dataset.id); });
  });

  graphBucket = bucket;
}

function observeGraph(container, variant) {
  if (graphRO) graphRO.disconnect();
  graphBucket = "";
  graphRO = new ResizeObserver(() => renderGraph(container, variant));
  graphRO.observe(container);
  renderGraph(container, variant);
}

function graphLegend() {
  return '<div class="graph-legend">' + Object.entries(TOPIC_COLORS).map(([t, c]) =>
    '<span><i class="dot" style="background:' + c + '"></i>' + esc(t) + "</span>").join("") + "</div>";
}

/* ================= 8. Shell (sidebar / topbar / bottom nav) ================= */

let route = { name: "dashboard", capture: null };
let notifOpen = false;

function renderSidebar() {
  const collapsed = prefs.collapsed;
  $("#sidebar").className = "sidebar" + (route.drawerOpen ? " open" : "");
  $("#sidebar").innerHTML =
    '<div class="sidebar-head">' +
    '<img class="logo" src="assets/logo.svg" alt="NeuroBot logo">' +
    '<div class="brand-block"><div class="brand-name">' + APP_NAME + '</div><a class="tagline" href="#/">' + TAGLINE + "</a></div>" +
    '<button class="collapse-btn" type="button" data-action="collapse" aria-label="Collapse sidebar">' +
    (collapsed ? "»" : "«") + "</button></div>" +
    "<nav>" +
    NAV.map((n) =>
      '<a href="' + n.path + '" data-nav="' + n.id + '" class="' + (route.name === n.id ? "active" : "") + '" title="' + esc(n.label) + '">' +
      '<span class="nav-icon">' + n.icon + "</span>" +
      '<span class="label">' + n.label + '</span>' +
      '<span class="glyph">' + n.glyph + "</span></a>").join("") +
    "</nav>" +
    '<div class="sidebar-foot">' +
    '<div class="row"><span class="avatar">TL</span><div class="col"><div class="name">Tanishq Lalwani</div><div class="sub">local · ' + esc(VERSION) + '</div></div></div>' +
    '<div class="health"><span class="sub-lbl">brain</span><span class="meter"><i style="width:' + brainHealth() + '%"></i></span><span class="pct">' + brainHealth() + '%</span></div>' +
    '<button class="credit" type="button" data-action="open-credits">' + esc(OWNER_CREDIT) + "</button>" +
    "</div>";
}

function brainHealth() {
  const s = computeStats(store.data);
  const base = Math.min(95, 40 + s.total * 2 + s.streak * 4);
  return Math.max(20, base);
}

function renderTopbar() {
  const nav = NAV.find((n) => n.id === route.name) || NAV[0];
  const recent = store.data.activity.slice(0, 5);
  $("#topbar").innerHTML =
    '<button class="menu-btn" type="button" data-action="drawer" aria-label="Open menu">☰</button>' +
    '<div class="crumbs">neurobot ' + esc(nav.glyph) + ' · <b>' + esc(nav.label) + "</b></div>" +
    '<div class="spacer"></div>' +
    '<button class="btn ghost sm search-btn" type="button" data-action="open-palette" aria-label="Search">⌕ <span class="hide-sm">Search</span> <span class="kbd hide-sm">⌘K</span></button>' +
    '<button class="btn sm live-btn" type="button" data-action="open-live">⏺ <span class="hide-sm">Live</span></button>' +
    '<div class="notif-wrap"><button class="btn icon ghost" type="button" data-action="toggle-notifs" aria-label="Notifications">◔' +
    (recent.length ? '<span class="notif-dot"></span>' : "") + "</button>" +
    (notifOpen ? notifPanel(recent) : "") + "</div>" +
    '<button class="btn icon ghost avatar-btn" type="button" data-action="open-credits" aria-label="Credits">TL</button>';
}

function notifPanel(recent) {
  return '<div class="notif-pop panel">' +
    '<div class="notif-head">Notifications <span class="chip amber">soon</span></div>' +
    (recent.length
      ? recent.map((a) => '<div class="notif-row"><span class="ico ' + toneClass(KINDS[a.kind].tone) + '">' + KINDS[a.kind].icon + "</span><span class="what">" + esc(a.title) + "</span></div>").join("")
      : '<div class="notif-empty">nothing yet</div>') +
    '<div class="notif-foot">digest of activity — full alerts ship in Phase 2</div></div>';
}

function renderBottomNav() {
  const items = [
    NAV[0], NAV[1], NAV[2], NAV[3],
    { id: "more", icon: "⋯", label: "More" },
  ];
  $("#bottom-nav").innerHTML = '<div class="row">' + items.map((n) =>
    n.id === "more"
      ? '<button type="button" data-action="drawer"><span class="ico">' + n.icon + '</span><span class="lbl">' + n.label + "</span></button>"
      : '<a href="' + n.path + '" class="' + (route.name === n.id ? "active" : "") + '"><span class="ico">' + n.icon + '</span><span class="lbl">' + n.label + "</span></a>"
  ).join("") + "</div>";
}

function openDrawer() {
  route.drawerOpen = true;
  $("#sidebar").classList.add("open");
  $("#scrim").classList.add("show");
}

function closeDrawer() {
  route.drawerOpen = false;
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("show");
}

function renderShell() {
  const shell = $("#shell");
  shell.classList.toggle("collapsed", prefs.collapsed);
  renderSidebar();
  renderTopbar();
  renderBottomNav();
}

/* ================= 9. Shared page pieces ================= */

function sectionHead(title, opts = {}) {
  return '<div class="section-head"><h2>' + esc(title) + "</h2>" +
    (opts.sub ? '<span class="sub">' + esc(opts.sub) + "</span>" : "") +
    (opts.count !== undefined ? '<span class="count">' + opts.count + "</span>" : "") +
    "</div>";
}

function statCard(icon, label, value, glyph, href) {
  return '<a class="panel stat-card" href="' + href + '">' +
    '<div class="top"><span class="ico">' + icon + "</span>" + esc(label) + "</div>" +
    '<div class="value">' + value + '</div><div class="glyph">' + esc(glyph) + "</div></a>";
}

function pinFlag(pinned) {
  return pinned ? '<span class="pin-flag">pinned</span>' : "";
}

function cardMenu(kind, item, opts = {}) {
  return '<div class="menu-wrap">' +
    '<button class="btn icon ghost menu-btn-c" type="button" data-action="card-menu" aria-label="Actions">⋯</button>' +
    '<div class="menu-pop" hidden>' +
    '<button type="button" data-action="pin" data-kind="' + kind + '" data-id="' + item.id + '">' + (item.pinned ? "◎ Unpin" : "◎ Pin to top") + "</button>" +
    (opts.editable === false ? "" : '<button type="button" data-action="edit" data-kind="' + kind + '" data-id="' + item.id + '">✎ Edit</button>') +
    '<button type="button" class="danger" data-action="delete" data-kind="' + kind + '" data-id="' + item.id + '">✕ Delete<span class="undo-note">undoable</span></button>' +
    "</div></div>";
}

function cardFoot() {
  return "foot";
}

function noteCard(note) {
  return '<article class="card' + (note.pinned ? " pinned" : "") + '">' + pinFlag(note.pinned) +
    '<div class="head"><span class="chip cyan">▤ note</span>' + cardMenu("note", note) + "</div>" +
    "<h3>" + esc(note.title) + "</h3>" +
    (note.body ? '<p class="body">' + esc(note.body) + "</p>" : "") +
    '<div class="foot"><span class="tag">#' + esc(note.category.toLowerCase()) + '</span><span class="when">' + timeAgo(note.createdAt) + "</span></div></article>";
}

function ideaCard(idea) {
  const st = IDEA_STATUSES.find((s) => s.value === idea.status) || IDEA_STATUSES[0];
  return '<article class="card' + (idea.pinned ? " pinned" : "") + '">' + pinFlag(idea.pinned) +
    '<div class="head"><span class="chip amber">✦ idea</span>' + cardMenu("idea", idea) + "</div>" +
    "<h3>" + esc(idea.title) + "</h3>" +
    (idea.body ? '<p class="body">' + esc(idea.body) + "</p>" : "") +
    '<div class="foot"><span class="tag">#' + esc(idea.category.toLowerCase()) + "</span>" + chip(st.label, st.tone) +
    '<span class="when">' + formatDay(idea.createdAt) + "</span></div></article>";
}

function goalCard(goal) {
  const overdue = goal.status === "active" && goal.progress < 100 && daysUntil(goal.deadline) < 0;
  return '<article class="card' + (goal.pinned ? " pinned" : "") + '">' + pinFlag(goal.pinned) +
    '<div class="head"><span class="chip violet">◎ goal</span>' + cardMenu("goal", goal) + "</div>" +
    "<h3>" + esc(goal.title) + "</h3>" +
    (goal.body ? '<p class="body">' + esc(goal.body) + "</p>" : "") +
    '<div class="prog"><div class="row"><span>' + goal.progress + '% complete</span>' +
    '<span class="' + (overdue ? "overdue" : "") + '">◷ ' + formatDate(goal.deadline) + (overdue ? " · overdue" : "") + "</span></div>" +
    '<div class="meter"><i class="' + (overdue ? "overdue" : "") + '" style="width:' + goal.progress + '%"></i></div></div></article>';
}

function knowledgeCard(item) {
  return '<article class="card' + (item.pinned ? " pinned" : "") + '">' + pinFlag(item.pinned) +
    '<div class="head"><span class="chip green">▣ knowledge</span>' + cardMenu("knowledge", item) + "</div>" +
    "<h3>" + esc(item.title) + "</h3>" +
    (item.body ? '<p class="body">' + esc(item.body) + "</p>" : "") +
    '<div class="foot"><span class="tag">#' + esc(item.topic.toLowerCase()) + "</span>" +
    (item.source ? '<span class="src">src: ' + esc(item.source) + "</span>" : "") +
    '<span class="when">' + timeAgo(item.createdAt) + "</span></div></article>";
}

function cardFor(kind, item) {
  return kind === "note" ? noteCard(item) : kind === "idea" ? ideaCard(item)
    : kind === "goal" ? goalCard(item) : knowledgeCard(item);
}

function activityRows() {
  const acts = store.data.activity;
  if (!acts.length) return '<div class="empty"><div class="glyph">∅</div>nothing yet — capture your first thought</div>';
  return acts.map((a) => {
    const meta = KINDS[a.kind];
    return '<div class="act-row"><span class="ico ' + toneClass(meta.tone) + '">' + meta.icon + "</span>" +
      '<span class="what">' + esc(a.title) + '</span><span class="when">' + timeAgo(a.createdAt) + "</span>" +
      '<button class="del" type="button" data-action="del-activity" data-id="' + a.id + '" aria-label="Remove">✕</button></div>';
  }).join("");
}

function quickCaptureHtml() {
  const defs = [
    ["note", "▤", "New Note"],
    ["idea", "✦", "New Idea"],
    ["knowledge", "▣", "Save Thought"],
    ["goal", "◎", "Add Goal"],
  ];
  return '<div class="qc-grid">' + defs.map(([k, ic, lbl]) =>
    '<button class="btn qc-btn" type="button" data-action="capture" data-kind="' + k + '">' +
    '<span class="qc-ico">' + ic + "</span>" + lbl + "</button>").join("") + "</div>";
}

function momentumHtml(stats, nextGoal) {
  const bars = stats.sparkline.map((v, i) => {
    const max = Math.max(1, ...stats.sparkline);
    const h = Math.max(8, (v / max) * 100);
    return "<i" + (i === 13 ? ' class="today"' : "") + ' style="height:' + h + '%"></i>';
  }).join("");
  return '<div class="momentum">' +
    '<span class="flame">▲</span>' +
    '<div><div class="big">' + stats.streak + ' day' + (stats.streak === 1 ? "" : "s") + '</div><div class="cap">capture streak</div></div>' +
    '<div class="right"><div class="big">' + stats.monthTotal + '</div><div class="cap">last 14 days</div></div></div>' +
    '<div class="sparkbars" aria-hidden="true">' + bars + '</div>' +
    '<div class="spark-axis"><span>14d ago</span><span>today</span></div>' +
    (nextGoal
      ? '<div class="next-deadline"><div class="cap">next deadline</div><div class="nd-title">' + esc(nextGoal.title) + "</div>" +
        '<div class="nd-meta">' + formatDate(nextGoal.deadline) + " · " + daysUntil(nextGoal.deadline) + "d left</div></div>"
      : "");
}

/* ================= 10. Pages ================= */

const ui = { search: "", filter: "all", noteCat: "all", goalSort: "deadline" };

function pageDashboard() {
  const stats = computeStats(store.data);
  const activeGoals = store.data.goals.filter((g) => g.status === "active").length;
  const nextGoal = store.data.goals.filter((g) => g.status === "active")
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))[0];
  const pinned = pinnedItems();
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  return '<div class="page">' +
    '<div class="boot"><span class="path">neurobot@local ~ $</span> brain --status <span class="online"><span class="dot-online"></span>online</span></div>' +
    "<h1 class='greeting'>" + greeting + " 👋</h1>" +
    '<p class="greeting-sub">Your second brain is ready. What should we think about today?</p>' +

    '<div class="window"><div class="window-bar"><span class="dots"><i></i><i></i><i></i></span>' +
    '<span class="title">neural_map.json — knowledge graph (visual demo)</span>' +
    '<a class="right" href="#/connections">expand →</a></div>' +
    '<div class="window-body"><div id="dash-graph" class="graph-wrap term-dots"></div>' + graphLegend() + "</div></div>" +

    '<div class="panel pad">' +
    '<div class="mini-cap">⚡ ask your brain <span class="hide-sm demo-note">demo — retrieval ships in Phase 2</span></div>' +
    '<form class="ask" id="ask-form"><span class="prompt">&gt;</span>' +
    '<input id="ask-input" placeholder="Ask your brain anything…" autocomplete="off">' +
    '<span class="caret" id="ask-caret" hidden>▍</span>' +
    '<button class="mic" type="button" data-action="voice-demo" aria-label="Voice (coming soon)">♪</button>' +
    '<button class="btn primary sm" type="submit">Send</button></form></div>' +

    '<div class="stats-grid-x4">' +
    statCard("▣", "Knowledge", store.data.knowledge.length, "~/knowledge", "#/knowledge") +
    statCard("✦", "Ideas", store.data.ideas.length, "~/ideas", "#/ideas") +
    statCard("◎", "Active Goals", activeGoals, "~/goals", "#/goals") +
    statCard("⁂", "Connections", GRAPH_EDGES.length, "~/links", "#/connections") +
    "</div>" +

    '<div><div class="section-head"><h2>Quick Capture</h2><span class="sub">one keystroke from brain to store</span></div>' +
    quickCaptureHtml() + "</div>" +

    '<div class="two-col">' +
    "<div>" + sectionHead("Momentum") + '<div class="panel pad">' + momentumHtml(stats, nextGoal) + "</div></div>" +
    "<div>" + sectionHead("Recent Activity", { count: store.data.activity.length }) +
    '<div class="window"><div class="window-bar"><span class="dots"><i></i><i></i><i></i></span><span class="title">activity.log</span></div>' +
    '<div class="window-body flush divided" id="activity-list">' + activityRows() + "</div></div></div></div>" +

    (pinned.length
      ? '<div>' + sectionHead("Pinned", { count: pinned.length, sub: "kept at the top of your brain" }) +
        '<div class="pin-strip">' + pinned.map((p) =>
          '<a class="mini" href="' + KINDS[p.kind].page + '"><div class="k">' + KINDS[p.kind].icon + " " + p.kind + '</div><div class="t">' + esc(p.title) + "</div></a>").join("") + "</div></div>"
      : "") +

    '<div class="panel pad intro"><div class="grid-bg term-grid"></div><div class="inner">' +
    "<h2>" + APP_NAME + ' <span class="dim">—</span> <span class="green">' + TAGLINE + "</span></h2>" +
    '<p class="lead">' + APP_NAME + " is not just another chatbot. It is your personal second brain — a place to capture what you learn, connect it to what you already know, and retrieve it the moment you need it. Notes become knowledge, knowledge becomes connections, and connections become insight.</p>" +
    '<div class="pipe"><span class="step">capture</span><span class="arrow">→</span><span class="step">organize</span><span class="arrow">→</span><span class="step">connect</span><span class="arrow">→</span><span class="step">retrieve</span></div>' +
    '<div class="credit-line">' + esc(OWNER_CREDIT) + " — <b>" + esc(OWNER_NAME.toUpperCase()) + "</b></div>" +
    "</div></div>" +

    "<div>" + sectionHead("Coming Soon") +
    '<div class="panel pad nv-card"><div><div class="nv-title">◉ NeuroVision</div>' +
    '<p class="nv-sub">Let ' + APP_NAME + " understand what's on your screen.</p></div>" +
    '<button class="btn sm" type="button" data-action="neurovision">Try NeuroVision</button></div></div>' +
    "</div>";
}

function pageBrain() {
  const q = ui.search.toLowerCase();
  const all = [];
  for (const kind of ["note", "idea", "goal", "knowledge"]) {
    for (const it of store.list(kind)) all.push({ kind, it });
  }
  const filtered = all.filter(({ kind, it }) =>
    (ui.filter === "all" || ui.filter === kind) &&
    (!q || (it.title + " " + (it.body || "")).toLowerCase().includes(q)));
  filtered.sort((a, b) => (b.it.pinned ? 1 : 0) - (a.it.pinned ? 1 : 0) || b.it.createdAt - a.it.createdAt);

  const chips = ["all", "note", "idea", "goal", "knowledge"].map((f) =>
    '<button class="chip' + (ui.filter === f ? " on" : "") + '" type="button" data-action="brain-filter" data-filter="' + f + '">' +
    (f === "all" ? "All" : KINDS[f].plural) + "</button>").join("");

  return '<div class="page">' +
    sectionHead("My Brain", { count: filtered.length + "/" + all.length, sub: "everything you've captured, unified" }) +
    '<div class="toolbar"><div class="search">⌕<input id="brain-search" placeholder="Search all memories…" value="' + esc(ui.search) + '"></div>' +
    '<div class="filters">' + chips + "</div></div>" +
    (filtered.length
      ? '<div class="cards k3">' + filtered.map(({ kind, it }) => cardFor(kind, it)).join("") + "</div>"
      : '<div class="panel"><div class="empty"><div class="glyph">∅</div>no memories match — capture something new</div></div>') +
    '<div class="row-actions"><button class="btn primary sm" type="button" data-action="capture" data-kind="note">▤ New Note</button>' +
    '<button class="btn sm" type="button" data-action="capture" data-kind="idea">✦ New Idea</button>' +
    '<button class="btn sm" type="button" data-action="capture" data-kind="goal">◎ Add Goal</button>' +
    '<button class="btn sm" type="button" data-action="capture" data-kind="knowledge">▣ Save Thought</button></div>' +
    "</div>";
}

function pageNotes() {
  const q = ui.search.toLowerCase();
  const cats = [...new Set(store.data.notes.map((n) => n.category))].sort();
  const notes = store.data.notes.filter((n) =>
    (ui.noteCat === "all" || n.category === ui.noteCat) &&
    (!q || (n.title + " " + (n.body || "")).toLowerCase().includes(q)));
  notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);

  return '<div class="page">' +
    sectionHead("Notes", { count: notes.length, sub: "capture now, refine later" }) +
    '<div class="toolbar">' +
    '<div class="search">⌕<input id="notes-search" placeholder="Search notes…" value="' + esc(ui.search) + '"></div>' +
    '<button class="btn primary sm" type="button" data-action="capture" data-kind="note">＋ New Note</button></div>' +
    (cats.length ? '<div class="filters">' +
      ["all", ...cats].map((c) => '<button class="chip' + (ui.noteCat === c ? " on" : "") + '" type="button" data-action="note-cat" data-cat="' + esc(c) + '">' + (c === "all" ? "All topics" : "#" + esc(c)) + "</button>").join("") + "</div>" : "") +
    (notes.length
      ? '<div class="cards k3">' + notes.map(noteCard).join("") + "</div>"
      : '<div class="panel"><div class="empty"><div class="glyph">▤</div>no notes here yet</div></div>') +
    "</div>";
}

function pageIdeas() {
  const cols = IDEA_STATUSES.map((st) => {
    const items = store.data.ideas.filter((i) => i.status === st.value);
    return '<div class="board-col">' +
      '<div class="board-head"><span class="board-title">' + st.label + '</span><span class="count">' + items.length + "</span></div>" +
      (items.length
        ? '<div class="board-cards">' + items.map(ideaCard).join("") + "</div>"
        : '<div class="board-empty">nothing ' + esc(st.label.toLowerCase()) + " yet</div>") +
      "</div>";
  }).join("");

  return '<div class="page">' +
    sectionHead("Ideas", { count: store.data.ideas.length, sub: "a board for every spark" }) +
    '<div class="toolbar"><span class="sub">status board — move ideas forward</span><span class="spacer"></span>' +
    '<button class="btn primary sm" type="button" data-action="capture" data-kind="idea">＋ New Idea</button></div>' +
    '<div class="board">' + cols + "</div></div>";
}

function pageKnowledge() {
  const q = ui.search.toLowerCase();
  const filtered = store.data.knowledge.filter((k) =>
    (ui.filter === "all" || ui.filter === k.topic) &&
    (!q || (k.title + " " + (k.body || "")).toLowerCase().includes(q)));

  const groups = TOPICS.map((t) => ({ topic: t, items: filtered.filter((k) => k.topic === t) }))
    .filter((g) => g.items.length);

  return '<div class="page">' +
    sectionHead("Knowledge", { count: filtered.length, sub: "distilled, grouped by topic" }) +
    '<div class="toolbar">' +
    '<div class="search">⌕<input id="knowledge-search" placeholder="Search knowledge…" value="' + esc(ui.search) + '"></div>' +
    '<button class="btn primary sm" type="button" data-action="capture" data-kind="knowledge">＋ Save Thought</button></div>' +
    '<div class="filters">' +
    ["all", ...TOPICS].map((t) => '<button class="chip' + (ui.filter === t ? " on" : "") + '" type="button" data-action="topic-filter" data-topic="' + esc(t) + '">' + esc(t) + "</button>").join("") +
    "</div>" +
    (groups.length
      ? groups.map((g) =>
          "<div>" + sectionHead(g.topic, { count: g.items.length }) +
          '<div class="cards k3">' + g.items.map(knowledgeCard).join("") + "</div></div>").join("")
      : '<div class="panel"><div class="empty"><div class="glyph">▣</div>nothing filed under this topic yet</div></div>') +
    "</div>";
}

function pageGoals() {
  const goals = [...store.data.goals].sort((a, b) => {
    if (ui.goalSort === "progress") return b.progress - a.progress;
    return daysUntil(a.deadline) - daysUntil(b.deadline);
  });
  const active = store.data.goals.filter((g) => g.status === "active").length;

  return '<div class="page">' +
    sectionHead("Goals", { count: active + " active", sub: "progress you can see" }) +
    '<div class="toolbar">' +
    '<div class="filters">' +
    '<button class="chip' + (ui.goalSort === "deadline" ? " on" : "") + '" type="button" data-action="goal-sort" data-sort="deadline">by deadline</button>' +
    '<button class="chip' + (ui.goalSort === "progress" ? " on" : "") + '" type="button" data-action="goal-sort" data-sort="progress">by progress</button></div>' +
    '<span class="spacer"></span>' +
    '<button class="btn primary sm" type="button" data-action="capture" data-kind="goal">＋ Add Goal</button></div>' +
    (goals.length
      ? '<div class="cards k2">' + goals.map(goalCard).join("") + "</div>"
      : '<div class="panel"><div class="empty"><div class="glyph">◎</div>no goals set — aim at something</div></div>') +
    "</div>";
}

function pageConnections() {
  return '<div class="page">' +
    sectionHead("Connections", { sub: "how your knowledge links up" }) +
    '<div class="split">' +
    '<div class="window"><div class="window-bar"><span class="dots"><i></i><i></i><i></i></span>' +
    '<span class="title">neural_map.json — full graph (visual demo)</span></div>' +
    '<div class="window-body"><div id="conn-graph" class="graph-wrap wide"></div>' + graphLegend() + "</div></div>" +
    '<div class="panel pad side-panel">' +
    "<h3>What am I looking at?</h3>" +
    '<p class="side-copy">Connections represent relationships between information in your second brain. Right now the graph above is a <b>visual prototype</b> — the links are hand-authored for the demo, not generated by AI.</p>' +
    '<p class="side-copy">In Phase 2, capturing notes and knowledge will let ' + APP_NAME + " suggest real connections between what you already know.</p>" +
    '<div class="side-stats">' +
    '<div class="ss"><div class="ss-v">' + GRAPH_NODES.length + '</div><div class="ss-k">nodes</div></div>' +
    '<div class="ss"><div class="ss-v">' + GRAPH_EDGES.length + '</div><div class="ss-k">links</div></div>' +
    '<div class="ss"><div class="ss-v">' + computeStats(store.data).total + '</div><div class="ss-k">memories</div></div>' +
    "</div>" +
    '<div class="side-note">' + chip("visual demo", "amber") + " no AI claims — honest prototype</div>" +
    "</div></div></div>";
}

function pageSettings() {
  const s = computeStats(store.data);
  const total = s.total;
  let bytes = 0;
  try { bytes = (localStorage.getItem(STORE_KEY) || "").length; } catch (e) { /* ignore */ }

  const toggle = (id, on, label, desc, soon) =>
    '<label class="toggle-row"><span class="toggle-txt"><span class="t">' + esc(label) +
    (soon ? ' <span class="chip amber">soon</span>' : "") + '</span><span class="d">' + esc(desc) + "</span></span>" +
    '<span class="switch"><input type="checkbox" data-pref="' + id + '"' + (on ? " checked" : "") + '><i></i></span></label>';

  return '<div class="page">' +
    sectionHead("Settings", { sub: "tuned locally — everything stays on this device" }) +
    '<div class="settings-grid">' +
    '<div class="panel pad"><h3 class="panel-title">Appearance</h3>' +
    toggle("compact", prefs.compact, "Compact density", "Tighter paddings across cards and lists") +
    toggle("grid", prefs.grid, "Grid backdrop", "Subtle terminal grid behind the app") +
    toggle("motion", prefs.motion, "Motion", "Micro-interactions and graph animations") + "</div>" +
    '<div class="panel pad"><h3 class="panel-title">Notifications <span class="chip amber">coming soon</span></h3>' +
    toggle("n.digest", prefs.notifications.digest, "Weekly brain digest", "One-screen summary of the week's captures", true) +
    toggle("n.connections", prefs.notifications.connections, "New connection found", "When two memories link up", true) +
    toggle("n.goals", prefs.notifications.goals, "Goal nudges", "Deadline reminders for active goals", true) + "</div>" +
    '<div class="panel pad"><h3 class="panel-title">Data</h3>' +
    '<p class="panel-copy">' + total + " memories · " + (bytes / 1024).toFixed(1) + " KB stored in this browser.</p>" +
    '<div class="row-actions">' +
    '<button class="btn sm" type="button" data-action="export">⤓ Export JSON</button>' +
    '<button class="btn sm" type="button" data-action="reset-demo">↺ Reset demo</button>' +
    '<button class="btn sm danger" type="button" data-action="clear-all">✕ Clear all</button></div></div>' +
    '<div class="panel pad"><h3 class="panel-title">Privacy</h3>' +
    toggle("p.localOnly", prefs.privacy.localOnly, "Keep my brain local", "Data never leaves this browser") +
    toggle("p.telemetry", prefs.privacy.telemetry, "Anonymous usage stats", "Disabled by default — nothing is collected", true) + "</div>" +
    "</div>" +
    '<div class="panel pad"><h3 class="panel-title">About ' + APP_NAME + ' <span class="chip">' + esc(VERSION) + "</span></h3>" +
    '<p class="panel-copy">' + APP_NAME + " — " + TAGLINE + " Capture, organize, connect and retrieve your knowledge, ideas and goals. This is a frontend prototype: all data lives in your browser, no AI is wired up yet, and every feature is honestly labeled.</p>" +
    '<div class="row-actions"><button class="btn sm" type="button" data-action="open-credits">✍ Credits</button>' +
    '<span class="credit-inline">' + esc(OWNER_CREDIT) + "</span></div></div>" +
    "</div>";
}

function page404() {
  return '<div class="page">' +
    '<div class="panel pad nf"><div class="nf-code">404</div>' +
    '<div class="nf-line"><span class="path">neurobot@local ~ $</span> cd ' + esc(location.hash.replace("#", "") || "/unknown") + "</div>" +
    '<div class="nf-line err">cd: no such directory in this brain</div>' +
    '<a class="btn primary sm" href="#/">← Back to Dashboard</a></div></div>';
}

const PAGES = {
  dashboard: pageDashboard, brain: pageBrain, notes: pageNotes, ideas: pageIdeas,
  knowledge: pageKnowledge, goals: pageGoals, connections: pageConnections, settings: pageSettings,
};

/* ================= 11. Data actions ================= */

function exportJson() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "neurobot-export.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Brain exported as JSON.");
}

function deleteItem(kind, id) {
  const undo = store.remove(kind, id);
  if (undo) toast(KINDS[kind].label + " deleted.", { undo });
  rerender();
}

/* ================= 12. Router & render ================= */

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = raw.split("?");
  const params = new URLSearchParams(queryPart || "");
  const clean = pathPart.replace(/\/+$/, "") || "/";
  const found = NAV.find((n) => n.path.replace("#", "") === clean);
  return { name: found ? found.id : (clean === "/" ? "dashboard" : "404"), capture: params.get("capture") };
}

function rerender() {
  renderShell();
  const main = $("#content");
  const fn = PAGES[route.name];
  main.innerHTML = fn ? fn() : page404();

  /* page-specific wiring */
  if (route.name === "dashboard") {
    observeGraph($("#dash-graph"), "card");
    bindAsk();
    bindSearchInput("#brain-search", null); // none
  }
  if (route.name === "connections") observeGraph($("#conn-graph"), "wide");
  if (route.name === "brain") bindSearchInput("#brain-search", (v) => { ui.search = v; renderContentOnly(); });
  if (route.name === "notes") bindSearchInput("#notes-search", (v) => { ui.search = v; renderContentOnly(); });
  if (route.name === "knowledge") bindSearchInput("#knowledge-search", (v) => { ui.search = v; renderContentOnly(); });
  if (route.onPage) { route.onPage(); route.onPage = null; }

  /* deep link ?capture=kind */
  if (route.capture && KINDS[route.capture]) {
    captureModal(route.capture);
    route.capture = null;
    history.replaceState(null, "", location.pathname + location.search + "#/" + (route.name === "dashboard" ? "" : route.name));
  }

  if (notifOpen) {
    document.addEventListener("mousedown", notifOutside, { once: true });
  }
}

function renderContentOnly() {
  const scroll = window.scrollY;
  rerender();
  window.scrollTo(0, scroll);
}

function bindSearchInput(sel, onChange) {
  const input = $(sel);
  if (!input || !onChange) return;
  input.addEventListener("input", () => onChange(input.value));
}

function bindAsk() {
  const form = $("#ask-form");
  if (!form) return;
  const input = $("#ask-input");
  const caret = $("#ask-caret");
  input.addEventListener("input", () => { caret.hidden = !input.value; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    toast("Prototype — retrieval arrives in Phase 2. Capture works today!");
    input.value = "";
    caret.hidden = true;
  });
}

function navigate(name) {
  closeDrawer();
  ui.search = "";
  ui.filter = "all";
  ui.noteCat = "all";
  const target = NAV.find((n) => n.id === name);
  if (target) location.hash = target.path;
  else rerender();
}

function onRouteChange() {
  const parsed = parseHash();
  const changed = parsed.name !== route.name || parsed.capture !== route.capture;
  route = { name: parsed.name, capture: parsed.capture, drawerOpen: false };
  notifOpen = false;
  if (changed || !$("#content").children.length) rerender();
  closeDrawer();
  window.scrollTo(0, 0);
}

/* ================= 13. Global event delegation ================= */

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action],[data-nav]");
  if (!t) {
    /* close any open card menus when clicking elsewhere */
    $$(".menu-pop").forEach((p) => { p.hidden = true; });
    return;
  }
  const act = t.dataset.action;

  if (t.dataset.nav) {
    /* links handle themselves; close drawer */
    closeDrawer();
    return;
  }

  if (act === "card-menu") {
    const pop = t.nextElementSibling;
    const wasOpen = !pop.hidden;
    $$(".menu-pop").forEach((p) => { p.hidden = true; });
    pop.hidden = wasOpen;
    e.stopPropagation();
    return;
  }

  switch (act) {
    case "drawer": route.drawerOpen ? closeDrawer() : openDrawer(); break;
    case "collapse":
      prefs.set("collapsed", !prefs.collapsed);
      renderShell();
      break;
    case "open-palette": openPalette(); break;
    case "close-overlay": closeOverlay(); break;
    case "open-live": liveModal(); break;
    case "open-credits": creditsModal(); break;
    case "capture": captureModal(t.dataset.kind); break;
    case "edit": captureModal(t.dataset.kind, t.dataset.id); break;
    case "pin":
      store.togglePin(t.dataset.kind, t.dataset.id);
      toast(t.dataset.kind + (store.find(t.dataset.kind, t.dataset.id)?.pinned ? " pinned." : " unpinned."));
      break;
    case "delete": deleteItem(t.dataset.kind, t.dataset.id); break;
    case "del-activity":
      store.removeActivity(t.dataset.id);
      toast("Activity entry removed.");
      break;
    case "voice-demo": toast("Voice input is coming soon — try the Live button."); break;
    case "neurovision": toast("NeuroVision is coming soon."); break;
    case "toggle-notifs":
      notifOpen = !notifOpen;
      renderTopbar();
      if (notifOpen) document.addEventListener("mousedown", notifOutside, { once: true });
      break;
    case "brain-filter": ui.filter = t.dataset.filter; renderContentOnly(); break;
    case "topic-filter": ui.filter = t.dataset.topic; renderContentOnly(); break;
    case "note-cat": ui.noteCat = t.dataset.cat; renderContentOnly(); break;
    case "goal-sort": ui.goalSort = t.dataset.sort; renderContentOnly(); break;
    case "export": exportJson(); break;
    case "reset-demo":
      confirmDialog({
        title: "Reset to demo data?",
        body: "This replaces everything you've captured with the original demo dataset. Export a backup first if you want to keep it.",
        confirmLabel: "Reset",
      }).then((yes) => {
        if (yes) { store.resetDemo(); toast("Demo data reset."); }
      });
      break;
    case "clear-all":
      confirmDialog({
        title: "Clear all data?",
        body: "Permanently deletes every note, idea, goal and knowledge item from this browser. This cannot be undone.",
        confirmLabel: "Delete everything",
        danger: true,
      }).then((yes) => {
        if (yes) { store.clearAll(); toast("All data cleared — a blank brain awaits."); }
      });
      break;
  }
});

function notifOutside(e) {
  if (!e.target.closest(".notif-wrap")) {
    notifOpen = false;
    renderTopbar();
  } else {
    document.addEventListener("mousedown", notifOutside, { once: true });
  }
}

/* prefs toggles in Settings */
document.addEventListener("change", (e) => {
  const input = e.target.closest("[data-pref]");
  if (!input) return;
  const key = input.dataset.pref;
  const on = input.checked;
  if (key === "compact" || key === "grid" || key === "motion") {
    prefs.set(key, on);
    renderShell();
    renderContentOnly();
  } else if (key.startsWith("n.")) {
    prefs.notifications[key.slice(2)] = on;
    prefs.save();
  } else if (key.startsWith("p.")) {
    prefs.privacy[key.slice(2)] = on;
    prefs.save();
    if (key === "p.telemetry" && on) toast("Telemetry stays off in this prototype — toggle remembered.");
  }
});

/* close card menus on any click inside menu (choose action → menu closes) */
document.addEventListener("click", (e) => {
  if (e.target.closest(".menu-pop")) {
    setTimeout(() => $$(".menu-pop").forEach((p) => { p.hidden = true; }), 50);
  }
}, true);

/* ================= 14. Hotkeys ================= */

let seq = null;
let seqTimer = null;

const GO_MAP = { d: "dashboard", b: "brain", n: "notes", i: "ideas", k: "knowledge", g: "goals", c: "connections", s: "settings" };
const CAP_MAP = { n: "note", i: "idea", k: "knowledge", g: "goal" };

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    overlayState.length ? closeAllOverlays() : openPalette();
    return;
  }
  if (e.key === "Escape") {
    if (overlayState.length) { closeAllOverlays(); return; }
    closeDrawer();
    if (notifOpen) { notifOpen = false; renderTopbar(); }
    return;
  }
  const tag = (e.target.tagName || "").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  if (typing || overlayState.length) return;

  if (seq === "g" && GO_MAP[e.key.toLowerCase()]) {
    navigate(GO_MAP[e.key.toLowerCase()]);
    seq = null;
    return;
  }
  if (seq === "c" && CAP_MAP[e.key.toLowerCase()]) {
    captureModal(CAP_MAP[e.key.toLowerCase()]);
    seq = null;
    return;
  }
  seq = null;

  if (e.key === "g" || e.key === "c") {
    seq = e.key.toLowerCase();
    clearTimeout(seqTimer);
    seqTimer = setTimeout(() => { seq = null; }, 1600);
    return;
  }
  if (e.key === "?") { shortcutsModal(); }
});

/* ================= 15. Boot ================= */

function boot() {
  store.load();
  prefs.load();
  store.onChange(() => {
    /* re-render active page + shell data without losing scroll position */
    renderContentOnly();
  });

  route = Object.assign(route, parseHash());
  window.addEventListener("hashchange", onRouteChange);
  onRouteChange();
}

boot();
