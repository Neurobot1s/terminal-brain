/* Kernel browser-VIEW tests — the viewport menu (zoom / mobile / fullscreen),
   CDP viewport emulation, and the kernel-down retry strip. No real network:
   boots the app in jsdom with the scripted fake WebSocket (same as kernel.test). */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom");

const ROOT = process.cwd();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (m) => errors.push("console.error: " + m));

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace(/<link[^>]*>/g, "");

const dom = new JSDOM(html, { url: "http://localhost/index.html", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.fetch = () => Promise.reject(new Error("offline test"));
window.scrollTo = () => {};

const wsLog = [];
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; wsLog.push({ url, frames: [] }); setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 5); }
  send(data) {
    const msg = JSON.parse(data);
    wsLog[wsLog.length - 1].frames.push(msg.method || "?" + (msg.result ? "(reply)" : ""));
    let result = {};
    if (msg.method === "Target.createTarget") result = { targetId: "tab-" + Math.random().toString(36).slice(2, 8) };
    else if (msg.method === "Target.attachToTarget") result = { sessionId: "sess-1" };
    else if (msg.method === "Runtime.evaluate") result = { result: { value: "Stubbed page text" } };
    setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ id: msg.id, result }) }); }, 3);
  }
  close() { this.readyState = 3; }
}
window.WebSocket = FakeWS;
window.NB_KERNEL_TEST = "1";
window.sessionStorage.setItem("nb_credit", "1");

for (const s of [...document.querySelectorAll("script")]) {
  try {
    if (s.src) {
      const m = String(s.getAttribute("src") || "").split("?")[0].match(/js\/[a-z0-9-]*\.js$/);
      if (m) window.eval(fs.readFileSync(path.join(ROOT, m[0]), "utf8"));
      else continue;
    } else if (s.textContent.trim()) window.eval(s.textContent);
  } catch (e) { errors.push((s.src || "inline") + " → " + e.message); }
}

const NB = window.NB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(label, fn) { try { const v = typeof fn === "function" ? fn() : fn; checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]); } catch (e) { checks.push([label, "THROW:" + e.message]); } }

(async () => {
  NB.agentBrowse("kernel view menu test");
  /* wait for the driver to boot (fake WS answers async) instead of a fixed
     sleep — CI machines are slower and a fixed 150ms raced the boot */
  for (let i = 0; i < 60 && !(document.querySelector("#ab-live") && document.querySelector("#ab-live").getAttribute("src")); i++) await sleep(25);
  await sleep(30);
  const panel = document.querySelector("#ab-panel");
  /* DEBUG */
  console.log("[dbg] wsMsgs:", wsLog.reduce((a, w) => a + w.frames.length, 0), "status:", (document.querySelector("#ab-status") || {}).textContent, "vw:", (document.querySelector("#ab-viewwrap") || {}).innerHTML ? "yes" : "no");
  console.log("[dbg] wsLog:", JSON.stringify(wsLog));
  if (document.querySelector("#ab-viewwrap")) console.log("[dbg] vw children:", [...document.querySelector("#ab-viewwrap").children].map((c) => c.id || c.className).join(","));

  check("kernel panel opens with a live iframe", () => !!panel && !!document.querySelector("#ab-live"));
  check("View menu button rendered (kernel mode)", () => !!document.querySelector("#ab-view-btn"));
  const menu = document.querySelector("#ab-menu");
  check("menu starts hidden", () => !!menu && menu.hidden === true);

  document.querySelector("#ab-view-btn").click();
  check("menu opens on click", () => menu.hidden === false);

  /* zoom — display-level scaling of the embedded stream only */
  document.querySelector("[data-ab-zoom='in']").click();
  const live = document.querySelector("#ab-live");
  check("zoom in scales the live view (1.25×)", () => /scale\(1\.25\)/.test(live.style.transform) && live.style.width === "80%");
  document.querySelector("[data-ab-zoom='out']").click();
  check("zoom out returns toward 100%", () => live.style.transform === "" || /scale\(1\)/.test(live.style.transform));
  document.querySelector("[data-ab-zoom='reset']").click();
  check("reset clears the zoom entirely", () => live.style.transform === "" && live.style.width === "");

  /* mobile / desktop view → REAL CDP emulation inside the cloud browser.
     No driver is active between runs, so the request is pended and applied
     at the next driver start — assert that too. */
  document.querySelector("[data-ab-view='mobile']").click();
  check("mobile view marks the menu item active", () => document.querySelector("[data-ab-view='mobile']").classList.contains("active"));
  check("mobile view letterboxes the viewport", () => document.querySelector("#ab-viewwrap").classList.contains("mobile"));
  check("getViewport reports mobile", () => NB.kernelAgent.getViewport() === "mobile");
  await NB.kernelAgent.run(async () => {}, () => {}).catch(() => {});
  await sleep(30);
  check("mobile view applied via CDP on the next tab", () => wsLog.some((w) => w.frames.includes("Emulation.setDeviceMetricsOverride")));
  document.querySelector("[data-ab-view='desktop']").click();
  check("desktop view un-marks mobile", () => !document.querySelector("[data-ab-view='mobile']").classList.contains("active") && !document.querySelector("#ab-viewwrap").classList.contains("mobile"));
  await NB.kernelAgent.run(async () => {}, () => {}).catch(() => {});
  await sleep(30);
  check("desktop view clears CDP emulation", () => wsLog.some((w) => w.frames.includes("Emulation.clearDeviceMetricsOverride")));

  /* fullscreen — jsdom has no Fullscreen API → pseudo-fs overlay fallback
     (exactly what iOS Safari needs) */
  document.querySelector("[data-ab-fs]").click();
  const vw = document.querySelector("#ab-viewwrap");
  check("fullscreen falls back to pseudo-fs when the API is missing", () => vw.classList.contains("fs-pseudo") && !!document.querySelector("#ab-fs-exit"));
  document.querySelector("#ab-fs-exit").click();
  check("exit chip leaves pseudo-fs", () => !vw.classList.contains("fs-pseudo"));

  /* retrieval + kernel-down hardening (source-level; the live paths need
     real network failures that jsdom cannot stage safely) */
  const src = fs.readFileSync(path.join(ROOT, "js/agent-browse.js"), "utf8");
  check("kernel-down keeps the viewport (no vw.remove)", () => !/vw\.remove\(\)/.test(src));
  check("kernel-down offers a Retry button", () => /ab-kretry/.test(src) && /Retry kernel/.test(src));
  check("fresh run clears the stale live view", () => /kernelResetLive/.test(src));
  check("empty reads retried via the text proxy", () => src.includes("https://r.jina.ai/"));
  check("failed reads are recorded so the model moves on", () => /readFails\[url\]/.test(src) && /FAILED TWICE/.test(src));
  check("already-read URLs are never re-read", () => /readDone\[url\]/.test(src));
  const ksrc = fs.readFileSync(path.join(ROOT, "js/kernel.js"), "utf8");
  check("kernel viewport emulation exists (CDP)", () => ksrc.includes("Emulation.setDeviceMetricsOverride"));
  check("extraction has a never-empty raw-body fallback", () => /text\.length<40/.test(ksrc));

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nKERNEL VIEW TEST: ALL PASS" : "\nKERNEL VIEW TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", (e && e.stack) || e); process.exit(1); });
