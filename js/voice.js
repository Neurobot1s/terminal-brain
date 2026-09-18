/* ============================================================
   NeuroBot — voice.js (classic script; extends window.NB)
   "NeuroBot Live" — real voice conversations, NVIDIA speech.

   STT (you → text) and TTS (text → NeuroBot's voice) both run
   on NVIDIA's own speech models, called from the browser:

     1. your own relay, if you deployed nvidia-relay.js
     2. NVCF direct — api.nvcf.nvidia.com. Unlike
        integrate.api.nvidia.com it reflects any Origin in CORS,
        so it works from GitHub Pages with no server. Function
        ids/versions are refreshed from NVIDIA's discovery API at
        runtime (self-healing) with a verified snapshot fallback.
     3. integrate.api.nvidia.com direct (where its CORS
        allowlist permits, e.g. build.nvidia.com)

   NVIDIA's speech NIMs are gRPC-backed preview functions, so
   they are not always reachable straight from a browser. When
   every NVIDIA route fails, Live keeps the conversation going
   with the device's built-in speech engine and labels exactly
   which engine is in use — so the feature is never dead.

   Nothing is recorded to disk: audio is decoded in memory,
   sent to NVIDIA, and dropped. No screen capture anywhere.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var NVCF_BASE = "https://api.nvcf.nvidia.com/v2/nvcf";
  var INTEGRATE = "https://integrate.api.nvidia.com/v1";
  var FN_CACHE = "nb_voice_fns";     /* cached speech function ids (12h) */
  var ROUTE_CACHE = "nb_voice_route"; /* remembered working engine names */
  var FAIL_CACHE = "nb_voice_fail";   /* backoff after total NVIDIA failure */

  /* ---------- NVIDIA speech models ----------
     All ACTIVE on NVCF (verified 2026-09-17). id/ver is a
     snapshot; refreshed from the discovery API at runtime. */
  var STT_MODELS = [
    { fn: "ai-parakeet-tdt-0_6b-v2", slug: "nvidia/parakeet-tdt-0.6b-v2", label: "NVIDIA Parakeet TDT 0.6B",
      id: "d3fe9151-442b-4204-a70d-5fcc597fd610", ver: "5037d83d-8861-4ce6-be4f-5e64556d073f" },
    { fn: "ai-whisper-large-v3", slug: "nvidia/whisper-large-v3", label: "NVIDIA Whisper Large v3",
      id: "b702f636-f60c-4a3d-a6f4-f3568c13bd7d", ver: "a37ce169-8352-48ab-b197-f7c5b02448ff" },
    { fn: "ai-parakeet-1_1b-rnnt-multilingual-asr", slug: "nvidia/parakeet-1.1b-rnnt-multilingual-asr", label: "NVIDIA Parakeet 1.1B",
      id: "71203149-d3b7-4460-8231-1be2543a1fca", ver: "855caece-aba6-4c33-97de-f5f0bc1606e4" },
  ];

  var TTS_MODELS = [
    { fn: "ai-magpie-tts-multilingual", slug: "nvidia/magpie-tts-multilingual", label: "NVIDIA Magpie TTS",
      id: "877104f7-e885-42b9-8de8-f6e4c6303969", ver: "ae73d297-743f-4ca9-8cfe-2b4a68aae369" },
    { fn: "ai-chatterbox-multilingual-tts", slug: "nvidia/chatterbox-multilingual-tts", label: "NVIDIA Chatterbox TTS",
      id: "ddacc747-1269-4fab-bfd9-8f593dead106", ver: "a92bb61e-79d2-492b-90b1-c0f1147cd94d" },
    { fn: "ai-studiovoice", slug: "nvidia/studiovoice", label: "NVIDIA StudioVoice",
      id: "3f0aeba3-6d91-4465-b8cc-cc2aef355186", ver: "637857de-d291-4a7d-821b-2332d81b2c28" },
  ];

  var STT_TIMEOUT = 14000;  /* total budget for one utterance → text */
  var TTS_TIMEOUT = 12000;  /* total budget for one answer → speech */
  var REQ_TIMEOUT = 7000;   /* per HTTP request */
  var FAIL_BACKOFF = 2 * 60 * 1000;

  /* turn-taking */
  var PAUSE_MS = 5000;      /* hands-free: send after a 5s pause */
  var HARD_CAP_MS = 60000;  /* never record longer than this */
  var QUIET_RMS = 0.035;    /* mic level under which we count silence */
  var ECHO_GAP_MS = 800;    /* wait after TTS before the mic reopens */

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- capability detection ---------- */
  function hasRecorder() { return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function Rec() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }
  function hasBrowserTTS() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }

  /* ---------- bytes / audio helpers ---------- */
  function b64FromBytes(bytes) {
    var s = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  /* 16-bit mono PCM WAV — what NVIDIA's ASR models expect */
  function encodeWav(samples, rate) {
    var len = samples.length;
    var buf = new ArrayBuffer(44 + len * 2);
    var v = new DataView(buf);
    function str(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, len * 2, true);
    for (var i = 0, off = 44; i < len; i++, off += 2) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  /* decode whatever the recorder produced → 16kHz mono PCM WAV */
  function toWav(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !blob.arrayBuffer) return Promise.reject(new Error("decode-unsupported"));
    return blob.arrayBuffer().then(function (raw) {
      var ctx = new AC();
      return ctx.decodeAudioData(raw).then(function (decoded) {
        var target = 16000;
        var frames = Math.max(1, Math.ceil(decoded.duration * target));
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        var done = function (samples) {
          try { ctx.close(); } catch (e) {}
          return encodeWav(samples, target);
        };
        if (!OAC) {
          /* no offline resampler — downmix without resampling */
          var ch0 = decoded.getChannelData(0);
          var out = new Float32Array(frames);
          for (var i = 0; i < frames; i++) out[i] = ch0[Math.floor(i * decoded.sampleRate / target)] || 0;
          return done(out);
        }
        var off = new OAC(1, frames, target);
        var src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start(0);
        return off.startRendering().then(function (r) { return done(r.getChannelData(0)); });
      });
    });
  }

  function blobFromB64(b64, mime) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || "audio/mpeg" });
  }

  /* ---------- HTTP with timeout ---------- */
  function req(url, opts, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || REQ_TIMEOUT) : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      var err = new Error("network");
      err.network = true;
      throw err;
    });
  }

  function authHeaders(extra) {
    return Object.assign({ "Accept": "application/json", "Authorization": "Bearer " + NB.getAIKey() }, extra || {});
  }

  function relayBase() { return NB.getAIRelay && NB.getAIRelay(); }

  /* ---------- live NVCF function ids (self-healing) ---------- */
  var fnPromise = null;
  function getSpeechFns() {
    if (fnPromise) return fnPromise;
    fnPromise = new Promise(function (resolve) {
      var cached = null;
      try { cached = JSON.parse(lsGet(FN_CACHE) || "null"); } catch (e) { cached = null; }
      if (cached && cached.t && Date.now() - cached.t < 12 * 3600 * 1000 && cached.fns) return resolve(cached.fns);
      var key = NB.getAIKey ? NB.getAIKey() : "";
      if (!key) return resolve(cached && cached.fns ? cached.fns : {});
      fetch(NVCF_BASE + "/functions", { headers: { "Authorization": "Bearer " + key, "Accept": "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var fns = j && j.functions, map = {};
          if (!fns || !fns.length) return resolve(cached && cached.fns ? cached.fns : {});
          fns.forEach(function (f) {
            if (f.status === "ACTIVE" && f.name && !map[f.name]) map[f.name] = { id: f.id, ver: f.versionId };
          });
          lsSet(FN_CACHE, JSON.stringify({ t: Date.now(), fns: map }));
          resolve(map);
        })
        .catch(function () { resolve(cached && cached.fns ? cached.fns : {}); });
    });
    return fnPromise;
  }

  function withIds(models) {
    return getSpeechFns().then(function (live) {
      return models.map(function (m) {
        var l = live && live[m.fn];
        return { fn: m.fn, slug: m.slug, label: m.label, id: (l && l.id) || m.id, ver: (l && l.ver) || m.ver };
      });
    });
  }

  function pexec(m) { return NVCF_BASE + "/pexec/functions/" + m.id + "?versionId=" + m.ver; }

  /* ---------- STT: audio (WAV) → text ---------- */
  function transcriptOf(data, rawText) {
    if (data) {
      if (typeof data === "string") return data.trim();
      if (data.text) return String(data.text).trim();
      if (data.transcript) return String(data.transcript).trim();
      if (data.results && data.results.length) {
        var r = data.results[0];
        if (r.alternatives && r.alternatives.length) return String(r.alternatives[0].transcript || "").trim();
        if (r.transcript) return String(r.transcript).trim();
      }
      if (Array.isArray(data.data) && data.data[0]) {
        if (data.data[0].text) return String(data.data[0].text).trim();
        if (data.data[0].transcript) return String(data.data[0].transcript).trim();
      }
      if (data.choices && data.choices[0]) {
        var c = data.choices[0].message || data.choices[0];
        if (c && (c.content || c.text)) return String(c.content || c.text).trim();
      }
      if (data.detail && data.detail !== "Inference error") return String(data.detail).trim();
    }
    if (rawText) {
      var t = String(rawText).trim();
      if (t && t.charAt(0) !== "{" && t.charAt(0) !== "<" && t.length < 2000) return t;
    }
    return "";
  }

  /* ordered attempt list — most likely NVIDIA shapes first */
  function sttAttempts(m, wavB64, wavBlob, relay) {
    var json = { "Content-Type": "application/json" };
    var list = [];
    if (relay) list.push({ engine: "relay", label: "your relay", url: relay + "/v1/audio/transcriptions",
      headers: Object.assign({}, json, { "X-NB-Target": m.slug }), body: JSON.stringify({ model: m.slug, audio: wavB64 }) });
    list.push({ engine: "nvcf", label: m.label, url: pexec(m), headers: json, body: JSON.stringify({ audio: wavB64 }) });
    list.push({ engine: "nvcf", label: m.label, url: pexec(m), headers: json,
      body: JSON.stringify({ audio: wavB64, language: "en-US", encoding: "WAV", sample_rate_hertz: 16000 }) });
    if (wavBlob && window.FormData) {
      var fd = new FormData();
      fd.append("file", wavBlob, "audio.wav");
      fd.append("audio", wavBlob, "audio.wav");
      fd.append("language", "en");
      list.push({ engine: "nvcf-form", label: m.label, url: pexec(m), headers: authHeaders(), body: fd });
    }
    list.push({ engine: "integrate", label: m.label, url: INTEGRATE + "/audio/transcriptions",
      headers: Object.assign({}, json, { "X-NB-Target": m.slug }), body: JSON.stringify({ model: m.slug, audio: wavB64 }) });
    return list;
  }

  function trySttAttempt(a) {
    var headers = a.engine === "nvcf-form" ? a.headers : authHeaders(a.headers);
    return req(a.url, { method: "POST", headers: headers, body: a.body }, REQ_TIMEOUT).then(function (res) {
      if (res.status === 429) { var e = new Error("retry"); e.retry = true; throw e; }
      /* 404/500 on NVIDIA speech = the NIM can't be served over HTTP —
         deterministic, so bail the whole chain instantly (no limbo) */
      if (res.status === 404 || res.status >= 500) { var e5 = new Error("nv-speech-down"); e5.deterministic = true; throw e5; }
      if (!res.ok) { var e2 = new Error("http " + res.status); throw e2; }
      var ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.indexOf("json") === -1 && ct.indexOf("text") === -1) return "";
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        var text = transcriptOf(data, t);
        if (!text) { var e3 = new Error("empty transcript"); throw e3; }
        return text;
      });
    });
  }

  /* Runs the NVIDIA STT chain. Rejects with {"__nvidia":true} when
     NVIDIA simply isn't reachable so the caller can fall back. */
  function unreachable() { var e = new Error("nvidia-unreachable"); e.nvidia = true; return e; }

  function nvidiaStt(wavB64, wavBlob) {
    return withIds(STT_MODELS).then(function (models) {
      var relay = relayBase();
      var started = Date.now();
      var i = 0, netFails = 0;
      function next() {
        if (i >= models.length) throw unreachable();
        if (Date.now() - started > STT_TIMEOUT) { var e2 = new Error("nvidia-timeout"); e2.nvidia = true; throw e2; }
        var attempts = sttAttempts(models[i], wavB64, wavBlob, relay);
        var j = 0;
        function nextAttempt() {
          if (j >= attempts.length) { i++; return next(); }
          if (Date.now() - started > STT_TIMEOUT) { var e3 = new Error("nvidia-timeout"); e3.nvidia = true; throw e3; }
          var a = attempts[j++];
          return trySttAttempt(a).then(function (text) {
            remember("stt", a.engine + "|" + models[i].fn);
            return { text: text, engine: a.engine, model: models[i] };
          }).catch(function (err) {
            if (err && err.deterministic) throw unreachable();
            if (err && err.network && ++netFails >= 2) throw unreachable();
            return sleep(60).then(nextAttempt);
          });
        }
        return nextAttempt();
      }
      return next();
    });
  }

  /* ---------- TTS: text → playable audio ---------- */
  function audioPayload(data) {
    if (!data) return null;
    var keys = ["audio", "audio_base64", "audioContent", "base64", "output", "data", "result"];
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (typeof v === "string" && v.length > 64) return { b64: v, mime: "audio/mpeg" };
      if (v && typeof v === "object") {
        if (typeof v.audio === "string") return { b64: v.audio, mime: "audio/mpeg" };
        if (typeof v.base64 === "string") return { b64: v.base64, mime: "audio/mpeg" };
        if (typeof v.audio_base64 === "string") return { b64: v.audio_base64, mime: "audio/mpeg" };
      }
    }
    if (data.artifacts && data.artifacts[0] && data.artifacts[0].base64) return { b64: data.artifacts[0].base64, mime: "audio/mpeg" };
    if (data.results && data.results[0]) {
      var r = data.results[0];
      if (typeof r.audio === "string") return { b64: r.audio, mime: "audio/mpeg" };
      if (r.audio && typeof r.audio.base64 === "string") return { b64: r.audio.base64, mime: "audio/mpeg" };
    }
    return null;
  }

  function ttsAttempts(m, text, relay) {
    var json = { "Content-Type": "application/json" };
    var list = [];
    if (relay) list.push({ engine: "relay", label: "your relay", url: relay + "/v1/audio/speech",
      headers: Object.assign({}, json, { "X-NB-Target": m.slug }),
      body: JSON.stringify({ model: m.slug, input: text, voice: "Aria", response_format: "mp3" }) });
    list.push({ engine: "nvcf", label: m.label, url: pexec(m), headers: json,
      body: JSON.stringify({ text: text, voice: "Aria", language: "en-US" }) });
    list.push({ engine: "nvcf", label: m.label, url: pexec(m), headers: json, body: JSON.stringify({ text: text }) });
    list.push({ engine: "nvcf", label: m.label, url: pexec(m), headers: json,
      body: JSON.stringify({ text: text, voice: "English-US.Female-1" }) });
    list.push({ engine: "integrate", label: m.label, url: INTEGRATE + "/audio/speech",
      headers: Object.assign({}, json, { "X-NB-Target": m.slug }),
      body: JSON.stringify({ model: m.slug, input: text, voice: "Aria", response_format: "mp3" }) });
    return list;
  }

  function tryTtsAttempt(a) {
    return req(a.url, { method: "POST", headers: authHeaders(a.headers), body: a.body }, REQ_TIMEOUT).then(function (res) {
      if (res.status === 429) { var e = new Error("retry"); e.retry = true; throw e; }
      if (res.status === 404 || res.status >= 500) { var e5 = new Error("nv-speech-down"); e5.deterministic = true; throw e5; }
      if (!res.ok) { var e2 = new Error("http " + res.status); throw e2; }
      var ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.indexOf("audio") !== -1) {
        return res.blob().then(function (b) {
          if (!b.size) { var e3 = new Error("empty audio"); throw e3; }
          return { blob: b, mime: b.type || ct };
        });
      }
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        var p = audioPayload(data);
        if (!p) { var e4 = new Error("no audio"); throw e4; }
        return { blob: blobFromB64(p.b64, p.mime), mime: p.mime };
      });
    });
  }

  function nvidiaTts(text) {
    return withIds(TTS_MODELS).then(function (models) {
      var relay = relayBase();
      var started = Date.now();
      var i = 0, netFails = 0;
      function next() {
        if (i >= models.length) throw unreachable();
        if (Date.now() - started > TTS_TIMEOUT) { var e2 = new Error("nvidia-timeout"); e2.nvidia = true; throw e2; }
        var attempts = ttsAttempts(models[i], text, relay);
        var j = 0;
        function nextAttempt() {
          if (j >= attempts.length) { i++; return next(); }
          if (Date.now() - started > TTS_TIMEOUT) { var e3 = new Error("nvidia-timeout"); e3.nvidia = true; throw e3; }
          var a = attempts[j++];
          return tryTtsAttempt(a).then(function (out) {
            remember("tts", a.engine + "|" + models[i].fn);
            return Object.assign({ engine: a.engine, model: models[i] }, out);
          }).catch(function (err) {
            if (err && err.deterministic) throw unreachable();
            if (err && err.network && ++netFails >= 2) throw unreachable();
            return sleep(60).then(nextAttempt);
          });
        }
        return nextAttempt();
      }
      return next();
    });
  }

  /* ---------- route memory / backoff ---------- */
  function routeMemory() {
    try { return JSON.parse(lsGet(ROUTE_CACHE) || "{}") || {}; } catch (e) { return {}; }
  }
  function remember(kind, value) {
    var m = routeMemory();
    m[kind] = value;
    m.t = Date.now();
    lsSet(ROUTE_CACHE, JSON.stringify(m));
  }
  function nvidiaCoolingDown() {
    var until = Number(lsGet(FAIL_CACHE)) || 0;
    return Date.now() < until;
  }
  function markNvidiaDown() { lsSet(FAIL_CACHE, String(Date.now() + FAIL_BACKOFF)); }
  function clearNvidiaDown() { lsDel(FAIL_CACHE); }

  /* ---------- browser fallbacks (only when NVIDIA can't answer) ---------- */

  /* live recognition while the user talks — gives interim text + a
     final transcript used if NVIDIA ASR stays unreachable.
     The final transcript is REBUILT from the results list on every
     event instead of accumulated — accumulating is what makes the
     same words print twice in browsers that re-deliver results. */
  function browserListen(onPartial) {
    var SR = Rec();
    if (!SR) return null;
    var rec;
    try { rec = new SR(); } catch (e) { return null; }
    var finalText = "", failed = false;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = function (e) {
      var fin = "", interim = "";
      for (var i = 0; i < e.results.length; i++) {
        var r = e.results[i];
        var t = (r && r[0] && r[0].transcript) || "";
        if (r.isFinal) fin += t;
        else interim += t;
      }
      finalText = fin.replace(/\s+/g, " ").trim();
      if (onPartial) onPartial((finalText + " " + interim).replace(/\s+/g, " ").trim());
    };
    rec.onerror = function () { failed = true; };
    try { rec.start(); } catch (e) { return null; }
    return {
      stop: function () {
        try { rec.stop(); } catch (e) {}
        return failed ? "" : finalText;
      },
      /* Chrome finalises the last result AFTER stop() — read this
         a beat later for the late-arriving words */
      getText: function () { return failed ? "" : finalText; },
    };
  }

  /* Device TTS — hardened, because this is what speaks every answer:
     1. cancel() then settle a beat (Chrome drops the NEXT utterance if you
        speak immediately after cancel — the classic silent-answer bug)
     2. pick a decent en voice when the browser has one loaded
     3. speak long text in chunks (Chrome caps/limits single utterances)
     4. per-chunk watchdog: Chrome sometimes loses onend entirely (the
        utterance finishes audibly but the event never fires) — the guard
        advances anyway so the UI can never hang in "speaking" */
  var speakToken = 0;
  function browserSpeak(text, onEnd) {
    if (!hasBrowserTTS() || !text) { if (onEnd) onEnd(); return false; }
    var token = ++speakToken;
    function cancelled() { return token !== speakToken; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    function pickVoice() {
      try {
        var vs = window.speechSynthesis.getVoices ? (window.speechSynthesis.getVoices() || []) : [];
        if (!vs.length) return null;
        var en = vs.filter(function (v) { return /^en/i.test(v.lang || ""); });
        var pool = en.length ? en : vs;
        var nice = pool.filter(function (v) { return /samantha|karen|zira|aria|jenny|google (us|uk)/i.test(v.name || ""); });
        return (nice[0] || pool[0]) || null;
      } catch (e) { return null; }
    }
    function chunks(s) {
      var words = String(s).replace(/\s+/g, " ").trim().split(" ");
      var out = [], cur = "";
      for (var i = 0; i < words.length; i++) {
        if ((cur + " " + words[i]).trim().length > 180) { out.push(cur.trim()); cur = words[i]; }
        else cur += " " + words[i];
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    function speakParts(voice) {
      if (cancelled()) return;
      var parts = chunks(text);
      if (!parts.length) { if (onEnd) onEnd(); return; }
      var idx = 0, finished = false;
      function finish() { if (!finished) { finished = true; if (onEnd) onEnd(); } }
      function next() {
        if (cancelled() || finished) return;
        if (idx >= parts.length) { finish(); return; }
        var part = parts[idx++];
        var u = new window.SpeechSynthesisUtterance(part);
        if (voice) { try { u.voice = voice; } catch (e) {} }
        u.rate = 1.02; u.pitch = 1; u.volume = 1;
        /* generous stall guard — only trips when onend is truly lost */
        var guard = setTimeout(next, Math.max(6000, part.length * 220));
        u.onend = function () { clearTimeout(guard); setTimeout(next, 0); };
        u.onerror = function () { clearTimeout(guard); setTimeout(next, 0); };
        try { window.speechSynthesis.speak(u); } catch (e) { clearTimeout(guard); setTimeout(next, 0); }
      }
      next();
    }
    /* let cancel() settle before speaking, then go (voices load async on
       Chrome but a missing one is fine — the default voice still speaks) */
    setTimeout(function () { if (!cancelled()) speakParts(pickVoice()); }, 120);
    return true;
  }

  function stopSpeaking() {
    speakToken++; /* kill queued chunks + watchdogs from any running speak */
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    if (state.audio) { try { state.audio.pause(); } catch (e) {} state.audio = null; }
  }

  /* ---------- diagnostics ---------- */
  var state = { audio: null };

  NB.voiceEngines = function () {
    var m = routeMemory();
    return {
      recorder: hasRecorder(),
      recognition: !!Rec(),
      speech: hasBrowserTTS(),
      nvidiaDown: nvidiaCoolingDown(),
      stt: m.stt || "",
      tts: m.tts || "",
    };
  };

  NB.voiceEngineLabel = function () {
    var e = NB.voiceEngines();
    function nice(v) {
      if (!v) return null;
      var parts = String(v).split("|");
      var eng = parts[0], fn = parts[1] || "";
      var label = fn ? (fn.replace(/^ai-/, "").replace(/_/g, " ")) : "";
      if (eng.indexOf("nvcf") === 0) return "NVIDIA " + (label || "speech");
      if (eng === "relay") return "NVIDIA " + (label || "speech") + " (relay)";
      if (eng === "integrate") return "NVIDIA " + (label || "speech") + " (integrate)";
      return null;
    }
    return {
      stt: nice(e.stt),
      tts: nice(e.tts),
      sttFallback: e.recognition,
      ttsFallback: e.speech,
      nvidiaDown: e.nvidiaDown,
    };
  };

  /* Probe NVIDIA STT+TTS once (used by the Live panel). */
  NB.voiceTest = function (onStep) {
    var step = function (s) { if (onStep) onStep(s); };
    var out = { stt: false, tts: false, notes: [] };
    step("building a 1-second silent WAV…");
    var rate = 16000, frames = rate;
    var samples = new Float32Array(frames);
    var wav = encodeWav(samples, rate);
    var b64 = b64FromBytes(new Uint8Array(wav));
    var blob = new Blob([wav], { type: "audio/wav" });
    step("asking NVIDIA for speech-to-text…");
    return nvidiaStt(b64, blob).then(function (r) {
      out.stt = true;
      out.notes.push("STT: " + r.model.label + " via " + r.engine);
    }).catch(function () {
      out.notes.push("STT: NVIDIA unreachable" + (Rec() ? " — device speech recognition will be used" : ""));
    }).then(function () {
      step("asking NVIDIA for text-to-speech…");
      return nvidiaTts("NeuroBot voice check.").then(function (r) {
        out.tts = true;
        out.notes.push("TTS: " + r.model.label + " via " + r.engine);
      }).catch(function () {
        out.notes.push("TTS: NVIDIA unreachable" + (hasBrowserTTS() ? " — device voice will be used" : ""));
      });
    }).then(function () {
      if (out.stt || out.tts) clearNvidiaDown();
      return out;
    });
  };

  /* ============================================================
     NEUROBOT LIVE — the voice conversation modal
     ============================================================ */
  NB.openLive = function () {
    var modal = NB.openModal({ subtitle: "$ neurobot live --voice", title: "NeuroBot Live", large: true });

    modal.body.innerHTML =
      '<div class="live">' +
        '<div class="live-stage">' +
          '<button class="live-orb idle" id="live-orb" type="button" aria-label="Start or stop listening">' +
            '<span class="live-ring"></span><span class="live-ring r2"></span>' +
            '<span class="live-core" id="live-core">🎙</span>' +
          "</button>" +
          '<div class="live-status" id="live-status">Tap the orb and start talking</div>' +
          '<div class="live-meter"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        "</div>" +
        '<div class="live-thread" id="live-thread">' +
          '<div class="live-empty" id="live-empty">Your conversation appears here. NeuroBot answers with your own ' +
          NB.totalItems() + " memories as context — and speaks out loud." +
            '<div class="live-empty-chips" id="live-chips">' +
              ["summarize my notes", "what are my goals", "ideas i should build next", "quiz me on my knowledge"]
                .map(function (q) { return '<button type="button" data-ask="' + esc(q) + '">' + esc(q) + "</button>"; })
                .join("") +
            "</div>" +
          "</div>" +
        "</div>" +
        '<div class="live-controls">' +
          '<button class="btn btn-primary btn-sm" id="live-talk">Start talking</button>' +
          '<button class="btn btn-outline btn-sm" id="live-hands" aria-pressed="false">Hands-free: off</button>' +
          '<button class="btn btn-outline btn-sm" id="live-stop" hidden>Stop voice</button>' +
          '<button class="btn btn-outline btn-sm" id="live-save" hidden>Save transcript</button>' +
        "</div>" +
        '<div class="live-hint">talk, then pause — neurobot sends after a 5-second break</div>' +
        '<div class="live-foot" id="live-foot"></div>' +
      "</div>";

    var orb = modal.body.querySelector("#live-orb");
    var core = modal.body.querySelector("#live-core");
    var statusEl = modal.body.querySelector("#live-status");
    var meter = modal.body.querySelector(".live-meter");
    var thread = modal.body.querySelector("#live-thread");
    var empty = modal.body.querySelector("#live-empty");
    var talkBtn = modal.body.querySelector("#live-talk");
    var handsBtn = modal.body.querySelector("#live-hands");
    var stopBtn = modal.body.querySelector("#live-stop");
    var saveBtn = modal.body.querySelector("#live-save");
    var foot = modal.body.querySelector("#live-foot");

    var micStream = null, recorder = null, chunks = [], analyser = null, audioCtx = null;
    var rafId = null, capTimer = null, noSpeechTimer = null, spokeAt = 0, quietSince = 0, sessionStart = 0;
    var lastSrActivity = 0; /* last time the recogniser delivered anything */
    var listening = false, handsFree = false, busy = false, closed = false;
    var recognizer = null, browserFinal = "", turns = [];
    var latestPartial = "";
    var said = {};            /* global dedupe: one utterance → one bubble, ever */
    var lastSpokeText = "";   /* what NeuroBot last said out loud (echo guard) */
    var liveChat = [];        /* conversation memory for follow-ups */

    function esc(s) { return NB.esc(s); }

    function setStatus(text, tone) {
      statusEl.textContent = text;
      statusEl.className = "live-status" + (tone ? " " + tone : "");
    }
    function setMode(mode) {
      orb.className = "live-orb " + mode;
      if (meter) meter.className = "live-meter" + (mode === "listening" || mode === "speaking" ? " on" : "");
      core.textContent = mode === "speaking" ? "🔊" : mode === "thinking" ? "✦" : "🎙";
    }
    function refreshFoot() {
      var e = NB.voiceEngineLabel();
      var stt = e.stt || (e.sttFallback ? "device speech recognition" : "unavailable");
      var tts = e.tts || (e.ttsFallback ? "device voice" : "unavailable");
      foot.innerHTML =
        "hearing: <b>" + esc(stt) + "</b> · speaking: <b>" + esc(tts) + "</b>" +
        (e.nvidiaDown ? ' · <span class="live-warn">NVIDIA speech models unreachable — using your device voice</span>' : "");
      if (NB.hasCustomKey && NB.hasCustomKey()) foot.innerHTML += " · using your key";
    }

    function bubble(role, text) {
      if (empty && empty.parentNode) empty.remove();
      var div = document.createElement("div");
      div.className = "live-bubble " + role;
      div.innerHTML = '<span class="live-who">' + (role === "user" ? "you" : "neurobot") + "</span>" +
        '<span class="live-said">' + esc(text) + "</span>";
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
      return div;
    }

    function pushTurn(role, text) {
      if (!text) return;
      turns.push({ role: role, text: text });
      if (turns.length) saveBtn.hidden = false;
    }

    /* ---------- metering + silence detection ----------
       Records until you stop talking for PAUSE_MS (5s), then sends.
       The countdown shows in the status line. */
    function startMeter() {
      if (!analyser || !audioCtx) return;
      var buf = new Uint8Array(analyser.fftSize);
      function loop() {
        if (!listening) return;
        analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) { var d = (buf[i] - 128) / 128; sum += d * d; }
        var rms = Math.sqrt(sum / buf.length);
        orb.style.setProperty("--level", Math.min(1, rms * 4.5).toFixed(3));
        var now = Date.now();
        /* “speaking” = the mic is loud OR the recogniser is streaming text
           right now — so quiet mics still get the 5s pause countdown */
        if (rms > QUIET_RMS || (lastSrActivity && now - lastSrActivity < 300)) {
          spokeAt = now;
          quietSince = 0;
        } else if (spokeAt && !quietSince) {
          quietSince = now;
        }
        if (spokeAt && quietSince && now - quietSince >= PAUSE_MS) { stopListening(); return; }
        if (now - sessionStart > HARD_CAP_MS) { stopListening(); return; }
        rafId = requestAnimationFrame(loop);
        if (spokeAt && quietSince) {
          var left = PAUSE_MS - (now - quietSince);
          if (left > 0 && left <= PAUSE_MS) setStatus("Sending in " + Math.max(1, Math.ceil(left / 1000)) + "s…", "live");
        } else if (spokeAt) {
          setStatus("Listening… speak now", "live");
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    function stopMeter() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (capTimer) { clearTimeout(capTimer); capTimer = null; }
      if (noSpeechTimer) { clearTimeout(noSpeechTimer); noSpeechTimer = null; }
      orb.style.removeProperty("--level");
    }

    /* ---------- listening round ---------- */
    function startListening() {
      if (listening || busy || closed) return;
      if (!hasRecorder()) {
        setStatus("This browser can't record audio — try Chrome, Edge or Safari.", "err");
        return;
      }
      setStatus("Requesting microphone…");
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then(function (stream) {
          if (closed) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          micStream = stream;
          var mime = "";
          var opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
          for (var i = 0; i < opts.length; i++) {
            if (window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) { mime = opts[i]; break; }
          }
          try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
          catch (e) { recorder = new MediaRecorder(stream); }
          chunks = [];
          recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          recorder.onstop = function () { finishListening(); };
          recorder.start();

          try {
            var AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            audioCtx.createMediaStreamSource(stream).connect(analyser);
          } catch (e) { audioCtx = null; analyser = null; }

          browserFinal = "";
          latestPartial = "";
          lastSrActivity = 0;
          recognizer = browserListen(function (partial) {
            /* any recogniser event counts as “heard something” — even a
               bare interim — so quiet mics still get the pause countdown */
            lastSrActivity = Date.now();
            latestPartial = partial || "";
            if (partial) setStatus(partial, "live");
          });

          /* if the mic AND the recogniser both heard nothing for a while,
             end the round instead of sitting on the 60s hard cap */
          if (noSpeechTimer) clearTimeout(noSpeechTimer);
          noSpeechTimer = setTimeout(function () {
            if (listening && !spokeAt && (!lastSrActivity || Date.now() - lastSrActivity > 4000)) stopListening();
          }, 7000);

          listening = true;
          spokeAt = 0; quietSince = 0; sessionStart = Date.now();
          setMode("listening");
          setStatus("Listening… speak now", "live");
          talkBtn.textContent = "Stop & send";
          startMeter();
          /* hard cap so a dropped recorder/VAD can't hang the UI */
          capTimer = setTimeout(function () { if (listening) stopListening(); }, HARD_CAP_MS + 2000);
        })
        .catch(function (err) {
          setStatus(/denied|NotAllowed/i.test(err && err.name || "") ?
            "Microphone blocked — allow mic access in your browser and try again." :
            "Could not start the microphone (" + ((err && err.name) || "error") + ").", "err");
          setMode("idle");
        });
    }

    function stopListening() {
      if (!listening) return;
      listening = false;
      stopMeter();
      talkBtn.textContent = "Start talking";
      /* Chrome finalises its last recognition result just after stop();
         grab the rebuilt transcript on the next tick */
      var rec = recognizer;
      recognizer = null;
      if (rec) {
        try { rec.stop(); } catch (e) {}
        setTimeout(function () {
          browserFinal = rec.getText ? rec.getText() : "";
          if (recorder && recorder.state !== "inactive") {
            try { recorder.stop(); } catch (e) { finishListening(); }
          } else {
            finishListening();
          }
        }, 250);
      } else if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (e) { finishListening(); }
      } else {
        finishListening();
      }
    }

    function releaseMic() {
      if (micStream) { micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); micStream = null; }
      if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
      analyser = null;
    }

    function finishListening() {
      if (busy) return;
      busy = true;
      releaseMic();
      var blob = chunks.length ? new Blob(chunks, { type: recorder && recorder.mimeType || "audio/webm" }) : null;
      chunks = [];
      var browserText = browserFinal || "";
      browserFinal = "";

      setMode("thinking");
      setStatus("Transcribing…");

      /* NVIDIA first; the device recogniser is the fallback. No minimum
         length — whatever came out of the mic gets sent. */
      var nvidia = (blob && !nvidiaCoolingDown())
        ? toWav(blob).then(function (wav) {
            var b64 = b64FromBytes(new Uint8Array(wav));
            return nvidiaStt(b64, new Blob([wav], { type: "audio/wav" }));
          })
        : Promise.reject(new Error("skipped"));

      nvidia.then(function (r) {
        clearNvidiaDown();
        return { text: r.text, engine: r.model.label + " (NVIDIA)" };
      }).catch(function () {
        markNvidiaDown();
        return { text: browserText, engine: browserText ? "device speech recognition" : "" };
      }).then(function (got) {
        refreshFoot();
        /* one utterance = one bubble, ever. Drops: echoes of NeuroBot's
           own last line, repeats of anything already sent this session,
           and empty/duplicate results from either engine. */
        var text = String(got.text || "").replace(/\s+/g, " ").trim();
        var key = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        /* echo guard — ONLY catches the mic picking up NeuroBot's own last
           line: the utterance must be a strong prefix of the answer (>18
           chars) or a long fragment of it (>30 chars). Short replies like
           "nice" or "cool" after an answer mentioning them pass freely. */
        var inLast = !!(lastSpokeText && key && lastSpokeText.indexOf(key) !== -1);
        var echoed = !!(inLast && (lastSpokeText.indexOf(key) === 0 ? key.length > 18 : key.length > 30));
        /* repeat guard — 90s window, and never for short natural replies */
        var REPEAT_WIN = 90 * 1000;
        var isRepeat = !!(said[key] && Date.now() - said[key] < REPEAT_WIN);
        if (!text || echoed || (isRepeat && key.length >= 6)) {
          busy = false;
          setMode("idle");
          if (echoed) setStatus("(echo filtered — that was NeuroBot speaking)", "warn");
          else if (isRepeat && key.length >= 6) setStatus("(repeat filtered — just answered that)", "warn");
          else setStatus("Couldn't hear that — tap the orb and try again.", "warn");
          if (handsFree) setTimeout(function () { if (!closed && !busy) startListening(); }, 900);
          return;
        }
        said[key] = Date.now();
        bubble("user", text);
        pushTurn("you", text);
        ask(text);
      });
    }

    /* ---------- thinking + speaking ---------- */
    function ask(question) {
      setMode("thinking");
      setStatus("Thinking with your memories…");
      var pending = bubble("ai", "…");
      pending.classList.add("think");
      NB.askAI(question, { history: liveChat }).then(function (answer) {
        liveChat.push({ role: "user", text: question }, { role: "assistant", text: answer });
        pending.classList.remove("think");
        pending.querySelector(".live-said").textContent = answer;
        thread.scrollTop = thread.scrollHeight;
        pushTurn("neurobot", answer);
        lastSpokeText = String(answer).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 120);
        busy = false;
        speak(answer);
      }).catch(function (err) {
        pending.classList.remove("think");
        pending.classList.add("err");
        pending.querySelector(".live-said").textContent = err.message || String(err);
        busy = false;
        setMode("idle");
        setStatus("NeuroBot couldn't answer just now.", "err");
        if (handsFree) setTimeout(function () { startListening(); }, 1400);
      });
    }

    function speak(text) {
      setMode("speaking");
      setStatus("NeuroBot is speaking…", "live");
      stopBtn.hidden = false;
      var done = function () {
        stopBtn.hidden = true;
        if (closed) return;
        setMode("idle");
        setStatus(handsFree ? "Listening again…" : "Tap the orb to keep talking");
        if (handsFree) {
          /* let the tail of the answer clear the mic before reopening */
          setTimeout(function () { if (!closed && !busy) startListening(); }, ECHO_GAP_MS);
        }
      };

      var nvidia = nvidiaCoolingDown() ? Promise.reject(new Error("skipped")) : nvidiaTts(text);
      nvidia.then(function (out) {
        clearNvidiaDown();
        refreshFoot();
        var url = URL.createObjectURL(out.blob);
        var audio = new Audio(url);
        state.audio = audio;
        audio.onended = function () { URL.revokeObjectURL(url); state.audio = null; done(); };
        audio.onerror = function () { URL.revokeObjectURL(url); state.audio = null; browserSpeak(text, done); };
        return audio.play().catch(function () {
          URL.revokeObjectURL(url); state.audio = null; browserSpeak(text, done);
        });
      }).catch(function () {
        markNvidiaDown();
        refreshFoot();
        var engine = NB.voiceEngineLabel();
        if (!engine.tts) setStatus("Speaking with your device voice…", "live");
        browserSpeak(text, done);
      });
    }

    /* ---------- controls ---------- */
    function toggleTalk() {
      if (busy) return;
      if (listening) stopListening(); else startListening();
    }
    orb.addEventListener("click", toggleTalk);
    talkBtn.addEventListener("click", toggleTalk);

    handsBtn.addEventListener("click", function () {
      handsFree = !handsFree;
      handsBtn.textContent = "Hands-free: " + (handsFree ? "on" : "off");
      handsBtn.setAttribute("aria-pressed", handsFree ? "true" : "false");
      handsBtn.className = "btn btn-sm " + (handsFree ? "btn-primary" : "btn-outline");
      talkBtn.textContent = handsFree ? "Interrupt" : "Start talking";
      if (handsFree && !listening && !busy) startListening();
      if (!handsFree) setStatus("Hands-free off");
    });

    /* starter chips — tap one to ask without talking */
    thread.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("[data-ask]") : null;
      if (!b || busy || closed || listening) return;
      var q = (b.getAttribute("data-ask") || "").trim();
      if (!q) return;
      var chips = thread.querySelector(".live-empty-chips");
      if (chips) chips.remove();
      if (empty && empty.parentNode) empty.remove();
      var key = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      said[key] = Date.now();
      bubble("user", q);
      pushTurn("you", q);
      ask(q);
    });

    stopBtn.addEventListener("click", function () {
      stopSpeaking();
      stopBtn.hidden = true;
      setMode("idle");
      setStatus("Voice stopped.");
    });

    saveBtn.addEventListener("click", function () {
      if (!turns.length) return;
      var body = turns.map(function (t) { return (t.role === "you" ? "You: " : "NeuroBot: ") + t.text; }).join("\n");
      NB.addNote({
        title: "Live conversation · " + new Date().toLocaleString(),
        body: body,
        category: "General",
        pinned: true,
      });
      NB.toast("Conversation saved to your notes.");
      saveBtn.hidden = true;
    });

    refreshFoot();
    if (!hasRecorder()) {
      setStatus("Voice needs microphone access — this browser can't record audio.", "warn");
      talkBtn.disabled = true;
      orb.disabled = true;
    } else if (!Rec() && !hasBrowserTTS()) {
      setStatus("Microphone ready · neurobot will answer in text (no voice engine here)", "warn");
    }

    /* ---------- teardown on any close path ---------- */
    var backdrop = document.querySelector("#modal-root .modal-backdrop");
    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      closed = true;
      listening = false;
      stopMeter();
      stopSpeaking();
      if (recognizer) { try { recognizer.stop(); } catch (e) {} recognizer = null; }
      if (recorder && recorder.state !== "inactive") { try { recorder.stop(); } catch (e) {} }
      releaseMic();
      document.removeEventListener("keydown", onEsc);
      if (backdrop) {
        backdrop.removeEventListener("click", onBackdrop);
        var x = backdrop.querySelector(".modal-close");
        if (x) x.removeEventListener("click", cleanup);
      }
    }
    function onEsc(e) { if (e.key === "Escape") cleanup(); }
    function onBackdrop(e) { if (e.target === backdrop) cleanup(); }
    document.addEventListener("keydown", onEsc);
    if (backdrop) {
      backdrop.addEventListener("click", onBackdrop);
      var closeX = backdrop.querySelector(".modal-close");
      if (closeX) closeX.addEventListener("click", cleanup);
    }

    /* auto-start once the user has been greeted */
    setStatus("Tap the orb and start talking");
    setMode("idle");
  };
})();
