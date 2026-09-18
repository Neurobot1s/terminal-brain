/* NeuroBot × Kernel — cloud-browser agent tests.
   Boots the app in jsdom with a scripted fake WebSocket and verifies:
   fresh-tab-per-run, tab close on finish AND on error, live-view URL,
   mode reporting, and the driver's CDP surface. No real network. */
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

const dom = new JSDOM(html, {
  url: "http://localhost/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.fetch = () => Promise.reject(new Error("offline test"));
window.scrollTo = () => {};

/* ---------- scripted fake WebSocket: records the CDP conversation ---------- */
const wsLog = [];
const sockets = [];
class FakeWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    sockets.push(this);
    wsLog.push({ url, frames: [] });
    setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 5);
  }
  send(data) {
    const msg = JSON.parse(data);
    wsLog[wsLog.length - 1].frames.push(msg.method || "?" + (msg.result ? "(reply)" : ""));
    /* canned CDP answers for the methods the driver uses */
    let result = {};
    if (msg.method === "Target.createTarget") result = { targetId: "tab-" + Math.random().toString(36).slice(2, 8) };
    else if (msg.method === "Target.attachToTarget") result = { sessionId: "sess-1" };
    else if (msg.method === "Runtime.evaluate") result = { result: { value: "Stubbed page text" } };
    else if (msg.method === "Page.captureScreenshot") result = { data: "c3R1Yg==" };
    else if (msg.method === "Page.navigate") result = {};
    else if (msg.method === "Target.closeTarget") result = {};
    setTimeout(() => {
      if (this.onmessage) this.onmessage({ data: JSON.stringify({ id: msg.id, result }) });
    }, 3);
  }
  close() { this.readyState = 3; }
}
window.WebSocket = FakeWS;
window.NB_KERNEL_TEST = "1"; /* tell kernel.js to skip Kernel REST + reuse tabs */
window.sessionStorage.setItem("nb_credit", "1");

/* ---------- boot the app ---------- */
for (const s of [...document.querySelectorAll("script")]) {
  try {
    if (s.src) {
      const m = s.src.match(/js\/[a-z0-9-]*\.js$/);
      if (m) window.eval(fs.readFileSync(path.join(ROOT, m[0]), "utf8"));
      else continue;
    } else if (s.textContent.trim()) window.eval(s.textContent);
  } catch (e) { errors.push((s.src || "inline") + " → " + e.message); }
}

const NB = window.NB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(label, fn) {
  try {
    const v = typeof fn === "function" ? fn() : fn;
    checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]);
  } catch (e) { checks.push([label, "THROW:" + e.message]); }
}

(async () => {
  /* ── mode + live view ── */
  check("kernel mode reported (demo-browser by default)", () => NB.kernelMode() === "demo-browser");
  check("built-in live view URL is available for embedding", () => /^https:\/\/.+\/browser\/live\//.test(NB.kernelLiveUrl() || ""));
  check("kernelAgent exposes run/searchWeb/available", () =>
    typeof NB.kernelAgent.run === "function" && typeof NB.kernelAgent.searchWeb === "function" && NB.kernelAgent.available() === true);
  check("relay setting round-trips", () => {
    NB.setKernelRelay("https://my-relay.example.com");
    const v = NB.getKernelRelay() === "https://my-relay.example.com";
    NB.setKernelRelay("");
    return v && NB.kernelMode() === "demo-browser";
  });

  /* ── run: fresh tab, job executes, tab CLOSED at the end ── */
  let sawText = null, sawTitle = null;
  const logs = [];
  await NB.kernelAgent.run(async (d) => {
    await d.goto("https://example.com/");
    sawText = await d.text("body");
    sawTitle = await d.title();
  }, (m, tone) => logs.push([m, tone])).catch(() => {});

  check("run navigated the cloud tab", () => wsLog.some(w => w.frames.includes("Page.navigate")));
  check("driver read text + title from the page", () => sawText === "Stubbed page text" && sawTitle === "Stubbed page text");
  check("fresh tab created for the run", () => wsLog.some(w => w.frames.includes("Target.createTarget")));
  check("tab CLOSED when the run finished", () => wsLog.some(w => w.frames.includes("Target.closeTarget")));
  check("websocket disconnected after the run", () => sockets.every(s => s.readyState === 3));
  check("completion logged", () => logs.some(([m]) => /closed/.test(m)));

  /* ── run that THROWS: tab must still be closed ── */
  const socketsBefore = sockets.length;
  let errorThrown = false;
  await NB.kernelAgent.run(async () => { throw new Error("boom"); }, () => {}).catch(() => { errorThrown = true; });
  await sleep(30);
  check("error propagates to the caller", () => errorThrown === true);
  check("tab closed EVEN when the job throws", () => wsLog.filter(w => w.frames.includes("Target.closeTarget")).length >= 2);

  /* ── per-run isolation: two runs = two tabs, sequentially closed ── */
  await NB.kernelAgent.run(async () => {}, () => {}).catch(() => {});
  await sleep(20);
  const createCount = wsLog.filter(w => w.frames.includes("Target.createTarget")).length;
  const closeCount = wsLog.filter(w => w.frames.includes("Target.closeTarget")).length;
  check("each run got its own tab", () => createCount >= 3);
  check("every tab was closed", () => closeCount >= createCount);

  /* ── searchWeb convenience ── */
  const results = await NB.kernelAgent.searchWeb("mount everest height", () => {}).catch(() => null);
  check("searchWeb returns page text through the driver", () => results === "Stubbed page text");

  /* ── voice.js intent gate (strict browser phrases only) ── */
  const src = fs.readFileSync(path.join(ROOT, "js/voice.js"), "utf8");
  check("voice.js has a strict browser-intent matcher", () => /function wantsBrowser\(/.test(src));
  check("live split-pane + background run wired", () => /runBrowserTask/.test(src) && /live-pane/.test(src));

  /* ── agentBrowse panel shows kernel mode ── */
  NB.agentBrowse("test question — kernel panel");
  await sleep(60);
  check("kernel panel opens with live view embedded", () => !!document.querySelector("#ab-panel.kernel"));
  check("panel has the live-view iframe", () => !!document.querySelector("#ab-live"));

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nKERNEL TEST: ALL PASS" : "\nKERNEL TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", (e && e.stack) || e); process.exit(1); });
