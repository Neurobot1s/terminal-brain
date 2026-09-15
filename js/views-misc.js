/* NeuroBot — views-misc.js (classic script; extends window.NB).
   Connections + Settings pages; Credits / Live / NeuroVision modals. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, $$ = NB.$$, el = NB.el, esc = NB.esc;
  var getStore = NB.getStore, resetDemo = NB.resetDemo, clearAll = NB.clearAll;
  var renderGraph = NB.renderGraph, openModal = NB.openModal, toast = NB.toast;
  var loadPrefs = NB.loadPrefs, savePrefs = NB.savePrefs;
  function rerender() { window.dispatchEvent(new Event("hashchange")); }

  /* ============================================================
     CONNECTIONS
     ============================================================ */
  NB.ConnectionsView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Connections</h1><p class="muted">Visual prototype — connections are illustrative, not AI-generated.</p></div></header>' +
      '<div class="conn-grid">' +
        '<section class="panel conn-panel"><div id="conn-graph" class="graph-wrap tall"></div></section>' +
        '<aside class="panel side-panel">' +
          '<h3>About connections</h3>' +
          '<p class="muted">Connections represent relationships between information in your second brain.</p>' +
          '<p class="muted">When two memories share concepts, NeuroBot will surface them here so you can navigate knowledge as a graph rather than a pile.</p>' +
          '<div class="hint"><p><strong>Legend</strong></p>' +
          '<p><span class="legend-dot hub"></span> hub nodes</p>' +
          '<p><span class="legend-dot leaf"></span> topic nodes</p></div>' +
        "</aside>" +
      "</div></div>");
    renderGraph($("#conn-graph", root), { height: 420 });
    return root;
  };

  /* ============================================================
     SETTINGS
     ============================================================ */
  NB.SettingsView = function () {
    var root = el('<div class="page">' +
      '<header class="page-head"><div><h1>Settings</h1><p class="muted">Tune NeuroBot to your liking.</p></div></header>' +
      '<section class="panel"><h3>Appearance</h3>' +
        '<div class="row-between"><span>Compact density</span><label class="switch"><input type="checkbox" id="set-density"><span class="slider"></span></label></div>' +
        '<div class="row-between"><span>Reduce motion</span><label class="switch"><input type="checkbox" id="set-motion"><span class="slider"></span></label></div>' +
        '<div class="row-between"><span>Theme</span><select id="set-theme" class="sel">' +
          '<option value="dark">Dark (default)</option><option value="midnight">Midnight</option><option value="forest">Forest</option>' +
        "</select></div>" +
      "</section>" +
      '<section class="panel"><h3>Notifications</h3>' +
        '<div class="row-between"><span>Daily capture reminder</span><label class="switch"><input type="checkbox" id="set-remind"><span class="slider"></span></label></div>' +
        '<div class="row-between"><span>Weekly digest (demo)</span><label class="switch"><input type="checkbox" id="set-digest"><span class="slider"></span></label></div>' +
      "</section>" +
      '<section class="panel"><h3>Data</h3>' +
        '<div class="row-between"><span>Export brain as JSON</span><button class="btn btn-outline btn-sm" id="set-export">Export</button></div>' +
        '<div class="row-between"><span>Reset demo data</span><button class="btn btn-outline btn-sm" id="set-reset">Reset</button></div>' +
        '<div class="row-between"><span>Erase all memories</span><button class="btn btn-outline btn-sm danger" id="set-clear">Erase</button></div>' +
      "</section>" +
      '<section class="panel"><h3>Privacy</h3>' +
        '<p class="muted">Everything is stored only in your browser (localStorage). Nothing leaves your device — except when you use <strong>Ask</strong>, which sends the selected memories to Google Gemini.</p>' +
      "</section>" +
      '<section class="panel"><h3>About NeuroBot</h3>' +
        '<p class="muted">NeuroBot — Your Second Brain.</p>' +
        '<p class="muted">Crafted by <strong>Tanishq Lalwani</strong></p>' +
        '<button class="btn btn-outline btn-sm" id="set-credits">View credits</button>' +
      "</section></div>");

    var prefs = loadPrefs();
    $("#set-density", root).checked = prefs.compact;
    $("#set-motion", root).checked = prefs.reduceMotion;
    $("#set-theme", root).value = prefs.theme;
    $("#set-remind", root).checked = prefs.remind;
    $("#set-digest", root).checked = prefs.digest;

    $("#set-density", root).addEventListener("change", function (e) { savePrefs(Object.assign({}, prefs, { compact: e.target.checked })); toast("Density updated."); });
    $("#set-motion", root).addEventListener("change", function (e) { savePrefs(Object.assign({}, prefs, { reduceMotion: e.target.checked })); toast("Motion preference saved."); });
    $("#set-theme", root).addEventListener("change", function (e) { savePrefs(Object.assign({}, prefs, { theme: e.target.value })); });
    $("#set-remind", root).addEventListener("change", function (e) { savePrefs(Object.assign({}, prefs, { remind: e.target.checked })); });
    $("#set-digest", root).addEventListener("change", function (e) { savePrefs(Object.assign({}, prefs, { digest: e.target.checked })); });

    $("#set-export", root).addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(getStore(), null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "neurobot-brain.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Brain exported as JSON.");
    });
    $("#set-reset", root).addEventListener("click", function () { resetDemo(); toast("Demo data restored."); rerender(); });
    $("#set-clear", root).addEventListener("click", function () { clearAll(); toast("All memories erased."); rerender(); });
    $("#set-credits", root).addEventListener("click", function () { if (NB.openCredits) NB.openCredits(); });
    return root;
  };

  /* ============================================================
     MODALS: Credits / Live / NeuroVision
     ============================================================ */
  NB.openCredits = function () {
    var modal = openModal({ subtitle: "$ neurobot credits --show" });
    modal.body.innerHTML =
      '<div style="text-align:center">' +
        '<div class="credits-brand"><span class="logo-mark big">▚</span>' +
        '<div style="text-align:left"><div style="font-weight:700">NeuroBot</div>' +
        '<div class="muted-xs up">Your Second Brain.</div></div></div>' +
        '<div class="credits-box">' +
          '<div class="muted-xs up">crafted by</div>' +
          '<div class="credits-name">TANISHQ LALWANI<span class="blink">▍</span></div>' +
          '<div class="muted-xs" style="margin-top:.5rem">✓ designer &amp; builder of this second brain</div>' +
        "</div>" +
        '<div class="chip-row"><span class="chip on">school-project-2026</span><span class="chip">vanilla js</span><span class="chip">local-first</span></div>' +
        '<p class="muted-xs" style="margin-top:1rem"><span class="dollar">$</span> whoami → tanishq</p>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:.75rem" data-close>Close</button>' +
      "</div>";
    $("[data-close]", modal.body).addEventListener("click", modal.close);
  };

  NB.openLive = function () {
    var modal = openModal({ subtitle: "$ neurobot live --voice" });
    var bars = [];
    for (var i = 0; i < 7; i++) bars.push('<i style="animation-delay:' + (i * 0.12).toFixed(2) + 's"></i>');
    modal.body.innerHTML =
      '<div style="text-align:center;padding:1rem 0">' +
        '<div class="mic-visual"><div class="mic-ring"><div class="mic-core">🎙</div></div>' +
        '<div class="mic-bars">' + bars.join("") + "</div></div>" +
        '<h3 style="font-size:1.05rem;font-weight:700;margin:.75rem 0 0">NeuroBot Live</h3>' +
        '<p class="muted" style="margin:.375rem auto 0;max-width:20rem">Real-time voice conversations are coming soon.</p>' +
        '<div style="margin-top:.875rem"><span class="chip on">status: in development</span></div>' +
        '<div style="margin-top:1.25rem"><button class="btn btn-outline btn-sm" data-close>Back to my brain</button></div>' +
      "</div>";
    $("[data-close]", modal.body).addEventListener("click", modal.close);
  };

  NB.openNeuroVision = function () {
    var modal = openModal({ subtitle: "$ neurobot vision --screen" });
    modal.body.innerHTML =
      '<div style="text-align:center;padding:1rem 0">' +
        '<div class="mic-visual"><div class="mic-ring"><div class="mic-core">◎</div></div></div>' +
        '<h3 style="font-size:1.05rem;font-weight:700;margin:.75rem 0 0">NeuroVision</h3>' +
        '<p class="muted" style="margin:.375rem auto 0;max-width:20rem">NeuroVision is coming soon.</p>' +
        '<div style="margin-top:.875rem"><span class="chip on">status: in development</span></div>' +
        '<div style="margin-top:1.25rem"><button class="btn btn-outline btn-sm" data-close>Close</button></div>' +
      "</div>";
    $("[data-close]", modal.body).addEventListener("click", modal.close);
  };
})();
