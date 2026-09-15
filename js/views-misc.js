/* ============================================================
   NeuroBot — views-misc.js
   Connections + Settings pages; Credits / Live / NeuroVision modals.
   ============================================================ */
import {
  $, $$, el, esc,
  getStore, resetDemo, clearAll, totalItems,
  renderGraph, openModal, toast,
} from "./core.js";
import { loadPrefs, savePrefs } from "./prefs.js";

/* ============================================================
   CONNECTIONS
   ============================================================ */

export function ConnectionsView() {
  const root = el(`<div class="page">
    <header class="page-head">
      <div><h1>Connections</h1><p class="muted">Visual prototype — connections are illustrative, not AI-generated.</p></div>
    </header>
    <div class="conn-grid">
      <section class="panel conn-panel">
        <div id="conn-graph" class="graph-wrap tall"></div>
      </section>
      <aside class="panel side-panel">
        <h3>About connections</h3>
        <p>Connections represent relationships between information in your second brain.</p>
        <p>When two memories share concepts, NeuroBot (in future phases) will surface them here so you can navigate knowledge as a graph rather than a pile.</p>
        <div class="hint">
          <p><strong>Legend</strong></p>
          <p><span class="legend-dot hub"></span> hub nodes</p>
          <p><span class="legend-dot leaf"></span> topic nodes</p>
        </div>
      </aside>
    </div>
  </div>`);
  renderGraph($("#conn-graph", root), { height: 420 });
  return root;
}

/* ============================================================
   SETTINGS
   ============================================================ */

export function SettingsView({ onOpenCredits }) {
  const root = el(`<div class="page">
    <header class="page-head"><div><h1>Settings</h1><p class="muted">Tune NeuroBot to your liking.</p></div></header>

    <section class="panel">
      <h3>Appearance</h3>
      <div class="row-between">
        <span>Compact density</span>
        <label class="switch"><input type="checkbox" id="set-density"><span class="slider"></span></label>
      </div>
      <div class="row-between">
        <span>Reduce motion</span>
        <label class="switch"><input type="checkbox" id="set-motion"><span class="slider"></span></label>
      </div>
      <div class="row-between">
        <span>Theme</span>
        <select id="set-theme">
          <option value="dark">Dark (default)</option>
          <option value="midnight">Midnight</option>
          <option value="forest">Forest</option>
        </select>
      </div>
    </section>

    <section class="panel">
      <h3>Notifications</h3>
      <div class="row-between">
        <span>Daily capture reminder</span>
        <label class="switch"><input type="checkbox" id="set-remind"><span class="slider"></span></label>
      </div>
      <div class="row-between">
        <span>Weekly digest (demo)</span>
        <label class="switch"><input type="checkbox" id="set-digest"><span class="slider"></span></label>
      </div>
    </section>

    <section class="panel">
      <h3>Data</h3>
      <div class="row-between">
        <span>Export brain as JSON</span>
        <button class="btn btn-outline btn-sm" id="set-export">Export</button>
      </div>
      <div class="row-between">
        <span>Reset demo data</span>
        <button class="btn btn-outline btn-sm" id="set-reset">Reset</button>
      </div>
      <div class="row-between">
        <span>Erase all memories</span>
        <button class="btn btn-outline btn-sm danger" id="set-clear">Erase</button>
      </div>
    </section>

    <section class="panel">
      <h3>Privacy</h3>
      <p class="muted">Everything is stored only in your browser (localStorage). Nothing leaves your device — except when you use <strong>Ask</strong>, which sends the selected memories to Google Gemini with your API key.</p>
    </section>

    <section class="panel">
      <h3>About NeuroBot</h3>
      <p class="muted">NeuroBot — Your Second Brain.</p>
      <p class="muted">Crafted by <strong>Tanishq Lalwani</strong></p>
      <button class="btn btn-outline btn-sm" id="set-credits">View credits</button>
    </section>
  </div>`);

  const prefs = loadPrefs();
  $("#set-density", root).checked = prefs.compact;
  $("#set-motion", root).checked = prefs.reduceMotion;
  $("#set-theme", root).value = prefs.theme;
  $("#set-remind", root).checked = prefs.remind;
  $("#set-digest", root).checked = prefs.digest;

  $("#set-density", root).addEventListener("change", (e) => savePrefs({ ...prefs, compact: e.target.checked }));
  $("#set-motion", root).addEventListener("change", (e) => savePrefs({ ...prefs, reduceMotion: e.target.checked }));
  $("#set-theme", root).addEventListener("change", (e) => savePrefs({ ...prefs, theme: e.target.value }));
  $("#set-remind", root).addEventListener("change", (e) => savePrefs({ ...prefs, remind: e.target.checked }));
  $("#set-digest", root).addEventListener("change", (e) => savePrefs({ ...prefs, digest: e.target.checked }));

  $("#set-export", root).addEventListener("click", exportJSON);
  $("#set-reset", root).addEventListener("click", () => { resetDemo(); toast("Demo data restored."); rerenderCurrentPage(); });
  $("#set-clear", root).addEventListener("click", () => { clearAll(); toast("All memories erased."); rerenderCurrentPage(); });
  $("#set-credits", root).addEventListener("click", onOpenCredits);
  return root;
}

/* ---------------- Export JSON ---------------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(getStore(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "neurobot-brain.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Brain exported as JSON.");
}

/* ---------------- Rerender hook (set by main.js) ---------------- */

export let rerenderCurrentPage = () => window.dispatchEvent(new Event("hashchange"));
export function setRerender(fn) {
  rerenderCurrentPage = fn;
}

/* ============================================================
   MODALS: Credits / Live / NeuroVision
   ============================================================ */

export function openCredits() {
  const modal = openModal({ subtitle: "$ neurobot credits --show", title: "Credits" });
  modal.body.innerHTML = `
    <div style="text-align:center">
      <div class="row" style="justify-content:center;gap:0.625rem">
        <span class="logo-mark" style="width:2.5rem;height:2.5rem;font-size:1.1rem">▚</span>
        <div style="text-align:left">
          <div style="font-weight:700">NeuroBot</div>
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-foreground)">Your Second Brain.</div>
        </div>
      </div>
      <div style="margin-top:1.25rem;border:1px solid rgba(74,222,128,.3);background:rgba(74,222,128,.05);border-radius:10px;padding:1rem">
        <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted-foreground)">crafted by</div>
        <div style="margin-top:0.25rem;font-size:1.125rem;font-weight:700;color:var(--primary)">TANISHQ LALWANI<span class="blink">▍</span></div>
        <div style="margin-top:0.5rem;font-size:11px;color:var(--muted-foreground)">✓ designer &amp; builder of this second brain</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin-top:0.875rem">
        <span class="chip green">school-project-2026</span>
        <span class="chip gray">vanilla js</span>
        <span class="chip amber">local-first</span>
      </div>
      <p style="margin-top:1rem;font-size:11px;color:var(--muted-foreground)"><span style="color:var(--primary)">$</span> whoami → tanishq</p>
      <button class="btn btn-outline btn-sm" style="margin-top:0.75rem" data-close>Close</button>
    </div>`;
  $("[data-close]", modal.body).addEventListener("click", modal.close);
}

export function openLive() {
  const modal = openModal({ subtitle: "$ neurobot live --voice", title: "NeuroBot Live" });
  modal.body.innerHTML = `
    <div style="text-align:center;padding:1rem 0">
      <div class="mic-visual">
        <div class="mic-ring"><div class="mic-core">🎙</div></div>
        <div class="mic-bars">${Array.from({ length: 7 }, (_, i) => `<i style="animation-delay:${(i * 0.12).toFixed(2)}s"></i>`).join("")}</div>
      </div>
      <h3 style="font-size:1.05rem;font-weight:700">NeuroBot Live</h3>
      <p style="margin:0.375rem auto 0;max-width:20rem;font-size:0.875rem;color:var(--muted-foreground)">Real-time voice conversations are coming soon.</p>
      <div style="margin-top:0.875rem"><span class="chip amber">status: in development</span></div>
      <div style="margin-top:1.25rem"><button class="btn btn-outline btn-sm" data-close>Back to my brain</button></div>
    </div>`;
  $("[data-close]", modal.body).addEventListener("click", modal.close);
}

export function openNeuroVision() {
  const modal = openModal({ subtitle: "$ neurobot vision --screen", title: "NeuroVision" });
  modal.body.innerHTML = `
    <div style="text-align:center;padding:1rem 0">
      <div class="mic-visual">
        <div class="mic-ring"><div class="mic-core">◎</div></div>
      </div>
      <h3 style="font-size:1.05rem;font-weight:700">NeuroVision</h3>
      <p style="margin:0.375rem auto 0;max-width:20rem;font-size:0.875rem;color:var(--muted-foreground)">NeuroVision is coming soon.</p>
      <div style="margin-top:0.875rem"><span class="chip amber">status: in development</span></div>
      <div style="margin-top:1.25rem"><button class="btn btn-outline btn-sm" data-close>Close</button></div>
    </div>`;
  $("[data-close]", modal.body).addEventListener("click", modal.close);
}
