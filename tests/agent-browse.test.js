/* agentBrowse test — offline jsdom run of the watchable browsing agent.
   Stubs NB.rawAI with a scripted NEXT sequence and fetch with wiki
   payloads, then drives NB.agentBrowse and asserts the panel streams
   every step: viewport renders, log lines appear, status finishes. */
const fs = require("fs");
const path = require("path");
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom")); }
catch (e) { console.log("SKIP: jsdom not installed"); process.exit(0); }

const ROOT = process.cwd();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (m) => errors.push("console.error: " + m));

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
const dom = new JSDOM(html, { url: "http://localhost/index.html", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
window.scrollTo = () => {};

/* scripted model: step 1 → SEARCH, step 2 → ANSWER */
let modelCalls = 0;
NBraw();
function NBraw() { /* defined after load via window.NB.rawAI override */ }

const fetchLog = [];
window.fetch = function (url) {
  fetchLog.push(String(url));
  if (/list=search/.test(url)) {
    return Promise.resolve({ json: () => Promise.resolve({ query: { search: [{ title: "Mount Everest", snippet: "<span>highest mountain above sea level</span>" }] } }) });
  }
  if (/rest_v1\/page\/summary/.test(url) || /prop=extracts|prop=links/.test(url)) {
    return Promise.resolve({ json: () => Promise.resolve({ extract: "Mount Everest is Earth's highest mountain above sea level, at 8,849 m.", query: { pages: { 1: { links: [{ title: "Himalayas" }, { title: "Nepal" }], extract: "Mount Everest is Earth's highest mountain above sea level, at 8,849 m." } } } }) });
  }
  return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("") });
};

/* the delayed Credits popup would race the assertions */
window.sessionStorage.setItem("nb_credit", "1");

/* boot the app exactly like a browser (main.js renders the dashboard
   so the ask box — and the 🌐 trigger — exist) */
for (const s of [...window.document.querySelectorAll("script")]) {
  try {
    if (s.src) {
      const m = String(s.getAttribute("src") || "").split("?")[0].match(/js\/[a-z0-9-]*\.js$/); /* tolerate ?v= cache-busters */
      if (m) window.eval(fs.readFileSync(path.join(ROOT, m[0]), "utf8"));
    } else if (s.textContent.trim()) {
      window.eval(s.textContent);
    }
  } catch (e) { errors.push((s.src || "inline") + " → " + e.message); }
}

const NB = window.NB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(label, fn) {
  try { const v = fn(); checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]); }
  catch (e) { checks.push([label, "THROW:" + e.message]); }
}

(async () => {
  /* scripted reasoning */
  const scripted = ["SEARCH highest mountain", "ANSWER Mount Everest is Earth's highest mountain at 8,849 m."];
  NB.rawAI = function () {
    const reply = scripted[Math.min(modelCalls++, scripted.length - 1)];
    return Promise.resolve(reply);
  };

  /* ── watchable run ── */
  NB.agentBrowse("How tall is Mount Everest?");
  await sleep(50);
  check("panel opens over the app", () => !!window.document.querySelector("#ab-panel"));
  /* kernel probe fails → fallback to in-site readers happens async
     (includes a short retry) — poll instead of a fixed wait */
  let classicUp = false;
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (window.document.querySelector("#ab-viewport") && /How tall is Mount Everest/.test(window.document.querySelector("#ab-log").textContent)) { classicUp = true; break; }
  }
  check("viewport + log + status present", () => classicUp || (!!window.document.querySelector("#ab-viewport") && !!window.document.querySelector("#ab-log") && !!window.document.querySelector("#ab-status")));
  check("goal logged", () => /How tall is Mount Everest/.test(window.document.querySelector("#ab-log").textContent));

  /* step 1: SEARCH → wikiSearch → (900ms beat) → wikiPage; poll for both */
  let articleFetched = false;
  for (let i = 0; i < 40; i++) {
    await sleep(100);
    if (fetchLog.some((u) => /rest_v1\/page\/summary\/Mount%20Everest/.test(u))) { articleFetched = true; break; }
  }
  check("step 1 rendered a page in the viewport", () => /Mount Everest/.test(window.document.querySelector("#ab-viewport").textContent));
  check("search hit the real Wikipedia API shape", () => fetchLog.some((u) => /en\.wikipedia\.org.*list=search/.test(u)));
  check("article fetch followed the search", () => articleFetched);
  check("log streamed the search step", () => /searching Wikipedia/.test(window.document.querySelector("#ab-log").textContent));

  /* wait for step 2 (ANSWER) */
  let done = false;
  for (let i = 0; i < 40; i++) { await sleep(100); if (/done/.test(window.document.querySelector("#ab-status").textContent)) { done = true; break; } }
  check("agent finishes with status done", () => done);
  check("final answer rendered in viewport", () => /8,849/.test(window.document.querySelector("#ab-viewport").textContent));
  check("ANSWER logged as success", () => /ANSWER: Mount Everest/.test(window.document.querySelector("#ab-log").textContent));

  /* ── chat trigger button (dashboard booted → ask box exists) ── */
  window.dispatchEvent(new window.Event("hashchange"));
  await sleep(150);
  check("🌐 agentBrowse button wired into the ask box", () => !!window.document.querySelector(".ask-box #ab-trigger"));
  check("button carries the agentBrowse title", () => /agentBrowse/.test(window.document.querySelector("#ab-trigger").title));

  /* ── guards ── */
  NB.agentBrowse("");
  await sleep(20);
  check("empty query rejected (no second panel)", () => window.document.querySelectorAll("#ab-panel").length === 1);

  /* script-tag order: agent-browse loads after ai.js (needs rawAI) */
  const idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  check("agent-browse.js loads after ai.js", () => idx.indexOf("js/ai.js") < idx.indexOf("js/agent-browse.js"));

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nBROWSE TEST: ALL PASS" : "\nBROWSE TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", e && e.stack || e); process.exit(1); });
