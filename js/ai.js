/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   AI backend: same-origin ai.php proxy → NVIDIA NIM (nemotron).
   - On http(s): calls ai.php (key stays server-side, no CORS).
   - On file:// (PHP unavailable): calls NVIDIA directly; note the
     browser may block that — use the hosted site for full AI.
   - Optional key override (localStorage) is forwarded to the proxy
     via X-NB-Key for `key <key>` / Settings → AI Connection.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var KEY_STORE = "nb_gemini_key"; /* kept for backward compat with settings/terminal */
  var MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  var isFile = location.protocol === "file:";
  var callCount = 0, lastError = "";

  NB.getGeminiKey = function () {
    try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; }
  };
  NB.setGeminiKey = function (k) {
    k = String(k || "").trim();
    try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {}
    callCount = 0; lastError = "";
    return true;
  };
  NB.geminiStatus = function () { return { calls: callCount, lastError: lastError }; };

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

  function postAI(messages, maxTokens) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : null;
    var url = isFile ? "https://integrate.api.nvidia.com/v1/chat/completions" : "ai.php";
    var headers = { "Content-Type": "application/json" };
    var userKey = NB.getGeminiKey();
    if (!isFile && userKey) headers["X-NB-Key"] = userKey;
    if (isFile) headers["Authorization"] = "Bearer " + (userKey || "MISSING");
    var body = isFile
      ? { model: MODEL, messages: messages, max_tokens: maxTokens || 900, temperature: 0.6, top_p: 0.95, stream: false }
      : { messages: messages, max_tokens: maxTokens || 900, temperature: 0.6 };
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res.json().then(
          function (data) { return { ok: res.ok, status: res.status, data: data }; },
          function () { return { ok: res.ok, status: res.status, data: null }; }
        );
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        var err = new Error(
          isFile
            ? "Network/CORS blocked — AI needs the hosted site (PHP) to work. Open neurobot.kesug.com."
            : "Network error — could not reach ai.php. Check your connection."
        );
        err.network = true;
        throw err;
      });
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
    return text.trim();
  }

  function apiError(data) {
    return (data && data.error && data.error.message) ? String(data.error.message) : "";
  }

  /* Diagnostic used by Settings → AI Connection and terminal `aitest`. */
  function hostChallenge(r) {
    /* InfinityFree sometimes intercepts the first request with a JS cookie
       check — the response is then HTML, not JSON. Tell the user exactly that. */
    return !r.data && r.ok
      ? "Server replied with a non-JSON page (host security check). Reload the page once, then try again."
      : null;
  }

  NB.testGemini = function () {
    return postAI([{ role: "user", content: "Reply with exactly: OK" }], 256).then(function (r) {
      if (r.ok) {
        var t = extractAnswer(r.data);
        if (!t && r.data === null) {
          var hc = hostChallenge(r);
          lastError = hc;
          return { ok: false, message: hc };
        }
        lastError = "";
        return { ok: true, message: "AI connection OK — model replied: " + (t || "(empty)") };
      }
      var msg = apiError(r.data) || "HTTP " + r.status;
      lastError = msg;
      return { ok: false, message: msg };
    }).catch(function (err) {
      lastError = err.message;
      return { ok: false, message: err.message };
    });
  };

  NB.askGemini = function (question) {
    if (callCount >= 100) return Promise.reject(new Error("Demo limit reached (100 asks per session). Refresh the page to reset."));
    callCount++;
    return postAI(messagesFor(question), 900).then(function (r) {
      if (!r.ok) {
        var msg = apiError(r.data) || "HTTP " + r.status;
        lastError = msg;
        throw new Error("AI: " + msg);
      }
      if (r.data === null) {
        var hc = hostChallenge(r);
        lastError = hc || "Non-JSON server response";
        throw new Error(hc || "AI: server returned an unreadable response.");
      }
      var text = extractAnswer(r.data);
      if (!text) {
        lastError = "Empty response";
        throw new Error("AI returned an empty response — try rephrasing.");
      }
      lastError = "";
      return text;
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
        out.innerHTML = '<div class="ask-error">⚠ ' + NB.esc(err.message || "Request failed") + "</div>";
      });
    }
    modal.body.querySelector("#ask-go").addEventListener("click", runAsk);
    modal.body.querySelector("#ask-q").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runAsk(); }
    });
    setTimeout(function () { var t = modal.body.querySelector("#ask-q"); if (t) t.focus(); }, 30);
  };
})();
