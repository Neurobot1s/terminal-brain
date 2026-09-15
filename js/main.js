/* NeuroBot — main.js (classic script).
   Hash router, shell wiring, command palette (Ctrl+K, arrow keys + Enter),
   keyboard shortcuts (?), credit popup, status-bar clock. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc;
  var getStore = NB.getStore, onStoreChange = NB.onStoreChange;

  var ROUTES = {
    "#/": function () { return NB.DashboardView(); },
    "#/brain": function () { return NB.BrainView(); },
    "#/notes": function () { return NB.NotesView(); },
    "#/ideas": function () { return NB.IdeasView(); },
    "#/knowledge": function () { return NB.KnowledgeView(); },
    "#/goals": function () { return NB.GoalsView(); },
    "#/connections": function () { return NB.ConnectionsView(); },
    "#/settings": function () { return NB.SettingsView(); },
  };

  var ROUTE_NAMES = {
    "#/": "dashboard", "#/brain": "my-brain", "#/notes": "notes", "#/ideas": "ideas",
    "#/knowledge": "knowledge", "#/goals": "goals", "#/connections": "connections", "#/settings": "settings",
  };

  function route() {
    var hash = location.hash || "#/";
    if (!ROUTES[hash]) hash = "#/";
    $$("#nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === hash);
    });
    var routeLabel = $("#topbar-route");
    if (routeLabel) routeLabel.textContent = ROUTE_NAMES[hash] || "dashboard";
    var view = $("#view");
    view.innerHTML = "";
    view.appendChild(ROUTES[hash]());
    window.scrollTo(0, 0);
    closeMobileNav();
  }

  function closeMobileNav() {
    document.querySelector(".app").classList.remove("side-open");
    var scrim = $("#scrim");
    if (scrim) scrim.classList.remove("show");
  }

  /* ---------- brain health indicator ---------- */
  function updateHealth() {
    var s = getStore();
    var total = s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length;
    var dot = $("#bh-dot"), label = $("#bh-label");
    if (!dot || !label) return;
    if (total === 0) {
      dot.style.background = "var(--warn)";
      dot.style.boxShadow = "0 0 10px rgba(251,191,36,.6)";
      label.textContent = "Brain warming up";
    } else if (total < 8) {
      dot.style.background = "var(--accent)";
      dot.style.boxShadow = "0 0 10px rgba(124,156,255,.6)";
      label.textContent = "Brain healthy · " + total + " items";
    } else {
      dot.style.background = "var(--ok)";
      dot.style.boxShadow = "0 0 10px rgba(74,222,128,.65)";
      label.textContent = "Brain thriving · " + total + " items";
    }
  }

  /* ---------- command palette (Ctrl+K) ---------- */
  function openPalette() {
    var root = $("#cmdk-root");
    if (!root || root.childElementCount) return;
    var wrap = el(
      '<div class="cmdk-backdrop open"><div class="cmdk" role="dialog" aria-label="Command palette">' +
        '<div class="cmdk-head"><span class="cmdk-spark">✦</span>' +
        '<input id="cmdk-q" placeholder="Search memories, jump to a page, run a command…" autocomplete="off" />' +
        '<span class="pill-kbd"><kbd>↑↓</kbd><kbd>↵</kbd></span></div>' +
        '<div class="cmdk-list" id="cmdk-list"></div>' +
      "</div></div>"
    );
    root.appendChild(wrap);
    var input = $("#cmdk-q", wrap), list = $("#cmdk-list", wrap);

    var pageEntries = [
      ["#/brain", "My Brain", "▤"], ["#/notes", "Notes", "✎"], ["#/ideas", "Ideas", "✦"],
      ["#/knowledge", "Knowledge", "◈"], ["#/goals", "Goals", "◎"], ["#/connections", "Connections", "⌬"],
      ["#/settings", "Settings", "⚙"],
    ];
    var actions = [
      { id: "terminal", label: "Open Terminal", ico: "›_", run: function () { if (NB.openTerminal) NB.openTerminal(); } },
      { id: "note", label: "New Note", ico: "✎", run: function () { NB.openCapture("note"); } },
      { id: "idea", label: "New Idea", ico: "✦", run: function () { NB.openCapture("idea"); } },
      { id: "goal", label: "New Goal", ico: "◎", run: function () { NB.openCapture("goal"); } },
      { id: "knowledge", label: "Save Thought", ico: "◈", run: function () { NB.openCapture("knowledge"); } },
      { id: "ask", label: "Ask your brain (AI)", ico: "✦", run: function () { if (NB.openAskModal) NB.openAskModal(); } },
      { id: "live", label: "NeuroBot Live", ico: "◉", run: function () { if (NB.openLive) NB.openLive(); } },
      { id: "export", label: "Export brain (JSON)", ico: "⇩", run: function () { if (NB.exportJSON) NB.exportJSON(); } },
      { id: "shortcuts", label: "Keyboard shortcuts", ico: "⌘", run: function () { openShortcuts(); } },
    ];

    /* flattened current result set for arrow-key navigation */
    var current = [];

    function pagesFor(q) {
      return pageEntries.filter(function (p) { return !q || p[1].toLowerCase().indexOf(q) !== -1; })
        .map(function (p) {
          return { html: '<a class="cmdk-item" href="' + p[0] + '"><span class="cmdk-ico">' + p[2] + "</span>" + p[1] + '<span class="cmdk-hint">page</span></a>', label: p[1] };
        });
    }
    function actionsFor(q) {
      return actions.filter(function (a) { return !q || a.label.toLowerCase().indexOf(q) !== -1; })
        .map(function (a) {
          return { html: '<button class="cmdk-item" type="button" data-act="' + a.id + '"><span class="cmdk-ico">' + a.ico + "</span>" + a.label + '<span class="cmdk-hint">action</span></button>', label: a.label };
        });
    }
    function memoriesFor(q) {
      if (!q) return [];
      var s = getStore(), out = [];
      ["notes", "ideas", "goals", "knowledge"].forEach(function (key) {
        s[key].forEach(function (x) {
          if ((x.title + " " + (x.body || "")).toLowerCase().indexOf(q) !== -1 && out.length < 6) {
            var routeMap = { notes: "#/notes", ideas: "#/ideas", goals: "#/goals", knowledge: "#/knowledge" };
            var meta = NB.ITEM_META[x.kind] || NB.ITEM_META.note;
            out.push({ html: '<a class="cmdk-item" href="' + routeMap[key] + '"><span class="cmdk-ico">' + meta.icon + "</span>" + esc(x.title) + '<span class="cmdk-hint">' + meta.label.toLowerCase() + "</span></a>", label: x.title });
          }
        });
      });
      return out;
    }
    function render() {
      var q = input.value.toLowerCase().trim();
      current = memoriesFor(q).concat(actionsFor(q), pagesFor(q));
      list.innerHTML = current.length ? current.map(function (it, i) {
        var h = it.html;
        return i === 0 ? h.replace('class="cmdk-item"', 'class="cmdk-item sel"') : h;
      }).join("") : '<div class="cmdk-empty">No matches.</div>';
    }
    function move(dir) {
      if (!current.length) return;
      var items = $$(".cmdk-item", list);
      var idx = items.findIndex(function (n) { return n.classList.contains("sel"); });
      if (idx === -1) idx = 0;
      else items[idx].classList.remove("sel");
      idx = (idx + dir + items.length) % items.length;
      items[idx].classList.add("sel");
      items[idx].scrollIntoView({ block: "nearest" });
    }
    function pick() {
      var sel = $(".cmdk-item.sel", list);
      if (!sel) return;
      if (sel.hasAttribute("data-act")) {
        var a = actions.filter(function (x) { return x.id === sel.getAttribute("data-act"); })[0];
        close();
        if (a) a.run();
      } else {
        var href = sel.getAttribute("href");
        close();
        if (href) location.hash = href;
      }
    }
    function close() { wrap.remove(); document.removeEventListener("keydown", onKey); document.removeEventListener("keydown", onListKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    function onListKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); pick(); }
    }

    input.addEventListener("input", render);
    input.addEventListener("keydown", onListKey);
    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn) {
        var a = actions.filter(function (x) { return x.id === btn.getAttribute("data-act"); })[0];
        close();
        if (a) a.run();
        return;
      }
      if (e.target.closest(".cmdk-item")) close();
    });
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    render();
    setTimeout(function () { input.focus(); }, 30);
  }

  /* ---------- notifications modal ---------- */
  function openNotifications() {
    var s = getStore();
    var modal = NB.openModal({ subtitle: "$ neurobot notifications --feed", title: "Activity" });
    var acts = s.activity.slice(0, 12);
    modal.body.innerHTML = acts.length
      ? '<div class="notif-list">' + acts.map(function (a) {
          var m = NB.ITEM_META[a.kind] || NB.ITEM_META.note;
          return '<div class="notif-row"><span class="mem-ico ' + m.tone + '">' + m.icon + "</span>" +
            '<span class="notif-title">' + esc(a.title) + '</span>' +
            '<span class="act-time">' + NB.timeAgo(a.createdAt) + "</span></div>";
        }).join("") + "</div>" +
        '<div class="form-actions"><button class="btn btn-outline btn-sm" data-goto-brain>Open My Brain →</button></div>'
      : '<div class="empty"><span class="empty-ico">◔</span>No notifications yet — capture something first.</div>';
    var gotoBtn = modal.body.querySelector("[data-goto-brain]");
    if (gotoBtn) gotoBtn.addEventListener("click", function () { modal.close(); location.hash = "#/brain"; });
  }

  /* ---------- keyboard shortcuts modal ---------- */
  function openShortcuts() {
    var modal = NB.openModal({ subtitle: "$ neurobot --shortcuts", title: "Keyboard shortcuts" });
    var rows = [
      ["Ctrl / ⌘ + K", "command palette — search everything, run actions"],
      ["` (backtick) or ~", "open / focus the terminal"],
      ["g then d", "go to dashboard"],
      ["g then b", "go to My Brain"],
      ["g then n", "go to Notes"],
      ["g then i", "go to Ideas"],
      ["g then k", "go to Knowledge"],
      ["g then g", "go to Goals"],
      ["g then c", "go to Connections"],
      ["g then s", "go to Settings"],
      ["N", "new note"],
      ["I", "new idea"],
      ["G", "new goal"],
      ["?", "this shortcut list"],
      ["Esc", "close any modal or palette"],
    ];
    modal.body.innerHTML =
      '<div class="shortcuts-list">' +
      rows.map(function (r) {
        return '<div class="sc-row"><span class="sc-keys"><kbd>' + esc(r[0]) + "</kbd></span>" +
          '<span class="sc-desc">' + esc(r[1]) + "</span></div>";
      }).join("") +
      "</div>";
  }

  /* ---------- shell wiring ---------- */
  var gPending = false;
  var GOTO = { d: "#/", b: "#/brain", n: "#/notes", i: "#/ideas", k: "#/knowledge", g: "#/goals", c: "#/connections", s: "#/settings" };

  function anyModalOpen() {
    return $("#modal-root").childElementCount > 0 || $("#cmdk-root").childElementCount > 0 || $("#term-root").childElementCount > 0;
  }

  function wireShell() {
    $("#menu-btn").addEventListener("click", function () {
      document.querySelector(".app").classList.add("side-open");
      var scrim = $("#scrim");
      if (scrim) scrim.classList.add("show");
    });
    var scrim = $("#scrim");
    if (scrim) scrim.addEventListener("click", closeMobileNav);

    $("#side-collapse").addEventListener("click", function () {
      document.querySelector(".app").classList.toggle("collapsed");
      localStorage.setItem("nb_side", document.querySelector(".app").classList.contains("collapsed") ? "1" : "0");
    });
    if (localStorage.getItem("nb_side") === "1") document.querySelector(".app").classList.add("collapsed");

    $("#search-btn").addEventListener("click", openPalette);
    var termBtn = $("#term-btn");
    if (termBtn) termBtn.addEventListener("click", function () { if (NB.openTerminal) NB.openTerminal(); });
    $("#live-btn").addEventListener("click", function () { if (NB.openLive) NB.openLive(); });
    $("#notif-btn").addEventListener("click", openNotifications);

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || anyModalOpen()) return;

      if (gPending) {
        gPending = false;
        var dest = GOTO[e.key.toLowerCase()];
        if (dest) { e.preventDefault(); location.hash = dest; return; }
      }
      if (e.key === "g" || e.key === "G") { gPending = true; setTimeout(function () { gPending = false; }, 1200); return; }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); if (NB.openCapture) NB.openCapture("note"); return; }
      if (e.key === "i" || e.key === "I") { e.preventDefault(); if (NB.openCapture) NB.openCapture("idea"); return; }
      if (e.key === "G") { e.preventDefault(); if (NB.openCapture) NB.openCapture("goal"); return; }
      if (e.key === "`" || e.key === "~") { e.preventDefault(); if (NB.openTerminal) NB.openTerminal(); return; }
      if (e.key === "?") { e.preventDefault(); openShortcuts(); return; }
    });
  }

  /* ---------- credit popup (once per session) ---------- */
  function showCredit() {
    try {
      if (sessionStorage.getItem("nb_credit")) return;
      sessionStorage.setItem("nb_credit", "1");
    } catch (e) { /* private mode / opaque origin — just show it */ }
    setTimeout(function () {
      if (NB.openCredits) NB.openCredits();
    }, 900);
  }

  /* ---------- boot ---------- */
  function startClock() {
    var t = $("#sb-time");
    if (!t) return;
    function tick() {
      var d = new Date();
      function p(n) { return (n < 10 ? "0" : "") + n; }
      t.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  function boot() {
    if (window.NB.loadPrefs && window.NB.applyPrefs) NB.applyPrefs(NB.loadPrefs());
    wireShell();
    onStoreChange(updateHealth);
    updateHealth();
    startClock();
    window.addEventListener("hashchange", route);
    if (!location.hash) location.hash = "#/";
    route();
    showCredit();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
