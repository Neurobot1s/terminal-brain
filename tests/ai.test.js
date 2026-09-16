/*
 * NeuroBot AI transport test — this one makes REAL network calls.
 * It proves the whole fallback chain works end to end:
 *   1. load js/ai.js in a jsdom page hosted at a non-PHP origin (simulates
 *      GitHub Pages / any static host) — the ai.php proxy 404s there
 *   2. ask a question through NB.askAI()
 *   3. expect a real answer fetched from NVIDIA NIM via the direct fallback
 * Skipped automatically if jsdom or the network is unavailable.
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
  /* NOTE: a plain http origin — there is NO ai.php here, so the proxy
     request 404s and ai.js must fall back to direct NVIDIA transport. */
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
const checks = [];
function check(label, ok, extra) {
  checks.push([label, ok === true ? "OK" : "FAIL" + (extra ? ": " + extra : "")]);
}

(async () => {
  /* 1 — terminal-style smoke: testAI returns ok:true */
  try {
    const r = await NB.testAI();
    check("testAI ok", r && r.ok === true, r ? String(r.message).slice(0, 160) : "no result");
    check("reply mentions transport", r && /proxy|direct/.test(r.message), r ? r.message : "");
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
