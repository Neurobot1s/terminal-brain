/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   AI backend: NVIDIA NIM chat completions.

   Transport strategy (fully automatic, resilient):
     1. same-origin ai.php proxy  (PHP hosts — key stays server-side)
        - cache-busted so the InfinityFree security check never sticks
        - HTML/security-page responses are detected → treated as "no proxy"
     2. direct https://integrate.api.nvidia.com  (GitHub Pages,
        static hosts, file:// — NVIDIA sends NVCF-ALLOW-ORIGIN: *)
        - if the browser blocks it (CORS/network), we remember for the
          session and report it clearly instead of hanging

   Resilience:
     - retries transient upstream failures (NVIDIA occasionally 503s
       on capacity / 429 on rate limits, with backoff)
     - falls back to a secondary model if the primary is retired (410/404)
     - reasoning models' <think>…</think> blocks are stripped
     - markdown formatting stripped (plain-text UI)
     - optional user key override (Settings → AI Connection / terminal `key`)
       stored under a dedicated key; the embedded key is never persisted
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var KEY_STORE = "nb_ai_key";          /* current key store (custom keys only) */
  var LEGACY_KEY_STORE = "nb_gemini_key"; /* pre-rename location — imported once */
  var MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  var FALLBACK_MODELS = ["openai/gpt-oss-20b"];
  var NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
  /* Embedded key so AI works on static hosts (GitHub Pages) and file://
     where ai.php does not exist. ai.php carries the same key server-side. */
  var DEFAULT_KEY = "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";
  var ASK_LIMIT = 100;

  var isFile = location.protocol === "file:";
  var callCount = 0, lastError = "", lastTransport = "", lastModel = "";
  /* session memory of what the environment supports (avoids repeat failures) */
  var env = { proxy: isFile ? "down" : "unknown", direct: isFile ? "ok" : "unknown" };

  /* one-time import of a custom key saved under the old name */
  (function importLegacyKey() {
    try {
      if (!localStorage.getItem(KEY_STORE) && localStorage.getItem(LEGACY_KEY_STORE)) {
        var old = localStorage.getItem(LEGACY_KEY_STORE);
        if (old && old !== DEFAULT_KEY) localStorage.setItem(KEY_STORE, old);
        localStorage.removeItem(LEGACY_KEY_STORE);
      }
    } catch (e) { /* storage unavailable */ }
  })();

  NB.getGeminiKey = function () {
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  };
  NB.setGeminiKey = function (k) {
    k = String(k || "").trim();
    try {
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
    } catch (e) { /* storage unavailable — key applies to this page only */ }
    callCount = 0; lastError = "";
    env.proxy = "unknown"; env.direct = isFile ? "ok" : "unknown";
    return true;
  };
  NB.geminiStatus = function () {
    return { calls: callCount, lastError: lastError, transport: lastTransport, model: lastModel, env: NB.aiEnv() };
  };
  /* host-capability diagnostics for Settings → AI Connection */
  NB.aiEnv = function () {
    return {
      protocol: location.protocol,
      file: isFile,
      proxy: env.proxy,      /* unknown | up | down */
      direct: env.direct,    /* unknown | ok | blocked */
      key: NB.getGeminiKey() ? "custom" : "embedded",
      model: MODEL,
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
  function retryable(status, data) {
    if (status === 429 || status >= 500) return true;
    if (data && data.error && String(data.error.code || "") === "429") return true;
    return false;
  }
  function upstreamMsg(r, fb) {
    if (r.data && r.data.error) {
      if (r.data.error.message) return String(r.data.error.message);
      if (typeof r.data.error === "string") return r.data.error;
    }
    return fb || "HTTP " + r.status;
  }

  /* ---------- direct NVIDIA transport ---------- */
  function postDirect(messages, maxTokens) {
    if (env.direct === "blocked") {
      return Promise.reject(mark(new Error("AI transport blocked on this host (browser blocked the direct NVIDIA call and no ai.php proxy is available). Deploy ai.php on a PHP host to enable AI here."), "env"));
    }
    var userKey = NB.getGeminiKey() || DEFAULT_KEY;
    var idx = 0, transientTries = 0;

    function attempt() {
      var model = [MODEL].concat(FALLBACK_MODELS)[idx];
      var body = {
        model: model,
        messages: messages,
        max_tokens: Math.max(64, Math.min(4096, maxTokens || 900)),
        temperature: 0.6,
        top_p: 0.95,
        stream: false,
      };
      if (model.indexOf("nemotron") !== -1) body.reasoning_budget = 256;
      var headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + userKey,
      };
      return postOnce(NVIDIA_URL, headers, body, 45000).then(function (r) {
        if (r.ok && r.data && r.data.choices) { env.direct = "ok"; lastTransport = "direct"; lastModel = model; return r; }
        if (r.ok && !r.data) {
          /* 2xx but not JSON — treat as unreachable upstream, retryable */
          if (transientTries < 2) { transientTries++; return sleep(900).then(attempt); }
          throw mark(new Error("AI service returned a non-JSON response."), "fatal");
        }
        if (r.status === 410 || r.status === 404) {
          if (idx < FALLBACK_MODELS.length) { idx++; return attempt(); }
          throw mark(new Error("AI model unavailable (" + r.status + ") — try again later."), "fatal");
        }
        if (retryable(r.status, r.data) && transientTries < 2) {
          transientTries++;
          var wait = r.status === 429 ? 1500 : 900;
          if (r.status === 503) env.last503 = true;
          return sleep(wait).then(attempt);
        }
        throw mark(new Error(upstreamMsg(r, "AI service error (HTTP " + r.status + ")")), "fatal");
      });
    }

    return attempt().catch(function (err) {
      if (err && err.network) {
        /* TypeError from fetch: timeout, DNS, or the browser blocked the
           cross-origin call (no ACAO on this origin). Remember for session. */
        env.direct = "blocked";
        lastError = "direct transport blocked (CORS/network)";
        throw mark(new Error("AI transport blocked on this host (browser blocked the direct NVIDIA call and no ai.php proxy is available). Deploy ai.php on a PHP host to enable AI here."), "env");
      }
      if (err && err.kind !== "env") lastError = err.message;
      throw err;
    });
  }

  /* ---------- same-origin ai.php proxy transport ---------- */
  function postProxy(messages, maxTokens) {
    var headers = { "Content-Type": "application/json" };
    var userKey = NB.getGeminiKey();
    if (userKey) headers["X-NB-Key"] = userKey;
    /* cache-bust: shared hosts aggressively cache; a fresh URL also skips
       past any security-check interstitial cached for ai.php */
    var url = "ai.php?cb=" + Date.now();
    var body = { messages: messages, max_tokens: maxTokens || 900, temperature: 0.6 };
    var transientTries = 0;

    function once() {
      return postOnce(url, headers, body, 50000).then(function (r) {
        if (r.status === 404 || r.status === 405) return { proxyDown: true };
        /* HTML / security-check pages: data is null and text starts with '<' */
        if (r.data === null) {
          if (r.text && /^\s*</.test(r.text)) return { proxyDown: true, intercepted: true };
          if (r.ok) return { proxyDown: true, intercepted: true };
        }
        if (r.ok) {
          if (r.data && r.data.choices) { env.proxy = "up"; lastTransport = "proxy"; lastModel = (r.data.model) || MODEL; return r; }
          if (r.data && r.data.ok && r.data.service) return { proxyDown: true, intercepted: true }; /* health JSON — proxy mis-route */
          /* JSON but unexpected shape → keep trying direct */
          return { proxyDown: true, intercepted: true };
        }
        if (retryable(r.status, r.data) && transientTries < 2) {
          transientTries++;
          return sleep(1000).then(once);
        }
        throw mark(new Error(upstreamMsg(r, "AI proxy error (HTTP " + r.status + ")")), "fatal");
      });
    }
    return once().catch(function (err) {
      if (err && err.proxyDown) return err;
      if (err && err.network) return { proxyDown: true, intercepted: true }; /* proxy unreachable → direct */
      throw err;
    });
  }

  /* proxy first (when it can exist), then direct NVIDIA */
  function postAI(messages, maxTokens) {
    if (isFile || env.proxy === "down") return postDirect(messages, maxTokens);
    return postProxy(messages, maxTokens).then(function (r) {
      if (r && r.proxyDown) {
        if (env.proxy !== "up") env.proxy = "down";
        if (r.intercepted) lastError = "ai.php not reachable on this host";
        return postDirect(messages, maxTokens);
      }
      return r;
    });
  }

  function mark(err, kind) { err.kind = kind; return err; }

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
    if (!text && c.reasoning_content) {
      /* reasoning models: if the visible answer is empty, the tail of the
         reasoning usually carries the final sentence */
      var rc = String(c.reasoning_content).trim();
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
    if (err && err.kind === "env") return m;
    if (env.last503 && /503|busy|capacity/i.test(m)) return "AI service is busy right now (NVIDIA capacity) — try again in a moment.";
    return m;
  }

  /* Diagnostic used by Settings → AI Connection and terminal `aitest`. */
  NB.testGemini = function () {
    env.last503 = false;
    return postAI([{ role: "user", content: "Reply with exactly: OK" }], 256).then(function (r) {
      if (r && r.ok) {
        var t = extractAnswer(r.data);
        lastError = "";
        var via = lastTransport === "direct" ? "direct connection" : "server proxy";
        return { ok: true, message: "AI connection OK via " + via + " — model replied: " + (t || "(empty)") };
      }
      var msg = upstreamMsg(r || {}, "HTTP " + (r ? r.status : "?"));
      lastError = msg;
      return { ok: false, message: friendly(mark(new Error(msg), "fatal")) };
    }).catch(function (err) {
      lastError = err.message;
      return { ok: false, message: friendly(err) };
    });
  };

  NB.askGemini = function (question) {
    if (callCount >= ASK_LIMIT) {
      return Promise.reject(new Error("Demo limit reached (" + ASK_LIMIT + " asks per session). Refresh the page to reset."));
    }
    callCount++;
    env.last503 = false;
    var msgs = messagesFor(question);
    return postAI(msgs, 900).then(function (r) {
      if (!r || !r.ok) {
        var msg = upstreamMsg(r || {}, "HTTP " + (r ? r.status : "?"));
        lastError = msg;
        throw mark(new Error("AI: " + msg), "fatal");
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

  /* Ask modal UI (unchanged surface, shared by dashboard + palette) */
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
      NB.askGemini(q).then(function (answer) {
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
