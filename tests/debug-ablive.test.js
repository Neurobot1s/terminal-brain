/* temporary debug — why no #ab-live after NB.agentBrowse? */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom");
const ROOT = process.cwd();
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("JSDOM-ERR:", e.message));
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
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
    wsLog[wsLog.length - 1].frames.push(msg.method || "?");
    let result = {};
    if (msg.method === "Target.createTarget") result = { targetId: "tab-1" };
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
  } catch (e) { console.log("EVAL-ERR:", (s.src || "inline"), e.message); }
}
const NB = window.NB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  console.log("kernelMode:", NB.kernelMode());
  NB.agentBrowse("debug question");
  for (const t of [20, 50, 100, 200, 400]) {
    await sleep(t === 20 ? 20 : t - (t === 50 ? 20 : t === 100 ? 50 : t === 200 ? 100 : 200));
    const vw = document.querySelector("#ab-viewwrap");
    console.log("t=" + t, "panel:", !!document.querySelector("#ab-panel"), "vw:", !!vw, "boot:", !!document.querySelector("#ab-boot"), "live:", !!document.querySelector("#ab-live"), "wsMsgs:", wsLog.reduce((a, w) => a + w.frames.length, 0), "status:", (document.querySelector("#ab-status") || {}).textContent);
    if (vw) console.log("   vw children:", [...vw.children].map(c => c.id || c.className).join(","));
  }
  process.exit(0);
})();
