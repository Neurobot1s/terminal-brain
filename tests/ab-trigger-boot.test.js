/* Regression test — "the 🌐 web-search button disappears".
   Reproduces the real-world case the old wiring missed: the site is
   (re)opened with a hash ALREADY in the URL (#/ or #/notes). No `hashchange`
   ever fires on such a load, and agent-browse.js's DOMContentLoaded listener
   runs before main.js renders the view — so the old code never wired the
   🌐 button until the user navigated manually. The MutationObserver must
   wire it on boot with ZERO hashchange events. Skips if jsdom is missing. */
const fs = require("fs");
const path = require("path");
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom")); }
catch (e) { console.log("SKIP: jsdom not installed"); process.exit(0); }

const ROOT = process.cwd();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + String(e.message || e).slice(0, 160)));
vc.on("error", (m) => errors.push("console.error: " + String(m).slice(0, 160)));

/* hash ALREADY in the URL — this is the reported scenario */
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
const dom = new JSDOM(html, { url: "http://localhost/index.html#/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || function () { return { matches: false, addListener() {}, removeListener() {} }; };
window.scrollTo = () => {};
if (!window.fetch) window.fetch = () => Promise.reject(new Error("offline"));
window.sessionStorage.setItem("nb_credit", "1"); /* dodge the Credits popup race */

let hashChanges = 0;
window.addEventListener("hashchange", () => { hashChanges++; });

for (const s of [...document.querySelectorAll("script")]) {
  try {
    if (s.src) {
      const m = String(s.getAttribute("src") || "").split("?")[0].match(/js\/[a-z0-9-]*\.js$/);
      if (m) window.eval(fs.readFileSync(path.join(ROOT, m[0]), "utf8"));
    } else if (s.textContent.trim()) {
      window.eval(s.textContent);
    }
  } catch (e) { errors.push((s.src || "inline") + " → " + e.message); }
}

const checks = [];
function check(label, fn, extra) {
  let v;
  try { v = typeof fn === "function" ? fn() : fn; }
  catch (e) { checks.push([label, "THROW:" + e.message]); return; }
  checks.push([label, v === true ? "OK" : "FAIL" + (extra ? ": " + (typeof extra === "function" ? extra() : extra) : "")]);
}

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(250); /* boot + observer microtask budget */

  check("boot rendered the dashboard", () => !!document.querySelector(".ask-box"));
  check("🌐 button wired with NO hashchange fired", () => hashChanges === 0 && !!document.querySelector(".ask-box #ab-trigger"),
    () => "hashChanges=" + hashChanges + " btn=" + !!document.querySelector(".ask-box #ab-trigger"));
  check("button sits next to Send", () => {
    const b = document.querySelector(".ask-box #ab-trigger");
    return !!b && !!b.previousElementSibling && b.previousElementSibling.id === "ask-mic" || !!(b && b.nextElementSibling && b.nextElementSibling.id === "ask-send");
  });
  check("button carries the agentBrowse title", () => /agentBrowse/.test((document.querySelector("#ab-trigger") || {}).title || ""));

  /* data-op style re-render (same-hash dispatch) must keep the button */
  window.dispatchEvent(new window.Event("hashchange"));
  await sleep(150);
  check("button survives a re-render", () => !!document.querySelector(".ask-box #ab-trigger"));

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nAB-TRIGGER BOOT TEST: ALL PASS" : "\nAB-TRIGGER BOOT TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", e && e.stack || e); process.exit(1); });
