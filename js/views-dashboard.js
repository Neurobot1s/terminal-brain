/* NeuroBot — views-dashboard.js (classic script; extends window.NB). */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc;
  var timeAgo = NB.timeAgo, ITEM_META = NB.ITEM_META;
  var getStore = NB.getStore, removeActivity = NB.removeActivity, totalItems = NB.totalItems;
  var renderGraph = NB.renderGraph, toast = NB.toast, openAskModal = NB.openAskModal, openCapture = NB.openCapture;
  function rerender() { window.dispatchEvent(new Event("hashchange")); }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }
  var ROUTE_BY_TONE = { cyan: "#/knowledge", amber: "#/ideas", violet: "#/goals", green: "#/connections", gray: "#/brain" };

  /* Connections = real pairs of memories sharing a topic/category. */
  function countConnections() {
    var s = getStore(), groups = {};
    function add(key) { if (!key) return; groups[key] = (groups[key] || 0) + 1; }
    s.notes.forEach(function (n) { add(n.category); });
    s.ideas.forEach(function (i) { add(i.category); });
    s.knowledge.forEach(function (k) { add(k.topic); });
    var total = 0;
    Object.keys(groups).forEach(function (key) {
      var n = groups[key];
      if (n > 1) total += (n * (n - 1)) / 2;
    });
    return total;
  }

  function statCard(label, value, icon, tone) {
    return '<a class="stat-card ' + tone + '" href="' + (ROUTE_BY_TONE[tone] || "#/brain") + '">' +
      '<span class="stat-ico">' + icon + "</span>" +
      '<span class="stat-val">' + value + "</span>" +
      '<span class="stat-label">' + esc(label) + "</span></a>";
  }

  NB.DashboardView = function () {
    var s = getStore();
    var root = el('<div class="page">' +
      '<section class="hero"><h1>' + greeting() + ' <span class="wave">👋</span></h1><p class="hero-sub">Your second brain is ready.</p></section>' +
      '<div class="ask-box"><span class="ask-spark">✦</span>' +
        '<input id="ask-input" placeholder="Ask your brain anything…" autocomplete="off" />' +
        '<button class="ask-mic" title="Voice (demo)" id="ask-mic">🎙</button>' +
        '<button class="ask-send" id="ask-send" title="Send">➤</button></div>' +
      '<section class="stat-grid">' +
        statCard("Knowledge", s.knowledge.length, "◈", "cyan") +
        statCard("Ideas", s.ideas.length, "✦", "amber") +
        statCard("Active goals", s.goals.filter(function (g) { return g.status !== "completed"; }).length, "◎", "violet") +
        statCard("Connections", countConnections(), "⌬", "green") +
        statCard("Total memories", totalItems(), "▤", "gray") +
      "</section>" +
      '<div class="dash-grid">' +
        '<section class="panel"><div class="panel-head"><h3>Neural network</h3><a class="panel-link" href="#/connections">Open Connections →</a></div>' +
          '<div id="dash-graph" class="graph-wrap"></div>' +
          '<p class="hint">Visual demo — connections shown are illustrative, not AI-generated.</p></section>' +
        '<section class="panel"><div class="panel-head"><h3>Quick Capture</h3><span class="muted-xs">saved locally</span></div>' +
          '<div class="qc-grid">' +
            '<button class="qc-btn" data-capture="note"><span>▤</span>New Note</button>' +
            '<button class="qc-btn" data-capture="idea"><span>✦</span>New Idea</button>' +
            '<button class="qc-btn" data-capture="knowledge"><span>◈</span>Save Thought</button>' +
            '<button class="qc-btn" data-capture="goal"><span>◎</span>Add Goal</button>' +
          "</div>" +
          '<div class="neurovision-card"><div class="nv-ico">◎</div>' +
            '<div class="nv-copy"><strong>NeuroVision</strong><p>Let NeuroBot understand what\u2019s on your screen.</p></div>' +
            '<button class="btn btn-outline btn-sm" id="nv-try">Try NeuroVision</button></div>' +
        "</section>" +
      "</div>" +
      '<section class="panel" id="pinned-panel"><div class="panel-head"><h3>Pinned memories</h3><a class="panel-link" href="#/brain">Open My Brain →</a></div>' +
        '<div id="pinned-list" class="grid-cards pinned-grid"></div></section>' +
      '<section class="panel"><div class="panel-head"><h3>Recent activity</h3><a class="panel-link" href="#/brain">view all →</a></div>' +
        '<div id="recent-list"></div></section>' +
      "</div>");

    renderGraph($("#dash-graph", root), { height: 300 });

    /* pinned memories row */
    var pinned = s.notes.concat(s.ideas, s.goals, s.knowledge)
      .filter(function (x) { return x.pinned; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
      .slice(0, 4);
    var pWrap = $("#pinned-list", root), pPanel = $("#pinned-panel", root);
    if (!pinned.length) { pPanel.style.display = "none"; }
    else {
      pWrap.innerHTML = pinned.map(function (x) {
        var m = ITEM_META[x.kind] || ITEM_META.note;
        var body = x.progress != null
          ? '<div class="progress-track"><div class="progress-fill" style="width:' + x.progress + '%"></div></div>'
          : '<p class="mem-body">' + esc(x.body || "") + "</p>";
        return '<a class="mem-card ' + m.tone + '" href="' + (x.kind === "idea" ? "#/ideas" : x.kind === "goal" ? "#/goals" : x.kind === "knowledge" ? "#/knowledge" : "#/notes") + '">' +
          '<div class="mem-top"><span class="mem-ico ' + m.tone + '">' + m.icon + '</span><span class="mem-kind">' + m.label + '</span><span class="pin-btn on">◆</span></div>' +
          '<strong class="mem-title">' + esc(x.title) + "</strong>" + body + "</a>";
      }).join("");
    }

    var acts = s.activity.slice(0, 6);
    var recent = $("#recent-list", root);
    recent.innerHTML = acts.length
      ? acts.map(function (a) {
          var m = ITEM_META[a.kind] || ITEM_META.note;
          return '<div class="activity-row">' +
            '<span class="act-ico ' + m.tone + '">' + m.icon + "</span>" +
            '<span class="act-title">' + esc(a.title) + "</span>" +
            '<span class="act-time">' + timeAgo(a.createdAt) + "</span>" +
            '<button class="row-del" data-del-act="' + a.id + '" title="Remove">×</button></div>';
        }).join("")
      : '<div class="empty-sm">No activity yet — capture something!</div>';

    recent.addEventListener("click", function (e) {
      var del = e.target.closest("[data-del-act]");
      if (del) { removeActivity(del.getAttribute("data-del-act")); rerender(); }
    });
    $$(".qc-btn", root).forEach(function (b) {
      b.addEventListener("click", function () { openCapture(b.getAttribute("data-capture")); });
    });
    /* inline AI chat — answers appear right under the box */
    var thread = el('<div class="ask-thread" hidden></div>');
    root.querySelector(".ask-box").insertAdjacentElement("afterend", thread);
    function bubble(kind, text) {
      var b = el('<div class="bubble ' + kind + '"></div>');
      b.textContent = text;
      thread.appendChild(b);
      thread.hidden = false;
      b.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return b;
    }
    function send() {
      var input = $("#ask-input", root);
      var q = input.value.trim();
      if (!q) return;
      input.value = "";
      bubble("user", q);
      var thinking = bubble("ai think", "✦ thinking with " + totalItems() + " memories…");
      var sendBtn = $("#ask-send", root);
      sendBtn.disabled = true;
      NB.askGemini(q).then(function (answer) {
        thinking.className = "bubble ai";
        thinking.textContent = answer;
      }).catch(function (err) {
        thinking.className = "bubble err";
        thinking.textContent = "⚠ " + (err.message || String(err));
      }).then(function () {
        sendBtn.disabled = false;
        input.focus();
      });
    }
    $("#ask-send", root).addEventListener("click", send);
    $("#ask-input", root).addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
    $("#ask-mic", root).addEventListener("click", function () { toast("Voice input is a visual demo for now.", "warn"); });
    $("#nv-try", root).addEventListener("click", function () { if (NB.openNeuroVision) NB.openNeuroVision(); });
    return root;
  };
})();
