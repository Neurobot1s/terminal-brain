/* ============================================================
   NeuroBot — views-collections.js
   My Brain / Notes / Ideas / Knowledge / Goals pages.
   ============================================================ */
import {
  $, $$, el, esc, timeAgo, formatDate, daysUntil,
  ITEM_META, IDEA_STATUSES, GOAL_STATUSES, TOPICS,
  getStore, totalItems,
  updateNote, removeNote,
  updateIdea, removeIdea,
  updateGoal, removeGoal,
  removeKnowledge, togglePin,
  openCapture, toast,
} from "./core.js";
import { openAskModal } from "./ai.js";

/* ============================================================
   MY BRAIN
   ============================================================ */

export function BrainView({ onOpenCapture }) {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>My Brain</h1><p class="muted" id="brain-count"></p></div>
      <button class="btn btn-outline btn-sm" id="brain-ask">✦ Ask</button>
    </header>
    <div class="filter-bar">
      <input id="brain-q" class="search-input" placeholder="Search all memories…" />
      <select id="brain-kind">
        <option value="all">All kinds</option>
        <option value="note">Notes</option>
        <option value="idea">Ideas</option>
        <option value="goal">Goals</option>
        <option value="knowledge">Knowledge</option>
      </select>
    </div>
    <div id="brain-list" class="grid-cards"></div>
  </div>`);

  const all = () => {
    const s = getStore();
    return [
      ...s.notes.map((x) => ({ ...x, _route: "#/notes" })),
      ...s.ideas.map((x) => ({ ...x, _route: "#/ideas" })),
      ...s.goals.map((x) => ({ ...x, _route: "#/goals" })),
      ...s.knowledge.map((x) => ({ ...x, _route: "#/knowledge" })),
    ];
  };

  const renderList = () => {
    const q = $("#brain-q", root).value.toLowerCase().trim();
    const kind = $("#brain-kind", root).value;
    const items = all().filter((x) => (kind === "all" || x.kind === kind) && (!q || (x.title + " " + (x.body || "")).toLowerCase().includes(q)));
    $("#brain-count", root).textContent = `${all().length} memories across ${new Set(all().map((x) => x.kind)).size} kinds`;
    const list = $("#brain-list", root);
    list.innerHTML = items.length
      ? items.map(universalCard).join("")
      : `<div class="empty">No memories match. Try another search.</div>`;
    $$(".row-btn[data-edit]", list).forEach((b) =>
      b.addEventListener("click", () => openCapture(b.dataset.kind, getStore()[b.dataset.kind + "s"].find((x) => x.id === b.dataset.edit))),
    );
    $$(".row-btn.danger[data-del]", list).forEach((b) =>
      b.addEventListener("click", () => {
        const kind = b.dataset.kind;
        const api = { note: removeNote, idea: removeIdea, goal: removeGoal, knowledge: removeKnowledge };
        api[kind](b.dataset.del);
        renderList();
        toast("Memory deleted.");
      }),
    );
  };

  $("#brain-q", root).addEventListener("input", renderList);
  $("#brain-kind", root).addEventListener("change", renderList);
  $("#brain-ask", root).addEventListener("click", () => openAskModal());
  renderList();
  return root;
}

function universalCard(x) {
  const m = ITEM_META[x.kind];
  const meta =
    x.kind === "goal"
      ? `${x.progress}% · due ${x.deadline}`
      : x.kind === "knowledge"
        ? x.source
        : x.status
          ? (IDEA_STATUSES.find((s) => s.value === x.status)?.label ?? x.status)
          : x.category || "";
  return `<a class="mem-card ${m.tone}" href="${x._route}">
    <div class="mem-top"><span class="mem-ico ${m.tone}">${m.icon}</span><span class="mem-kind">${m.label}</span></div>
    <strong class="mem-title">${esc(x.title)}</strong>
    <p class="mem-body">${esc(x.body)}</p>
    <div class="mem-foot"><span>${esc(meta)}</span><span>${timeAgo(x.createdAt)}</span></div>
  </a>`;
}

/* ============================================================
   NOTES
   ============================================================ */

export function NotesView() {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>Notes</h1><p class="muted" id="notes-count"></p></div>
      <button class="btn btn-primary btn-sm" id="notes-add">+ New Note</button>
    </header>
    <div class="filter-bar">
      <input id="notes-q" class="search-input" placeholder="Search notes…" />
      <select id="notes-cat"><option value="all">All categories</option></select>
    </div>
    <div id="notes-list" class="grid-cards"></div>
  </div>`);

  const catSel = $("#notes-cat", root);
  [...new Set(getStore().notes.map((n) => n.category))].forEach((c) => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    catSel.appendChild(o);
  });

  const renderList = () => {
    const q = $("#notes-q", root).value.toLowerCase().trim();
    const cat = $("#notes-cat", root).value;
    const items = getStore().notes.filter((n) => (cat === "all" || n.category === cat) && (!q || (n.title + " " + n.body).toLowerCase().includes(q)));
    $("#notes-count", root).textContent = `${getStore().notes.length} notes captured`;
    const list = $("#notes-list", root);
    list.innerHTML = items.length ? items.map(noteCard).join("") : `<div class="empty">No notes match. Capture your first one.</div>`;

    $$("[data-pin-note]", list).forEach((b) => b.addEventListener("click", () => { togglePin("note", b.dataset.pinNote); renderList(); }));
    $$("[data-edit-note]", list).forEach((b) => b.addEventListener("click", () => openCapture("note", getStore().notes.find((x) => x.id === b.dataset.editNote))));
    $$("[data-del-note]", list).forEach((b) =>
      b.addEventListener("click", () => { removeNote(b.dataset.delNote); renderList(); toast("Note deleted."); }),
    );
  };

  $("#notes-q", root).addEventListener("input", renderList);
  $("#notes-cat", root).addEventListener("change", renderList);
  $("#notes-add", root).addEventListener("click", () => openCapture("note"));
  renderList();
  return root;
}

function noteCard(n) {
  return `<div class="mem-card cyan" data-id="${n.id}">
    <div class="mem-top">
      <span class="mem-ico cyan">▤</span><span class="mem-kind">Note</span>
      <button class="pin-btn ${n.pinned ? "on" : ""}" data-pin-note="${n.id}" title="Pin">◆</button>
    </div>
    <strong class="mem-title">${esc(n.title)}</strong>
    <p class="mem-body">${esc(n.body)}</p>
    <div class="mem-foot">
      <span>${esc(n.category)}</span>
      <span>${timeAgo(n.createdAt)}</span>
      <span class="row-actions">
        <button class="row-btn" data-edit-note="${n.id}">Edit</button>
        <button class="row-btn danger" data-del-note="${n.id}">Delete</button>
      </span>
    </div>
  </div>`;
}

/* ============================================================
   IDEAS (kanban board)
   ============================================================ */

export function IdeasView() {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>Ideas</h1><p class="muted" id="ideas-count"></p></div>
      <button class="btn btn-primary btn-sm" id="ideas-add">+ New Idea</button>
    </header>
    <div class="filter-bar">
      <input id="ideas-q" class="search-input" placeholder="Search ideas…" />
      <select id="ideas-status">
        <option value="all">All statuses</option>
        ${IDEA_STATUSES.map((x) => `<option value="${x.value}">${x.label}</option>`).join("")}
      </select>
    </div>
    <div id="ideas-board" class="board"></div>
  </div>`);

  const renderBoard = () => {
    const q = $("#ideas-q", root).value.toLowerCase().trim();
    const st = $("#ideas-status", root).value;
    const items = getStore().ideas.filter((i) => (st === "all" || i.status === st) && (!q || (i.title + " " + i.body).toLowerCase().includes(q)));
    $("#ideas-count", root).textContent = `${getStore().ideas.length} ideas on the board`;
    $("#ideas-board", root).innerHTML = IDEA_STATUSES.map((col) => {
      const colItems = items.filter((i) => i.status === col.value);
      return `<div class="board-col">
        <div class="board-col-head ${col.tone}">
          <span>${col.label}</span><span class="count">${colItems.length}</span>
          <button class="board-add" data-add-status="${col.value}" title="Add idea in ${col.label}">+</button>
        </div>
        ${colItems.map(ideaCard).join("")}
      </div>`;
    }).join("");

    $$("[data-add-status]", root).forEach((b) => b.addEventListener("click", () => openCapture("idea", { status: b.dataset.addStatus })));
    $$("[data-pin-idea]", root).forEach((b) => b.addEventListener("click", () => { togglePin("idea", b.dataset.pinIdea); renderBoard(); }));
    $$("[data-edit-idea]", root).forEach((b) => b.addEventListener("click", () => openCapture("idea", getStore().ideas.find((x) => x.id === b.dataset.editIdea))));
    $$("[data-del-idea]", root).forEach((b) => b.addEventListener("click", () => { removeIdea(b.dataset.delIdea); renderBoard(); toast("Idea deleted."); }));
    $$("[data-status-set]", root).forEach((b) =>
      b.addEventListener("click", () => { updateIdea(b.closest(".idea-card").dataset.id, { status: b.dataset.statusSet }); renderBoard(); }),
    );
  };

  $("#ideas-q", root).addEventListener("input", renderBoard);
  $("#ideas-status", root).addEventListener("change", renderBoard);
  $("#ideas-add", root).addEventListener("click", () => openCapture("idea"));
  renderBoard();
  return root;
}

function ideaCard(i) {
  const meta = IDEA_STATUSES.find((x) => x.value === i.status);
  const others = IDEA_STATUSES.filter((x) => x.value !== i.status);
  return `<div class="idea-card ${meta.tone}" data-id="${i.id}">
    <div class="mem-top">
      <span class="mem-ico ${meta.tone}">✦</span><span class="mem-kind">${esc(i.category)}</span>
      <button class="pin-btn ${i.pinned ? "on" : ""}" data-pin-idea="${i.id}">◆</button>
    </div>
    <strong class="mem-title">${esc(i.title)}</strong>
    <p class="mem-body">${esc(i.body)}</p>
    <div class="mem-foot">
      <span>${formatDate(i.createdAt)}</span>
      <span class="row-actions">
        <select class="status-select ${meta.tone}" data-status-set>
          ${IDEA_STATUSES.map((s) => `<option value="${s.value}" ${s.value === i.status ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <button class="row-btn" data-edit-idea="${i.id}">Edit</button>
        <button class="row-btn danger" data-del-idea="${i.id}">Delete</button>
      </span>
    </div>
  </div>`;
}

/* ============================================================
   KNOWLEDGE
   ============================================================ */

export function KnowledgeView() {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>Knowledge</h1><p class="muted" id="know-count"></p></div>
      <button class="btn btn-outline btn-sm" id="know-ask">✦ Ask</button>
      <button class="btn btn-primary btn-sm" id="know-add">+ Add Knowledge</button>
    </header>
    <div class="filter-bar">
      <input id="know-q" class="search-input" placeholder="Search knowledge…" />
      <select id="know-topic">
        <option value="all">All topics</option>
        ${TOPICS.map((t) => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </div>
    <div id="know-list" class="topic-groups"></div>
  </div>`);

  const renderList = () => {
    const q = $("#know-q", root).value.toLowerCase().trim();
    const topic = $("#know-topic", root).value;
    const s = getStore().knowledge;
    const items = s.filter((k) => (topic === "all" || k.topic === topic) && (!q || (k.title + " " + (k.body || "")).toLowerCase().includes(q)));
    $("#know-count", root).textContent = `${s.length} concepts across ${new Set(s.map((k) => k.topic)).size} topics`;
    const groups = TOPICS.filter((t) => (topic === "all" ? items.some((k) => k.topic === t) : t === topic));
    $("#know-list", root).innerHTML = groups.map((t) => {
      const colItems = items.filter((k) => k.topic === t);
      return `<div class="topic-group">
        <div class="topic-head"><span class="topic-dot ${toneForTopic(t)}"></span><h2>${t}</h2><span class="count">${colItems.length}</span></div>
        <div class="grid-cards">${colItems.map(knowledgeCard).join("")}</div>
      </div>`;
    }).join("");

    $$("[data-pin-knowledge]", root).forEach((b) => b.addEventListener("click", () => { togglePin("knowledge", b.dataset.pinKnowledge); renderList(); }));
    $$("[data-edit-knowledge]", root).forEach((b) => b.addEventListener("click", () => openCapture("knowledge", getStore().knowledge.find((x) => x.id === b.dataset.editKnowledge))));
    $$("[data-del-knowledge]", root).forEach((b) =>
      b.addEventListener("click", () => { removeKnowledge(b.dataset.delKnowledge); renderList(); toast("Knowledge deleted."); }),
    );
  };

  $("#know-q", root).addEventListener("input", renderList);
  $("#know-topic", root).change;
  $("#know-topic", root).addEventListener("change", renderList);
  $("#know-add", root).addEventListener("click", () => openCapture("knowledge"));
  $("#know-ask", root).addEventListener("click", () => openAskModal());
  renderList();
  return root;
}

function knowledgeCard(k) {
  return `<div class="mem-card green" data-id="${k.id}">
    <div class="mem-top">
      <span class="mem-ico green">◈</span><span class="mem-kind">${esc(k.topic)}</span>
      <button class="pin-btn ${k.pinned ? "on" : ""}" data-pin-knowledge="${k.id}">◆</button>
    </div>
    <strong class="mem-title">${esc(k.title)}</strong>
    <p class="mem-body">${esc(k.body)}</p>
    <div class="mem-foot">
      <span>${esc(k.source)}</span>
      <span>${timeAgo(k.createdAt)}</span>
      <span class="row-actions">
        <button class="row-btn" data-edit-knowledge="${k.id}">Edit</button>
        openAskModal
        <button class="row-btn danger" data-del-knowledge="${k.id}">Delete</button>
      </span>
    </div>
  </div>`;
}

/* ============================================================
   GOALS
   ============================================================ */

export function GoalsView() {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>Goals</h1><p class="muted" id="goals-count"></p></div>
      <button class="btn btn-outline btn-sm" id="goals-ask">✦ Ask</button>
      <button class="btn btn-primary btn-sm" id="goals-add">+ Add Goal</button>
    </header>
    <div class="filter-bar">
      <input id="goals-q" class="search-input" placeholder="Search goals…" />
      <select id="goals-status">
        <option value="all">All statuses</option>
        ${GOAL_STATUSES.map((x) => `<option value="${x.value}">${x.label}</option>`).join("")}
      </select>
    </div>
    <div id="goals-list" class="grid-cards"></div>
  </div>`);

  const renderList = () => {
    const q = $("#goals-q", root).value.toLowerCase().trim();
    const st = $("#goals-status", root).value;
    const s = getStore().goals;
    const items = s.filter((g) => (st === "all" || g.status === st) && (!q || (g.title + " " + g.body).toLowerCase().includes(q)));
    $("#goals-count", root).textContent = `${s.filter((g) => g.status === "active").length} active of ${s.length}`;
    const list = $("#goals-list", root);
    list.innerHTML = items.length ? items.map(goalCard).join("") : `<div class="empty">No goals match.</div>`;

    $$("[data-goal-progress]", list).forEach((b) =>
      b.addEventListener("click", () => {
        const g = getStore().goals.find((x) => x.id === b.dataset.goalProgress);
        if (!g) return;
        updateGoal(g.id, { progress: Math.max(0, Math.min(100, g.progress + Number(b.dataset.delta))) });
        renderList();
      }),
    );
    $$("[data-pin-goal]", list).forEach((b) => b.addEventListener("click", () => { togglePin("goal", b.dataset.pinGoal); renderList(); }));
    $$("[data-edit-goal]", list).forEach((b) => b.addEventListener("click", () => openCapture("goal", getStore().goals.find((x) => x.id === b.dataset.editGoal))));
    $$("[data-del-goal]", list).forEach((b) =>
      b.addEventListener("click", () => { removeGoal(b.dataset.delGoal); renderList(); toast("Goal deleted."); }),
    );
  };

  $("#goals-q", root).addEventListener("input", renderList);
  $("#goals-status", root).addEventListener("change", renderList);
  $("#goals-add", root).addEventListener("click", () => openCapture("goal"));
  $("#goals-ask", root).addEventListener("click", () => openAskModal());
  renderList();
  return root;
}

function goalCard(g) {
  const meta = GOAL_STATUSES.find((x) => x.value === g.status);
  const left = daysUntil(g.deadline);
  const urgency = left < 0 ? "overdue" : left <= 7 ? "soon" : "ok";
  return `<div class="mem-card violet" data-id="${g.id}">
    <div class="mem-top">
      <span class="mem-ico violet">◎</span><span class="mem-kind">${meta.label}</span>
      <button class="pin-btn ${g.pinned ? "on" : ""}" data-pin-goal="${g.id}">◆</button>
    </div>
    <strong class="mem-title">${esc(g.title)}</strong>
    <p class="mem-body">${esc(g.body)}</p>
    <div class="progress-track"><div class="progress-fill" style="width:${g.progress}%"></div></div>
    <div class="mem-foot">
      <span class="${urgency}">${left < 0 ? "overdue" : left + "d left"} · ${formatDate(new Date(g.deadline + "T00:00:00").getTime())}</span>
      <span class="row-actions">
        <button class="row-btn" data-goal-progress="${g.id}" data-delta="-10">−10%</button>
        <button class="row-btn" data-goal-progress="${g.id}" data-delta="+10">+10%</button>
        <button class="row-btn" data-edit-goal="${g.id}">Edit</button>
        <button class="row-btn danger" data-del-goal="${g.id}">Delete</button>
      </span>
    </div>
  </div>`;
}

/* ---------------- helpers ---------------- */

function toneForTopic(t) {
  return { AI: "cyan", Programming: "amber", Science: "green", Business: "violet", Education: "gray" }[t] || "gray";
}
