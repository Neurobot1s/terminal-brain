/* NeuroBot boot test — loads index.html + all scripts in jsdom, asserts real boot. */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom");

const ROOT = process.cwd();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (m) => errors.push("console.error: " + m));

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
/* strip external font/css links — jsdom doesn't fetch them anyway */
html = html.replace(/<link[^>]*>/g, "");

const dom = new JSDOM(html, {
  url: "http://localhost/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

/* stubs jsdom lacks */
window.matchMedia = window.matchMedia || function () { return { matches: false, addListener: function () {}, removeListener: function () {} }; };
window.fetch = window.fetch || function () { return Promise.reject(new Error("offline test")); };

/* evaluate every script tag in document order, exactly like a browser */
const scripts = [...window.document.querySelectorAll("script")];
let inline = 0, external = 0;
for (const s of scripts) {
  try {
    if (s.src) {
      const m = s.src.match(/js\/[a-z0-9-]*\.js$/);
      if (!m) continue;
      const code = fs.readFileSync(path.join(ROOT, m[0]), "utf8");
      window.eval(code);
      external++;
    } else if (s.textContent.trim()) {
      window.eval(s.textContent);
      inline++;
    }
  } catch (e) {
    errors.push((s.src ? s.src : "inline#" + inline) + " → " + e.message);
  }
}

const NB = window.NB || {};
const checks = [];
function check(label, fn) {
  try {
    const v = fn();
    checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]);
  } catch (e) {
    checks.push([label, "THROW:" + e.message]);
  }
}

check("NB namespace exists", () => !!window.NB);
check("store shape", () => {
  const s = NB.getStore();
  return Array.isArray(s.notes) && Array.isArray(s.ideas) && Array.isArray(s.goals) && Array.isArray(s.knowledge) && Array.isArray(s.activity);
});
check("seed data present", () => NB.totalItems() > 0);
check("all views defined", () => ["DashboardView", "BrainView", "NotesView", "IdeasView", "KnowledgeView", "GoalsView", "ConnectionsView", "SettingsView"].every(v => typeof NB[v] === "function"));
check("openModal renders title", () => {
  const m = NB.openModal({ title: "T-Title", subtitle: "$ sub" });
  const txt = window.document.querySelector("#modal-root").textContent;
  m.close();
  return txt.includes("T-Title") && txt.includes("$ sub");
});
check("capture note end-to-end", () => {
  const before = NB.getStore().notes.length;
  NB.addNote({ title: "boot-test note", body: "x", category: "General" });
  const after = NB.getStore().notes.length;
  const created = NB.getStore().notes[0];
  NB.removeNote(created.id);
  return after === before + 1 && created.title === "boot-test note";
});
check("ask modal opens", () => {
  NB.openAskModal();
  const ok = !!window.document.querySelector("#ask-q");
  window.document.querySelector(".modal-close").click();
  return ok;
});
check("terminal opens", () => {
  NB.openTerminal();
  const ok = !!window.document.querySelector("#term-input");
  window.document.querySelector(".term-close").click();
  return ok;
});
check("py interpreter wired", () => {
  NB.openTerminal();
  const input = window.document.querySelector("#term-input");
  input.value = "py 6 * 7";
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const out = window.document.querySelector("#term-out").textContent;
  window.document.querySelector(".term-close").click();
  return out.includes("42");
});
check("fx click listener attached", () => {
  window.document.body.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
  return !!window.document.querySelector(".paper-pop");
});

console.log("scripts evaluated:", external, "external,", inline, "inline");
for (const [l, r] of checks) console.log((r === "OK" ? " ✓" : " ✗"), l, r === "OK" ? "" : "→ " + r);
if (errors.length) { console.log("\nERRORS:"); errors.forEach(e => console.log("  ", e.slice(0, 300))); }
const failed = checks.filter(c => c[1] !== "OK").length;
console.log(failed === 0 && errors.length === 0 ? "\nBOOT TEST: ALL PASS" : "\nBOOT TEST: " + failed + " failed, " + errors.length + " errors");
process.exit(failed || errors.length ? 1 : 0);
