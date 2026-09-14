/* ============================================================
   NeuroBot — views.js
   Hash router + all pages. Renders into #page.
   ============================================================ */

import {
  $, el, esc, renderChrome, renderGraph, openCapture, openPalette, openLive,
  openCredits, openKeysHelp, initHotkeys, toast, timeAgo, formatDay, formatDate,
  daysUntil, getStore, addNote, addIdea, addGoal, addKnowledge, removeNote,
  removeIdea, removeGoal, removeKnowledge, removeActivity, updateGoal,
  updateIdea, togglePin, resetDemo, clearAll, ITEM_META, IDEA_STATUSES,
  GOAL_STATUSES, APP_NAME, TAGLINE, OWNER_CREDIT, GRAPH_NODES, GRAPH_EDGES,
} from "./core.js";
import { attachBrainChat, openNeuroVision, brainStats, GEMINI_MODEL } from "./ai.js";

const page = () => $("#page");

/* ---------------- Shared card renderers ---------------- */

function kindChip(kind) {
  const m = ITEM_META[kind];
  return `<span class="chip ${m.tone}">${m.icon} ${m.label}</span>`;
}

function cardFoot({ tag, extra = "", time, kind }) {
  return `
    <div class="card-foot">
      <span class="chip">#${esc(tag)}</span>
      ${extra}
      <div class="card-actions">
        <button data-act="pin" title="Pin to top">📌</button>
        <button data-act="edit" title="Edit">✎</button>
        <button data-act="del" title="Delete">🗑</button>
      </div>
      <span style="margin-left:auto">${time}</span>
    </div>`;
}

function bindCardActions(container, { kind, item, refresh }) {
  const undo = {
    note: removeNote, idea: removeIdea, goal: removeGoal, knowledge: removeKnowledge,
  }[kind];
  $("[data-act=pin]", container)?.addEventListener("click", () => { togglePin(kind, item.id); refresh(); });
  $("[data-act=edit]", container)?.addEventListener("click", () => openCapture(kind, item, refresh));
  $("[data-act=del]", container)?.addEventListener("click", () => {
    const restore = undo(item.id);
    refresh();
    toast(`${ITEM_META[kind].label} deleted — click here to undo.`, 6000);
    const t = document.querySelector(".toast-wrap .toast:last-child");
    if (t) {
      t.style.cursor = "pointer";
      t.title = "Click to undo";
      t.addEventListener("click", () => { restore(); refresh(); }, { once: true });
    }
  });
}

/* ---------------- Pages ---------------- */

function pageDashboard() {
  const s = getStore();
  const stats = brainStats();
  const activeGoals = s.goals.filter((g) => g.status === "active").length;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  const pinned = [
    ...s.notes.filter((n) => n.pinned).map((n) => ({ kind: "note", to: "#/notes", title: n.title, createdAt: n.createdAt })),
    ...s.ideas.filter((i) => i.pinned).map((i) => ({ kind: "idea", to: "#/ideas", title: i.title, createdAt: i.createdAt })),
    ...s.goals.filter((g) => g.pinned).map((g) => ({ kind: "goal", to: "#/goals", title: g.title, createdAt: g.createdAt })),
    ...s.knowledge.filter((k) => k.pinned).map((k) => ({ kind: "knowledge", to: "#/knowledge", title: k.title, createdAt: k.createdAt })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const nextGoal = s.goals
    .filter((g) => g.status === "active")
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))[0];

  // 14-day sparkline
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(Date.now() - i * 86400000);
  const all = [...s.notes, ...s.ideas, ...s.goals, ...s.knowledge];
  const spark = days.map((d) => all.filter((x) => new Date(x.createdAt).toDateString() === new Date(d).toDateString()).length);
  const sparkMax = Math.max(1, ...spark);

  page().innerHTML = `
    <div class="rise">
      <div class="row text-xs muted">
        <span style="color:var(--primary)">◈</span>
        <span>neurobot@local <span style="color:var(--border)">~</span> $ brain --status</span>
        <span style="color:var(--primary)">● online</span>
      </div>
      <h1 class="page-title" style="margin-top:0.5rem">${greeting} 👋</h1>
      <p class="page-sub">Your second brain is ready. What should we think about today?</p>
    </div>

    <section class="panel">
      <div class="term-window-head">
        <span class="term-dots"><i></i><i></i><i></i></span>
        <span class="term-title">neural_map.json — knowledge graph (visual demo)</span>
        <span style="margin-left:auto"><a href="#/connections" style="color:var(--primary)">expand →</a></span>
      </div>
      <div class="graph-wrap" id="dash-graph"></div>
    </section>

    <section class="panel ai-panel" id="ai-panel"></section>

    <div class="stat-grid">
      <a class="stat-card" href="#/knowledge"><div class="stat-top"><span class="stat-icon" style="color:var(--primary)">◉</span> Knowledge</div><div class="stat-value">${stats.knowledge}</div><div class="stat-glyph">~/knowledge</div></a>
      <a class="stat-card" href="#/ideas"><div class="stat-top"><span class="stat-icon" style="color:var(--term-amber-strong)">✦</span> Ideas</div><div class="stat-value">${stats.ideas}</div><div class="stat-glyph">~/ideas</div></a>
      <a class="stat-card" href="#/goals"><div class="stat-top"><span class="stat-icon" style="color:var(--term-violet)">◎</span> Active Goals</div><div class="stat-value">${activeGoals}</div><div class="stat-glyph">~/goals</div></a>
      <a class="stat-card" href="#/connections"><div class="stat-top"><span class="stat-icon" style="color:var(--term-cyan)">⇄</span> Connections</div><div class="stat-value">${GRAPH_EDGES.length}</div><div class="stat-glyph">~/links</div></a>
    </div>

    <section class="panel panel-pad">
      <div class="spread" style="margin-bottom:0.75rem">
        <div class="row"><span style="color:var(--primary)">＋</span><strong class="text-sm">Quick Capture</strong></div>
        <span class="text-xs muted">saved locally</span>
      </div>
      <div class="card-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
        <button class="panel" data-cap="note" style="padding:0.875rem;text-align:center"><div style="font-size:1rem">▤</div><div class="text-xs" style="margin-top:4px;font-weight:600">New Note</div><div class="text-xs muted" style="font-size:9px;text-transform:uppercase;letter-spacing:0.12em;margin-top:2px">press c n</div></button>
        <button class="panel" data-cap="idea" style="padding:0.875rem;text-align:center"><div style="font-size:1rem">✦</div><div class="text-xs" style="margin-top:4px;font-weight:600">New Idea</div><div class="text-xs muted" style="font-size:9px;text-transform:uppercase;letter-spacing:0.12em;margin-top:2px">press c i</div></button>
        <button class="panel" data-cap="knowledge" style="padding:0.875rem;text-align:center"><div style="font-size:1rem">✧</div><div class="text-xs" style="margin-top:4px;font-weight:600">Save Thought</div><div class="text-xs muted" style="font-size:9px;text-transform:uppercase;letter-spacing:0.12em;margin-top:2px">press c k</div></button>
        <button class="panel" data-cap="goal" style="padding:0.875rem;text-align:center"><div style="font-size:1rem">◎</div><div class="text-xs" style="margin-top:4px;font-weight:600">Add Goal</div><div class="text-xs muted" style="font-size:9px;text-transform:uppercase;letter-spacing:0.12em;margin-top:2px">press c g</div></button>
      </div>
    </section>

    <div class="spread" style="align-items:flex-end;display:grid;grid-template-columns:1fr;gap:1rem">
      <section>
        <div class="section-head"><div><h2 class="section-title"><span class="hash">##</span> Momentum</h2></div></div>
        <div class="panel panel-pad">
          <div class="spread">
            <div class="row">
              <span class="stat-icon" style="color:var(--term-amber-strong);border-color:oklch(0.6641 0.1124 74.7/40%)">🔥</span>
              <div>
                <div style="font-size:1.25rem;font-weight:600">${computeStreak(all)} day${computeStreak(all) === 1 ? "" : "s"}</div>
                <div class="text-xs muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em">capture streak</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.25rem;font-weight:600">${spark.reduce((a, b) => a + b, 0)}</div>
              <div class="text-xs muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em">last 14 days</div>
            </div>
          </div>
          <div class="sparkbars" style="margin-top:1rem">
            ${spark.map((v) => `<div><i style="height:${Math.max(8, (v / sparkMax) * 100)}%"></i></div>`).join("")}
          </div>
          <div class="spark-labels"><span>14d ago</span><span>today</span></div>
          ${nextGoal ? `
          <div style="margin-top:1rem;border-top:1px solid oklch(0.8665 0.0097 115/60%);padding-top:0.75rem">
            <div class="text-xs muted" style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em">next deadline</div>
            <div class="text-xs" style="margin-top:2px;font-weight:600">${esc(nextGoal.title)}</div>
            <div class="text-xs muted" style="font-size:10px">${formatDate(nextGoal.deadline)} · ${daysUntil(nextGoal.deadline)}d left</div>
          </div>` : ""}
        </div>
      </section>

      <section>
        <div class="section-head"><div><h2 class="section-title"><span class="hash">##</span> Recent Activity</h2></div></div>
        <div class="panel" id="activity-list">
          ${s.activity.slice(0, 6).map((a) => activityRow(a)).join("")}
          ${s.activity.length === 0 ? `<div class="empty">nothing yet — capture your first thought above</div>` : ""}
        </div>
      </section>
    </div>

    ${pinned.length ? `
    <section>
      <div class="section-head"><div><h2 class="section-title"><span class="hash">##</span> Pinned</h2><div class="section-sub">kept at the top of your brain</div></div></div>
      <div class="pin-strip">
        ${pinned.map((p) => `<a class="pin-card" href="${p.to}"><div class="pin-kind">📌 ${p.kind}</div><div class="pin-title">${esc(p.title)}</div></a>`).join("")}
      </div>
    </section>` : ""}

    <section class="panel panel-pad" style="position:relative;overflow:hidden">
      <div class="row">
        <span style="color:var(--primary)">▚</span>
        <h2 style="font-size:1rem;font-weight:700">${APP_NAME} — <span style="color:var(--primary)">${TAGLINE}</span></h2>
      </div>
      <p class="text-sm muted" style="margin-top:0.5rem;max-width:42rem;line-height:1.65">
        ${APP_NAME} is not just another chatbot. It is your personal second brain — a place to capture what you learn,
        connect it to what you already know, and retrieve it the moment you need it. Notes become knowledge,
        knowledge becomes connections, and connections become insight.
      </p>
      <div class="row-wrap" style="margin-top:0.875rem">
        <span class="chip">capture</span><span style="color:var(--primary)">→</span>
        <span class="chip">organize</span><span style="color:var(--primary)">→</span>
        <span class="chip">connect</span><span style="color:var(--primary)">→</span>
        <span class="chip">retrieve</span>
      </div>
      <p class="text-xs muted" style="margin-top:1rem;border-top:1px solid oklch(0.8665 0.0097 115/60%);padding-top:0.75rem;font-size:10px;text-transform:uppercase;letter-spacing:0.12em">${OWNER_CREDIT}</p>
    </section>

    <section>
      <div class="section-head"><div><h2 class="section-title"><span class="hash">##</span> Coming Soon</h2></div></div>
      <div class="panel panel-pad spread">
        <div>
          <div class="text-sm" style="font-weight:600">👁 NeuroVision</div>
          <div class="text-xs muted" style="margin-top:2px">Let NeuroBot understand what's on your screen.</div>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-nv">Try NeuroVision</button>
      </div>
    </section>
  `;

  renderGraph($("#dash-graph"));
  attachBrainChat($("#ai-panel"));

  // Momentum + graph heights
  document.querySelectorAll("[data-cap]").forEach((b) =>
    b.addEventListener("click", () => openCapture(b.dataset.cap, null, () => render())),
  );
  $("#btn-nv").addEventListener("click", openNeuroVision);

  // Activity delete
  document.querySelectorAll("#activity-list [data-del-activity]").forEach((b) =>
    b.addEventListener("click", () => { removeActivity(b.dataset.delActivity); render(); }),
  );
}

function computeStreak(all) {
  if (all.length === 0) return 0;
  const daysSet = new Set(all.map((x) => new Date(x.createdAt).toDateString()));
  let streak = 0;
  const day = new Date();
  if (!daysSet.has(day.toDateString())) day.setDate(day.getDate() - 1);
  while (daysSet.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function activityRow(a) {
  const m = ITEM_META[a.kind];
  return `
    <div class="activity-row">
      <span class="chip ${m.tone}">${m.icon}</span>
      <span class="activity-title">${esc(a.title)}</span>
      <span class="activity-time">${timeAgo(a.createdAt)}</span>
      <button class="activity-del" data-del-activity="${a.id}" aria-label="Delete">✕</button>
    </div>`;
}

function filterToolbar(placeholder, addKind = "note", addLabel = "Add") {
  return `
    <div class="spread" style="flex-wrap:wrap;gap:0.625rem">
      <div class="searchbar grow" style="min-width:220px">
        <span class="prompt">&gt;</span>
        <input id="filter-q" placeholder="${placeholder}" />
      </div>
      <div class="row" id="filter-extra"></div>
      <button class="btn btn-primary btn-sm" id="btn-add">＋ ${addLabel}</button>
    </div>`;
}

function pageBrain() {
  const s = getStore();
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">My Brain</h1>
        <p class="page-sub">Everything you've captured — searchable and filterable.</p>
      </div>
      <span class="chip green">${brainStats().total} memories</span>
    </div>
    ${filterToolbar("Search your entire brain…", "note", "New Note")}
    <div class="section-head">
      <div class="row-wrap" id="brain-tabs">
        <button class="btn btn-outline btn-sm" data-filter="all">All</button>
        <button class="btn btn-outline btn-sm" data-filter="note">Notes</button>
        <button class="btn btn-outline btn-sm" data-filter="idea">Ideas</button>
        <button class="btn btn-outline btn-sm" data-filter="knowledge">Knowledge</button>
        <button class="btn btn-outline btn-sm" data-filter="goal">Goals</button>
      </div>
    </div>
    <div class="card-grid" id="brain-grid"></div>
  `;
  $("#btn-add").addEventListener("click", () => openCapture("note", null, render));

  const grid = $("#brain-grid");
  grid.dataset.bindPage = "brain";
  const renderGrid = () => {
    const q = ($("#filter-q")?.value || "").toLowerCase();
    const active = $("#brain-tabs .active")?.dataset.filter || "all";
    const rows = [
      ...s.notes.map((x) => ({ kind: "note", x })),
      ...s.ideas.map((x) => ({ kind: "idea", x })),
      ...s.knowledge.map((x) => ({ kind: "knowledge", x })),
      ...s.goals.map((x) => ({ kind: "goal", x })),
    ]
      .filter(({ x }) => !q || (x.title + " " + (x.body || "")).toLowerCase().includes(q))
      .filter(({ kind }) => active === "all" || kind === active)
      .sort((a, b) => b.x.createdAt - a.x.createdAt);

    grid.innerHTML = rows.length
      ? rows.map(({ kind, x }) => genericCard(kind, x)).join("")
      : `<div class="empty" style="grid-column:1/-1">No memories match. Try a different search.</div>`;

    grid.querySelectorAll("[data-card]").forEach((card) => {
      const kind = card.dataset.card;
      const item = rows.find((r) => r.x.id === card.dataset.id)?.x;
      if (item) bindCardActions(card, { kind, item, refresh: renderGrid });
    });
  };
  $("#filter-q").addEventListener("input", renderGrid);
  document.querySelectorAll("#brain-tabs [data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("#brain-tabs [data-filter]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderGrid();
    }),
  );
  document.querySelector("#brain-tabs [data-filter=all]").classList.add("active");
  renderGrid();
}

function genericCard(kind, x) {
  const m = ITEM_META[kind];
  let extra = "";
  let tag = "";
  let time = timeAgo(x.createdAt);
  if (kind === "note") tag = x.category;
  if (kind === "idea") {
    tag = x.category;
    const st = IDEA_STATUSES.find((s) => s.value === x.status);
    extra = `<span class="chip ${st?.tone || "gray"}">${st?.label || x.status}</span>`;
    time = formatDay(x.createdAt);
  }
  if (kind === "knowledge") { tag = x.topic; time = timeAgo(x.createdAt); }
  if (kind === "goal") {
    tag = x.deadline;
    const st = GOAL_STATUSES.find((s) => s.value === x.status);
    extra = `<div class="progress grow" style="max-width:5rem"><div style="width:${x.progress}%"></div></div><span class="chip ${st?.tone}">${st?.label}</span>`;
  }
  return `
    <div class="item-card ${x.pinned ? "pinned" : ""}" data-card="${kind}" data-id="${x.id}">
      <div class="spread"><span class="chip ${m.tone}">${m.icon} ${m.label}</span></div>
      <h3>${esc(x.title)}</h3>
      ${x.body ? `<p class="body">${esc(x.body)}</p>` : ""}
      ${kind === "goal" ? `<div class="progress" style="margin-top:0.625rem"><div style="width:${x.progress}%"></div></div><div class="text-xs muted" style="margin-top:4px;font-size:10px">${x.progress}% · ${formatDate(x.deadline)}</div>` : ""}
      ${cardFoot({ tag, extra, time, id: x.id, kind, editable: true })}
    </div>`;
}

function pageNotes() {
  const s = getStore();
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Notes</h1>
        <p class="page-sub">Capture, edit and search your raw thoughts.</p>
      </div>
      <span class="chip cyan">${s.notes.length} notes</span>
    </div>
    ${filterToolbar("Search notes…", "note", "New Note")}
    <div class="card-grid" id="notes-grid"></div>
  `;
  $("#btn-add").addEventListener("click", () => openCapture("note", null, render));

  const grid = $("#notes-grid");
  const cats = () => [...new Set(s.notes.map((n) => n.category))];
  $("#filter-extra").innerHTML = `
    <select class="select-sm" id="cat-sel"><option value="">all categories</option>${cats().map((c) => `<option>${esc(c)}</option>`).join("")}</select>
  `;

  const renderGrid = () => {
    const q = ($("#filter-q")?.value || "").toLowerCase();
    const cat = $("#cat-sel")?.value || "";
    const rows = s.notes
      .filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q))
      .filter((n) => !cat || n.category === cat)
      .sort((a, b) => b.createdAt - a.createdAt);
    grid.innerHTML = rows.length
      ? rows.map((n) => genericCard("note", n)).join("")
      : `<div class="empty" style="grid-column:1/-1">No notes yet. Capture your first thought.</div>`;
    grid.querySelectorAll("[data-card]").forEach((card) => {
      const item = rows.find((r) => r.id === card.dataset.id);
      if (item) bindCardActions(card, { kind: "note", item, refresh: renderGrid });
    });
  };
  $("#filter-q").addEventListener("input", renderGrid);
  $("#filter-extra").addEventListener("change", renderGrid);
  renderGrid();
}

function pageIdeas() {
  const s = getStore();
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Ideas</h1>
        <p class="page-sub">Your idea board — from spark to shipped.</p>
      </div>
      <span class="chip amber">${s.ideas.length} ideas</span>
    </div>
    ${filterToolbar("Search ideas…", "idea", "New Idea")}
    <div class="card-grid" id="ideas-grid"></div>
  `;
  $("#btn-add").addEventListener("click", () => openCapture("idea", null, render));


  const grid = $("#ideas-grid");
  $("#filter-extra").innerHTML = `
    <select class="select-sm" id="status-sel">
      <option value="">all statuses</option>
      ${IDEA_STATUSES.map((st) => `<option value="${st.value}">${st.label}</option>`).join("")}
    </select>`;

  const renderGrid = () => {
    const q = ($("#filter-q")?.value || "").toLowerCase();
    const st = $("#status-sel")?.value || "";
    const rows = s.ideas
      .filter((i) => !q || (i.title + " " + i.body).toLowerCase().includes(q))
      .filter((i) => !st || i.status === st)
      .sort((a, b) => b.createdAt - a.createdAt);
    grid.innerHTML = rows.length
      ? rows.map((i) => genericCard("idea", i)).join("")
      : `<div class="empty" style="grid-column:1/-1">No ideas yet. Log your first spark.</div>`;
    grid.querySelectorAll("[data-card]").forEach((card) => {
      const item = rows.find((r) => r.id === card.dataset.id);
      if (item) bindCardActions(card, { kind: "idea", item, refresh: renderGrid });
    });
  };
  $("#filter-q").addEventListener("input", renderGrid);
  $("#filter-extra").addEventListener("change", renderGrid);
  renderGrid();
}

function pageKnowledge() {
  const s = getStore();
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Knowledge</h1>
        <p class="page-sub">Distilled cards grouped by topic.</p>
      </div>
      <span class="chip green">${s.knowledge.length} items</span>
    </div>
    ${filterToolbar("Search knowledge…", "knowledge", "Capture")}
    <div id="know-groups"></div>
  `;
  $("#btn-add").addEventListener("click", () => openCapture("knowledge", null, render));


  const groups = $("#know-groups");
  const renderGroups = () => {
    const q = ($("#filter-q")?.value || "").toLowerCase();
    const byTopic = {};
    for (const k of s.knowledge) {
      if (q && !(k.title + " " + k.body + " " + k.topic + " " + (k.source || "")).toLowerCase().includes(q)) continue;
      (byTopic[k.topic] ||= []).push(k);
    }
    const topics = Object.keys(byTopic).sort();
    groups.innerHTML = topics.length
      ? topics
          .map((t) => `
        <section style="margin-bottom:1.5rem">
          <div class="section-head"><div><h2 class="section-title"><span class="hash">##</span> ${esc(t)}</h2><span class="chip">${byTopic[t].length}</span></div></div>
          <div class="card-grid">${byTopic[t].map((k) => genericCard("knowledge", k)).join("")}</div>
        </section>`)
          .join("")
      : `<div class="empty">No knowledge captured yet.</div>`;

    groups.querySelectorAll("[data-card]").forEach((card) => {
      const item = s.knowledge.find((k) => k.id === card.dataset.id);
      if (item) bindCardActions(card, { kind: "knowledge", item, refresh: renderGroups });
    });
  };
  $("#filter-q").addEventListener("input", renderGroups);
  renderGroups();
}

function pageGoals() {
  const s = getStore();
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Goals</h1>
        <p class="page-sub">Track progress toward what matters.</p>
      </div>
      <span class="chip violet">${s.goals.filter((g) => g.status === "active").length} active</span>
    </div>
    ${filterToolbar("Search goals…", "goal", "Add Goal")}
    <div class="card-grid" id="goals-grid"></div>
  `;
  $("#btn-add").addEventListener("click", () => openCapture("goal", null, render));


  const grid = $("#goals-grid");
  $("#filter-extra").innerHTML = `
    <select class="select-sm" id="gstatus-sel">
      <option value="">all statuses</option>
      ${GOAL_STATUSES.map((st) => `<option value="${st.value}">${st.label}</option>`).join("")}
    </select>`;

  const renderGrid = () => {
    const q = ($("#filter-q")?.value || "").toLowerCase();
    const st = $("#gstatus-sel")?.value || "";
    const rows = s.goals
      .filter((g) => !q || (g.title + " " + g.body).toLowerCase().includes(q))
      .filter((g) => !st || g.status === st);
    grid.innerHTML = rows.length
      ? rows.map((g) => genericCard("goal", g)).join("")
      : `<div class="empty" style="grid-column:1/-1">No goals yet. Set your first target.</div>`;
    grid.querySelectorAll("[data-card]").forEach((card) => {
      const item = rows.find((r) => r.id === card.dataset.id);
      if (item) bindCardActions(card, { kind: "goal", item, refresh: renderGrid });
    });
  };
  $("#filter-q").addEventListener("input", renderGrid);
  $("#filter-extra").addEventListener("change", renderGrid);
  renderGrid();
}

function pageConnections() {
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Connections</h1>
        <p class="page-sub">How your knowledge links together (visual demo).</p>
      </div>
    </div>
    <div class="spread" style="display:grid;grid-template-columns:1fr;gap:1rem;align-items:start">
      <section class="panel">
        <div class="term-window-head">
          <span class="term-dots"><i></i><i></i><i></i></span>
          <span class="term-title">neural_map_full.json — ${GRAPH_NODES.length} nodes · ${GRAPH_EDGES.length} edges</span>
        </div>
        <div class="graph-wrap" id="full-graph"></div>
      </section>
      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> About this map</h2>
        <p class="text-sm muted" style="margin-top:0.5rem;line-height:1.65">
          Connections represent relationships between information in your second brain.
          When you capture a note about machine learning and later add a paper on transformers,
          NeuroBot draws the line between them — so retrieval follows meaning, not folders.
        </p>
        <p class="text-xs muted" style="margin-top:0.75rem">
          ⚠ This map is currently a <strong>visual prototype</strong> — links are illustrative, not yet AI-generated.
        </p>
        <div class="row-wrap" style="margin-top:0.875rem">
          <span class="chip green">${GRAPH_NODES.length} nodes</span>
          <span class="chip cyan">${GRAPH_EDGES.length} edges</span>
          <span class="chip amber">phase 2 demo</span>
        </div>
      </section>
    </div>
  `;
  renderGraph($("#full-graph"), { height: 460 });
}

function pageSettings() {
  page().innerHTML = `
    <div class="rise page-head">
      <div class="grow">
        <h1 class="page-title">Settings</h1>
        <p class="page-sub">Tune your NeuroBot.</p>
      </div>
    </div>

    <div class="settings-grid">
      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> Appearance</h2>
        <div class="set-row"><div><div class="set-label">Terminal grid backdrop</div><div class="set-desc">The dotted grid behind the app</div></div><input type="checkbox" id="set-grid" checked /></div>
        <div class="set-row"><div><div class="set-label">Reduce motion</div><div class="set-desc">Disable animations</div></div><input type="checkbox" id="set-motion" /></div>
      </section>

      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> Notifications</h2>
        <div class="set-row"><div><div class="set-label">Capture confirmations</div><div class="set-desc">Toast when something is saved</div></div><input type="checkbox" id="set-notif" checked /></div>
        <div class="set-row"><div><div class="set-label">Weekly digest</div><div class="set-desc">Coming in a future phase</div></div><input type="checkbox" disabled /></div>
      </section>

      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> AI — Gemini</h2>
        <div class="set-row"><div><div class="set-label">Model</div><div class="set-desc">${GEMINI_MODEL} via Google AI</div></div><span class="chip green">connected</span></div>
        <div class="set-row"><div><div class="set-label">Brain visibility</div><div class="set-desc">The AI sees every note, idea, goal, knowledge item and chat memory</div></div><span class="chip green">full</span></div>
        <div class="set-row"><div><div class="set-label">Conversation memory</div><div class="set-desc">Last 40 turns kept locally, last 12 sent to the model</div></div><span class="chip cyan">on</span></div>
      </section>

      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> Data</h2>
        <div class="set-row"><div><div class="set-label">Memories stored</div><div class="set-desc">${brainStats().total} items in localStorage</div></div><span class="chip">${brainStats().total}</span></div>
        <div class="form-actions" style="justify-content:flex-start">
          <button class="btn btn-outline btn-sm" id="btn-seed">Reload demo data</button>
          <button class="btn btn-danger btn-sm" id="btn-wipe">Erase everything</button>
        </div>
      </section>

      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> Privacy</h2>
        <p class="text-xs muted" style="line-height:1.65">
          All memories live in your browser's localStorage. When you ask your brain a question,
          your stored memories and recent conversation are sent to Google's Gemini API to generate an answer.
          Nothing else leaves your device. This is a school project — the API key is intentionally hardcoded.
        </p>
      </section>

      <section class="panel panel-pad">
        <h2 class="section-title"><span class="hash">##</span> About NeuroBot</h2>
        <p class="text-sm muted" style="line-height:1.65">
          ${APP_NAME} — ${TAGLINE} Capture → organize → connect → retrieve.
          A second brain for students, builders and the endlessly curious.
        </p>
        <p class="text-xs muted" style="margin-top:0.75rem;font-size:10px;text-transform:uppercase;letter-spacing:0.12em">${OWNER_CREDIT}</p>
        <button class="btn btn-outline btn-sm" style="margin-top:0.75rem" id="btn-credits2">View credits</button>
      </section>
    </div>
  `;

  $("#btn-seed").addEventListener("click", () => { resetDemo(); toast("Demo data reloaded."); render(); });
  $("#btn-wipe").addEventListener("click", () => {
    if (confirm("Erase every memory? This cannot be undone.")) { clearAll(); toast("Brain wiped. Blank slate."); render(); }
  });
  $("#btn-credits2").addEventListener("click", openCredits);
  $("#set-grid").addEventListener("change", (e) => {
    document.getElementById("grid-backdrop").style.display = e.target.checked ? "" : "none";
  });
  $("#set-motion").addEventListener("change", (e) => {
    document.documentElement.style.setProperty("--motion", e.target.checked ? "off" : "on");
    document.body.classList.toggle("no-motion", e.target.checked);
  });
}

/* ---------------- Router ---------------- */

const ROUTES = {
  "#/": pageDashboard,
  "#/brain": pageBrain,
  "#/notes": pageNotes,
  "#/ideas": pageIdeas,
  "#/knowledge": pageKnowledge,
  "#/goals": pageGoals,
  "#/connections": pageConnections,
  "#/settings": pageSettings,
};

function render() {
  const path = location.hash || "#/";
  const view = ROUTES[path] || pageDashboard;
  if (!ROUTES[path]) location.hash = "#/";
  view();
  renderChrome();
  document.body.classList.remove("nav-open");
  window.scrollTo({ top: 0 });
}

/* ---------------- Boot ---------------- */

function boot() {
  renderChrome();
  render();
  initHotkeys();

  $("#btn-menu").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#sidebar-overlay").addEventListener("click", () => document.body.classList.remove("nav-open"));
  $("#btn-cmd").addEventListener("click", openPalette);
  $("#btn-live").addEventListener("click", openLive);
  $("#btn-keys").addEventListener("click", openKeysHelp);
  $("#btn-credits").addEventListener("click", openCredits);

  $("#btn-notif").addEventListener("click", () => {
    const s = getStore();
    const recent = s.activity.slice(0, 3);
    toast(recent.length ? recent.map((a) => a.title).join("  ·  ") : "all quiet — nothing new", 4200);
  });

  window.addEventListener("hashchange", render);
}

boot();
