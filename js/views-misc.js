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
          '<p><span class="legend-dot leaf"></span> topic nodes</p>' +
          '<p class="legend-note">node size = memories in that area · hover a node for its count</p></div>' +
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
      '<section class="panel"><h3>AI Connection</h3>' +
        '<p class="muted">The AI answers questions using your memories, calling NVIDIA directly from your browser (works on GitHub Pages — no server needed). The embedded key is a demo key; override it below with your own.</p>' +
        '<div class="ai-model-row"><label class="muted-xs" for="ai-model">Model</label><select id="ai-model"></select>' +
          '<button class="btn btn-outline btn-sm" id="ai-model-save">Use this model</button></div>' +
        '<div class="row-between"><span>Custom key</span><code id="ai-key-preview" class="key-preview"></code></div>' +
        '<div class="ai-key-row"><input id="ai-key-input" class="key-input" placeholder="Optional: paste a custom key (nvapi-…)" autocomplete="off" spellcheck="false" /></div>' +
        '<div class="ai-key-row">' +
          '<button class="btn btn-primary btn-sm" id="ai-key-save">Save key</button>' +
          '<button class="btn btn-outline btn-sm" id="ai-key-reset">Clear override</button>' +
          '<button class="btn btn-outline btn-sm" id="ai-key-test">Test connection</button></div>' +
        '<div id="ai-test-out" class="ai-test-out"></div>' +
        '<div id="ai-env-out" class="ai-env"></div>' +
        '<p class="muted muted-xs">Runs fully client-side — the browser talks straight to NVIDIA. Only your question + relevant memory text leave the device.</p>' +
      '</section>' +
      '<section class="panel"><h3>Data</h3>' +
        '<div class="row-between"><span>Export brain as JSON</span><button class="btn btn-outline btn-sm" id="set-export">Export</button></div>' +
        '<div class="row-between"><span>Import brain from JSON</span><button class="btn btn-outline btn-sm" id="set-import">Import</button></div>' +
        '<div class="row-between"><span>Reset demo data</span><button class="btn btn-outline btn-sm" id="set-reset">Reset</button></div>' +
        '<div class="row-between"><span>Erase all memories</span><button class="btn btn-outline btn-sm danger" id="set-clear">Erase</button></div>' +
        '<input type="file" id="set-import-file" accept=".json,application/json" style="display:none" />' +
      "</section>" +
      '<section class="panel"><h3>Privacy</h3>' +
        '<p class="muted">Everything is stored only in your browser (localStorage). Nothing leaves your device — except when you use <strong>Ask</strong>, which sends your memories to the AI model through this site\'s own server.</p>' +
      "</section>" +
      '<section class="panel"><h3>About NeuroBot</h3>' +
        '<p class="muted">NeuroBot — Your Second Brain.</p>' +
        '<p class="muted">Crafted by <strong>Tanishq Lalwani</strong></p>' +
        '<button class="btn btn-outline btn-sm" id="set-credits">View credits</button>' +
      "</section></div>");

    var prefs = loadPrefs();
    var keyPrev = $("#ai-key-preview", root);
    function maskKey(k) { return k ? (k.length > 14 ? k.slice(0, 7) + "…" + k.slice(-4) : k) : "embedded default"; }
    keyPrev.textContent = maskKey(NB.getAIKey());
    $("#ai-key-save", root).addEventListener("click", function () {
      var v = $("#ai-key-input", root).value.trim();
      if (!v) { toast("Paste a key first.", "err"); return; }
      NB.setAIKey(v);
      keyPrev.textContent = maskKey(NB.getAIKey());
      $("#ai-key-input", root).value = "";
      toast("Key saved locally.");
    });
    $("#ai-key-test", root).addEventListener("click", function () {
      var out = $("#ai-test-out", root);
      out.textContent = "$ ai --test … pinging the model…";
      out.className = "ai-test-out pending";
      NB.testAI().then(function (r) {
        out.textContent = (r.ok ? "✓ " : "⚠ ") + r.message;
        out.className = "ai-test-out " + (r.ok ? "ok" : "err");
      });
    });
    $("#ai-key-reset", root).addEventListener("click", function () {
      NB.setAIKey("");
      keyPrev.textContent = maskKey(NB.getAIKey());
      toast("Using the embedded NVIDIA key.");
    });

    /* model picker → localStorage (static hosting — no server writes) */
    var modelSel = $("#ai-model", root), envOut = $("#ai-env-out", root), testOut = $("#ai-test-out", root);
    (NB.AI_MODELS || []).forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      o.textContent = String(m).indexOf("gpt-oss") !== -1 ? "GPT-OSS 20B" : "Nemotron Nano";
      modelSel.appendChild(o);
    });
    modelSel.value = NB.getAIModel ? NB.getAIModel() : (NB.AI_MODELS || [])[0];
    function refreshEnv() {
      var e = NB.aiEnv ? NB.aiEnv() : {};
      envOut.innerHTML = "env · transport: <b>direct</b> · browser: <b>" + NB.esc(e.protocol || "?") +
        "</b> · key: <b>" + NB.esc(e.key || "?") + "</b> · model: <b>" + NB.esc((String(e.model || "").indexOf("gpt-oss") !== -1 ? "GPT-OSS 20B" : "Nemotron Nano")) + "</b>";
      var st = NB.aiStatus ? NB.aiStatus() : {};
      if (st.lastError) envOut.innerHTML += " · last error: <b>" + NB.esc(st.lastError) + "</b>";
    }
    refreshEnv();
    $("#ai-model-save", root).addEventListener("click", function () {
      var ok = NB.setAIModel(modelSel.value);
      toast(ok ? "Model saved on this device." : "Could not save — keeping default.", ok ? "ok" : "err");
      refreshEnv();
      testOut.className = "ai-test-out";
    });

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

    $("#set-export", root).addEventListener("click", function () { if (NB.exportJSON) NB.exportJSON(); });
    $("#set-import", root).addEventListener("click", function () { $("#set-import-file", root).click(); });
    $("#set-import-file", root).addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          var clean = { notes: [], ideas: [], goals: [], knowledge: [], activity: [] };
          var kinds = { notes: "note", ideas: "idea", goals: "goal", knowledge: "knowledge" };
          Object.keys(kinds).forEach(function (key) {
            if (!Array.isArray(data[key])) return;
            clean[key] = data[key]
              .filter(function (x) { return x && typeof x.title === "string" && x.title.trim(); })
              .slice(0, 500)
              .map(function (x) {
                var item = { id: NB.uid(), kind: kinds[key], title: String(x.title).slice(0, 300), createdAt: Number(x.createdAt) || Date.now() };
                if (x.body) item.body = String(x.body).slice(0, 5000);
                if (x.category) item.category = String(x.category).slice(0, 60);
                if (x.topic) item.topic = String(x.topic).slice(0, 60);
                if (x.source) item.source = String(x.source).slice(0, 200);
                if (x.status) item.status = String(x.status).slice(0, 20);
                if (x.progress != null) item.progress = Math.max(0, Math.min(100, Number(x.progress) || 0));
                if (x.deadline) item.deadline = String(x.deadline).slice(0, 10);
                if (x.pinned) item.pinned = true;
                return item;
              });
          });
          if (Array.isArray(data.activity)) {
            clean.activity = data.activity.filter(function (a) { return a && a.title; }).slice(0, 50)
              .map(function (a) { return { id: NB.uid(), kind: String(a.kind || "note"), title: String(a.title).slice(0, 300), createdAt: Number(a.createdAt) || Date.now() }; });
          }
          var total = clean.notes.length + clean.ideas.length + clean.goals.length + clean.knowledge.length;
          if (!total) { toast("Import failed: no valid items found in that file.", "err"); return; }
          NB.setStore(clean);
          toast("Imported " + total + " memories.");
          rerender();
        } catch (err) {
          toast("Import failed: not a valid JSON file.", "err");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
    $("#set-reset", root).addEventListener("click", function () {
      if (!window.confirm("Restore the demo data? Your current memories will be replaced.")) return;
      resetDemo(); toast("Demo data restored."); rerender();
    });
    $("#set-clear", root).addEventListener("click", function () {
      if (!window.confirm("Erase ALL memories? This cannot be undone.")) return;
      clearAll(); toast("All memories erased."); rerender();
    });
    $("#set-credits", root).addEventListener("click", function () { if (NB.openCredits) NB.openCredits(); });
    return root;
  };

  /* ============================================================
     MODALS: Credits / Live / NeuroVision
     ============================================================ */
  NB.exportJSON = function () {
    var blob = new Blob([JSON.stringify(getStore(), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "neurobot-brain.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Brain exported as JSON.");
  };

  NB.openCredits = function () {
    var modal = openModal({ subtitle: "$ neurobot credits --show", title: "Credits" });
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
    var modal = openModal({ subtitle: "$ neurobot live --voice", title: "NeuroBot Live" });
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
    var modal = openModal({ subtitle: "$ neurobot vision --screen", title: "NeuroVision" });
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
