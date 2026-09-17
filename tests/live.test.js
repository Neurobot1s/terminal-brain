/* NeuroBot Live voice test — boots the app in jsdom, drives a full
   voice round-trip with stubbed mic/speech APIs, and asserts that the
   NVIDIA-first / device-fallback pipeline really works. */
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

/* ---------- stubs for what jsdom (and headless) lacks ---------- */
window.matchMedia = window.matchMedia || function () {
  return { matches: false, addListener() {}, removeListener() {} };
};
window.fetch = function () { return Promise.reject(new Error("offline test")); };
window.scrollTo = () => {};

const micStops = [];
const fakeTrack = { kind: "audio", stop() { micStops.push(1); } };
const fakeStream = { getTracks: () => [fakeTrack] };
window.navigator.mediaDevices = window.navigator.mediaDevices || {};
let gotUserMedia = 0;
window.navigator.mediaDevices.getUserMedia = () => { gotUserMedia++; return Promise.resolve(fakeStream); };

let recorderStopped = 0;
class FakeRecorder {
  static isTypeSupported() { return true; }
  constructor(stream, opts) { this.stream = stream; this.mimeType = (opts && opts.mimeType) || "audio/webm"; this.state = "inactive"; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    recorderStopped++;
    if (this.ondataavailable) this.ondataavailable({ data: new window.Blob([new Uint8Array(6000)]) });
    if (this.onstop) this.onstop();
  }
}
window.MediaRecorder = FakeRecorder;

class FakeAudioCtx {
  constructor() { this.state = "running"; }
  createAnalyser() { return { fftSize: 1024, getByteTimeDomainData(b) { for (let i = 0; i < b.length; i++) b[i] = 140; } }; }
  createMediaStreamSource() { return { connect() {} }; }
  decodeAudioData() {
    const sr = 48000, len = 48000;
    const ch = new Float32Array(len);
    return Promise.resolve({ sampleRate: sr, duration: len / sr, length: len, getChannelData: () => ch });
  }
  close() { return Promise.resolve(); }
}
window.AudioContext = FakeAudioCtx;
window.webkitAudioContext = FakeAudioCtx;

/* browser speech recognition stub — feeds a final transcript */
class FakeSR {
  start() { if (this.onstart) this.onstart(); }
  stop() {
    if (this.onresult) {
      this.onresult({ resultIndex: 0, results: [[{ transcript: "what are my ai goals" }]].map((r) => Object.assign(r, { isFinal: true })) });
    }
  }
}
window.SpeechRecognition = FakeSR;

const spoken = [];
window.speechSynthesis = {
  cancel() {},
  speak(u) { spoken.push(u.text); if (u.onend) setTimeout(() => u.onend(), 5); },
};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };

window.Audio = class { play() { return Promise.resolve(); } pause() {} };
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};

/* the delayed Credits popup would race the modal assertions */
window.sessionStorage.setItem("nb_credit", "1");

/* ---------- boot the app exactly like a browser ---------- */
for (const s of [...document.querySelectorAll("script")]) {
  try {
    if (s.src) {
      const m = s.src.match(/js\/[a-z0-9-]*\.js$/);
      if (!m) continue;
      window.eval(fs.readFileSync(path.join(ROOT, m[0]), "utf8"));
    } else if (s.textContent.trim()) {
      window.eval(s.textContent);
    }
  } catch (e) {
    errors.push((s.src || "inline") + " → " + e.message);
  }
}

const NB = window.NB;
const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(label, fn) {
  try {
    const v = typeof fn === "function" ? fn() : fn;
    checks.push([label, v === true ? "OK" : "FAIL:" + JSON.stringify(v)]);
  } catch (e) {
    checks.push([label, "THROW:" + e.message]);
  }
}

(async () => {
  /* ── sources: NVIDIA-only speech, no screen capture ── */
  const voiceSrc = fs.readFileSync(path.join(ROOT, "js/voice.js"), "utf8");
  check("voice.js ships an STT chain on NVIDIA NVCF", () => /api\.nvcf\.nvidia\.com/.test(voiceSrc) && /ai-parakeet-tdt-0_6b-v2/.test(voiceSrc));
  check("voice.js ships a TTS chain on NVIDIA NVCF", () => /ai-magpie-tts-multilingual/.test(voiceSrc) && /ai-chatterbox-multilingual-tts/.test(voiceSrc));
  check("no screen capture anywhere", () => !/getDisplayMedia|getUserMedia\(\{\s*video/.test(voiceSrc + document.documentElement.innerHTML));

  /* ── engine surface ── */
  check("NB.openLive defined by voice.js (not a stub)", () => typeof NB.openLive === "function");
  check("voiceEngines reports capabilities", () => {
    const e = NB.voiceEngines();
    return e.recorder === true && e.recognition === true && e.speech === true;
  });
  check("voiceEngineLabel shape", () => {
    const l = NB.voiceEngineLabel();
    return "stt" in l && "tts" in l && l.sttFallback === true && l.ttsFallback === true;
  });

  /* ── open the modal ── */
  NB.openLive();
  await sleep(40);
  check("live modal opens", () => $(".live") !== null);
  check("orb + status + thread present", () => !!$("#live-orb") && !!$("#live-status") && !!$("#live-thread"));
  check("controls present", () => !!$("#live-talk") && !!$("#live-hands") && !!$("#live-stop") && !!$("#live-save"));
  check("engine footer rendered", () => /hearing:|speaking:/.test($("#live-foot").textContent));
  check("no 'coming soon' copy left", () => !/coming soon/i.test(document.querySelector("#modal-root").textContent));
  check("orb starts idle", () => /idle/.test($("#live-orb").className));

  /* ── full round trip: listen → transcribe → answer → speak ── */
  const realAsk = NB.askAI;
  NB.askAI = (q) => { NB.__asked = q; return Promise.resolve("You have three AI goals, all active."); };

  $("#live-talk").click();
  await sleep(40);
  check("mic requested", () => gotUserMedia === 1);
  check("status shows listening", () => /Listening/.test($("#live-status").textContent));
  check("orb is in listening mode", () => /listening/.test($("#live-orb").className));
  check("button flips to stop", () => $("#live-talk").textContent === "Stop & send");

  $("#live-talk").click();
  await sleep(500);
  check("recorder released", () => recorderStopped >= 1);
  check("question reached the AI", () => NB.__asked === "what are my ai goals");
  check("user bubble rendered", () => /what are my ai goals/i.test($("#live-thread").textContent));
  check("answer bubble rendered", () => /three AI goals/.test($("#live-thread").textContent));
  check("device voice used when NVIDIA is offline", () => spoken.length >= 1);
  check("transcript save offered", () => $("#live-save").hidden === false);
  NB.askAI = realAsk;

  /* ── save transcript → becomes a note ── */
  const before = NB.getStore().notes.length;
  $("#live-save").click();
  await sleep(10);
  check("save writes a note", () => NB.getStore().notes.length === before + 1);

  /* ── hands-free toggle ── */
  $("#live-hands").click();
  check("hands-free toggles on", () => $("#live-hands").getAttribute("aria-pressed") === "true");
  $("#live-hands").click();
  check("hands-free toggles off", () => $("#live-hands").getAttribute("aria-pressed") === "false");

  /* ── closing releases the microphone ── */
  const stopsBefore = micStops.length;
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await sleep(20);
  check("escape closes the modal", () => $("#modal-root").children.length === 0);
  check("mic tracks stopped on close", () => micStops.length > stopsBefore);

  for (const [l, r] of checks) console.log(r === "OK" ? " ✓" : " ✗", l, r === "OK" ? "" : "→ " + r);
  if (errors.length) { console.log("\nERRORS:"); errors.forEach((e) => console.log("  ", e)); }
  const failed = checks.filter((c) => c[1] !== "OK").length;
  console.log(failed === 0 && errors.length === 0 ? "\nLIVE TEST: ALL PASS" : "\nLIVE TEST: " + failed + " failed, " + errors.length + " errors");
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.log("HARNESS ERROR:", e && e.stack || e); process.exit(1); });
