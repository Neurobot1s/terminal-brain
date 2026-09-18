/* ============================================================
   NeuroBot — agent-browse.js
   "agentBrowse" — a watchable web-browsing agent, in-site.
   The agent fetches REAL web pages (Wikipedia REST + direct URLs),
   reasons with the local NVIDIA model, follows links, extracts
   answers — and streams every step to a browser panel the user
   watches in real time. Triggered by a button in the AI chat.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var wikiApi = "https://en.wikipedia.org/w/api.php?origin=*&format=json&";
  var wikiRest = "https://en.wikipedia.org/api/rest_v1/page/summary/";

  function esc(s) { return NB.esc(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- real network readers ---------- */

  /* Wikipedia search (CORS-open, no key) */
  function wikiSearch(q) {
    var url = wikiApi + "action=query&list=search&srlimit=5&srsearch=" + encodeURIComponent(q);
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var hits = (j.query && j.query.search) || [];
      return hits.map(function (h) { return { title: h.title, snippet: String(h.snippet || "").replace(/<[^>]*>/g, "") }; });
    });
  }

  /* Wikipedia article: summary + outgoing links + lead sections */
  function wikiPage(title) {
    var sum = wikiRest + encodeURIComponent(title);
    var links = wikiApi + "action=query&prop=links&pllimit=25&plnamespace=0&titles=" + encodeURIComponent(title);
    var text = wikiApi + "action=query&prop=extracts&explaintext=1&exchars=1200&titles=" + encodeURIComponent(title);
    return Promise.all([
      fetch(sum).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(links).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(text).then(function (r) { return r.json(); }).catch(function () { return null; }),
    ]).then(function (out) {
      var summary = out[0] && out[0].extract || "";
      var pages = out[1] && out[1].query && out[1].query.pages;
      var linkList = [];
      if (pages) {
        var first = Object.keys(pages)[0];
        ((pages[first] && pages[first].links) || []).forEach(function (l) { linkList.push(l.title); });
      }
      var longText = "";
      if (out[2] && out[2].query && out[2].query.pages) {
        var p2 = Object.keys(out[2].query.pages)[0];
        longText = (out[2].query.pages[p2] && out[2].query.pages[p2].extract) || "";
      }
      if (!summary && longText) summary = longText.slice(0, 500);
      return { title: title, summary: summary, text: (longText || summary).slice(0, 1500), links: linkList };
    });
  }

  /* Generic page reader via r.jina.ai (CORS-open text proxy) */
  function readAnyPage(url) {
    if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("bad url"));
    return fetch("https://r.jina.ai/" + url, { headers: { "Accept": "text/plain" } })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
      .then(function (t) { return String(t || "").replace(/\s+\n/g, "\n").trim().slice(0, 1500); });
  }

  /* Ask the model to read a page and decide the next step. */
  function think(systemPrompt, userPayload, maxTokens) {
    if (!NB.rawAI) return Promise.reject(new Error("AI unavailable"));
    return NB.rawAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPayload },
    ], maxTokens || 300).then(function (t) { return String(t || "").trim(); });
  }

  /* ---------- state + UI ---------- */
  var running = false;

  function panelHTML() {
    return '<div class="ab-wrap">' +
      '<div class="ab-head"><span class="ab-dot"></span>' +
        '<span class="ab-title">agentBrowse</span>' +
        '<span class="ab-status" id="ab-status">idle</span>' +
        '<button class="btn btn-outline btn-sm" id="ab-close">Close</button>' +
      "</div>" +
      '<div class="ab-viewport" id="ab-viewport"></div>' +
      '<div class="ab-log" id="ab-log"></div>' +
      '<div class="ab-foot" id="ab-foot"></div>' +
      "</div>";
  }

  function openPanel() {
    var old = document.querySelector("#ab-panel");
    if (old) old.remove();
    var root = document.querySelector("#modal-root");
    var wrap = document.createElement("div");
    wrap.id = "ab-panel";
    wrap.innerHTML = panelHTML();
    (root || document.body).appendChild(wrap);
    wrap.querySelector("#ab-close").addEventListener("click", function () { wrap.remove(); });
    return {
      el: wrap,
      viewport: wrap.querySelector("#ab-viewport"),
      log: wrap.querySelector("#ab-log"),
      status: wrap.querySelector("#ab-status"),
      foot: wrap.querySelector("#ab-foot"),
    };
  }

  /* Render a fake "browser screen" for one step. */
  function showPage(p, opts) {
    opts = opts || {};
    var v = document.querySelector("#ab-viewport");
    if (!v) return;
    var url = opts.url || ("https://en.wikipedia.org/wiki/" + encodeURIComponent(String(p.title || "").replace(/ /g, "_")));
    var body = String(p.body != null ? p.body : p.summary || "").slice(0, 600);
    v.innerHTML =
      '<div class="ab-chrome"><span class="ab-chrome-btn"></span><span class="ab-chrome-btn"></span><span class="ab-chrome-btn"></span>' +
      '<span class="ab-url">' + esc(url) + "</span></div>" +
      '<div class="ab-page"><h3>' + esc(p.title || "page") + "</h3>" +
      '<p class="ab-text">' + esc(body) + (body.length >= 600 ? "…" : "") + "</p>" +
      (p.links && p.links.length
        ? '<div class="ab-links">' + p.links.slice(0, 8).map(function (l) {
            return '<span class="ab-link" data-title="' + esc(l) + '">' + esc(l) + "</span>";
          }).join("") + "</div>"
        : "") +
      "</div>";
  }

  function log(msg, tone) {
    var l = document.querySelector("#ab-log");
    if (!l) return;
    var d = document.createElement("div");
    d.className = "ab-step " + (tone || "");
    d.innerHTML = '<span class="ab-ico">' + (tone === "act" ? "⚡" : tone === "ok" ? "✓" : tone === "err" ? "✗" : "·") + "</span>" + esc(msg);
    l.appendChild(d);
    l.scrollTop = l.scrollHeight;
  }

  function status(t) { var s = document.querySelector("#ab-status"); if (s) s.textContent = t; }
  function foot(t) { var f = document.querySelector("#ab-foot"); if (f) f.textContent = t; }

  /* ---------- the agent loop ---------- */
  var MAX_STEPS = 7;

  function run(query, panel) {
    var visited = [], lastAnswer = "", linksSeen = [];
    function step(n) {
      if (n > MAX_STEPS || !document.querySelector("#ab-panel")) return Promise.resolve();
      status("step " + n + "/" + MAX_STEPS);
      foot("thinking with your local NVIDIA model…");
      return think(
        "You are agentBrowse, an autonomous web-research agent inside NeuroBot. " +
        "ALWAYS reply in English. " +
        "You explore the web one step at a time to answer the user's question.\n" +
        "Reply with EXACTLY one line, in one of these formats (choose the single most useful next step):\n" +
        "NEXT SEARCH mount everest height\n" +
        "NEXT OPEN Mount Everest\n" +
        "NEXT READ https://example.com/page\n" +
        "NEXT ANSWER Mount Everest is Earth's highest mountain at 8,849 m.\n" +
        "Start with SEARCH if no pages have been opened yet. Use ANSWER as soon as the steps so far let you answer. No other text.",
        "QUESTION: " + query +
        "\n\nSTEPS SO FAR:\n" + (visited.length ? visited.map(function (v, i) { return (i + 1) + ". " + v; }).join("\n") : "(none yet)") +
        (linksSeen.length ? "\n\nLINKS on the last page: " + linksSeen.slice(0, 15).join(" | ") : "") +
        (lastAnswer ? "\n\nDRAFT ANSWER so far: " + lastAnswer : "") +
        "\n\nWhat is the next step?",
        220
      ).then(function (raw) {
        /* models drop the NEXT prefix ~half the time — accept both */
        var m = raw.match(/^(?:NEXT\s+)?(SEARCH|OPEN|READ|ANSWER)\s*:?\s*([\s\S]+)$/i);
        var action = m[1].toUpperCase(), arg = m[2].trim();
        if (action === "ANSWER") {
          log("ANSWER: " + arg, "ok");
          status("done");
          foot("");
          showPage({ title: "Agent answer", body: arg, summary: arg }, { url: "agent://answer" });
          if (panel) panel.el.classList.add("done");
          return;
        }
        if (action === "SEARCH") {
          log("searching Wikipedia for “" + arg + "”", "act");
          foot("GET en.wikipedia.org · search");
          return wikiSearch(arg).then(function (hits) {
            if (!hits.length) { log("no results — trying a broader step", "err"); visited.push("SEARCH “" + arg + "” → no results"); return step(n + 1); }
            showPage({ title: 'Search: "' + arg + '"', body: hits.map(function (h, i) { return (i + 1) + ". " + h.title + " — " + h.snippet.slice(0, 90); }).join("\n"), summary: hits[0].snippet }, { url: "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(arg) });
            visited.push('SEARCH “' + arg + '” → ' + hits.length + " hits, top: " + hits[0].title);
            log("found " + hits.length + " pages — opening “" + hits[0].title + "”", "ok");
            foot("GET en.wikipedia.org · " + hits[0].title);
            return sleep(900).then(function () { return wikiPage(hits[0].title); }).then(function (p) {
              showPage(p);
              linksSeen = p.links || [];
              visited.push("OPEN “" + p.title + "” → " + (p.summary || "").slice(0, 120));
              return sleep(900).then(function () { return step(n + 1); });
            });
          });
        }
        if (action === "OPEN") {
          log("opening article “" + arg + "”", "act");
          foot("GET en.wikipedia.org · " + arg);
          return wikiPage(arg).then(function (p) {
            showPage(p);
            linksSeen = p.links || [];
            visited.push("OPEN “" + arg + "” → " + (p.summary || "").slice(0, 120));
            return sleep(900).then(function () { return step(n + 1); });
          }).catch(function () { log("could not open that page", "err"); return step(n + 1); });
        }
        if (action === "READ") {
          log("reading " + arg, "act");
          foot("GET " + arg);
          return readAnyPage(arg).then(function (t) {
            showPage({ title: arg.replace(/^https?:\/\//, "").slice(0, 60), body: t, summary: t.slice(0, 200) }, { url: arg });
            visited.push("READ " + arg + " → " + t.slice(0, 120));
            return sleep(900).then(function () { return step(n + 1); });
          }).catch(function (e) { log("read failed (" + (e.message || "error") + ")", "err"); return step(n + 1); });
        }
      }).catch(function (e) {
        log("agent error: " + (e.message || "unknown"), "err");
        status("error");
      });
    }
    log("goal: " + query, "");
    return step(1);
  }

  /* ---------- public surface ---------- */

  /* Watchable run: opens the panel, streams steps. */
  NB.agentBrowse = function (query) {
    var q = String(query || "").trim();
    if (!q) { NB.toast("Give the agent something to research.", "warn"); return; }
    if (running) { NB.toast("agentBrowse is already running.", "warn"); return; }
    running = true;
    var panel = openPanel();
    log("agent online — watching it work in real time", "");
    status("starting");
    run(q, panel).then(function () {
      running = false;
      if (document.querySelector("#ab-panel")) status(document.querySelector("#ab-status").textContent === "error" ? "error" : "done");
    });
  };

  /* Quiet variant for the ask flow: no panel, returns the final answer text
     by driving the same loop and capturing the ANSWER step. */
  NB.agentBrowseQuiet = function (query) {
    var q = String(query || "").trim();
    if (!q) return Promise.reject(new Error("empty query"));
    var captured = null;
    var origShow = showPage; /* keep UI untouched; reuse the loop with a hook */
    var steps = [];
    function quietStep(n) {
      if (n > MAX_STEPS) return Promise.resolve(captured || "I couldn't complete the research in time.");
      return think(
        "You are agentBrowse, an autonomous web-research agent. ALWAYS reply in English. " +
        "Reply with EXACTLY one line, in one of these formats:\n" +
        "NEXT SEARCH mount everest height\n" +
        "NEXT OPEN Mount Everest\n" +
        "NEXT READ https://example.com/page\n" +
        "NEXT ANSWER Mount Everest is Earth's highest mountain at 8,849 m.\n" +
        "Start with SEARCH if no steps yet. Use ANSWER as soon as you can. No other text.",
        "QUESTION: " + q + "\n\nSTEPS SO FAR:\n" + (steps.join("\n") || "(none)") +
        (linksQ.length ? "\n\nLINKS: " + linksQ.slice(0, 15).join(" | ") : ""),
        220
      ).then(function (raw) {
        var m = String(raw || "").match(/^(?:NEXT\s+)?(SEARCH|OPEN|READ|ANSWER)\s*:?\s*([\s\S]+)$/i);
        var a = m[1].toUpperCase(), arg = m[2].trim();
        if (a === "ANSWER") { captured = arg; return captured; }
        if (a === "SEARCH") {
          return wikiSearch(arg).then(function (hits) {
            steps.push("SEARCH “" + arg + "” → " + (hits.length ? hits[0].title : "no results"));
            if (!hits.length) return quietStep(n + 1);
            return wikiPage(hits[0].title).then(function (p) { linksQ = p.links || []; steps.push("OPEN “" + p.title + "”"); return quietStep(n + 1); });
          });
        }
        if (a === "OPEN") {
          return wikiPage(arg).then(function (p) { linksQ = p.links || []; steps.push("OPEN “" + arg + "”"); return quietStep(n + 1); })
            .catch(function () { steps.push("OPEN failed"); return quietStep(n + 1); });
        }
        return readAnyPage(arg).then(function (t) { steps.push("READ " + arg); return quietStep(n + 1); })
          .catch(function () { steps.push("READ failed"); return quietStep(n + 1); });
      });
    }
    var linksQ = [];
    return quietStep(1);
  };

  /* ---------- chat trigger ---------- */
  /* A “Browse” button next to Send in the dashboard ask box. */
  function wireChatButton() {
    var box = document.querySelector(".ask-box");
    if (!box || box.querySelector("#ab-trigger")) return;
    var btn = document.createElement("button");
    btn.id = "ab-trigger";
    btn.className = "ask-mic ab-trigger";
    btn.title = "agentBrowse — watch the agent research the web";
    btn.setAttribute("aria-label", "agentBrowse");
    btn.textContent = "🌐";
    var send = box.querySelector("#ask-send");
    if (send && send.parentNode) send.parentNode.insertBefore(btn, send);
    else box.appendChild(btn);
    btn.addEventListener("click", function () {
      var input = document.querySelector("#ask-input");
      var q = input && input.value.trim();
      if (!q) { NB.toast("Type a research question first.", "warn"); if (input) input.focus(); return; }
      NB.agentBrowse(q);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireChatButton);
  } else {
    wireChatButton();
  }
  /* the dashboard re-renders on hashchange — re-wire after each render */
  window.addEventListener("hashchange", function () { setTimeout(wireChatButton, 60); });
})();
