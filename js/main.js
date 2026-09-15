/* NeuroBot — main.js (classic script).
   Hash router, shell wiring, command palette (Ctrl+K), credit popup. */
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
        '<input id="cmdk-q" placeholder="Search memories or jump to a page…" autocomplete="off" />' +
        '<span class="pill-kbd"><kbd>esc</kbd></span></div>' +
        '<div class="cmdk-list" id="cmdk-list"></div>' +
      "</div></div>"
    );
    root.appendChild(wrap);
    var input = $("#cmdk-q", wrap), list = $("#cmdk-list", wrap);

    function pagesFor(q) {
      var pages = [
        ["#/brain", "My Brain", "▤"], ["#/notes", "Notes", "✎"], ["#/ideas", "Ideas", "✦"],
        ["#/knowledge", "Knowledge", "◈"], ["#/goals", "Goals", "◎"], ["#/connections", "Connections", "⌬"],
        ["#/settings", "Settings", "⚙"],
      ];
      return pages.filter(function (p) { return !q || p[1].toLowerCase().indexOf(q) !== -1; })
        .slice(0, 6)
        .map(function (p) {
          return '<a class="cmdk-item" href="' + p[0] + '"><span class="cmdk-ico">' + p[2] + "</span>" + p[1] + '<span class="cmdk-hint">page</span></a>';
        });
    }
    function memoriesFor(q) {
      if (!q) return [];
      var s = getStore();
      var out = [];
      ["notes", "ideas", "goals", "knowledge"].forEach(function (key) {
        s[key].forEach(function (x) {
          if ((x.title + " " + (x.body || "")).toLowerCase().indexOf(q) !== -1 && out.length < 6) {
            var routeMap = { notes: "#/notes", ideas: "#/ideas", goals: "#/goals", knowledge: "#/knowledge" };
            out.push('<a class="cmdk-item" href="' + routeMap[key] + '"><span class="cmdk-ico">' +
              (NB.ITEM_META[x.kind] || NB.ITEM_META.note).icon + "</span>" + esc(x.title) +
              '<span class="cmdk-hint">' + (NB.ITEM_META[x.kind] || NB.ITEM_META.note).label.toLowerCase() + "</span></a>");
          }
        });
      });
      return out;
    }
    function render() {
      var q = input.value.toLowerCase().trim();
      var items = memoriesFor(q).concat(pagesFor(q));
      list.innerHTML = items.length ? items.join("") : '<div class="cmdk-empty">No matches.</div>';
    }
    function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }

    input.addEventListener("input", render);
    list.addEventListener("click", function (e) {
      if (e.target.closest(".cmdk-item")) close();
    });
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    render();
    setTimeout(function () { input.focus(); }, 30);
  }

  /* ---------- shell wiring ---------- */
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
    $("#live-btn").addEventListener("click", function () { if (NB.openLive) NB.openLive(); });
    $("#notif-btn").addEventListener("click", function () {
      var n = getStore().activity.length;
      if (NB.toast) NB.toast(n ? n + " recent captures in your brain." : "No notifications yet.", "ok");
    });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    });
  }

  /* ---------- credit popup (once per session) ---------- */
  function showCredit() {
    if (sessionStorage.getItem("nb_credit")) return;
    sessionStorage.setItem("nb_credit", "1");
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
