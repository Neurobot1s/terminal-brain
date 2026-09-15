/* ============================================================
   NeuroBot — main.js
   Router, sidebar/topbar/bottom-nav, command palette, boot.
   ============================================================ */
import {
  $, $$, el, esc,
  NAV_ITEMS, ITEM_META,
  getStore, onStoreChange, totalItems,
  openCapture, openModal,
} from "./core.js";
import { loadPrefs, applyPrefs } from "./prefs.js";
import { askGemini } from "./ai.js";
import { DashboardView } from "./views-dashboard.js";
import { BrainView, NotesView, IdeasView, KnowledgeView, GoalsView } from "./views-collections.js";
import {
  ConnectionsView, SettingsView,
  openCredits, openLive, openNeuroVision,
  setRerender,
} from "./views-misc.js";

/* ---------------- Chrome (sidebar + topbar + bottom nav) ---------------- */

function renderChrome() {
  const path = location.hash || "#/";
  const nav = $("#nav");
  nav.innerHTML = NAV_ITEMS.map(
    (n) => `
    <a class="nav-item ${path === n.to ? "active" : ""}" href="${n.to}">
      <span class="nav-ico">${n.icon}</span>
      <span class="nav-label">${n.label}</span>
      <span class="nav-glyph">${n.glyph}</span>
    </a>`,
  ).join("");

  // Bottom nav (mobile)
  let bottom = $("#bottom-nav");
  if (!bottom) {
    bottom = el(`<nav class="bottom-nav" id="bottom-nav"></nav>`);
    document.querySelector(".main").appendChild(bottom);
  }
  bottom.innerHTML =
    NAV_ITEMS.slice(0, 5)
      .map((n) => {
        const active = path === n.to;
        return `<a href="${n.to}" class="${active ? "active" : ""}">
          <span class="bnav-ico">${n.icon}</span><span>${n.label}</span><span class="bnav-bar"></span>
        </a>`;
      })
      .join("") +
    `<a href="#/settings" class="${path === "#/settings" ? "active" : ""}">
      <span class="bnav-ico">⚙</span><span>More</span><span class="bnav-bar"></span>
    </a>`;

  // Brain health
  const s = getStore();
  const total = totalItems();
  const bh = $("#bh-label");
  const dot = $("#bh-dot");
  if (total >= 12) { bh.textContent = "Brain health: excellent"; dot.className = "bh-dot ok"; }
  else if (total >= 5) { bh.textContent = "Brain health: good"; dot.className = "bh-dot mid"; }
  else { bh.textContent = "Brain health: warming up"; dot.className = "bh-dot low"; }
}

/* ---------------- Router ---------------- */

const ROUTES = {
  "#/": DashboardView,
  "#/brain": BrainView,
  "#/notes": NotesView,
  "#/ideas": IdeasView,
  "#/knowledge": KnowledgeView,
  "#/goals": GoalsView,
  "#/connections": ConnectionsView,
  "#/settings": SettingsView,
};

function currentRoute() {
  const h = location.hash || "#/";
  return ROUTES[h] ? h : "#/";
}

function render() {
  const view = $("#view");
  const route = currentRoute();
  const Page = ROUTES[route];
  view.innerHTML = "";
  const ctx = {
    onOpenCapture: (kind, item) => openCapture(kind, item, () => render()),
    onOpenLive,
    onOpenNeuroVision,
    onOpenCredits: () => openCredits(),
  };
  const node = Page(ctx);
  view.appendChild(node);
  view.scrollTop = 0;
}

function navigate() {
  renderChrome();
  render();
  closeMobileSidebar();
}

/* ---------------- Mobile sidebar ---------------- */

function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

/* ---------------- Command palette ---------------- */

function openPalette() {
  const root = $("#cmdk-root");
  root.innerHTML = "";
  const backdrop = el(`
    <div class="cmdk-backdrop open">
      <div class="cmdk" role="dialog" aria-modal="true">
        <input class="cmdk-input" placeholder="Type a command or search memories…" />
        <div class="cmdk-list"></div>
      </div>
    </div>`);
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
      const els = $$(".cmdk-item", list);
      const idx = els.findIndex((x) => x.classList.contains("sel"));
      const next = e.key === "ArrowDown" ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
      els.forEach((x) => x.classList.remove("sel"));
      els[next]?.classList.add("sel");
      els[next]?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") {
      const sel = $(".cmdk-item.sel", list) || $(".cmdk-item", list);
      sel?.click();
    }
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  const rebuild = () => {
    const q = input.value.toLowerCase().trim();
    const s = getStore();
    const nav = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ label: n.label, hint: n.glyph, run: () => (location.hash = n.to) }));
    const caps = [
      { label: "New Note", hint: "C N", run: () => openCapture("note", null, () => render()) },
      { label: "New Idea", hint: "C I", run: () => openCapture("idea", null, () => render()) },
      { label: "Save Thought", hint: "C K", run: () => openCapture("knowledge", null, () => render()) },
      { label: "Add Goal", hint: "C G", run: () => openCapture("goal", null, () => render()) },
    ].filter((c) => !q || c.label.toLowerCase().includes(q));
    const acts = [
      { label: "✦ Ask Gemini", hint: "AI", run: () => import("./ai.js").then((m) => m.openAskModal()) },
      { label: "◉ NeuroBot Live", hint: "soon", run: openLive },
      { label: "◎ NeuroVision", hint: "soon", run: openNeuroVision },
      { label: "✦ Credits — Tanishq Lalwani", hint: "", run: openCredits },
    ].filter((c) => !q || c.label.toLowerCase().includes(q));
    const mems = [
      ...s.notes.map((n) => ({ label: n.title, kind: "note" })),
      ...s.ideas.map((i) => ({ label: i.title, kind: "idea" })),
      ...s.goals.map((g) => ({ label: g.title, kind: "goal" })),
      ...s.knowledge.map((k) => ({ label: k.title, kind: "knowledge" })),
    ]
      .filter((m) => q && m.label.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({
        label: m.label,
        hint: m.kind,
        run: () => (location.hash = { note: "#/notes", idea: "#/ideas", goal: "#/goals", knowledge: "#/knowledge" }[m.kind]),
      }));

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
          <button class="cmdk-item">
            <span class="glyph">&gt;</span>
            <span class="grow">${esc(it.label)}</span>
            <span class="hint">${esc(it.hint)}</span>
          </button>`,
          )
          .join("")}
      `,
          )
          .join("")
      : `<div class="cmdk-empty">No results found.</div>`;

    const flat = items.flatMap((g) => g.list);
    $$(".cmdk-item", list).forEach((b, i) => {
      b.addEventListener("click", () => {
        close();
        flat[i] && flat[i].run();
      });
    });
    $(".cmdk-item", list)?.classList.add("sel");
  };

  input.addEventListener("input", rebuild);
  rebuild();
  root.appendChild(backdrop);
  input.focus();
}

/* ---------------- Keys help modal ---------------- */

function openKeysHelp() {
  const modal = openModal({ subtitle: "$ neurobot keys --list", title: "Keyboard shortcuts" });
  const rows = [
    ["Ctrl K", "Open command palette"],
    ["C N", "New note"],
    ["C I", "New idea"],
    ["C K", "Save a thought"],
    ["C G", "Add a goal"],
    ["?", "Show this help"],
  ];
  modal.body.innerHTML = rows
    .map((r) => `<div class="keys-row"><kbd>${r[0]}</kbd><span>${r[1]}</span></div>`)
    .join("");
}

/* ---------------- Boot ---------------- */

function boot() {
  applyPrefs(loadPrefs());
  renderChrome();
  render();

  window.addEventListener("hashchange", navigate);
  onStoreChange(renderChrome); // sidebar stats stay live

  // Topbar
  $("#search-btn").addEventListener("click", openPalette);
  $("#live-btn").addEventListener("click", openLive);
  $("#notif-btn").addEventListener("click", () => {
    const s = getStore();
    const modal = openModal({ subtitle: "$ neurobot notifications", title: "Notifications" });
    modal.body.innerHTML = `
      <div class="notif-list">
        ${s.activity.slice(0, 5).map((a) => `
          <div class="activity-row">
            <span class="act-ico ${ITEM_META[a.kind].tone}">${ITEM_META[a.kind].icon}</span>
            <span class="act-title">${esc(a.title)}</span>
            <span class="act-time">${new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>`).join("") || `<div class="empty-sm">Nothing yet.</div>`}
      </div>`;
  });
  $("#menu-btn").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
  $("#side-collapse").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("neurobot.v1.sidebar", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
  });
  if (localStorage.getItem("neurobot.v1.sidebar") === "1") document.body.classList.add("sidebar-collapsed");

  // Hotkeys
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
      if (kind) { e.preventDefault(); openCapture(kind, null, () => render()); }
    }
  });

  setRerender(render);
}

boot();
