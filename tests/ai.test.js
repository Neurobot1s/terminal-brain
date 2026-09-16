/*
 * NeuroBot AI transport test — this one makes REAL network calls.
 * It proves the browser-direct NVIDIA transport works end to end:
 *   1. load js/ai.js in a jsdom page (simulates GitHub Pages)
 *   2. ask a question through NB.askAI()
 *   3. expect a real answer fetched from NVIDIA NIM (Nemotron model)
 * Requires an NVIDIA key: set NVIDIA_KEY env var (nvapi-…), or paste a
 * key into localStorage under "nb_ai_key" before running.
 * Skipped automatically if jsdom, the key, or the network is unavailable.
 */
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
  /* plain http origin — NVIDIA's real API has a CORS allowlist here, so the
     direct call will fail and ai.js must walk the relay chain (or fail with
     a friendly all-routes-blocked error, which is also correct behavior). */
  url: "http://localhost/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
/* real fetch (Node 18+ has it) — this test deliberately goes to the network */
if (!window.fetch) window.fetch = (...a) => fetch(...a);

/* load only the scripts ai.js needs, in the same order as index.html */
for (const f of ["js/core.js", "js/core-part2.js", "js/ai.js"]) {
  try {
    window.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
  } catch (e) {
    console.log(" ✗ script failed:", f, "→", e.message);
    process.exit(1);
  }
}

const NB = window.NB;
/* seed a key from the environment if provided (static hosts have none embedded) */
if (process.env.NVIDIA_KEY) {
  window.localStorage.setItem("nb_ai_key", process.env.NVIDIA_KEY);
}
const hasKey = !!NB.getAIKey();
const checks = [];
function check(label, ok, extra) {
  checks.push([label, ok === true ? "OK" : "FAIL" + (extra ? ": " + extra : "")]);
}

(async () => {
  if (!hasKey) {
    console.log("SKIP: no NVIDIA key (set NVIDIA_KEY env var). The UI shows a friendly no-key message instead.");
    const r = await NB.testAI();
    check("no-key message is friendly", r && r.ok === false && /build\.nvidia\.com/.test(r.message), r ? r.message : "no result");
    for (const [l, r2] of checks) console.log((r2 === "OK" ? " ✓" : " ✗"), l, r2 === "OK" ? "" : "→ " + r2);
    process.exit(checks.some((c) => c[1] !== "OK") ? 1 : 0);
    return;
  }

  /* 1 — terminal-style smoke: testAI returns ok:true */
  try {
    const r = await NB.testAI();
    check("testAI ok", r && r.ok === true, r ? String(r.message).slice(0, 160) : "no result");
    check("reply mentions NVIDIA", r && /NVIDIA/.test(r.message), r ? r.message : "");
  } catch (e) {
    check("testAI ok", false, e.message);
  }

  /* 2 — real Ask with brain context */
  try {
    const answer = await NB.askAI("In one short sentence, what is the Transformer architecture note about?");
    check("askAI returned an answer", typeof answer === "string" && answer.trim().length > 0, answer ? answer.slice(0, 120) : "empty");
    check("answer has no markdown asterisks", typeof answer === "string" && !/\*\*/.test(answer), answer ? answer.slice(0, 80) : "");
  } catch (e) {
    check("askAI returned an answer", false, e.message);
  }

  /* 3 — status object is intact */
  const st = NB.aiStatus();
  check("aiStatus tracks calls", st && st.calls >= 2, JSON.stringify(st).slice(0, 120));

  for (const [l, r] of checks) console.log((r === "OK" ? " ✓" : " ✗"), l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e.slice(0, 300))); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nAI TEST: ALL PASS" : "\nAI TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})();
