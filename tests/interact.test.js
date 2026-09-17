/*
 * NeuroBot interaction test — simulates real user flows in jsdom:
 *   navigation (hash + g-nav), My Brain search/filter, pin/delete/edit,
 *   kanban status moves, goal progress clamping, quick capture,
 *   inline ask thread (stubbed AI), activity feed, health label,
 *   command palette (Ctrl+K + arrow/enter), terminal (py/help/history).
 * Skipped automatically if jsdom is unavailable.
 */
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom")); }
catch (e) { console.log("SKIP: jsdom not installed"); process.exit(0); }

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + String(e.message || e).slice(0, 160)));
vc.on("error", (m) => errors.push("console.error: " + String(m).slice(0, 160)));

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
const dom = new JSDOM(html, {
  url: "http://localhost/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
window.HTMLElement.prototype.scrollIntoView = function () {};
window.scrollTo = function () {};
if (!window.fetch) window.fetch = () => Promise.reject(new Error("offline"));

for (const f of ["js/core.js", "js/core-part2.js", "js/prefs.js", "js/ai.js",
  "js/views-dashboard.js", "js/views-collections.js", "js/views-kanban.js",
  "js/views-misc.js", "js/main.js", "js/terminal.js", "js/fx.js"]) {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), "utf8")); }
  catch (e) { console.log(" ✗ script failed:", f, "→", e.message); process.exit(1); }
}

const NB = window.NB;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (el2, k, opts) => el2.dispatchEvent(new window.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {})));
const checks = [];
function check(label, ok, extra) { checks.push([label, ok === true ? "OK" : "FAIL" + (extra ? ": " + extra : "")]); }
function nav(hash) { window.location.hash = hash; }
function count() { const s = NB.getStore(); return s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length; }

(async () => {
  await sleep(50); /* boot */
  check("boot: view populated", $("#view").children.length > 0);

  /* ── navigation ── */
  nav("#/notes"); await sleep(60);
  check("hash nav renders notes", $(".mem-card") !== null);
  key(document.body, "g"); key(document.body, "k"); await sleep(60);
  check("g-nav g+k goes to knowledge", window.location.hash === "#/knowledge" && $(".page-head h1") && /Knowledge/.test($(".page-head h1").textContent));

  /* ── my brain: search + filter ── */
  nav("#/brain"); await sleep(60);
  const q = $("#brain-q");
  q.value = "transformer";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(220); /* debounce 120ms */
  check("brain search filters to 1 card", $$("#brain-list .mem-card").length === 1, "got " + $$("#brain-list .mem-card").length);
  $("#brain-q").value = "";
  $("#brain-q").dispatchEvent(new window.Event("input", { bubbles: true }));
  $("#brain-kind").value = "goal";
  $("#brain-kind").dispatchEvent(new window.Event("change", { bubbles: true }));
  await sleep(220);
  check("brain kind filter shows 4 goals", $$("#brain-list .mem-card").length === 4, "got " + $$("#brain-list .mem-card").length);

  /* ── notes: edit + pin + delete ── */
  nav("#/notes"); await sleep(60);
  const before = NB.getStore().notes.length;
  const pinBtn = $("[data-pin]");
  const pinId = pinBtn.getAttribute("data-pin");
  const wasPinned = !!NB.getStore().notes.find((n) => n.id === pinId).pinned;
  pinBtn.click();
  const nowPinned = !!NB.getStore().notes.find((n) => n.id === pinId).pinned;
  check("pin toggle flips state", nowPinned === !wasPinned);

  const delBtn = $$("[data-del]").find((b) => b.getAttribute("data-kind") === "note");
  const delId = delBtn.getAttribute("data-del");
  delBtn.click();
  check("delete removes note", NB.getStore().notes.length === before - 1 && !NB.getStore().notes.find((n) => n.id === delId));

  const editBtn = $$("[data-edit]").find((b) => b.getAttribute("data-kind") === "note");
  const editId = editBtn.getAttribute("data-edit");
  editBtn.click(); await sleep(60);
  check("edit opens capture modal", !!$("#capture-form") && $("#f-title").value.length > 0);
  $("#f-title").value = "Renamed via test";
  $("#capture-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(60);
  check("edit saves new title", NB.getStore().notes.find((n) => n.id === editId).title === "Renamed via test");
  check("modal closes after save", $("#modal-root").children.length === 0);

  /* ── ideas kanban ── */
  nav("#/ideas"); await sleep(60);
  check("kanban has 4 columns", $$(".kanban-col").length === 4);
  const ideaId = NB.getStore().ideas[0].id;
  const sel = $('[data-status-for="' + ideaId + '"]');
  sel.value = "building";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await sleep(60);
  check("status select updates store", NB.getStore().ideas.find((i) => i.id === ideaId).status === "building");

  /* ── goals: progress + clamp ── */
  nav("#/goals"); await sleep(60);
  const g1 = NB.getStore().goals[0];
  const plusBtn = $('[data-goal-progress="' + g1.id + '"][data-delta="+10"]');
  plusBtn.click();
  check("goal +10 updates progress", NB.getStore().goals.find((g) => g.id === g1.id).progress === Math.min(100, g1.progress + 10));
  NB.updateGoal(g1.id, { progress: 95 }); nav("#/goals"); await sleep(60);
  $('[data-goal-progress="' + g1.id + '"][data-delta="+10"]').click();
  $('[data-goal-progress="' + g1.id + '"][data-delta="+10"]').click();
  check("goal progress clamps at 100", NB.getStore().goals.find((g) => g.id === g1.id).progress === 100);

  /* ── dashboard: quick capture + inline ask + activity ── */
  nav("#/"); await sleep(60);
  const ideasBefore = NB.getStore().ideas.length;
  $('.qc-btn[data-capture="idea"]').click(); await sleep(60);
  $("#f-title").value = "Palette-tested idea";
  $("#capture-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(60);
  check("quick capture adds idea", NB.getStore().ideas.length === ideasBefore + 1);

  const actsBefore = NB.getStore().activity.length;
  const del = $("[data-del-act]");
  if (del) del.click();
  check("activity delete removes entry", NB.getStore().activity.length === actsBefore - 1);

  const realAsk = NB.askAI;
  NB.askAI = () => Promise.resolve("stub answer from test");
  $("#ask-input").value = "what did I capture?";
  $("#ask-send").click();
  await sleep(60);
  const aiBubble = $(".ask-thread .bubble.ai:not(.think)");
  check("inline ask renders answer bubble", aiBubble !== null && aiBubble.textContent === "stub answer from test");
  NB.askAI = realAsk;

  NB.resetDemo();
  check("health label reacts to store", /Brain/.test($("#bh-label").textContent));

  /* ── command palette ── */
  key(document.body, "k", { ctrlKey: true }); await sleep(60);
  check("ctrl+k opens palette", !!$("#cmdk-q"));
  const cq = $("#cmdk-q");
  cq.value = "sett";
  cq.dispatchEvent(new window.Event("input", { bubbles: true }));
  await sleep(60);
  key(cq, "Enter"); await sleep(60);
  check("palette enter navigates to settings", window.location.hash === "#/settings");
  key(document.body, "k", { ctrlKey: true }); await sleep(60);
  key(document.body, "Escape"); await sleep(60);
  check("escape closes palette", $("#cmdk-root").children.length === 0);

  /* first action for empty query is Open Terminal */
  key(document.body, "k", { ctrlKey: true }); await sleep(60);
  key($("#cmdk-q"), "Enter"); await sleep(60);
  check("palette first action opens terminal", !!$("#term-input"));

  /* ── terminal ── */
  const tin = $("#term-input");
  tin.value = "py print(6*7)";
  key(tin, "Enter"); await sleep(60);
  check("terminal py evaluates", /42/.test($("#term-out").textContent));

  tin.value = "definitely-not-a-cmd";
  key(tin, "Enter"); await sleep(60);
  check("terminal unknown command errors", /command not found/.test($("#term-out").textContent));

  tin.value = "help";
  key(tin, "Enter"); await sleep(60);
  check("terminal help lists model cmd", /model/.test($("#term-out").textContent));

  tin.value = "history";
  key(tin, "Enter"); await sleep(60);
  tin.value = "";
  key(tin, "ArrowUp");
  check("terminal history recalls last cmd", tin.value === "history");

  key(document.body, "Escape"); await sleep(60);
  check("escape closes terminal", $("#term-root").children.length === 0);

  /* ── shortcut + notifications modals ── */
  key(document.body, "?"); await sleep(60);
  check("? opens shortcuts modal", $$(".sc-row").length >= 10);
  key(document.body, "Escape"); await sleep(60);
  $("#notif-btn").click(); await sleep(60);
  check("notifications modal opens", $("#modal-root").children.length === 1);

  /* ── results ── */
  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nINTERACT TEST: ALL PASS" : "\nINTERACT TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", e.message); process.exit(1); });
