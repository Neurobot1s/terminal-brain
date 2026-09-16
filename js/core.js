/* NeuroBot — core.js (classic script, exposes window.NB). No build step. */
(function () {
  "use strict";

  var APP_NAME = "NeuroBot";
  var TAGLINE = "Your Second Brain.";

  var NAV_ITEMS = [
    { to: "#/", label: "Dashboard", icon: "◉", glyph: "D" },
    { to: "#/brain", label: "My Brain", icon: "▤", glyph: "B" },
    { to: "#/notes", label: "Notes", icon: "✎", glyph: "N" },
    { to: "#/ideas", label: "Ideas", icon: "✦", glyph: "I" },
    { to: "#/knowledge", label: "Knowledge", icon: "◈", glyph: "K" },
    { to: "#/goals", label: "Goals", icon: "◎", glyph: "G" },
    { to: "#/connections", label: "Connections", icon: "⌬", glyph: "C" },
    { to: "#/settings", label: "Settings", icon: "⚙", glyph: "S" },
  ];

  var ITEM_META = {
    note: { label: "Note", icon: "▤", tone: "cyan" },
    idea: { label: "Idea", icon: "✦", tone: "amber" },
    goal: { label: "Goal", icon: "◎", tone: "violet" },
    knowledge: { label: "Knowledge", icon: "◈", tone: "green" },
  };

  var IDEA_STATUSES = [
    { value: "new", label: "New", tone: "gray" },
    { value: "exploring", label: "Exploring", tone: "cyan" },
    { value: "building", label: "Building", tone: "amber" },
    { value: "completed", label: "Completed", tone: "green" },
  ];

  var GOAL_STATUSES = [
    { value: "active", label: "Active", tone: "green" },
    { value: "paused", label: "Paused", tone: "amber" },
    { value: "completed", label: "Completed", tone: "gray" },
  ];

  var TOPICS = ["AI", "Programming", "Science", "Business", "Education"];
  var CATEGORIES = ["General", "AI", "Engineering", "Product", "Business", "Learning", "Psychology"];

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function timeAgo(ts) {
    var d = Date.now() - ts, m = Math.floor(d / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var dd = Math.floor(h / 24);
    return dd === 1 ? "yesterday" : dd + "d ago";
  }
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function daysUntil(iso) {
    if (!iso) return Infinity;
    var t = new Date(iso + "T00:00:00").getTime();
    return Math.ceil((t - Date.now()) / 86400000);
  }

  /* ---------- store ---------- */
  var KEY = "neurobot.v1.data";
  var BACKUP_KEY = "neurobot.v1.backup";
  var ACTIVITY_LIMIT = 50;
  var _store = null;
  var listeners = [];

  /* Safe storage: some browsers/private modes throw on ANY access. */
  var mem = {};
  var storage = (function () {
    try { var t = "__nb"; localStorage.setItem(t, "1"); localStorage.removeItem(t); return localStorage; }
    catch (e) { return null; }
  })();
  function sGet(k) { if (!storage) return mem[k] || null; try { return storage.getItem(k); } catch (e) { return mem[k] || null; } }
  function sSet(k, v) { mem[k] = v; if (!storage) return; try { storage.setItem(k, v); } catch (e) {} }

  function seed() {
    var now = Date.now();
    var min = function (n) { return now - n * 60000; };
    var hour = function (n) { return now - n * 3600000; };
    var day = function (n) { return now - n * 86400000; };
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
        { id: uid(), kind: "knowledge", title: "Knowledge captured: Transformer architecture", createdAt: day(4) },
      ],
    };
  }

  /* Deep sanitize: guarantees the app never crashes on malformed data
     (hand-edited localStorage, old versions, imported files). */
  function sanitize(s) {
    var out = { notes: [], ideas: [], goals: [], knowledge: [], activity: [] };
    if (!s || typeof s !== "object") return out;
    var lists = { notes: "note", ideas: "idea", goals: "goal", knowledge: "knowledge" };
    Object.keys(lists).forEach(function (key) {
      if (!Array.isArray(s[key])) return;
      out[key] = s[key]
        .filter(function (x) { return x && typeof x.title === "string" && x.title.trim(); })
        .slice(0, 1000)
        .map(function (x) {
          var item = { id: typeof x.id === "string" && x.id ? String(x.id).slice(0, 64) : uid(), kind: lists[key], title: String(x.title).slice(0, 300), createdAt: Number(x.createdAt) || Date.now() };
          if (x.body) item.body = String(x.body).slice(0, 5000);
          if (x.category) item.category = String(x.category).slice(0, 60);
          if (x.topic) item.topic = String(x.topic).slice(0, 60);
          if (x.source) item.source = String(x.source).slice(0, 200);
          if (x.status) item.status = String(x.status).slice(0, 20);
          if (x.progress != null) item.progress = Math.max(0, Math.min(100, Number(x.progress) || 0));
          /* deadline must be a real ISO date — anything else breaks the goals UI */
          if (x.deadline && /^\d{4}-\d{2}-\d{2}$/.test(String(x.deadline).slice(0, 10))) item.deadline = String(x.deadline).slice(0, 10);
          if (x.pinned) item.pinned = true;
          return item;
        });
    });
    if (Array.isArray(s.activity)) {
      /* keep existing ids so rendered delete buttons stay valid across writes */
      out.activity = s.activity.filter(function (a) { return a && typeof a.title === "string"; }).slice(0, ACTIVITY_LIMIT)
        .map(function (a) { return { id: (typeof a.id === "string" && a.id) ? String(a.id).slice(0, 64) : uid(), kind: String(a.kind || "note").slice(0, 20), title: String(a.title).slice(0, 300), createdAt: Number(a.createdAt) || Date.now() }; });
    }
    return out;
  }

  function persist(s) {
    var json = JSON.stringify(s);
    try { storage.setItem(KEY, json); }
    catch (e) {
      /* quota exceeded → try dropping activity first, then give up silently */
      try { storage.setItem(KEY, JSON.stringify(Object.assign({}, s, { activity: [] }))); } catch (e2) {}
    }
    sSet(BACKUP_KEY, json); /* rolling backup, no quota pressure (same try/catch) */
  }
  function load() {
    var raw = null;
    try { raw = storage.getItem(KEY); } catch (e) {}
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          var clean = sanitize(p);
          if (clean.notes.length + clean.ideas.length + clean.goals.length + clean.knowledge.length > 0) return clean;
        }
      } catch (e) { /* corrupted → try backup */ }
      /* corrupted primary → try the rolling backup before reseeding */
      try {
        var braw = storage.getItem(BACKUP_KEY);
        if (braw) {
          var b = sanitize(JSON.parse(braw));
          if (b.notes.length + b.ideas.length + b.goals.length + b.knowledge.length > 0) {
            persist(b);
            window.NB_RECOVERY = "restored from backup";
            return b;
          }
        }
      } catch (e2) { /* fall through to reseed */ }
      window.NB_RECOVERY = "data was corrupted — started fresh";
    }
    var fresh = seed();
    persist(fresh);
    return fresh;
  }

  function getStore() {
    if (!_store) _store = load();
    return _store;
  }
  function setStore(next) {
    _store = sanitize(next);
    persist(_store);
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) {} }
  }
  function onStoreChange(fn) { listeners.push(fn); }
  function mutate(fn) { setStore(fn(getStore())); }

  function logActivity(kind, title) {
    return function (s) {
      var entry = { id: uid(), kind: kind, title: title, createdAt: Date.now() };
      return Object.assign({}, s, { activity: [entry].concat(s.activity).slice(0, ACTIVITY_LIMIT) });
    };
  }

  /* PART2 */
  window.NB = {
    APP_NAME: APP_NAME, TAGLINE: TAGLINE,
    NAV_ITEMS: NAV_ITEMS, ITEM_META: ITEM_META,
    IDEA_STATUSES: IDEA_STATUSES, GOAL_STATUSES: GOAL_STATUSES,
    TOPICS: TOPICS, CATEGORIES: CATEGORIES,
    $: $, $$: $$, el: el, esc: esc, uid: uid,
    timeAgo: timeAgo, formatDate: formatDate, daysUntil: daysUntil,
    getStore: getStore, setStore: setStore, onStoreChange: onStoreChange,
    seed: seed,
    debounce: function (fn, ms) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        if (t) clearTimeout(t);
        t = setTimeout(function () { t = null; fn.apply(self, args); }, ms || 150);
      };
    },
  };
})();
