/* NeuroBot route test — loads the real index.html from disk (file:// style,
   exactly like double-clicking it) and walks every route. */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("/tmp/nbtest/node_modules/jsdom");

const ROOT = process.cwd();
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(String((e && e.message) || e)));
vc.on("error", (m) => errors.push(String(m)));

/* project-root copy with external <link> stripped (jsdom won't fetch CSS/fonts);
   must live in the project root so relative js/ paths resolve */
const tmp = path.join(ROOT, ".test-index.html");
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<link[^>]*>/g, "");
fs.writeFileSync(tmp, html);

JSDOM.fromFile(tmp, {
  resources: "usable", /* actually load + execute the js/ scripts */
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    /* jsdom treats file:// as an opaque origin (real browsers allow
       localStorage there) — shim it if access throws */
    try { window.localStorage.getItem("probe"); } catch (e) {
      const store = {};
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = String(v); },
          removeItem: (k) => { delete store[k]; },
          clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        },
      });
    }
    window.fetch = window.fetch || function () { return Promise.reject(new Error("offline test")); };
    window.scrollTo = function () {}; /* jsdom: not implemented (harmless) */
  },
}).then((dom) => {
  const w = dom.window;
  w.matchMedia = w.matchMedia || function () { return { matches: false, addListener: function () {}, removeListener: function () {} }; };
  /* jsdom can't do PointerEvent — shim it for the fx test */
  if (!w.PointerEvent) w.PointerEvent = w.MouseEvent;

  const NB = w.NB;
  const doc = w.document;

  function go(hash) {
    w.location.hash = hash;
    w.dispatchEvent(new w.Event("hashchange"));
  }

  setTimeout(function () {
    const checks = [];
    function check(label, fn) {
      try {
        const v = fn();
        checks.push([label, v === true ? "OK" : "FAIL"]);
      } catch (e) { checks.push([label, "THROW:" + e.message]); }
    }

    const view = doc.querySelector("#view");
    check("app booted (view populated)", () => view.children.length > 0);

    const routes = [
      ["#/", (v) => /ask your brain|second brain/i.test(v)],
      ["#/brain", (v) => /brain/i.test(v)],
      ["#/notes", (v) => /note/i.test(v)],
      ["#/ideas", (v) => /idea/i.test(v)],
      ["#/knowledge", (v) => /knowledge/i.test(v)],
      ["#/goals", (v) => /goal/i.test(v)],
      ["#/connections", (v) => /connection/i.test(v)],
      ["#/settings", (v) => /settings/i.test(v)],
    ];
    for (const [hash, test] of routes) {
      go(hash);
      const txt = view.textContent;
      check("route " + hash + " renders", () => view.children.length > 0 && test(txt));
    }

    go("#/settings");
    check("AI panel present in Settings", () => !!doc.querySelector("#ai-key-test") && !!doc.querySelector("#ai-key-save"));

    go("#/ideas");
    check("kanban has 4 columns", () => doc.querySelectorAll(".kanban-col").length === 4);

    go("#/");
    check("dashboard stat cards", () => doc.querySelectorAll(".stat-card").length >= 4);
    check("graph svg rendered", () => !!doc.querySelector(".graph-svg"));
    check("quick capture buttons", () => doc.querySelectorAll(".quick-capture button, [data-capture]").length >= 3);

    /* status bar + topbar wiring */
    check("terminal button present", () => !!doc.querySelector("#term-btn"));
    check("live button present", () => !!doc.querySelector("#live-btn"));

    for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l);
    const failed = checks.filter((c) => c[1] !== "OK").length;
    console.log(errors.length ? "\nERRORS (first 3):" : "\n(no jsdom errors)");
    errors.slice(0, 3).forEach((e) => console.log("  ", e.slice(0, 200)));
    console.log(failed === 0 && errors.length === 0 ? "\nROUTE TEST: ALL PASS" : "\nROUTE TEST: " + failed + " failed / " + errors.length + " errors");
    w.close();
    try { fs.unlinkSync(tmp); } catch (e) {}
    process.exit(failed || errors.length ? 1 : 0);
  }, 400);
}).catch((e) => { console.log("JSDOM.fromFile failed:", e.message); process.exit(1); });
