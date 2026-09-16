/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   AI backend: NVIDIA NIM chat completions.

   Transport strategy (fully automatic, tested):
     1. same-origin ai.php proxy  (PHP hosts — key stays server-side)
     2. direct https://integrate.api.nvidia.com  (GitHub Pages,
        static hosts, file:// — CORS is allowed by NVIDIA)

   Resilience:
     - up to 3 attempts per endpoint (NVIDIA occasionally returns a
       transient 503 "capacity" error — a retry fixes it)
     - if the primary model is unavailable (410/404), falls back to
       openai/gpt-oss-20b on the same key
     - reasoning models sometimes emit <think>…</think> blocks — stripped
     - markdown formatting stripped (plain-text UI)
     - optional user key override (Settings → AI / terminal `key`)
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var KEY_STORE = "nb_gemini_key"; /* kept for backward compat with settings/terminal */
  var MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  var FALLBACK_MODELS = ["openai/gpt-oss-20b"];
  var NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
  /* Embedded key so AI works on static hosts (GitHub Pages) and file://
     where ai.php does not exist. The proxy ai.php carries the same key. */
  var DEFAULT_KEY = "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";

  var isFile = location.protocol === "file:";
  var callCount = 0, lastError = "", lastTransport = "", lastModel = "";

  NB.getGeminiKey = function () {
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  };
  NB.setGeminiKey = function (k) {
    k = String(k || "").trim();
    try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {}
    callCount = 0; lastError = "";
    return true;
  };
  NB.geminiStatus = function () {
    return { calls: callCount, lastError: lastError, transport: lastTransport, model: lastModel };
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

  /* ---------- low-level fetch with timeout + retries ---------- */
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

  /* POST to NVIDIA directly (browser CORS is allowed). Retries transient
     failures; walks to the fallback model if the primary is gone (410/404). */
  function postDirect(messages, maxTokens) {
    var userKey = NB.getGeminiKey() || DEFAULT_KEY;
    var models = [MODEL].concat(FALLBACK_MODELS);
    var idx = 0;

    function attempt() {
      var model = models[idx];
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
        if (r.ok) { lastTransport = "direct"; lastModel = model; return r; }
        if (r.status === 410 || r.status === 404) {
          /* model gone — try the next one, no retry on same model */
          if (idx < models.length - 1) { idx++; return attempt(); }
          var gone = new Error("AI model unavailable (" + r.status + ") — try again later.");
          lastError = gone.message;
          throw gone;
        }
        if (retryable(r.status, r.data)) throw { transient: true };
        var msg = (r.data && r.data.error && r.data.error.message) ? r.data.error.message : "HTTP " + r.status;
        lastError = msg;
        var e = new Error("AI: " + msg);
        throw e;
      }).catch(function (err) {
        if (err && err.transient && idx === models.length - 1) throw err;
        if (err && err.network) throw err;
        throw err;
      });
    }

    function withRetry(n) {
      return attempt().catch(function (err) {
        if (n > 0 && err && (err.transient || err.network)) {
          return sleep(err.network ? 500 : 900).then(function () { return withRetry(n - 1); });
        }
        throw err;
      });
    }
    return withRetry(2).catch(function (err) {
      if (err && err.network) {
        lastError = "Network error reaching NVIDIA";
        var e = new Error("Network error — could not reach the AI service. Check your connection.");
        throw e;
      }
      throw err;
    });
  }

  /* POST through same-origin ai.php. Resolves with {proxyDown:true} when the
     proxy is missing/broken (static hosts), so the caller can fall through. */
  function postProxy(messages, maxTokens) {
    var headers = { "Content-Type": "application/json" };
    var userKey = NB.getGeminiKey();
    if (userKey) headers["X-NB-Key"] = userKey;
    var body = { messages: messages, max_tokens: maxTokens || 900, temperature: 0.6 };

    function once() {
      return postOnce("ai.php", headers, body, 50000).then(function (r) {
        if (r.status === 404 || r.status === 405) return { proxyDown: true };
        /* InfinityFree/PHP hosts sometimes answer with an HTML security or
           error page — detect non-JSON and treat the proxy as down. */
        if (r.data === null) {
          if (r.text && /^\s*</.test(r.text)) return { proxyDown: true };
          if (r.ok) return { proxyDown: true };
        }
        if (r.ok) { lastTransport = "proxy"; return r; }
        if (retryable(r.status, r.data)) throw { transient: true };
        var msg = (r.data && r.data.error && r.data.error.message) ? r.data.error.message : "HTTP " + r.status;
        lastError = msg;
        throw new Error("AI: " + msg);
      });
    }
    function withRetry(n) {
      return once().catch(function (err) {
        if (err && err.proxyDown) return err;
        if (n > 0 && err && (err.transient || err.network)) {
          return sleep(900).then(function () { return withRetry(n - 1); });
        }
        throw err;
      });
    }
    return withRetry(2);
  }

  /* Try the proxy (when it can exist), then fall back to direct NVIDIA. */
  function postAI(messages, maxTokens) {
    if (isFile) return postDirect(messages, maxTokens);
    return postProxy(messages, maxTokens).then(function (r) {
      if (r && r.proxyDown) return postDirect(messages, maxTokens);
      return r;
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
    var c = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!c) return "";
    var text = String(c.content || "").trim();
    if (!text && c.reasoning_content) {
      /* fallback: some reasoning models put the answer at the end of reasoning */
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
    return m;
  }

  /* Diagnostic used by Settings → AI Connection and terminal `aitest`. */
  NB.testGemini = function () {
    return postAI([{ role: "user", content: "Reply with exactly: OK" }], 256).then(function (r) {
      if (r.ok) {
        var t = extractAnswer(r.data);
        lastError = "";
        var via = lastTransport === "direct" ? "direct connection" : "server proxy";
        return { ok: true, message: "AI connection OK via " + via + " — model replied: " + (t || "(empty)") };
      }
      var msg = (r.data && r.data.error && r.data.error.message) ? r.data.error.message : "HTTP " + r.status;
      lastError = msg;
      return { ok: false, message: msg };
    }).catch(function (err) {
      lastError = err.message;
      return { ok: false, message: friendly(err) };
    });
  };

  NB.askGemini = function (question) {
    if (callCount >= 100) return Promise.reject(new Error("Demo limit reached (100 asks per session). Refresh the page to reset."));
    callCount++;
    var msgs = messagesFor(question);
    return postAI(msgs, 900).then(function (r) {
      if (!r.ok) {
        var msg = (r.data && r.data.error && r.data.error.message) ? r.data.error.message : "HTTP " + r.status;
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
      throw new Error(friendly(err));
    });
  };

  /* Keep the public name for existing callers; ask modal UI unchanged. */
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
