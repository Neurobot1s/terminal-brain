/* ============================================================
   NeuroBot — agent-browse.js
   "agentBrowse" — a watchable web-browsing agent, in-site.
   Mode 1 (Kernel): the agent drives a REAL cloud Chromium
   (kernel.sh) — real pages, real tabs — while you watch the
   live view embedded in the panel. Fresh tab per run, tab
   closed when the run ends.
   Mode 2 (classic): CORS-open fetch readers (Wikipedia +
   r.jina.ai), rendered as a reader panel — works with zero
   infrastructure, kept as automatic fallback.
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
    /* Kernel mode embeds the REAL live view of the cloud browser.
       A fresh session is created per run — the iframe is injected the
       moment the browser exists (see setLive). */
    var kernelOn = NB.kernelMode && NB.kernelMode() !== "off";
    var live = kernelOn && NB.kernelLiveUrl ? NB.kernelLiveUrl() : "";
    return '<div class="ab-wrap kernel">' +
      '<div class="ab-head"><span class="ab-dot"></span>' +
        '<span class="ab-title">agentBrowse</span>' +
        '<span class="ab-mode" id="ab-mode">' + (kernelOn ? "☁ kernel" : "reader") + "</span>" +
        '<span class="ab-status" id="ab-status">idle</span>' +
        '<button class="btn btn-outline btn-sm" id="ab-close">Close</button>' +
      "</div>" +
      (kernelOn
        ? '<div class="ab-viewwrap" id="ab-viewwrap">' +
            (live ? "" : '<div class="ab-boot" id="ab-boot">spinning up a fresh cloud browser…</div>') +
            '<div class="ab-reconnect" id="ab-reconnect" hidden>' +
              '<div class="ab-reconnect-box">' +
                '<p>The cloud browser went to sleep — it closes itself when idle.</p>' +
                '<button class="btn btn-primary btn-sm" id="ab-reconnect-btn">Reconnect</button>' +
              "</div>" +
            "</div>" +
          "</div>"
        : '<div class="ab-viewwrap" id="ab-viewwrap"></div>') +
      '<div class="ab-log" id="ab-log"></div>' +
      '<div class="ab-foot" id="ab-foot"></div>' +
      "</div>";
  }

  /* Embed the live view of the CURRENT cloud browser (fresh per run). */
  function setLive(url) {
    url = String(url || "");
    if (!url) return;
    var vw = document.querySelector("#ab-viewwrap");
    if (!vw) return;
    var frame = vw.querySelector("#ab-live");
    if (!frame) {
      var boot = vw.querySelector("#ab-boot");
      if (boot) boot.remove();
      frame = document.createElement("iframe");
      frame.id = "ab-live";
      frame.className = "ab-live";
      frame.setAttribute("allow", "clipboard-read; clipboard-write");
      frame.allowFullscreen = true;
      vw.insertBefore(frame, vw.querySelector("#ab-reconnect"));
    }
    if (frame.getAttribute("src") !== url) frame.setAttribute("src", url);
  }
  NB.agentBrowseSetLive = setLive; /* reusable by the Live voice pane */

  function openPanel() {
    var old = document.querySelector("#ab-panel");
    if (old) old.remove();
    var root = document.querySelector("#modal-root");
    var wrap = document.createElement("div");
    wrap.id = "ab-panel";
    if (NB.kernelMode && NB.kernelMode() !== "off") wrap.className = "kernel";
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

  /* Render a reader page (classic mode — creates its viewport on demand). */
  function showPage(p, opts) {
    opts = opts || {};
    var v = document.querySelector("#ab-viewport");
    if (!v) {
      var panel = document.querySelector("#ab-panel");
      if (!panel) return;
      v = document.createElement("div");
      v.className = "ab-viewport";
      v.id = "ab-viewport";
      /* insert before the log INSIDE the wrap — #ab-log is a child of
         .ab-wrap, not of #ab-panel (insertBefore requires that) */
      var host = panel.querySelector(".ab-wrap") || panel;
      var ref = host.querySelector("#ab-log");
      if (ref) host.insertBefore(v, ref); else host.appendChild(v);
    }
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
  var MAX_STEPS = 14;

  /* ---------- real-interaction helpers (drive the cloud browser) ----------
     The model works with VISIBLE TEXT ("Sign in", "email"), not raw CSS —
     these resolvers try a CSS selector first, then aria/placeholder/name/id,
     then visible-text matching over buttons/links/fields. */
  function pageContext(d) {
    return d.eval("JSON.stringify((function(){function vis(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}var out=[];try{document.querySelectorAll('input,textarea,select').forEach(function(e){if(!vis(e)||out.length>18)return;out.push({k:'field',t:e.tagName.toLowerCase(),type:e.type||'',ph:e.placeholder||e.getAttribute('aria-label')||e.name||e.id||'',v:String(e.value||'').slice(0,30)});});document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a').forEach(function(e){if(!vis(e)||out.length>40)return;var tx=(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,40);if(tx)out.push({k:/^a$/i.test(e.tagName)?'link':'btn',tx:tx});});}catch(e){}return out;})())")
      .then(function (s) { try { return JSON.parse(s); } catch (e) { return []; } })
      .catch(function () { return []; });
  }
  function resolveAndClick(d, arg) {
    return d.eval("(function(){var arg=" + JSON.stringify(arg) + ";function norm(s){return String(s||'').toLowerCase().replace(/\\s+/g,' ').trim();}var el=null;try{el=document.querySelector(arg);}catch(e){}if(!el){var c=document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a,label');for(var i=0;i<c.length;i++){var e=c[i];var tx=norm(e.innerText||e.value||e.getAttribute('aria-label')||e.title);if(tx&&e.getBoundingClientRect().width>0&&(tx===norm(arg)||tx.indexOf(norm(arg))>-1||(norm(arg).indexOf(tx)>-1&&tx.length>3))){el=e;break;}}}if(!el)return JSON.stringify({ok:false});try{el.scrollIntoView({block:'center'});}catch(e2){}var r=el.getBoundingClientRect();var o={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2};try{el.dispatchEvent(new PointerEvent('pointerdown',o));el.dispatchEvent(new MouseEvent('mousedown',o));el.dispatchEvent(new PointerEvent('pointerup',o));el.dispatchEvent(new MouseEvent('mouseup',o));}catch(e3){}el.click();return JSON.stringify({ok:true,label:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,40)});})()")
      .then(function (s) { try { return JSON.parse(s); } catch (e) { return { ok: false }; } })
      .catch(function () { return { ok: false }; });
  }
  function resolveAndType(d, field, text) {
    return d.eval("(function(){var arg=" + JSON.stringify(field) + ",text=" + JSON.stringify(text) + ";function norm(s){return String(s||'').toLowerCase();}var el=null;try{el=document.querySelector(arg);}catch(e){}if(!el){var c=document.querySelectorAll('input,textarea');for(var i=0;i<c.length;i++){var e=c[i];var t=e.type||'';if(t==='hidden'||t==='submit'||t==='button'||e.getBoundingClientRect().width<=0)continue;var hay=norm([e.placeholder,e.getAttribute('aria-label'),e.name,e.id,t,e.getAttribute('autocomplete')].join(' '));if(hay.indexOf(norm(arg))>-1){el=e;break;}}}if(!el){var types={'email':['email'],'mail':['email'],'password':['password'],'pass':['password'],'username':['text','email'],'user':['text','email'],'search':['search','text'],'phone':['tel'],'code':['text','tel','number']};var want=types[norm(arg)]||['text','email','tel','number'];for(var j=0;j<c.length;j++){var b=c[j];if(b.getBoundingClientRect().width>0&&want.indexOf(b.type||'text')>-1){el=b;break;}}}if(!el)return JSON.stringify({ok:false});try{el.scrollIntoView({block:'center'});}catch(e2){}el.focus();var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;var setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify({ok:true,filled:String(el.placeholder||el.name||el.type||'field').slice(0,30)});})()")
      .then(function (s) { try { return JSON.parse(s); } catch (e) { return { ok: false }; } })
      .catch(function () { return { ok: false }; });
  }
  function settleIf(d) { try { if (d.settle) return d.settle().catch(function () {}); } catch (e) {} return Promise.resolve(); }

  /* when the loop ends without an explicit ANSWER — or the model emits an
     unclear step — compose the best answer from everything gathered so the
     user always gets the retrieved info, never a dead stop. */
  function bestEffortAnswer(query, steps, lastPage) {
    if (!steps.length && !lastPage) return Promise.resolve();
    log("composing the answer from the gathered research", "act");
    var gathered = steps.join("\n").slice(0, 6000) +
      (lastPage ? "\n\nFULL TEXT of the last page [" + (lastPage.title || "untitled") + "]:\n" + String(lastPage.text || "").slice(0, 3000) : "");
    return think(
      "You are agentBrowse. Answer the user's question using ONLY the gathered research below. " +
      "ALWAYS reply in English. 2-6 sentences, concrete facts and numbers, plain text, no markdown. " +
      "If the research is insufficient, say what was found and what is missing.",
      "QUESTION: " + query + "\n\nRESEARCH GATHERED:\n" + gathered,
      700
    ).then(function (ans) {
      var t = String(ans || "").trim();
      if (!t) throw new Error("empty");
      log("ANSWER: " + t.slice(0, 220), "ok");
      status("done");
      foot("");
      return { answer: t };
    }).catch(function () {
      /* model unavailable — surface the raw research so the run still has value */
      var raw = lastPage
        ? (lastPage.title ? lastPage.title + " — " : "") + String(lastPage.text || "").replace(/\s+/g, " ").trim().slice(0, 400)
        : steps.join(" · ").slice(0, 400);
      if (raw) { log("ANSWER (raw research): " + raw, "ok"); status("done"); foot(""); return { answer: raw }; }
    });
  }

  /* ===== Kernel mode: the agent drives a REAL cloud browser =====
     ONE fresh session per run; DELETED the moment the run ends (success,
     error, or stop). Pages are read via rich extraction (content container,
     noise removal, lazy-load sweep) so the agent actually RETRIEVES the
     info instead of a 150-char nav-menu sliver. */
  function runKernel(query, panel) {
    var steps = [], lastPage = null;
    var K = (window.NB && NB.__kernelInternals) || {};
    var extract = K.extractPageText || function (d2, m) { return d2.text("body").then(function (t) { return { title: "", url: "", text: String(t || "").slice(0, m || 3600) }; }); };
    var sweep = K.sweepPage || function () { return Promise.resolve(); };
    function step(n, d) {
      if (n > MAX_STEPS || !document.querySelector("#ab-panel")) return Promise.resolve();
      status("step " + n + "/" + MAX_STEPS);
      foot("thinking with your local NVIDIA model…");
      return pageContext(d).then(function (elems) {
        var elemLines = (elems || []).slice(0, 30).map(function (e) {
          return e.k === "field" ? "  field " + e.t + "[" + e.type + "] “" + e.ph + "”" + (e.v ? " = " + e.v : "")
            : "  " + e.k + " “" + e.tx + "”";
        }).join("\n");
        return think(
          "You are agentBrowse, an autonomous web agent inside NeuroBot that DRIVES a real cloud browser. " +
          "ALWAYS reply in English. " +
          "You can both research AND interact with pages (sign-ups, logins, forms, buttons).\n" +
          "Reply with EXACTLY one line, one of:\n" +
          "NEXT SEARCH mount everest height\n" +
          "NEXT OPEN https://en.wikipedia.org/wiki/Mount_Everest\n" +
          "NEXT READ https://en.wikipedia.org/wiki/Mount_Everest\n" +
          "NEXT CLICK Sign in\n" +
          "NEXT TYPE email :: you@temp-mail.io\n" +
          "NEXT KEY Enter\n" +
          "NEXT ANSWER Mount Everest is Earth's highest mountain at 8,849 m.\n" +
          "SEARCH = web search, OPEN = navigate, READ = extract page text, CLICK = click a button/link by its visible text, " +
          "TYPE = fill a form field (field-name :: text — field-name can be email/password/username/search or the placeholder), " +
          "KEY = press Enter to submit, ANSWER = stop and answer.\n" +
          "For tasks that require DOING something (create an account, sign in, submit a form), you MUST use CLICK/TYPE/KEY — OPEN/READ alone cannot complete them. " +
          "Temporary-email flows: OPEN a temp-mail site, READ the address, TYPE it into the sign-up form, KEY Enter, then OPEN/READ the inbox again for the confirmation code. " +
          "Start with SEARCH or OPEN. Use ANSWER as soon as the steps let you. No other text.",
          "QUESTION: " + query +
          "\n\nCURRENT PAGE ELEMENTS:\n" + (elemLines || "(none detected)") +
          "\n\nSTEPS SO FAR:\n" + (steps.length ? steps.join("\n") : "(none yet)"),
          220
        );
      }).then(function (raw) {
        var m = String(raw || "").match(/^(?:NEXT\s+)?(SEARCH|OPEN|READ|CLICK|TYPE|KEY|ANSWER)\s*:?\s*([\s\S]+)$/i);
        if (!m) { log("model step unclear — answering from what was gathered", "warn"); return bestEffortAnswer(query, steps, lastPage); }
        var action = m[1].toUpperCase(), arg = m[2].trim();
        if (action === "ANSWER") {
          log("ANSWER: " + arg, "ok");
          status("done");
          foot("");
          return { answer: arg };
        }
        if (action === "CLICK") {
          log("clicking “" + arg + "”", "act");
          foot("cloud browser → click");
          return resolveAndClick(d, arg).then(function (r) {
            if (!r || !r.ok) { log("no clickable “" + arg + "” on this page", "err"); return step(n + 1, d); }
            log("clicked" + (r.label ? " “" + r.label + "”" : ""), "ok");
            steps.push("CLICK “" + arg + "” → clicked" + (r.label ? " (“" + r.label + "”)" : ""));
            return settleIf(d).then(function () { return sleep(600); }).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "TYPE") {
          var parts = arg.split(/\s*::\s*/);
          var fld = (parts[0] || "").trim(), val = parts.slice(1).join(" :: ").trim();
          log("typing into “" + fld + "”", "act");
          foot("cloud browser → type");
          return resolveAndType(d, fld, val).then(function (r) {
            if (!r || !r.ok) { log("no field matching “" + fld + "” here", "err"); return step(n + 1, d); }
            log("typed into " + (r.filled || fld), "ok");
            steps.push("TYPE " + fld + " → filled " + (r.filled || fld) + " with " + String(val).slice(0, 60));
            return sleep(400).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "KEY") {
          var key = (arg || "Enter").trim() || "Enter";
          log("pressing " + key, "act");
          foot("cloud browser → key " + key);
          return d.press(key).catch(function () {}).then(function () {
            steps.push("KEY " + key);
            return settleIf(d).then(function () { return sleep(600); }).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "SEARCH") {
          log("searching the web for “" + arg + "”", "act");
          foot("cloud browser → search");
          return d.goto("https://duckduckgo.com/?q=" + encodeURIComponent(arg)).then(function () {
            return sleep(800);
          }).then(function () { return d.text("#links"); }).then(function (t) {
            t = String(t || "").replace(/\s+/g, " ").trim().slice(0, 2400);
            if (!t) throw new Error("empty results");
            steps.push("SEARCH “" + arg + "” → " + t.slice(0, 500));
            return sleep(700).then(function () { return step(n + 1, d); });
          }).catch(function (e) {
            log("search failed (" + (e.message || "error") + ") — trying direct step", "err");
            return sleep(400).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "OPEN" || action === "READ") {
          var url = /^(https?:)?\/\//.test(arg) ? arg : "https://" + arg.replace(/^\/+/, "");
          log((action === "READ" ? "reading " : "opening ") + url, "act");
          foot("cloud browser → " + url.replace(/^https?:\/\//, "").slice(0, 40));
          return d.goto(url).then(function () { return sleep(500); })
            .then(function () { return sweep(d); })
            .then(function () { return extract(d, 3600); })
            .then(function (p) {
              if (!p || !String(p.text || "").trim()) throw new Error("empty page");
              lastPage = p;
              var flat = String(p.text || "").replace(/\s+/g, " ").trim();
              steps.push("READ " + (p.url || url) + " [" + (p.title || "untitled") + "] → " + flat.slice(0, 500));
              showPage({ title: p.title || url, body: flat.slice(0, 600) }, { url: p.url || url });
              return sleep(700).then(function () { return step(n + 1, d); });
            })
            .catch(function (e) {
              log("could not open that page (" + (e.message || "error") + ")", "err");
              return step(n + 1, d);
            });
        }
      }).catch(function (e) {
        log("agent error: " + (e.message || "unknown"), "err");
        status("error");
      });
    }
    log("kernel agent online — a fresh cloud browser is spinning up", "");
    /* the whole loop runs inside ONE run: fresh session now, deleted when done */
    return NB.kernelAgent.run(function (d, klog) {
      return d.goto("about:blank").then(function () { return step(1, d); }).then(function (out) {
        /* loop ended without an explicit ANSWER — still deliver the research */
        if (out && out.answer) return out;
        return bestEffortAnswer(query, steps, lastPage);
      });
    }, function (m, tone) { if (tone !== "ok") log(m, tone); }, function (session) {
      var url = session && (session.browser_live_view_url || session.live);
      if (url) { setLive(url); status("cloud browser ready"); }
    });
  }

  /* ===== Classic mode: CORS-open readers, no cloud browser ===== */
  function runClassic(query, panel) {
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

  /* Watchable run: opens the panel, streams steps.
     Kernel mode first (real cloud browser); classic readers as fallback. */
  NB.agentBrowse = function (query) {
    var q = String(query || "").trim();
    if (!q) { NB.toast("Give the agent something to research.", "warn"); return; }
    if (running) { NB.toast("agentBrowse is already running.", "warn"); return; }
    running = true;
    var panel = openPanel();
    log("agent online — watching it work in real time", "");
    status("starting");
    var kernelWanted = NB.kernelMode && NB.kernelMode() !== "off" && NB.kernelAgent.available();
    var startRun = function (useKernel) {
      var job = useKernel ? runKernel(q, panel) : runClassic(q, panel);
      Promise.resolve(job).then(function (out) {
      running = false;
      var el = document.querySelector("#ab-panel");
      if (el && out && out.answer) {
        var v = el.querySelector("#ab-viewport") || el.querySelector(".ab-viewwrap");
        if (v) {
          var ans = document.createElement("div");
          ans.className = "ab-answer";
          ans.innerHTML = '<span class="ab-answer-label">agent answer</span>' + esc(out.answer);
          el.insertBefore(ans, el.querySelector("#ab-log"));
        }
        status("done");
      }
      }).catch(function () { running = false; });
    };
    if (!kernelWanted) { startRun(false); return; }
    /* Kernel FIRST — always. The in-site readers only run when the
       cloud browser can't be reached at all. */
    NB.kernelAgent.ready().then(function (ok) {
      if (ok) startRun(true);
      else {
        var blocked = NB.kernelProbeBlocked && NB.kernelProbeBlocked();
        log(
          blocked
            ? "kernel relay unreachable from this browser — falling back to in-site readers (check the relay URL in Settings → Kernel Browser)"
            : "kernel unreachable — falling back to in-site readers",
          "err"
        );
        /* no live iframe ever arrived — drop the empty kernel viewport */
        var vw = document.querySelector("#ab-viewwrap");
        if (vw && !vw.querySelector("#ab-live")) vw.remove();
        startRun(false);
      }
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
