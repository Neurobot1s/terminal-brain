/* NeuroBot agent test — proves the AI can WRITE to the brain.
   Loads core + core-part2 + ai.js in jsdom (offline), drives
   NB.__agent.parseAgentReply + applyOps directly with the exact
   ACTION format the real model is instructed to emit, and asserts
   the store changed. No network needed. */
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom"));
} catch (e) {
  console.log("SKIP: jsdom not installed");
  process.exit(0);
}

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (m) => errors.push("console.error: " + m));

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
const dom = new JSDOM(html, {
  url: "http://localhost/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
window.fetch = () => Promise.reject(new Error("offline test"));

for (const f of ["js/core.js", "js/core-part2.js", "js/ai.js"]) {
  try { window.eval(fs.readFileSync(path.join(ROOT, f), "utf8")); }
  catch (e) { errors.push(f + " → " + e.message); }
}

const NB = window.NB;
const checks = [];
function check(label, fn) {
  try { const v = fn(); checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]); }
  catch (e) { checks.push([label, "THROW:" + e.message]); }
}

/* seed the store minimal */
NB.clearAll();

(async () => {
  /* ── protocol parser ── */
  const raw = [
    'ACTION {"op":"add_note","title":"Dentist","body":"Friday 3pm","category":"General"}',
    'ACTION {"op":"add_idea","title":"AI study planner","body":"Tracks deadlines","category":"AI","status":"Exploring"}',
    "SAID: Saved both.",
  ].join("\n");
  const p1 = NB.__agent.parseAgentReply(raw);
  check("parser extracts two ACTION ops", () => p1.ops.length === 2 && p1.ops[0].op === "add_note");
  check("parser strips ACTION lines from SAID", () => p1.said === "Saved both.");

  const p2 = NB.__agent.parseAgentReply("ACTION not json at all\nSAID: hello");
  check("parser survives malformed ACTION lines", () => p2.ops.length === 0 && p2.said === "hello");

  const p3 = NB.__agent.parseAgentReply("Just a plain answer, no actions.");
  check("plain answers pass through untouched", () => p3.ops.length === 0 && p3.said.indexOf("Just a plain answer") === 0);

  /* ── applyOps: create ── */
  const r1 = NB.__agent.applyOps(p1.ops);
  check("add_note writes to the store", () => NB.getStore().notes.some((n) => n.title === "Dentist" && n.body === "Friday 3pm" && n.category === "General"));
  check("add_idea honors status + category", () => NB.getStore().ideas.some((i) => i.title === "AI study planner" && i.status === "Exploring" && i.category === "AI"));
  check("op results are human-readable", () => r1.join(" ").indexOf("Dentist") !== -1);

  /* ── applyOps: invalid enum values are sanitized ── */
  NB.__agent.applyOps([{ op: "add_idea", title: "Bad status", status: "Nonsense", category: "Nope" }]);
  const bad = NB.getStore().ideas.find((i) => i.title === "Bad status");
  check("invalid status/category fall back to defaults", () => bad && bad.status === "New" && bad.category === "General");

  NB.__agent.applyOps([{ op: "add_goal", title: "Read 5 books", progress: 250, deadline: "not-a-date" }]);
  const g = NB.getStore().goals.find((x) => x.title === "Read 5 books");
  check("goal progress clamped 0-100, bad deadline dropped", () => g && g.progress === 100 && !g.deadline);

  /* ── applyOps: update / pin / delete by title match ── */
  NB.__agent.applyOps([{ op: "update", kind: "note", match: "Dentist", body: "Friday 4pm" }]);
  check("update patches an existing item by title", () => NB.getStore().notes.find((n) => n.title === "Dentist").body === "Friday 4pm");

  NB.__agent.applyOps([{ op: "update", kind: "goal", match: "Read 5 books", progress: 50, status: "paused" }]);
  check("goal update sets progress + status", () => { const x = NB.getStore().goals.find((x2) => x2.title === "Read 5 books"); return x.progress === 50 && x.status === "paused"; });

  NB.__agent.applyOps([{ op: "pin", kind: "note", match: "Dentist" }]);
  check("pin toggles a note", () => NB.getStore().notes.find((n) => n.title === "Dentist").pinned === true);

  NB.__agent.applyOps([{ op: "delete", kind: "idea", match: "AI study planner" }]);
  check("delete removes by title", () => !NB.getStore().ideas.some((i) => i.title === "AI study planner"));

  const miss = NB.__agent.applyOps([{ op: "delete", kind: "note", match: "Does Not Exist" }]);
  check("missing item reports failure, store untouched", () => miss.join(" ").indexOf("couldn") !== -1 && NB.getStore().notes.some((n) => n.title === "Dentist"));

  /* ── system prompt actually teaches the tools ── */
  const aiSrc = fs.readFileSync(path.join(ROOT, "js/ai.js"), "utf8");
  check("system prompt teaches all 4 add ops", () => ["add_note", "add_idea", "add_goal", "add_knowledge"].every((k) => aiSrc.indexOf(k) !== -1));
  check("system prompt teaches update/delete/pin", () => ["op\\\":\\\"update", "op\\\":\\\"delete", "op\\\":\\\"pin"].every((k) => aiSrc.indexOf(k) !== -1));
  check("SAID-line format is enforced in the prompt", () => aiSrc.indexOf("SAID:") !== -1);
  check("askAI applies ops before answering (agent path)", () => /parsed\.ops\.length/.test(aiSrc) && /summarizeActions/.test(aiSrc));

  /* ── conversation history plumbing ── */
  check("askAI accepts an opts.history argument", () => /function \(question, opts\)/.test(aiSrc));
  check("dashboard ask passes conversation history", () => fs.readFileSync(path.join(ROOT, "js/views-dashboard.js"), "utf8").indexOf("{ history: chat }") !== -1);
  check("live voice passes conversation history", () => fs.readFileSync(path.join(ROOT, "js/voice.js"), "utf8").indexOf("history: liveChat") !== -1);

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nAGENT TEST: ALL PASS" : "\nAGENT TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", e && e.stack || e); process.exit(1); });
