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

  /* ---------- task vs. question ----------
     "sign in to chatgpt.com via temp mail" is a DOING task and must go to
     the browser agent — the memory-chat AI cannot operate websites. */
  var TASK_RX = new RegExp(
    "\\b(sign\\s?-?\\s?in|sign\\s?-?\\s?up|log\\s?in|log\\s?into|login|logged\\s?in|logging\\s?(in|into)|register|create\\s+(an?\\s+)?account|make\\s+(an?\\s+)?account|" +
    "fill\\s+(in|out)|submit\\s+(the\\s+)?form|checkout|check\\s?out|add\\s+to\\s+(my\\s+)?cart|buy\\s+(a|an|the|me)|" +
    "order\\s+(a|an|the|my|food)|book\\s+(a|an|the|my)|reserve\\s+(a|an|the|my)|subscribe\\s+to|apply\\s+(to|for)|" +
    "post\\s+(a|an|this|it|my)|tweet\\b|publish\\b|upload\\b|send\\s+(a\\s+)?(message|email|mail)|temp\\s?-?\\s?mail|via\\s+temp|" +
    "delete\\s+my\\s+(account|post|tweet)|change\\s+my\\s+(password|email|username))\\b", "i");
  function isTaskRequest(q) {
    q = String(q || "");
    if (q.length < 8) return false;
    if (TASK_RX.test(q)) return true;
    /* "open X and then …" / "go to X and …" multi-step chains are tasks */
    return /\b(open|go\s+to|visit)\b.+\b(and|then)\b.+/i.test(q);
  }
  NB.isTaskRequest = isTaskRequest;

  /* ---------- demo-echo guard ----------
     The prompts' FORMAT examples use a fixed demo topic; small models
     sometimes echo the example back instead of the user's request (the
     reported "it just searches mount everest height" bug). When a step
     is about the demo topic — or a literal <template> — but the user
     never mentioned it, rewrite or reject the step. */
  var ECHO_RX = /mount\s*everest|8,?\s*849/i;
  function fixEcho(action, arg, query) {
    if (!ECHO_RX.test(arg) && !/^<[^>]*>$/.test(arg)) return { action: action, arg: arg };
    if (ECHO_RX.test(String(query || ""))) return { action: action, arg: arg }; /* user really asked about it */
    if (action === "SEARCH") return { action: action, arg: String(query) }; /* search THEIR thing */
    return null; /* ANSWER/OPEN/READ aimed at the demo → not trustworthy */
  }

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
        '<span class="ab-actions">' +
          (kernelOn ? '<button class="btn btn-outline btn-sm" id="ab-view-btn" title="Browser view — zoom, mobile width, fullscreen">⛶ View</button>' : "") +
          '<button class="btn btn-outline btn-sm" id="ab-close">Close</button>' +
        "</span>" +
      "</div>" +
      (kernelOn
        ? '<div class="ab-menu" id="ab-menu" hidden>' +
            '<button class="ab-menu-item" data-ab-zoom="out">−&nbsp;&nbsp;Zoom out</button>' +
            '<button class="ab-menu-item" data-ab-zoom="reset">◻&nbsp;&nbsp;100%</button>' +
            '<button class="ab-menu-item" data-ab-zoom="in">+&nbsp;&nbsp;Zoom in</button>' +
            '<div class="ab-menu-sep"></div>' +
            '<button class="ab-menu-item" data-ab-view="desktop">🖥&nbsp;&nbsp;Desktop view</button>' +
            '<button class="ab-menu-item" data-ab-view="mobile">📱&nbsp;&nbsp;Mobile view</button>' +
            '<div class="ab-menu-sep"></div>' +
            '<button class="ab-menu-item" data-ab-fs>⛶&nbsp;&nbsp;Fullscreen browser</button>' +
          "</div>"
        : "") +
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

  /* ---------- browser-view menu: zoom / mobile / fullscreen ----------
     DISPLAY-level controls for the embedded live stream only — the agent's
     log/answer are untouched, and the cloud browser itself keeps its own
     real viewport. "Mobile view" additionally flips the cloud browser to a
     REAL 390×844 phone viewport via CDP (see kernel.js setViewport) so the
     site serves its mobile layout — not just a squeezed desktop stream. */
  function wireViewMenu(wrap) {
    var btn = wrap.querySelector("#ab-view-btn");
    var menu = wrap.querySelector("#ab-menu");
    if (!btn || !menu) return;
    var zoom = 1;
    var vw = wrap.querySelector("#ab-viewwrap");

    function liveFrame() { return wrap.querySelector("#ab-live"); }
    function setZoom(z) {
      zoom = Math.min(2, Math.max(0.5, Math.round(z * 100) / 100));
      var f = liveFrame();
      if (f) {
        if (zoom === 1) { f.style.transform = ""; f.style.width = ""; f.style.height = ""; }
        else {
          f.style.transformOrigin = "0 0";
          f.style.transform = "scale(" + zoom + ")";
          f.style.width = (100 / zoom) + "%";
          f.style.height = (100 / zoom) + "%";
        }
      }
      var cur = menu.querySelector("[data-ab-zoom='reset']");
      if (cur) cur.textContent = zoom === 1 ? "◻  100%" : "◻  " + Math.round(zoom * 100) + "%";
      var b2 = wrap.querySelector("#ab-view-btn");
      if (b2) b2.textContent = zoom === 1 ? "⛶ View" : "⛶ View · " + Math.round(zoom * 100) + "%";
    }
    function markView(mode) {
      menu.querySelectorAll("[data-ab-view]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-ab-view") === mode);
      });
      if (vw) vw.classList.toggle("mobile", mode === "mobile");
    }
    function exitPseudoFs() {
      if (vw) vw.classList.remove("fs-pseudo");
      var x = wrap.querySelector("#ab-fs-exit");
      if (x) x.remove();
    }
    function pseudoFs() {
      if (!vw) return;
      vw.classList.add("fs-pseudo");
      if (!wrap.querySelector("#ab-fs-exit")) {
        var x = document.createElement("button");
        x.id = "ab-fs-exit";
        x.className = "ab-fs-exit";
        x.textContent = "✕ exit fullscreen";
        x.addEventListener("click", function (e) { e.stopPropagation(); exitPseudoFs(); });
        vw.appendChild(x);
      }
    }
    function toggleFullscreen() {
      if (!vw) return;
      var doc = document;
      if (doc.fullscreenElement === vw) {
        if (doc.exitFullscreen) { try { doc.exitFullscreen(); } catch (e) {} }
        exitPseudoFs();
        return;
      }
      if (vw.requestFullscreen) {
        try { vw.requestFullscreen().catch(function () { pseudoFs(); }); } catch (e) { pseudoFs(); }
        return;
      }
      pseudoFs(); /* iOS Safari / old browsers: full-viewport overlay instead */
    }

    markView(NB.kernelAgent && NB.kernelAgent.getViewport ? NB.kernelAgent.getViewport() : "desktop");
    btn.addEventListener("click", function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".ab-menu-item") : null;
      if (!b) return;
      e.stopPropagation();
      var z = b.getAttribute("data-ab-zoom");
      if (z === "in") return setZoom(zoom * 1.25);
      if (z === "out") return setZoom(zoom / 1.25);
      if (z === "reset") return setZoom(1);
      var v = b.getAttribute("data-ab-view");
      if (v === "mobile" || v === "desktop") {
        markView(v);
        try { if (NB.kernelAgent.setViewport) NB.kernelAgent.setViewport(v); } catch (e2) {}
        return;
      }
      if (b.hasAttribute("data-ab-fs")) { toggleFullscreen(); menu.hidden = true; }
    });
  }
  /* one shared click-away dismiss for whatever menu is open (no per-open
     listeners — the panel is opened/closed repeatedly) */
  document.addEventListener("click", function () {
    var m = document.querySelector("#ab-menu");
    if (m && !m.hidden) m.hidden = true;
  });
  /* Escape closes the open menu too (one shared listener, like click-away) */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var m = document.querySelector("#ab-menu");
      if (m && !m.hidden) m.hidden = true;
    }
  });

  /* Kernel down? DON'T delete the viewport — collapse it into a slim strip
     with a Retry button. Removing it wholesale (the old behavior) is what
     made the kernel look like it "completely disappeared" on some devices. */
  function markKernelUnavailable(reason) {
    var vw = document.querySelector("#ab-viewwrap");
    if (!vw || vw.querySelector("#ab-live")) return;
    vw.classList.add("unavailable");
    vw.innerHTML = '<div class="ab-kdown"><span class="ab-kdown-msg">☁ kernel unreachable — ' + esc(reason) +
      ' · running in reader mode</span><button class="btn btn-outline btn-sm" id="ab-kretry">Retry kernel</button></div>';
    var r = vw.querySelector("#ab-kretry");
    if (r) r.addEventListener("click", function () {
      var el = document.querySelector("#ab-panel");
      if (el) el.remove();
      running = false;
      NB.agentBrowse(lastQuery || "");
    });
  }

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
    wireViewMenu(wrap);
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
  var MAX_STEPS = 24; /* doing-tasks (temp-mail sign-up flows) need real room */

  /* ---------- real-interaction helpers (drive the cloud browser) ----------
     The model works with VISIBLE TEXT ("Sign in", "email"), not raw CSS —
     these resolvers try a CSS selector first, then aria/placeholder/name/id,
     then visible-text matching over buttons/links/fields. */
  function pageContext(d) {
    return d.eval("JSON.stringify((function(){function vis(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}var out=[];try{document.querySelectorAll('input,textarea,select').forEach(function(e){if(!vis(e)||out.length>18)return;out.push({k:'field',t:e.tagName.toLowerCase(),type:e.type||'',ph:e.placeholder||e.getAttribute('aria-label')||e.name||e.id||'',v:String(e.value||'').slice(0,30)});});document.querySelectorAll('button,[role=button],input[type=submit],input[type=button],a').forEach(function(e){if(!vis(e)||out.length>40)return;var tx=(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,40);if(tx)out.push({k:/^a$/i.test(e.tagName)?'link':'btn',tx:tx});});}catch(e){}return out;})())")
      .then(function (s) { try { return JSON.parse(s); } catch (e) { return []; } })
      .catch(function () { return []; });
  }
  /* where is the cloud browser right now? (prevents OPEN-the-same-page
     loops and lets the model reason about the site it's on) */
  function currentUrl(d) {
    return Promise.resolve()
      .then(function () { return d.eval("location.href"); })
      .then(function (u) { return String(u || ""); })
      .catch(function () { return ""; });
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

  /* top navigation-worthy links of the current page (resolved + decoded).
     Search-results pages show titles in text but URLs only in hrefs —
     without this the model can see results but can't OPEN them. */
  function collectLinks(d, cap) {
    return d.eval("JSON.stringify((function(){var out=[];try{document.querySelectorAll('a').forEach(function(a){if(out.length>=" + (cap || 8) + ")return;var t=String(a.innerText||'').trim();var h=String(a.href||'');if(!t||t.length<25||h.indexOf('http')!==0)return;if(h.indexOf('uddg=')>-1){try{h=decodeURIComponent(h.split('uddg=')[1].split('&')[0]);}catch(e){}}if(h.indexOf('http')!==0||h.indexOf('duckduckgo.com')>-1)return;out.push({t:t.slice(0,90),h:h.slice(0,220)});});}catch(e){}return out;})())")
      .then(function (s) { try { return JSON.parse(s) || []; } catch (e) { return []; } })
      .catch(function () { return []; });
  }

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
    var readDone = {}, readFails = {}; /* per-run URL bookkeeping — loop breakers */
    var K = (window.NB && NB.__kernelInternals) || {};
    var extract = K.extractPageText || function (d2, m) { return d2.text("body").then(function (t) { return { title: "", url: "", text: String(t || "").slice(0, m || 3600) }; }); };
    var sweep = K.sweepPage || function () { return Promise.resolve(); };
    var waited = 0; /* WAIT uses: model can't retry it forever */
    var sameStep = 0, lastSig = ""; /* repeated-step detector: 3 identical outcomes in a row → force a wrap-up */
    function step(n, d) {
      if (n > MAX_STEPS || !document.querySelector("#ab-panel")) return Promise.resolve();
      status("step " + n + "/" + MAX_STEPS);
      foot("thinking with your local NVIDIA model…");
      /* near the cap, tell the model to wrap up instead of starting new work */
      var wrapping = n >= MAX_STEPS - 3;
      return Promise.all([pageContext(d), currentUrl(d), extract(d, 1600).catch(function () { return null; }), collectLinks(d, 6)]).then(function (ctx) {
        var elems = ctx[0], here = ctx[1] || "", snap = ctx[2] || null, links = ctx[3] || [];
        var elemLines = (elems || []).slice(0, 30).map(function (e) {
          return e.k === "field" ? "  field " + e.t + "[" + e.type + "] “" + e.ph + "”" + (e.v ? " = " + e.v : "")
            : "  " + e.k + " “" + e.tx + "”";
        }).join("\n");
        var linkLines = links.map(function (l) { return "  " + l.t + " → " + l.h; }).join("\n");
        var doing = isTaskRequest(query);
        return think(
          "You are agentBrowse, an autonomous web agent inside NeuroBot that DRIVES a real cloud browser to COMPLETE the user's request. " +
          "ALWAYS reply in English. " +
          "You can research AND DO things on websites: log in, sign up, fill forms, click buttons, submit.\n" +
          "Reply with EXACTLY one line, one of:\n" +
          "NEXT OPEN https://example.com\n" +
          "NEXT CLICK Sign in\n" +
          "NEXT TYPE email :: you@example.com\n" +
          "NEXT KEY Enter\n" +
          "NEXT WAIT 2\n" +
          "NEXT SCROLL down\n" +
          "NEXT READ https://example.com/page\n" +
          "NEXT SEARCH whatever you need to find\n" +
          "NEXT ANSWER what you did or found\n" +
          "SEARCH = web search, OPEN = navigate, READ = extract page text, CLICK = click a button/link by its visible text, " +
          "TYPE = fill a form field (field-name :: text — field-name can be email/password/username/search or the placeholder), " +
          "KEY = press Enter to submit, SCROLL = scroll down/up to reveal more of the page, " +
          "WAIT = pause 1-5s for navigation/modals to settle, ANSWER = stop and report.\n" +
          "WORKFLOW RULES:\n" +
          "0) The lines above are FORMAT EXAMPLES ONLY — never act on their example content. ALWAYS act on the USER'S REQUEST below.\n" +
          "1) DOING tasks (sign in, sign up, create account, submit a form, buy, post) MUST be completed with OPEN → CLICK/TYPE/KEY. Reading pages alone cannot complete them. If the request names a site, OPEN it directly — do NOT SEARCH for it.\n" +
          "2) If the request needs an email address: OPEN a temp-mail site first (https://temp-mail.io or https://tempmail.plus), READ the page to get the address, TYPE it into the form, submit, then OPEN the temp-mail site again and READ the inbox for the confirmation code/link.\n" +
          "3) If an element you need is missing or a page just changed, WAIT once and re-look. If it may be below the fold, SCROLL.\n" +
          "4) READ the page when you need its content — element labels alone are not the content. A page whose text comes back empty is auto-retried through a text proxy; a URL that FAILED twice is dead — never READ it again.\n" +
          "5) Never OPEN the page you are already on (see CURRENT URL). Do not repeat a step that already failed the same way.\n" +
          "6) When the task is done or you have what you need, ANSWER immediately — for DOING tasks report exactly what you did (accounts created, forms submitted, addresses/codes used); for research report the facts.\n" +
          "7) TIME BUDGET: when told WRAP UP (or steps are nearly exhausted) do NOT start new searches/opens — ANSWER with the best result you have.\n" +
          "8) If the same action keeps failing the same way, stop repeating it — take a DIFFERENT approach or ANSWER with what you have.\n" +
          "Start with OPEN (if the request names a site) or SEARCH (only if you don't know where to go). No other text.",
          "USER'S REQUEST (the ONLY thing you should act on): " + query +
          "\nTASK TYPE: " + (doing ? "DOING — the user wants something DONE on a website. You MUST interact (OPEN/CLICK/TYPE/KEY), not just read." : "RESEARCH — find and report information.") +
          (wrapping ? "\n⚠ WRAP UP — only a few steps remain. Answer NOW with what you have; do not start new pages.\n" : "") +
          "\n\nCURRENT URL: " + (here || "(unknown)") +
          "\n\nPAGE TEXT (first 1400 chars):\n" + (snap && String(snap.text || "").replace(/\s+/g, " ").trim().slice(0, 1400) || "(unavailable)") +
          "\n\nLINKS ON THIS PAGE (title → url):\n" + (linkLines || "(none)") +
          "\n\nCURRENT PAGE ELEMENTS:\n" + (elemLines || "(none detected)") +
          "\n\nSTEPS SO FAR:\n" + (steps.length ? steps.join("\n") : "(none yet)"),
          260
        );
      }).then(function (raw) {
        var m = String(raw || "").match(/^(?:NEXT\s+)?(SEARCH|OPEN|READ|CLICK|TYPE|KEY|WAIT|SCROLL|ANSWER)\s*:?\s*([\s\S]+)$/i);
        if (!m) { log("model step unclear — answering from what was gathered", "warn"); return bestEffortAnswer(query, steps, lastPage); }
        var action = m[1].toUpperCase(), arg = m[2].trim();
        var fixed = fixEcho(action, arg, query);
        if (!fixed) { log("model echoed the demo example — answering from the gathered research instead", "warn"); return bestEffortAnswer(query, steps, lastPage); }
        action = fixed.action; arg = fixed.arg;
        /* repeated-step breaker: three IDENTICAL outcomes in a row means the
           model is grinding — force a wrap-up ("it just searches the same
           thing over and over") */
        var sig = action + " " + String(arg || "").toLowerCase().replace(/\s+/g, " ").slice(0, 80);
        if (sig === lastSig && action !== "ANSWER") sameStep++; else sameStep = 0;
        lastSig = sig;
        if (sameStep >= 2) {
          log("same step repeated 3× — forcing a wrap-up", "warn");
          return bestEffortAnswer(query, steps, lastPage);
        }
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
            if (!r || !r.ok) {
              log("no clickable “" + arg + "” on this page", "err");
              /* failures must reach STEPS SO FAR or the model re-emits them forever */
              steps.push("CLICK “" + arg + "” → NOT FOUND on this page. Look at CURRENT PAGE ELEMENTS and LINKS; try a different label, SCROLL, or ANSWER.");
              return step(n + 1, d);
            }
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
            if (!r || !r.ok) {
              log("no field matching “" + fld + "” here", "err");
              steps.push("TYPE " + fld + " → NO FIELD on this page. Check CURRENT PAGE ELEMENTS for the real field name, SCROLL if below the fold, or ANSWER.");
              return step(n + 1, d);
            }
            log("typed into " + (r.filled || fld), "ok");
            steps.push("TYPE " + fld + " → filled " + (r.filled || fld) + " with " + String(val).slice(0, 60));
            return sleep(400).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "WAIT") {
          var secs = Math.min(5, Math.max(1, parseFloat(arg) || 2));
          if (waited >= 3) { log("WAIT budget spent — moving on", "warn"); return step(n + 1, d); }
          waited++;
          log("waiting " + secs + "s for the page to settle", "act");
          foot("cloud browser → wait");
          return sleep(secs * 1000).then(function () { return step(n + 1, d); });
        }
        if (action === "SCROLL") {
          var dir = /up/i.test(arg) ? -1 : 1;
          log("scrolling " + (dir > 0 ? "down" : "up"), "act");
          foot("cloud browser → scroll");
          return d.eval("window.scrollBy(0," + (700 * dir) + ")").catch(function () {}).then(function () {
            return sleep(500).then(function () { return step(n + 1, d); });
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
          /* html.duckduckgo.com is the static-results endpoint — the JS
             lite page often renders blank under CDP navigation */
          return d.goto("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(arg)).then(function () {
            return sleep(800);
          }).then(function () {
            return extract(d, 2400);
          }).then(function (p) {
            var t = String((p && p.text) || "").replace(/\s+/g, " ").trim().slice(0, 2400);
            if (!t) throw new Error("empty results");
            lastPage = p;
            steps.push("SEARCH “" + arg + "” → " + t.slice(0, 500));
            showPage({ title: "Search: " + arg, body: t.slice(0, 600) }, { url: "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(arg) });
            return sleep(700).then(function () { return step(n + 1, d); });
          }).catch(function (e) {
            log("search failed (" + (e.message || "error") + ") — trying direct step", "err");
            return sleep(400).then(function () { return step(n + 1, d); });
          });
        }
        if (action === "OPEN" || action === "READ") {
          var url = /^(https?:)?\/\//.test(arg) ? arg : "https://" + arg.replace(/^\/+/, "");
          /* model pasted a bare title → resolve it from the page's links */
          if (!/^https?:\/\//i.test(arg)) {
            var wanted = arg.toLowerCase().replace(/^\/+/, "");
            var hit = links.find(function (l) { return (l.t || "").toLowerCase() === wanted; })
              || links.find(function (l) { return (l.t || "").toLowerCase().indexOf(wanted) > -1; });
            if (hit) { url = hit.h; arg = hit.t; log("resolved “" + hit.t + "” → " + hit.h, "ok"); }
          }
          /* LOOP BREAKERS — "the agent reads the same dead page forever":
             a URL whose text was already captured is never re-read, and one
             that failed twice is skipped WITH an explicit instruction so the
             model moves on instead of grinding the same step (it kept
             re-emitting READ because failures never reached STEPS SO FAR). */
          if (readDone[url]) {
            log("already read " + url + " — its text is in STEPS SO FAR", "warn");
            steps.push("READ " + url + " → ALREADY READ — use that text from STEPS SO FAR or ANSWER");
            return step(n + 1, d);
          }
          if ((readFails[url] || 0) >= 2) {
            log("skipping " + url + " — it failed twice already", "err");
            steps.push("READ " + url + " → FAILED TWICE (unreachable/JS-only). Choose a DIFFERENT page, SEARCH again, or ANSWER with what you have.");
            return step(n + 1, d);
          }
          log((action === "READ" ? "reading " : "opening ") + url, "act");
          foot("cloud browser → " + url.replace(/^https?:\/\//, "").slice(0, 40));
          return d.goto(url).then(function () { return sleep(500); })
            .then(function () { return sweep(d); })
            .then(function () { return extract(d, 3600); })
            .then(function (p) {
              if (p && String(p.text || "").trim()) return p;
              /* cloud extraction came back empty (JS-only or blocked page) —
                 re-read the SAME URL through the text-proxy renderer inside
                 the cloud browser, so the agent still gets real content
                 instead of looping on empty reads ("can't retrieve info") */
              log("page text came back empty — reading it through the text proxy", "act");
              return d.goto("https://r.jina.ai/" + url).then(function () { return sleep(700); })
                .then(function () { return extract(d, 3600); })
                .then(function (p2) {
                  if (p2 && String(p2.text || "").trim()) {
                    p2.url = url;
                    if (!p2.title || /^just a moment/i.test(p2.title)) p2.title = url;
                    return p2;
                  }
                  throw new Error("empty page");
                });
            })
            .then(function (p) {
              readDone[url] = true;
              lastPage = p;
              var flat = String(p.text || "").replace(/\s+/g, " ").trim();
              steps.push("READ " + (p.url || url) + " [" + (p.title || "untitled") + "] → " + flat.slice(0, 500));
              showPage({ title: p.title || url, body: flat.slice(0, 600) }, { url: p.url || url });
              return sleep(700).then(function () { return step(n + 1, d); });
            })
            .catch(function (e) {
              readFails[url] = (readFails[url] || 0) + 1;
              log("could not read that page (" + (e.message || "error") + ")", "err");
              steps.push("READ " + url + " → FAILED (" + String(e.message || "error").slice(0, 60) + "). Try a DIFFERENT page, SEARCH, or ANSWER.");
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
        "NEXT SEARCH <the user's topic, NOT the example topic>\n" +
        "NEXT OPEN <a page title or url about the user's topic>\n" +
        "NEXT READ https://example.com/page\n" +
        "NEXT ANSWER <the answer to the user's question>\n" +
        "RULE 0: the formats above are TEMPLATES — fill them with the USER'S topic from QUESTION below, never with example content. " +
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
        var fixedC = fixEcho(action, arg, query);
        if (!fixedC) { log("model echoed the demo example — stopping", "warn"); status("done"); foot(""); return; }
        action = fixedC.action; arg = fixedC.arg;
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
  var runSeq = 0, lastQuery = "";
  NB.agentBrowse = function (query) {
    var q = String(query || "").trim();
    if (!q) { NB.toast("Give the agent something to research.", "warn"); return; }
    if (running) { NB.toast("agentBrowse is already running.", "warn"); return; }
    running = true;
    var myRun = ++runSeq;
    lastQuery = q;
    var kernelWanted = NB.kernelMode && NB.kernelMode() !== "off" && NB.kernelAgent.available();
    /* a fresh run must NEVER embed the PREVIOUS run's live view — that
       browser was deleted when the last run ended, so the frame would sit
       blank forever (the other half of the "kernel disappeared" reports) */
    if (kernelWanted && NB.kernelResetLive) NB.kernelResetLive();
    var panel = openPanel();
    log("agent online — watching it work in real time", "");
    status("starting");
    var startRun = function (useKernel) {
      var job = useKernel ? runKernel(q, panel) : runClassic(q, panel);
      Promise.resolve(job).then(function (out) {
      if (myRun === runSeq) running = false;
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
      }).catch(function () { if (myRun === runSeq) running = false; });
    };
    if (!kernelWanted) { startRun(false); return; }
    /* Kernel FIRST — always. The in-site readers only run when the
       cloud browser can't be reached at all. */
    NB.kernelAgent.ready().then(function (ok) {
      if (!document.querySelector("#ab-panel")) { if (myRun === runSeq) running = false; return; }
      if (ok) startRun(true);
      else {
        var blocked = NB.kernelProbeBlocked && NB.kernelProbeBlocked();
        log(
          blocked
            ? "kernel relay unreachable from this browser — falling back to in-site readers (check the relay URL in Settings → Kernel Browser)"
            : "kernel unreachable — falling back to in-site readers",
          "err"
        );
        /* keep the viewport — collapse it to a retry strip instead of
           deleting it (deleting made the kernel look vanished) */
        markKernelUnavailable(
          blocked
            ? "relay blocked by this browser — check the relay URL in Settings → Kernel Browser"
            : "relay unreachable right now"
        );
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
        "NEXT SEARCH <the user's topic, NOT the example topic>\n" +
        "NEXT OPEN <a page title or url about the user's topic>\n" +
        "NEXT READ https://example.com/page\n" +
        "NEXT ANSWER <the answer to the user's question>\n" +
        "RULE 0: fill the templates with the USER'S topic from QUESTION below, never with example content. " +
        "Start with SEARCH if no steps yet. Use ANSWER as soon as you can. No other text.",
        "QUESTION: " + q + "\n\nSTEPS SO FAR:\n" + (steps.join("\n") || "(none)") +
        (linksQ.length ? "\n\nLINKS: " + linksQ.slice(0, 15).join(" | ") : ""),
        220
      ).then(function (raw) {
        var m = String(raw || "").match(/^(?:NEXT\s+)?(SEARCH|OPEN|READ|ANSWER)\s*:?\s*([\s\S]+)$/i);
        var a = m[1].toUpperCase(), arg = m[2].trim();
        var fixedQ = fixEcho(a, arg, q);
        if (!fixedQ) return Promise.resolve(captured || "I couldn't complete that research.");
        a = fixedQ.action; arg = fixedQ.arg;
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
    btn.title = "agentBrowse — watch the agent DO tasks & research on the web";
    btn.setAttribute("aria-label", "agentBrowse");
    btn.textContent = "🌐";
    var send = box.querySelector("#ask-send");
    if (send && send.parentNode) send.parentNode.insertBefore(btn, send);
    else box.appendChild(btn);
    btn.addEventListener("click", function () {
      var input = document.querySelector("#ask-input");
      var q = input && input.value.trim();
      if (!q) { NB.toast("Type a task or question first.", "warn"); if (input) input.focus(); return; }
      NB.agentBrowse(q);
    });
  }
  /* THE "🌐 button disappears" BUG (user-reported, intermittent): every
     render wipes #view, and the old re-wire path (DOMContentLoaded + a 60ms
     timer after hashchange) missed two real cases —
       1) a fresh load whose URL ALREADY contains a hash (reopening the site
          on #/ or #/notes) never fires `hashchange` at all, so the button
          only appeared after the first manual navigation;
       2) agent-browse.js registers its DOMContentLoaded listener BEFORE
          main.js boots (script order), so on first paint wireChatButton()
          ran while the view was still empty — a silent no-op.
     A MutationObserver re-wires the instant an ask-box exists without its
     trigger — no timing, no races, no missed events. */
  if ("MutationObserver" in window && document.body) {
    var wireQueued = false;
    new MutationObserver(function () {
      if (wireQueued) return;
      wireQueued = true;
      setTimeout(function () { wireQueued = false; wireChatButton(); }, 0);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireChatButton);
  } else {
    wireChatButton();
  }
  /* re-renders ride on hashchange — belt-and-braces alongside the observer */
  window.addEventListener("hashchange", function () { setTimeout(wireChatButton, 0); });
})();
