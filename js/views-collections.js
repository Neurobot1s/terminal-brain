/* NeuroBot — views-collections.js (classic script; extends window.NB).
   My Brain / Notes / Knowledge / Goals pages. Ideas board lives in views-kanban.js. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc;
  var timeAgo = NB.timeAgo, formatDate = NB.formatDate, daysUntil = NB.daysUntil;
  var ITEM_META = NB.ITEM_META, GOAL_STATUSES = NB.GOAL_STATUSES, TOPICS = NB.TOPICS;
  var getStore = NB.getStore, totalItems = NB.totalItems;
  var updateNote = NB.updateNote, removeNote = NB.removeNote;
  var updateGoal = NB.updateGoal, removeGoal = NB.removeGoal;
  var removeKnowledge = NB.removeKnowledge, togglePin = NB.togglePin;
  var openCapture = NB.openCapture, toast = NB.toast, openAskModal = NB.openAskModal;

  /* ---------- shared card scaffolding ---------- */
  function memShell(x, tone, icon, kindLabel, inner) {
    return '<div class="mem-card ' + tone + '" data-id="' + x.id + '">' +
      '<div class="mem-top"><span class="mem-ico ' + tone + '">' + icon + '</span>' +
      '<span class="mem-kind">' + kindLabel + '</span>' +
      '<button class="pin-btn ' + (x.pinned ? "on" : "") + '" data-pin="' + x.id + '" data-kind="' + x.kind + '">◆</button></div>' +
      '<strong class="mem-title">' + esc(x.title) + "</strong>" + inner +
      '<div class="mem-foot"><span class="muted-xs">' + timeAgo(x.createdAt || Date.now()) + "</span>" +
      '<span class="row-actions">' +
        '<button class="row-btn" data-edit="' + x.id + '" data-kind="' + x.kind + '">Edit</button>' +
        '<button class="row-btn danger" data-del="' + x.id + '" data-kind="' + x.kind + '">Delete</button>' +
      "</span></div></div>";
  }

  function wireCards(root, renderList) {
    $$("[data-pin]", root).forEach(function (b) {
      b.addEventListener("click", function () { togglePin(b.getAttribute("data-kind"), b.getAttribute("data-pin")); renderList(); });
    });
    $$("[data-edit]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var kind = b.getAttribute("data-kind"), id = b.getAttribute("data-edit");
        openCapture(kind, getStore()[kind === "knowledge" ? "knowledge" : kind + "s"].find(function (x) { return x.id === id; }));
      });
    });
    $$("[data-del]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        var api = { note: removeNote, idea: NB.removeIdea, goal: removeGoal, knowledge: removeKnowledge };
        api[b.getAttribute("data-kind")](b.getAttribute("data-del"));
        renderList();
        toast("Memory deleted.");
      });
    });
  }

  /* ============================================================
     MY BRAIN
     ============================================================ */
  NB.BrainView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>My Brain</h1><p class="muted" id="brain-count"></p></div>' +
      '<button class="btn btn-outline btn-sm" id="brain-ask">✦ Ask</button></header>' +
      '<div class="filter-bar">' +
        '<input id="brain-q" class="search-input" placeholder="Search all memories…" />' +
        '<select id="brain-kind"><option value="all">All kinds</option><option value="note">Notes</option>' +
        '<option value="idea">Ideas</option><option value="goal">Goals</option><option value="knowledge">Knowledge</option></select>' +
      "</div>" +
      '<div id="brain-list" class="grid-cards"></div></div>');

    function all() {
      var s = getStore();
      return s.notes.map(function (x) { x._k = "note"; return x; })
        .concat(s.ideas.map(function (x) { x._k = "idea"; return x; }))
        .concat(s.goals.map(function (x) { x._k = "goal"; return x; }))
        .concat(s.knowledge.map(function (x) { x._k = "knowledge"; return x; }));
    }
    function card(x) {
      var m = ITEM_META[x._k];
      var body = x.deadline != null && x.progress != null
        ? '<div class="progress-track"><div class="progress-fill" style="width:' + x.progress + '%"></div></div>'
        : '<p class="mem-body">' + esc(x.body || "") + "</p>";
      return memShell(x, m.tone, m.icon, m.label, body);
    }
    function renderList() {
      var q = $("#brain-q", root).value.toLowerCase().trim();
      var kind = $("#brain-kind", root).value;
      var items = all().filter(function (x) {
        return (kind === "all" || x._k === kind) && (!q || (x.title + " " + (x.body || "")).toLowerCase().indexOf(q) !== -1);
      });
      $("#brain-count", root).textContent = all().length + " memories across your brain";
      var list = $("#brain-list", root);
      list.innerHTML = items.length ? items.map(card).join("") :
        '<div class="empty"><span class="empty-ico">◌</span>' + (q || kind !== "all" ? "No memories match. Try another search." : "Your brain is empty — capture your first memory.") +
        (q || kind !== "all" ? "" : '<div class="empty-cta"><button class="btn btn-primary btn-sm" data-empty-capture="note">＋ New Note</button><button class="btn btn-outline btn-sm" data-empty-capture="idea">＋ New Idea</button></div>') + "</div>";
      wireCards(list, renderList);
    }
    $("#brain-q", root).addEventListener("input", renderList);
    $("#brain-kind", root).addEventListener("change", renderList);
    $("#brain-ask", root).addEventListener("click", function () { openAskModal(); });
    renderList();
    return root;
  };

  /* ============================================================
     NOTES
     ============================================================ */
  NB.NotesView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Notes</h1><p class="muted" id="notes-count"></p></div>' +
      '<button class="btn btn-primary btn-sm" id="notes-add">＋ New Note</button></header>' +
      '<div class="filter-bar">' +
        '<input id="notes-q" class="search-input" placeholder="Search notes…" />' +
        '<select id="notes-cat"><option value="all">All categories</option></select>' +
      "</div>" +
      '<div id="notes-list" class="grid-cards"></div></div>');

    function renderList() {
      var s = getStore();
      var cats = [];
      s.notes.forEach(function (n) { if (cats.indexOf(n.category) === -1) cats.push(n.category); });
      var sel = $("#notes-cat", root);
      var cur = sel.value || "all";
      sel.innerHTML = '<option value="all">All categories</option>' + cats.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + "</option>";
      }).join("");
      sel.value = cats.indexOf(cur) !== -1 ? cur : "all";

      var q = $("#notes-q", root).value.toLowerCase().trim();
      var cat = sel.value;
      var items = s.notes.filter(function (n) {
        return (cat === "all" || n.category === cat) && (!q || (n.title + " " + (n.body || "")).toLowerCase().indexOf(q) !== -1);
      });
      $("#notes-count", root).textContent = items.length + " of " + s.notes.length + " notes";
      var list = $("#notes-list", root);
      list.innerHTML = items.length ? items.map(function (n) {
        var m = ITEM_META.note;
        return memShell(n, m.tone, m.icon, n.category, '<p class="mem-body">' + esc(n.body || "") + "</p>");
      }).join("") : '<div class="empty"><span class="empty-ico">✎</span>' + (q || cat !== "all" ? "No notes match your search." : "No notes yet. Capture your first thought.") +
        (!q && cat === "all" ? '<div class="empty-cta"><button class="btn btn-primary btn-sm" data-empty-capture="note">＋ New Note</button></div>' : "") + "</div>";
      wireCards(list, renderList);
      $$('[data-empty-capture]', list).forEach(function (b) { b.addEventListener('click', function () { openCapture(b.getAttribute('data-empty-capture')); }); });
    }
    $("#notes-q", root).addEventListener("input", renderList);
    $("#notes-cat", root).addEventListener("change", renderList);
    $("#notes-add", root).addEventListener("click", function () { openCapture("note"); });
    renderList();
    return root;
  };

  /* ============================================================
     KNOWLEDGE
     ============================================================ */
  NB.KnowledgeView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Knowledge</h1><p class="muted" id="kn-count"></p></div>' +
      '<button class="btn btn-primary btn-sm" id="kn-add">＋ Add Knowledge</button></header>' +
      '<div id="kn-groups"></div></div>');

    function renderList() {
      var s = getStore();
      var topics = [];
      s.knowledge.forEach(function (k) { if (topics.indexOf(k.topic) === -1) topics.push(k.topic); });
      TOPICS.forEach(function (t) { if (topics.indexOf(t) === -1) topics.push(t); });
      $("#kn-count", root).textContent = s.knowledge.length + " items captured";
      $("#kn-groups", root).innerHTML = topics.length ? topics.map(function (t) {
        var items = s.knowledge.filter(function (k) { return k.topic === t; });
        if (!items.length) return "";
        var tone = toneForTopic(t);
        return '<section class="panel topic-panel"><div class="panel-head"><h3>' + esc(t) +
          '</h3><span class="muted-xs">' + items.length + " items</span></div>" +
          '<div class="grid-cards">' + items.map(function (k) {
            return memShell(k, tone, "◈", k.source || t, '<p class="mem-body">' + esc(k.body || "") + "</p>");
          }).join("") + "</div></section>";
      }).join("") : '<div class="empty"><span class="empty-ico">◈</span>No knowledge yet. Save what you learn.<div class="empty-cta"><button class="btn btn-primary btn-sm" data-empty-capture="knowledge">＋ Add Knowledge</button></div></div>';
      wireCards($("#kn-groups", root), renderList);
      $$('[data-empty-capture]', $("#kn-groups", root)).forEach(function (b) { b.addEventListener('click', function () { openCapture(b.getAttribute('data-empty-capture')); }); });
    }
    $("#kn-add", root).addEventListener("click", function () { openCapture("knowledge"); });
    renderList();
    return root;
  };
  function toneForTopic(t) {
    return { AI: "cyan", Programming: "amber", Science: "green", Business: "violet", Education: "gray" }[t] || "gray";
  }

  /* ============================================================
     GOALS
     ============================================================ */
  NB.GoalsView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Goals</h1><p class="muted" id="goals-count"></p></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" id="goals-ask">✦ Ask</button>' +
      '<button class="btn btn-primary btn-sm" id="goals-add">＋ Add Goal</button></div></header>' +
      '<div class="filter-bar">' +
        '<input id="goals-q" class="search-input" placeholder="Search goals…" />' +
        '<select id="goals-status"><option value="all">All statuses</option>' +
        GOAL_STATUSES.map(function (g) { return '<option value="' + g.value + '">' + g.label + "</option>"; }).join("") +
      "</select></div>" +
      '<div id="goals-list" class="grid-cards"></div></div>');

    function renderList() {
      var s = getStore();
      var q = $("#goals-q", root).value.toLowerCase().trim();
      var st = $("#goals-status", root).value;
      var items = s.goals.filter(function (g) {
        return (st === "all" || g.status === st) && (!q || (g.title + " " + (g.body || "")).toLowerCase().indexOf(q) !== -1);
      });
      var active = s.goals.filter(function (g) { return g.status === "active"; }).length;
      $("#goals-count", root).textContent = active + " active · " + s.goals.length + " total";
      var list = $("#goals-list", root);
      list.innerHTML = items.length ? items.map(goalCard).join("") : '<div class="empty"><span class="empty-ico">◎</span>' + (q || st !== "all" ? "No goals match your filters." : "No goals yet. Set one and start making progress.") +
        (!q && st === "all" ? '<div class="empty-cta"><button class="btn btn-primary btn-sm" data-empty-capture="goal">＋ Add Goal</button></div>' : "") + "</div>";
      wireGoalCards(list, renderList);
      $$('[data-empty-capture]', list).forEach(function (b) { b.addEventListener('click', function () { openCapture(b.getAttribute('data-empty-capture')); }); });
    }
    function wireGoalCards(list, renderList) {
      $$("[data-pin]", list).forEach(function (b) {
        b.addEventListener("click", function () { togglePin("goal", b.getAttribute("data-pin")); renderList(); });
      });
      $$("[data-goal-progress]", list).forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-goal-goal") || b.getAttribute("data-goal-progress");
          var delta = Number(b.getAttribute("data-delta")) || 0;
          var g = getStore().goals.find(function (x) { return x.id === id; });
          if (g) updateGoal(id, { progress: Math.max(0, Math.min(100, (g.progress || 0) + delta)) });
          renderList();
        });
      });
      wireCards(list, renderList);
    }
    $("#goals-q", root).addEventListener("input", renderList);
    $("#goals-status", root).addEventListener("change", renderList);
    $("#goals-add", root).addEventListener("click", function () { openCapture("goal"); });
    $("#goals-ask", root).addEventListener("click", function () { openAskModal(); });
    renderList();
    return root;
  };

  function goalCard(g) {
    var meta = GOAL_STATUSES.find(function (x) { return x.value === g.status; }) || GOAL_STATUSES[0];
    var left = daysUntil(g.deadline);
    var urgency = left < 0 ? "overdue" : left <= 7 ? "soon" : "ok";
    return '<div class="mem-card violet" data-id="' + g.id + '">' +
      '<div class="mem-top"><span class="mem-ico violet">◎</span><span class="mem-kind">' + meta.label + "</span>" +
      '<button class="pin-btn ' + (g.pinned ? "on" : "") + '" data-pin="' + g.id + '" data-kind="goal">◆</button></div>' +
      '<strong class="mem-title">' + esc(g.title) + "</strong>" +
      '<p class="mem-body">' + esc(g.body || "") + "</p>" +
      '<div class="progress-track"><div class="progress-fill" style="width:' + (g.progress || 0) + '%"></div></div>' +
      '<div class="mem-foot"><span class="' + urgency + '">' + (left < 0 ? "overdue" : left + "d left") + " · " + formatDate(new Date(g.deadline + "T00:00:00").getTime()) + "</span>" +
      '<span class="row-actions">' +
        '<button class="row-btn" data-goal-progress="' + g.id + '" data-delta="-10">−10%</button>' +
        '<button class="row-btn" data-goal-progress="' + g.id + '" data-delta="+10">+10%</button>' +
        '<button class="row-btn" data-edit="' + g.id + '" data-kind="goal">Edit</button>' +
        '<button class="row-btn danger" data-del="' + g.id + '" data-kind="goal">Delete</button>' +
      "</span></div></div>";
  }
})();
