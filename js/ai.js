/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   Gemini integration, hardcoded key (school project).
   Model: gemini-2.0-flash (free tier) with fallbacks.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var GEMINI_KEY = "AQ.Ab8RN6JvNBW1MK9_Hv41sCU7IjDuDr3MGnrWIVRGEDAACSSiQQ";
  var MODELS = ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];

  function brainContext() {
    var s = NB.getStore(), lines = [];
    s.knowledge.forEach(function (k) { lines.push("- [knowledge/" + k.topic + "] " + k.title + ": " + k.body + " (source: " + k.source + ")"); });
    s.notes.forEach(function (n) { lines.push("- [note/" + n.category + "] " + n.title + ": " + n.body); });
    s.ideas.forEach(function (i) { lines.push("- [idea/" + i.category + ", status " + i.status + "] " + i.title + ": " + i.body); });
    s.goals.forEach(function (g) { lines.push("- [goal, " + g.progress + "%, " + g.status + "] " + g.title + ": " + g.body + " (deadline " + g.deadline + ")"); });
    return lines.join("\n");
  }

  function buildPrompt(q) {
    return [
      "You are NeuroBot, a personal second-brain assistant.",
      "Answer the user's question using ONLY the memories below.",
      "If the memories do not contain the answer, say so briefly and offer what is closest.",
      "Be concise (max ~120 words). Plain text only.",
      "",
      "MEMORIES (" + NB.totalItems() + " items):",
      brainContext(),
      "",
      "QUESTION: " + q,
    ].join("\n");
  }

  var callCount = 0;

  NB.askGemini = function (question) {
    if (callCount >= 100) return Promise.reject(new Error("Demo limit reached (100 asks per session)."));
    callCount++;
    var body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(question) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
    });
    var idx = 0;
    function attempt() {
      if (idx >= MODELS.length) return Promise.reject(new Error("Gemini request failed — check your connection."));
      var model = MODELS[idx++];
      return fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(GEMINI_KEY),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: body }
      ).then(function (res) {
        if (!res.ok) return attempt();
        return res.json().then(function (data) {
          var parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
          var text = parts.map(function (p) { return p.text || ""; }).join("").trim();
          if (!text) return attempt();
          return text;
        });
      }).catch(function () { return attempt(); });
    }
    return attempt();
  };

  NB.openAskModal = function (preFill) {
    var modal = NB.openModal({ subtitle: "$ neurobot ask --gemini", title: "Ask your brain" });
    modal.body.innerHTML =
      '<div class="ask-modal">' +
        '<p class="muted-sm">Gemini answers using your ' + NB.totalItems() + ' memories as context.</p>' +
        '<textarea id="ask-q" rows="3" placeholder="e.g. Summarize what I\'ve captured about AI…">' + NB.esc(preFill || "") + "</textarea>" +
        '<div class="form-actions">' +
          '<button class="btn btn-outline btn-sm" data-cancel>Cancel</button>' +
          '<button class="btn btn-primary btn-sm" id="ask-go">✦ Ask Gemini</button>' +
        "</div>" +
        '<div id="ask-out" class="ask-out" style="display:none"></div>' +
      "</div>";
    modal.body.querySelector("[data-cancel]").addEventListener("click", modal.close);
    modal.body.querySelector("#ask-go").addEventListener("click", function () {
      var q = modal.body.querySelector("#ask-q").value.trim();
      if (!q) return;
      var out = modal.body.querySelector("#ask-out");
      out.style.display = "block";
      out.innerHTML = '<div class="ask-loading">✦ Thinking with ' + NB.totalItems() + " memories…</div>";
      NB.askGemini(q).then(function (answer) {
        out.innerHTML = '<div class="ask-answer">' + NB.esc(answer) + "</div>";
      }).catch(function (err) {
        out.innerHTML = '<div class="ask-error">⚠ ' + NB.esc(err.message || "Request failed") + "</div>";
      });
    });
    setTimeout(function () { var t = modal.body.querySelector("#ask-q"); if (t) t.focus(); }, 30);
  };
})();
