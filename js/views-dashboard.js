/* ============================================================
   NeuroBot — views-dashboard.js
   Dashboard page: hero, ask box, stats, graph, quick capture,
   NeuroVision card, recent activity.
   ============================================================ */
import {
  $, $$, el, esc, timeAgo, ITEM_META,
  getStore, removeActivity, totalItems,
  renderGraph, toast,
} from "./core.js";
import { openAskModal } from "./ai.js";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const ROUTE_BY_TONE = {
  cyan: "#/knowledge",
  amber: "#/ideas",
  violet: "#/goals",
  green: "#/connections",
  gray: "#/brain",
};

function statCard(label, value, icon, tone) {
  return `<a class="stat-card ${tone}" href="${ROUTE_BY_TONE[tone] || "#/brain"}">
    <span class="stat-ico">${icon}</span>
    <span class="stat-val">${value}</span>
    <span class="stat-label">${esc(label)}</span>
  </a>`;
}

export function DashboardView({ onOpenCapture, onOpenLive, onOpenNeuroVision }) {
  const s = getStore();
  const root = el(`<div class="page">
    <section class="hero">
      <h1>${greeting()} <span class="wave">👋</span></h1>
      <p class="hero-sub">Your second brain is ready.</p>
    </section>

    <div class="ask-box">
      <span class="ask-spark">✦</span>
      <input id="ask-input" placeholder="Ask your brain anything…" autocomplete="off" />
      <button class="ask-mic" title="Voice (demo)" id="ask-mic">🎙</button>
      <button class="ask-send" id="ask-send" title="Send">➤</button>
    </div>

    <section class="stat-grid">
      ${statCard("Knowledge", s.knowledge.length, "◈", "cyan")}
      ${statCard("Ideas", s.ideas.length, "✦", "amber")}
      ${statCard("Active goals", s.goals.filter((g) => g.status !== "completed").length, "◎", "violet")}
      ${statCard("Connections", 42, "⌬", "green")}
      ${statCard("Total memories", totalItems(), "▤", "gray")}
    </section>

    <div class="dash-grid">
      <section class="panel">
        <div class="panel-head">
          <h3>Neural network</h3>
          <a class="panel-link" href="#/connections">Open Connections →</a>
        </div>
        <div id="dash-graph" class="graph-wrap"></div>
        <p class="hint">Visual demo — connections shown are illustrative, not AI-generated.</p>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Quick Capture</h3><span class="muted-xs">saved locally</span></div>
        <div class="qc-grid">
          <button class="qc-btn" data-capture="note"><span>▤</span>New Note</button>
          <button class="qc-btn" data-capture="idea"><span>✦</span>New Idea</button>
          <button class="qc-btn" data-capture="knowledge"><span>◈</span>Save Thought</button>
          <button class="qc-btn" data-capture="goal"><span>◎</span>Add Goal</button>
        </div>
        <div class="neurovision-card">
          <div class="nv-ico">◎</div>
          <div class="nv-copy">
            <strong>NeuroVision</strong>
            <p>Let NeuroBot understand what's on your screen.</p>
          </div>
          <button class="btn btn-outline btn-sm" id="nv-try">Try NeuroVision</button>
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h3>Recent activity</h3>
        <span class="muted-xs">last 6</span>
      </div>
      <div id="recent-list"></div>
    </section>
  </div>`);

  renderGraph($("#dash-graph", root), { height: 300 });

  const recent = $("#recent-list", root);
  const acts = s.activity.slice(0, 6);
  recent.innerHTML = acts.length
    ? acts.map((a) => `
        <div class="activity-row">
          <span class="act-ico ${ITEM_META[a.kind].tone}">${ITEM_META[a.kind].icon}</span>
          <span class="act-title">${esc(a.title)}</span>
          <span class="act-time">${timeAgo(a.createdAt)}</span>
          <button class="row-del" data-del-act="${a.id}" title="Remove">×</button>
        </div>`).join("")
    : `<div class="empty-sm">No activity yet — capture something!</div>`;

  recent.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-act]");
    if (del) { removeActivity(del.dataset.delAct); rerender(); }
  });

  $$(".qc-btn", root).forEach((b) => b.addEventListener("click", () => onOpenCapture(b.dataset.capture)));

  $("#ask-send", root).addEventListener("click", () => {
    const q = $("#ask-input", root).value.trim();
    if (!q) return;
    $("#ask-input", root).value = "";
    openAskModal(q);
  });
  $("#ask-input", root).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#ask-send", root).click();
  });
  $("#ask-mic", root).addEventListener("click", () => toast("Voice input is a visual demo for now.", "warn"));
  $("#nv-try", root).addEventListener("click", onOpenNeuroVision);

  return root;
}
