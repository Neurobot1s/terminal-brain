/* NeuroBot — views-kanban.js (classic script; extends window.NB).
   Ideas board: four status columns with inline status switching. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc;
  var timeAgo = NB.timeAgo, ITEM_META = NB.ITEM_META, IDEA_STATUSES = NB.IDEA_STATUSES;
  var getStore = NB.getStore, updateIdea = NB.updateIdea, removeIdea = NB.removeIdea, togglePin = NB.togglePin;
  var openCapture = NB.openCapture, openAskModal = NB.openAskModal, toast = NB.toast;

  NB.IdeasView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Ideas</h1><p class="muted" id="ideas-count"></p></div>' +
      '<div class="head-actions"><button class="btn btn-outline btn-sm" id="ideas-ask">✦ Ask</button>' +
      '<button class="btn btn-primary btn-sm" id="ideas-add">＋ New Idea</button></div></header>' +
      '<div id="kanban" class="kanban"></div></div>');

    function renderBoard() {
      var s = getStore();
      $("#ideas-count", root).textContent = s.ideas.length + " ideas · move them across the board as they grow";
      var kb = $("#kanban", root);
      kb.innerHTML = IDEA_STATUSES.map(function (st) {
        var items = s.ideas.filter(function (i) { return i.status === st.value; });
        var tone = st.tone === "gray" ? "" : st.tone;
        return '<div class="kanban-col" data-status="' + st.value + '">' +
          '<div class="kanban-head"><span class="chip on ' + (tone || "gray-chip") + '">' + st.label + '</span>' +
          '<span class="muted-xs">' + items.length + "</span></div>" +
          (items.length ? items.map(function (i) { return ideaCard(i, st); }).join("") : '<div class="kanban-empty">Nothing here yet</div>') +
          "</div>";
      }).join("");
      wireBoard();
    }

    function ideaCard(i, st) {
      var m = ITEM_META.idea;
      return '<div class="mem-card ' + m.tone + '" data-id="' + i.id + '">' +
        '<div class="mem-top"><span class="mem-ico ' + m.tone + '">' + m.icon + '</span>' +
        '<span class="mem-kind">' + esc(i.category) + '</span>' +
        '<button class="pin-btn ' + (i.pinned ? "on" : "") + '" data-pin="' + i.id + '">◆</button></div>' +
        '<strong class="mem-title">' + esc(i.title) + "</strong>" +
        '<p class="mem-body">' + esc(i.body || "") + "</p>" +
        '<select class="status-select" data-status-for="' + i.id + '">' +
          IDEA_STATUSES.map(function (x) {
            return '<option value="' + x.value + '"' + (x.value === i.status ? " selected" : "") + ">" + x.label + "</option>";
          }).join("") +
        "</select>" +
        '<div class="mem-foot"><span class="muted-xs">' + timeAgo(i.createdAt || Date.now()) + "</span>" +
        '<span class="row-actions">' +
          '<button class="row-btn" data-edit="' + i.id + '">Edit</button>' +
          '<button class="row-btn danger" data-del="' + i.id + '">Delete</button>' +
        "</span></div></div>";
    }

    function wireBoard() {
      var kb = $("#kanban", root);
      $$("[data-pin]", kb).forEach(function (b) {
        b.addEventListener("click", function () { togglePin("idea", b.getAttribute("data-pin")); renderBoard(); });
      });
      $$("[data-status-for]", kb).forEach(function (sel) {
        sel.addEventListener("change", function () {
          updateIdea(sel.getAttribute("data-status-for"), { status: sel.value });
          renderBoard();
          toast("Idea moved to " + sel.value + ".");
        });
      });
      $$("[data-edit]", kb).forEach(function (b) {
        b.addEventListener("click", function () {
          openCapture("idea", getStore().ideas.find(function (x) { return x.id === b.getAttribute("data-edit"); }));
        });
      });
      $$("[data-del]", kb).forEach(function (b) {
        b.addEventListener("click", function () {
          removeIdea(b.getAttribute("data-del"));
          renderBoard();
          toast("Idea deleted.");
        });
      });
    }

    $("#ideas-add", root).addEventListener("click", function () { openCapture("idea"); });
    $("#ideas-ask", root).addEventListener("click", function () { openAskModal(); });
    renderBoard();
    return root;
  };
})();
