/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   AI backend: NVIDIA models via OpenRouter, called directly
   from the browser.

   WHY OpenRouter: GitHub Pages has no server, and NVIDIA's
   integrate.api endpoint only allows cross-origin browser
   calls from build.nvidia.com — from any other origin the
   browser blocks the response (no Access-Control-Allow-Origin).
   OpenRouter sends `Access-Control-Allow-Origin: *`, so a
   pure-static site can talk to it, and it hosts NVIDIA models
   on its free tier.

   Setup: create a FREE key at openrouter.ai/keys and paste it
   in Settings → AI Connection (or terminal `key <sk-or-…>`).
   It is stored only in this browser's localStorage.

   Resilience:
     - retries transient failures with backoff
     - walks to the next free model on 404/410 (model retired)
       AND on 429 (free-tier rate limit) — 3 free models available
     - reasoning models' <think>…</think> blocks are stripped
     - markdown formatting stripped (plain-text UI)
     - model preference persists in localStorage (terminal `model`)
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var KEY_STORE = "nb_ai_key";     /* OpenRouter key override */
  var MODEL_STORE = "nb_ai_model"; /* preferred model */
  var MODELS = [
    "nvidia/nemotron-3.5-lightning:free",                          /* NVIDIA — default */
    "nvidia/nemotron-3-super-120b-a12b:free",                      /* NVIDIA — fallback */
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428:free", /* NVIDIA — last resort */
  ];
  var OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  var ASK_LIMIT = 100;

  var isFile = location.protocol === "file:";
  var callCount = 0, lastError = "", lastModel = "";
  var lastBlocked = ""; /* session memory of why a request failed hard */

  NB.getAIKey = function () {
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  };
  NB.setAIKey = function (k) {
    k = String(k || "").trim();
    try {
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
    } catch (e) { /* storage unavailable — key applies to this page only */ }
    callCount = 0; lastError = "";
    return true;
  };

  /* model preference (localStorage — perfect for static hosting) */
  NB.getAIModel = function () {
    try {
      var m = localStorage.getItem(MODEL_STORE);
      return MODELS.indexOf(m) !== -1 ? m : MODELS[0];
    } catch (e) { return MODELS[0]; }
  };
  NB.setAIModel = function (m) {
    if (MODELS.indexOf(m) === -1) return false;
    try { localStorage.setItem(MODEL_STORE, m); } catch (e) { /* session-only */ }
    return true;
  };
  NB.AI_MODELS = MODELS;

  NB.aiStatus = function () {
    return { calls: callCount, lastError: lastError, transport: "openrouter", model: lastModel, env: NB.aiEnv() };
  };
  /* host-capability diagnostics for Settings → AI Connection */
  NB.aiEnv = function () {
    return {
      protocol: location.protocol,
      file: isFile,
      direct: lastBlocked ? "blocked: " + lastBlocked : "ready",
      key: NB.getAIKey() ? "custom" : "missing",
      model: NB.getAIModel(),
    };
  };

  /* ---------- brain context ---------- */
  function brainContext() {
    var s = NB.getStore(), lines = [];
    s.knowledge.forEach(function (k) { lines.push("- [knowledge/" + k.topic + "] " + k.title + ": " + k.body + " (source: " + k.source + ")"); });
    s.notes.forEach(function (n) { lines.push("- [note/" + n.category + "] " + n.title + ": " + n.body); });
    s.ideas.forEach(function (i) { lines.push("- [idea/" + i.category + ", status " + i.status + "] " + i.title + ": " + i.body); });
    s.goals.forEach(function (g) { lines.push("- [goal, " + g.progress + "%, " + g.status + "] " + g.title + ": " + g.body + " (deadline " + g.deadline + ")"); });
    return lines.join("\n");
  }

  function messagesFor(q) {
    return [
      {
        role: "system",
        content:
          "You are NeuroBot, a personal second-brain assistant. " +
          "Answer ONLY from the memories provided by the user. " +
          "If they don't contain the answer, say so briefly and offer what is closest. " +
          "Be concise (max ~100 words). Plain text only, no markdown formatting.",
      },
      { role: "user", content: "MEMORIES (" + NB.totalItems() + " items):\n" + brainContext() + "\n\nQUESTION: " + q },
    ];
  }

  /* ---------- low-level fetch with timeout ---------- */
  function postOnce(url, headers, body, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          return { ok: res.ok, status: res.status, data: data, text: txt };
        });
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        var err = new Error("network");
        err.network = true;
        throw err;
      });
  }

  function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function upstreamMsg(r, fb) {
    if (r && r.data && r.data.error) {
      if (r.data.error.message) return String(r.data.error.message);
      if (typeof r.data.error === "string") return r.data.error;
    }
    return fb || "HTTP " + (r ? r.status : "?");
  }

  function noKeyError() {
    return new Error("No OpenRouter key yet — get a FREE one at openrouter.ai/keys, then paste it in Settings → AI Connection (or terminal: key sk-or-…).");
  }

  /* ---------- OpenRouter transport (browser-direct, CORS-allowed) ---------- */
  function postAI(messages, maxTokens) {
    var userKey = NB.getAIKey();
    if (!userKey) return Promise.reject(noKeyError());

    var models = [NB.getAIModel()].concat(MODELS);
    var idx = 0, transientTries = 0;

    function attempt() {
      var model = models[idx];
      var body = {
        model: model,
        messages: messages,
        max_tokens: Math.max(64, Math.min(2048, maxTokens || 900)),
        temperature: 0.6,
      };
      var headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + userKey,
        "X-Title": "NeuroBot",
      };
      return postOnce(OPENROUTER_URL, headers, body, 45000).then(function (r) {
        if (r.ok && r.data && r.data.choices) { lastModel = model; lastBlocked = ""; return r; }
        if (r.status === 401 || r.status === 403) {
          throw new Error("OpenRouter rejected the key (" + r.status + ") — check it in Settings → AI Connection.");
        }
        /* model retired OR free-tier rate limit/quota → walk to the next free model */
        if ((r.status === 410 || r.status === 404 || r.status === 429 || r.status === 402) && idx < models.length - 1) {
          idx++;
          return sleep(r.status === 429 ? 800 : 0).then(attempt);
        }
        if ((r.status === 429 || r.status >= 500 || r.ok) && transientTries < 2) {
          transientTries++;
          return sleep(r.status === 429 ? 1500 : 900).then(attempt);
        }
        throw new Error(upstreamMsg(r, "AI service error (HTTP " + r.status + ")"));
      });
    }

    return attempt().catch(function (err) {
      if (err && err.network) {
        lastBlocked = "network/CORS";
        throw new Error("Network error reaching the AI — check your connection and try again.");
      }
      var m = err && err.message ? err.message : String(err);
      lastError = m;
      if (err instanceof Error) { err.message = m; throw err; }
      throw new Error(m);
    });
  }

  /* ---------- answer extraction ---------- */
  function stripMarkdown(s) {
    return s
      .replace(/<think>[\s\S]*?<\/think>/gi, "")  /* reasoning blocks */
      .replace(/<\/?think>/gi, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")           /* **bold** */
      .replace(/\*([^*]+)\*/g, "$1")               /* *italic* */
      .replace(/`([^`]+)`/g, "$1")                 /* `code` */
      .replace(/^#{1,6}\s+/gm, "")                 /* headings */
      .replace(/^\s*[-*]\s+/gm, "· ");             /* list bullets → · */
  }

  function extractAnswer(data) {
    var c = data && data.choices && data.choices[0] && (data.choices[0].message || data.choices[0]);
    if (!c) return "";
    var text = String(c.content || c.text || "").trim();
    if (!text && (c.reasoning || c.reasoning_content)) {
      /* reasoning models: if the visible answer is empty, the tail of the
         reasoning usually carries the final sentence */
      var rc = String(c.reasoning || c.reasoning_content || "").trim();
      text = rc.length > 400 ? rc.slice(-400) : rc;
    }
    return stripMarkdown(text).trim();
  }

  function friendly(err) {
    var m = err && err.message ? err.message : String(err);
    if (m === "network" || /Failed to fetch|NetworkError|network/i.test(m)) {
      return navigator && navigator.onLine === false
        ? "You're offline — reconnect and try again."
        : "Network error — check your connection and try again.";
    }
    if (/aborted|timed out|signal is aborted/i.test(m)) return "The AI took too long to respond — try again.";
    return m;
  }

  /* Diagnostic used by Settings → AI Connection and terminal `aitest`.
     Counts against the session budget like any other ask. */
  NB.testAI = function () {
    if (callCount >= ASK_LIMIT) {
      return Promise.resolve({ ok: false, message: "Demo limit reached (" + ASK_LIMIT + " asks per session). Refresh the page to reset." });
    }
    if (!NB.getAIKey()) {
      return Promise.resolve({ ok: false, message: noKeyError().message });
    }
    callCount++;
    return postAI([{ role: "user", content: "Reply with exactly: OK" }], 64).then(function (r) {
      if (r && r.ok) {
        var t = extractAnswer(r.data);
        lastError = "";
        return { ok: true, message: "AI connection OK (OpenRouter → " + lastModel + ") — model replied: " + (t || "(empty)") };
      }
      var msg = upstreamMsg(r, "HTTP " + (r ? r.status : "?"));
      lastError = msg;
      return { ok: false, message: friendly(new Error(msg)) };
    }).catch(function (err) {
      lastError = err.message;
      return { ok: false, message: friendly(err) };
    });
  };

  NB.askAI = function (question) {
    if (callCount >= ASK_LIMIT) {
      return Promise.reject(new Error("Demo limit reached (" + ASK_LIMIT + " asks per session). Refresh the page to reset."));
    }
    callCount++;
    var msgs = messagesFor(question);
    return postAI(msgs, 900).then(function (r) {
      if (!r || !r.ok) {
        var msg = upstreamMsg(r, "HTTP " + (r ? r.status : "?"));
        lastError = msg;
        throw new Error("AI: " + msg);
      }
      var text = extractAnswer(r.data);
      if (!text) {
        lastError = "Empty response";
        throw new Error("AI returned an empty response — try rephrasing.");
      }
      lastError = "";
      return text;
    }).catch(function (err) {
      if (err && err.message && err.message.indexOf("Demo limit") === 0) throw err;
      throw new Error(friendly(err));
    });
  };

  /* Ask modal UI (shared by palette + ✦ Ask buttons) */
  NB.openAskModal = function (preFill) {
    var modal = NB.openModal({ subtitle: "$ neurobot ask --ai", title: "Ask your brain" });
    modal.body.innerHTML =
      '<div class="ask-modal">' +
        '<p class="muted-sm">The AI answers using your ' + NB.totalItems() + ' memories as context. <span class="muted-xs">Ctrl+Enter to send</span></p>' +
        '<textarea id="ask-q" rows="3" placeholder="e.g. Summarize what I\'ve captured about AI…">' + NB.esc(preFill || "") + "</textarea>" +
        '<div class="form-actions">' +
          '<button class="btn btn-outline btn-sm" data-cancel>Cancel</button>' +
          '<button class="btn btn-primary btn-sm" id="ask-go">✦ Ask</button>' +
        "</div>" +
        '<div id="ask-out" class="ask-out" style="display:none"></div>' +
      "</div>";
    modal.body.querySelector("[data-cancel]").addEventListener("click", modal.close);
    function runAsk() {
      var q = modal.body.querySelector("#ask-q").value.trim();
      if (!q) return;
      var go = modal.body.querySelector("#ask-go");
      go.disabled = true;
      go.textContent = "✦ Thinking…";
      var out = modal.body.querySelector("#ask-out");
      out.style.display = "block";
      out.innerHTML = '<div class="ask-loading">✦ Thinking with ' + NB.totalItems() + " memories…</div>";
      NB.askAI(q).then(function (answer) {
        go.disabled = false;
        go.textContent = "✦ Ask";
        out.innerHTML = '<div class="ask-answer">' + NB.esc(answer) + "</div>";
      }).catch(function (err) {
        go.disabled = false;
        go.textContent = "✦ Ask";
        out.innerHTML = '<div class="ask-error">⚠ ' + NB.esc(err.message || String(err)) + "</div>";
      });
    }
    modal.body.querySelector("#ask-go").addEventListener("click", runAsk);
    modal.body.querySelector("#ask-q").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runAsk(); }
    });
    setTimeout(function () { var t = modal.body.querySelector("#ask-q"); if (t) t.focus(); }, 30);
  };
})();
