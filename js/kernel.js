/* ============================================================
   NeuroBot — kernel.js (classic script; extends window.NB)
   "Kernel mode" — the agent drives a REAL cloud Chromium
   (kernel.sh) while you watch it live, inside NeuroBot.

   How it works from a static site (no server on our side):
   • Kernel's REST API (api.onkernel.com) sends NO CORS headers,
     so browsers can't call it. Its MCP server looked promising —
     it answers OPTIONS preflights with ACAO:* — but the ACTUAL
     POST responses carry no CORS headers at all, so real browsers
     block every session call. (Verified 2026-09-19.)
   • FIX: a tiny Cloudflare Worker relay (kernel-relay.js) forwards
     browser REST to api.onkernel.com with CORS on every response.
     A project-deployed relay is BUILT IN (BUILTIN_RELAY below) so
     cloud-browser runs work with zero setup; users can swap in
     their own relay URL (or clear the override) in Settings.
     Every relay call carries the Authorization header — the relay
     forwards it to Kernel (without it: 401).
   • Sessions are created with Kernel's MAXIMUM idle timeout
     (72h) and DELETED the moment the run finishes — nothing
     ever sits idle. If the account's concurrent-session limit
     is hit, we close the two oldest sessions to make room and
     spin up a brand-new browser (never reuse if avoidable).
   • The CDP WebSocket (wss://…/browser/cdp?jwt=…) from the MCP
     payload accepts any Origin — WebSockets aren't subject to
     CORS — so the driver connects straight to the cloud tab.
   • Optional: a kernel-relay Worker can also be swapped in
     Settings — every run then goes through YOUR endpoint.
   • When the MCP transport still can't complete in a browser,
     Settings says so honestly and points at the one-click relay —
     NO more dead-end "unreachable" messaging.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  /* ---------- built-in owner key ----------
     Scoped to NeuroBot's Kernel org. The user can override it in
     Settings → Kernel Browser (stored on their device only). */
  var BUILTIN_KEY = "sk_3f9ea184-1094-ee4e-f1ae-39ebe2637b9e.lfDHUAScxT67Xvn2NZcHbw8PpOgCF97fwG0wd57451w";
  /* Built-in session relay (project-deployed Cloudflare Worker). Kernel's REST
     API sends no CORS headers, so a browser cannot call api.onkernel.com —
     this worker forwards browser REST with CORS on every response. A user can
     override it in Settings → Kernel Browser; clearing the field returns to
     this default. */
  var BUILTIN_RELAY = "https://jolly-breeze-f8f9.tanishqlalwani202.workers.dev";
  var API = "https://api.onkernel.com";
  var MCP_URL = "https://mcp.onkernel.com/mcp";
  var KEY_LS = "nb_kernel_key";
  var RELAY_LS = "nb_kernel_relay";
  var MAX_TIMEOUT_S = 259200; /* 72h — Kernel's max idle timeout */

  /* "timeout on max": MCP/REST calls get a 2-minute budget, each CDP
     command gets 2 minutes, page-settle waits up to 20s. */
  var REST_TIMEOUT_MS = 120000;
  var CDP_TIMEOUT_MS = 120000;
  var SETTLE_CAP_MS = 20000;

  var currentLive = ""; /* live-view URL of the most recent run's browser */
  var CORS_HELP = "Kernel blocks direct browser calls (CORS). NeuroBot routes sessions through its built-in relay — if runs fail, check the relay URL in Settings → Kernel Browser (or deploy your own kernel-relay.js to Cloudflare Workers and paste it there).";
  /* jsdom test harness sets this: skip Kernel transport (fetch is stubbed) and
     reuse the fake WebSocket directly — still exercises the full driver. */
  var TEST_MODE = false;
  try { TEST_MODE = typeof window !== "undefined" && window.NB_KERNEL_TEST === "1"; } catch (e) {}

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function apiKey() { return String(lsGet(KEY_LS) || BUILTIN_KEY).trim(); }
  function relayBase() {
    return String(lsGet(RELAY_LS) || (NB.getKernelRelay && NB.getKernelRelay()) || BUILTIN_RELAY).trim();
  }

  /* ============================================================
     MCP transport — https://mcp.onkernel.com/mcp
     Fallback only (no relay configured). Responses are SSE frames
     (`data: {jsonrpc}` lines) but some deployments reply with a
     single plain-JSON body — both parsed. A watchdog aborts hung
     requests. NOTE: from a static-site browser this POST is
     CORS-blocked today (the response carries no ACAO header) —
     the relay is the working path; this transport stays wired so
     the day Kernel adds response CORS, the site lights up with
     zero changes.
     ============================================================ */
  var mcpSession = ""; /* mcp-session-id from the initialize response */
  var mcpReadyPromise = null;
  var mcpNextId = 1;

  function mcpInit() {
    if (mcpSession) return Promise.resolve(mcpSession);
    if (mcpReadyPromise) return mcpReadyPromise;
    mcpReadyPromise = mcpRaw(null, {
      jsonrpc: "2.0", id: mcpNextId++, method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "neurobot", version: "1.0" } },
    }).then(function (res) {
      mcpSession = res.sid || "";
      /* fire-and-forget handshake completion (202, no body) */
      if (mcpSession) {
        try {
          fetch(MCP_URL, {
            method: "POST",
            headers: mcpHeaders(),
            body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
          }).catch(function () {});
        } catch (e) {}
      }
      return mcpSession;
    }).catch(function (e) {
      mcpReadyPromise = null; /* allow a later retry */
      throw e;
    });
    return mcpReadyPromise;
  }

  function mcpHeaders() {
    var h = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer " + apiKey(),
    };
    if (mcpSession) h["mcp-session-id"] = mcpSession;
    return h;
  }

  /* one raw MCP POST → resolves { sid, data } (data = last JSON-RPC frame)
     Responses are SSE frames (`data: {...}` lines) but some deployments
     reply with a single plain-JSON body — both are parsed. A watchdog
     aborts hung requests. NOTE: from a static-site browser this POST is
     CORS-blocked today (the response carries no ACAO header) — the relay
     is the working path; this transport stays wired so the day Kernel
     adds response CORS, the site lights up with zero changes. */
  function mcpRaw(sessionId, payload) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REST_TIMEOUT_MS) : null;
    var headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": "Bearer " + apiKey(),
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    var opts = { method: "POST", headers: headers, body: JSON.stringify(payload) };
    if (ctrl) opts.signal = ctrl.signal;

    return fetch(MCP_URL, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      var sid = "";
      try { sid = r.headers.get("mcp-session-id") || ""; } catch (e) {}
      if (!r.ok) {
        return r.text().catch(function () { return ""; }).then(function (t) {
          var err = new Error("kernel mcp " + r.status + (t ? ": " + t.slice(0, 140) : ""));
          err.status = r.status;
          throw err;
        });
      }
      return r.text().then(function (txt) {
        var data = null, errObj = null;
        var t = String(txt || "").trim();
        if (t) {
          try { var whole = JSON.parse(t); if (whole.error) errObj = whole.error; else data = whole; } catch (e) {}
        }
        if (!data && !errObj) {
          var lines = t.split("\n");
          for (var i = 0; i < lines.length; i++) {
            var l = lines[i];
            if (l.indexOf("data:") !== 0) continue;
            var b = l.slice(5).trim();
            if (!b) continue;
            try {
              var j = JSON.parse(b);
              if (j.error) errObj = j.error;
              else data = j;
            } catch (e2) { /* non-JSON keepalive line */ }
          }
        }
        if (errObj) {
          var e3 = new Error(errObj.message || "kernel mcp error");
          e3.status = errObj.code;
          throw e3;
        }
        return { sid: sid, data: data };
      });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      /* a browser CORS block surfaces as TypeError("Failed to fetch") —
         translate it into the honest, actionable message */
      if (e && (e.name === "TypeError" || /failed to fetch|networkerror/i.test(String(e.message || "")))) {
        var cors = new Error(CORS_HELP);
        cors.cors = true;
        throw cors;
      }
      throw e;
    });
  }

  /* tools/call `manage_browsers` → parsed inner JSON (or plain text)
     Throws err.limit = true when the org's concurrent cap is hit. */
  function mcpBrowsers(args) {
    return mcpInit().then(function (sid) {
      var payload = {
        jsonrpc: "2.0", id: mcpNextId++, method: "tools/call",
        params: { name: "manage_browsers", arguments: args },
      };
      return mcpRaw(sid, payload).then(function (res) {
        var r = res && res.data && res.data.result;
        if (!r) throw new Error("kernel mcp: empty result");
        if (r.is_error) {
          var t = (r.content && r.content[0] && r.content[0].text) || "kernel error";
          var err = new Error(String(t).slice(0, 300));
          if (/limit|exceed|maximum|concurrent|org_|too many/i.test(err.message)) err.limit = true;
          throw err;
        }
        var txt = (r.content && r.content[0] && r.content[0].text) || "";
        try { return JSON.parse(txt); } catch (e) { return txt; } /* "deleted successfully" etc. */
      }).catch(function (e) {
        /* stale/unknown MCP session — re-initialize once and retry */
        if ((e && (e.status === 404 || e.status === 400)) && mcpSession) {
          mcpSession = ""; mcpReadyPromise = null;
          return mcpInit().then(function () { return mcpBrowsers(args); });
        }
        throw e;
      });
    });
  }

  /* relay health probe: authenticated GET /browsers (session list).
     Cheap, CORS-clean, and proves both the relay AND the key in one call. */
  function probeRelay() {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(relayBase() + "/browsers", { headers: { "Authorization": "Bearer " + apiKey() }, signal: ctrl && ctrl.signal })
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          return r.text().catch(function () { return ""; }).then(function (t) {
            var err = new Error("relay " + r.status + (t ? ": " + t.slice(0, 120) : ""));
            err.status = r.status;
            throw err;
          });
        }
        return true;
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        if (e && (e.name === "TypeError" || /failed to fetch|networkerror/i.test(String(e.message || "")))) {
          var cors = new Error(CORS_HELP);
          cors.cors = true;
          throw cors;
        }
        throw e;
      });
  }

  /* normalize an MCP browser object into the shape the driver expects */
  function normBrowser(b) {
    if (!b) return null;
    return {
      session_id: b.session_id || b.id || "",
      base_url: b.base_url || "",
      cdp_ws_url: b.cdp_ws_url || "",
      browser_live_view_url: b.browser_live_view_url || b.live_view_url || "",
      timeout_seconds: b.timeout_seconds || MAX_TIMEOUT_S,
      name: b.name || "",
    };
  }

  function sessionPayloads(s) {
    /* MCP wraps: {"browser":{...}}; be liberal about the envelope */
    var b = s && (s.browser || s.session || s);
    return normBrowser(b);
  }

  function createSession(key) { /* key kept for signature compat */
    return mcpBrowsers({
      action: "create",
      timeout_seconds: MAX_TIMEOUT_S,
      name: "neurobot-" + Math.random().toString(36).slice(2, 8),
    }).then(function (j) {
      var s = sessionPayloads(j);
      if (!s || !s.session_id) throw new Error("kernel: unexpected create response");
      return s;
    });
  }

  function getSession(key, sid) {
    return mcpBrowsers({ action: "get", session_id: sid }).then(function (j) {
      return sessionPayloads(j);
    });
  }

  function listSessions(key) {
    return mcpBrowsers({ action: "list" }).then(function (j) {
      if (Array.isArray(j)) return j.map(normBrowser).filter(Boolean);
      if (j && Array.isArray(j.items)) return j.items.map(normBrowser).filter(Boolean);
      return [];
    });
  }

  function deleteSession(key, sid) {
    if (!sid) return Promise.resolve();
    return mcpBrowsers({ action: "delete", session_id: sid }).catch(function () {});
  }

  /* ============================================================
     Tiny CDP-over-WebSocket client (unchanged — WS has no CORS)
     ============================================================ */
  function Cdp(wsUrl) {
    var WS = window.WebSocket || WebSocket;
    this.ws = new WS(wsUrl);
    this.mid = 0;
    this.evHandlers = [];
    this.pending = {};
    var self = this;
    this.opened = new Promise(function (resolve, reject) {
      self.ws.onopen = function () { resolve(); };
      self.ws.onerror = function () { reject(new Error("kernel-ws-error")); };
    });
    this.ws.onmessage = function (e) {
      var d; try { d = JSON.parse(e.data); } catch (err) { return; }
      if (d.id && self.pending[d.id]) {
        var p = self.pending[d.id]; delete self.pending[d.id];
        if (d.error) p.reject(new Error(d.error.message || "cdp error")); else p.resolve(d.result);
      } else if (d.method) {
        self.evHandlers.forEach(function (h) { h(d); });
      }
    };
  }
  Cdp.prototype.send = function (method, params, sessionId) {
    var self = this;
    return this.opened.then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++self.mid;
        self.pending[id] = { resolve: resolve, reject: reject };
        var msg = { id: id, method: method, params: params || {} };
        if (sessionId) msg.sessionId = sessionId;
        self.ws.send(JSON.stringify(msg));
        setTimeout(function () {
          if (self.pending[id]) { delete self.pending[id]; reject(new Error("cdp timeout: " + method)); }
        }, CDP_TIMEOUT_MS);
      });
    });
  };
  Cdp.prototype.onEvent = function (h) { this.evHandlers.push(h); };
  Cdp.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

  /* ---------- rich page-text extraction (agent retrieval) ----------
     d.text("body") grabs nav/menu/footer noise and is capped small, so the
     agent often "can't retrieve the info" it just opened. This extractor
     prefers real content containers, scrolls the page to trigger lazy
     content, and returns much more text. */
  function extractPageText(driver, maxChars) {
    maxChars = maxChars || 3600;
    return driver.eval(
      "(function(){" +
      "function clean(s){return String(s||'').replace(/[\\t\\r]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').replace(/[ \\u00a0]{2,}/g,' ').trim();}" +
      "var CAND=['main','article','[role=\"main\"]','#content','.post-content','.entry-content','.markdown-body','.prose','.article-body','#__next','body'];" +
      "var host=null;" +
      "for(var i=0;i<CAND.length;i++){var e=document.querySelector(CAND[i]);if(e&&clean(e.innerText).length>240){host=e;break;}}" +
      "if(!host)host=document.body;" +
      "var kill='nav,header,footer,aside,script,style,noscript,svg,form,iframe,.sidebar,#sidebar,.cookie,.banner,[aria-hidden=\"true\"]';" +
      "var clone=host.cloneNode(true);" +
      "try{clone.querySelectorAll(kill).forEach(function(n){n.remove();});}catch(e2){}" +
      "var h1=(document.querySelector('h1')||{}).innerText||'';" +
      "var text=clean(clone.innerText);" +
      "if(h1&&text.indexOf(clean(h1))!==0)text=clean(h1)+'\\n'+text;" +
      "return {title:document.title||'',url:location.href,text:text.slice(0," + maxChars + ")};" +
      "})()"
    ).then(function (r) {
      if (r && r.exceptionDetails) throw new Error("page read error");
      return (r && r.result && r.result.value) || { title: "", url: "", text: "" };
    });
  }

  /* scroll the page top→bottom→top so lazy-loaded content renders
     before extraction (most long articles load below the fold) */
  function sweepPage(driver) {
    return driver.eval(
      "(function(){" +
      "var step=Math.floor(window.innerHeight*0.85),d=0;" +
      "var t=setInterval(function(){d+=step;if(d>=document.body.scrollHeight){clearInterval(t);window.scrollTo(0,0);}" +
      "else{window.scrollTo(0,d);}},140);" +
      "return true;})()"
    ).catch(function () {}).then(function () { return sleep(1300); });
  }

  /* ---------- driver: one fresh TAB on a cloud browser ---------- */
  var TAB_REUSE = false; /* tests flip this to skip real sockets + transport */

  function openDriver(session) {
    var wsUrl = session.cdp ||
      (session.base.replace(/^http/, "ws").replace(/\/browser\/kernel\/?$/, "/browser/cdp") +
        "?jwt=" + encodeURIComponent(session.jwt));
    var cdp = new Cdp(wsUrl);
    var tabId = null, attached = null;

    var driver = {
      session: session,
      /* open a FRESH tab for this run */
      start: function () {
        return cdp.send("Target.createTarget", { url: "about:blank" }).then(function (r) {
          tabId = r.targetId;
          return cdp.send("Target.attachToTarget", { targetId: tabId, flatten: true });
        }).then(function (r) {
          attached = r.sessionId;
          return cdp.send("Page.enable", {}, attached).then(function () {
            return cdp.send("Runtime.enable", {}, attached);
          });
        }).then(function () { return driver; });
      },
      send: function (m, p) { return cdp.send(m, p, attached); },
      goto: function (url) {
        return cdp.send("Page.navigate", { url: url }, attached).then(function (r) {
          if (r && r.errorText) throw new Error(r.errorText);
          return driver.settle();
        });
      },
      /* wait for the document to stop loading (best effort) */
      settle: function () {
        var t0 = Date.now();
        function poll() {
          return cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, attached)
            .then(function (r) {
              var s = r && r.result && r.result.value;
              if (s === "complete" || Date.now() - t0 > SETTLE_CAP_MS) return;
              return sleep(350).then(poll);
            }).catch(function () {});
        }
        return poll();
      },
      eval: function (expr) {
        return cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, attached)
          .then(function (r) {
            if (r && r.exceptionDetails) throw new Error("page error");
            return r && r.result ? r.result.value : undefined;
          });
      },
      title: function () { return driver.eval("document.title"); },
      text: function (sel) {
        return driver.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel || "body") + ");return e?e.innerText:'';})()") || "";
      },
      click: function (sel) {
        return driver.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + ");if(e){e.click();return true;}return false;})()");
      },
      type: function (sel, text) {
        return driver.eval("(function(){var e=document.querySelector(" + JSON.stringify(sel) + ");if(!e)return false;e.focus();e.value=" + JSON.stringify(text) + ";e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()");
      },
      press: function (key) {
        /* common keys → their Windows virtual keycodes (Enter=13, Tab=9, …);
           unknown keys fall back to Enter's so the gesture still fires */
        var VK = { Enter: 13, Tab: 9, Escape: 27, Esc: 27, Space: 32, Backspace: 8, Delete: 46, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageDown: 34, PageUp: 33 };
        var vk = VK[key] || 13;
        return cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: key, code: key === "Space" ? "Space" : key, windowsVirtualKeyCode: vk, text: key === "Enter" ? "\r" : undefined }, attached)
          .then(function () { return cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: key, code: key === "Space" ? "Space" : key, windowsVirtualKeyCode: vk }, attached); });
      },
      screenshot: function () {
        return cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 62 }, attached)
          .then(function (r) { return "data:image/jpeg;base64," + r.data; });
      },
      url: function () { return driver.eval("location.href"); },
      /* run over → kill the tab */
      close: function () {
        var p = (tabId ? cdp.send("Target.closeTarget", { targetId: tabId }).catch(function () {}) : Promise.resolve());
        return p.then(function () { cdp.close(); });
      },
    };
    return driver.start();
  }

  /* fresh browser via the relay — created and torn down per run.
     The relay forwards the Authorization header to Kernel, so every
     REST call MUST carry it (verified live: without it Kernel answers
     401 "Authentication token required"). */
  function openRelayDriver(onSession) {
    var auth = { "Authorization": "Bearer " + apiKey(), "Content-Type": "application/json" };
    function relayFetch(url, opts) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REST_TIMEOUT_MS) : null;
      opts = opts || {};
      opts.headers = auth;
      if (ctrl) opts.signal = ctrl.signal;
      return fetch(url, opts).then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          return r.text().catch(function () { return ""; }).then(function (t) {
            var err = new Error("relay " + r.status + (t ? ": " + t.slice(0, 120) : ""));
            err.status = r.status;
            throw err;
          });
        }
        return r.status === 204 ? null : r.json();
      }).catch(function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
    }
    return relayFetch(relayBase() + "/browsers", {
      method: "POST",
      body: JSON.stringify({ timeout_seconds: MAX_TIMEOUT_S, name: "neurobot-" + Math.random().toString(36).slice(2, 8) }),
    }).then(function (s) {
      var driverSeed = {
        base: s.base_url, jwt: (s.cdp_ws_url || "").split("jwt=")[1] || "",
        live: s.browser_live_view_url, sid: s.session_id, fresh: true,
        cdp: s.cdp_ws_url || "",
      };
      if (onSession) { try { onSession(s); } catch (e) {} }
      return openDriver(driverSeed).then(function (d) {
        d.close = (function (orig) {
          return function () {
            return orig().then(function () {
              /* best-effort delete; fire-and-forget so a dead relay can't hang the UI */
              try { fetch(relayBase() + "/browsers/" + d.session.sid, { method: "DELETE", headers: auth, keepalive: true }).catch(function () {}); } catch (e) {}
            });
          };
        })(d.close);
        return d;
      }).catch(function (err) {
        /* browser/WS failed after creation — don't leak the session */
        try { fetch(relayBase() + "/browsers/" + s.session_id, { method: "DELETE", headers: auth, keepalive: true }).catch(function () {}); } catch (e2) {}
        throw err;
      });
    });
  }

  /* ---------- managed mode: fresh browser per run, deleted on finish ----------
     1. MCP manage_browsers create with the max timeout → a brand-new Chromium.
     2. If the org's concurrent limit is hit → close the two OLDEST sessions
        (making room) and create fresh again; reuse an existing browser only
        as a last resort (a fresh TAB still isolates the run).
     3. The tab closes when the job settles; sessions WE created are then
        DELETED via MCP so nothing sits idle. */
  function acquireManaged(key, log) {
    function fresh() {
      return createSession(key).then(function (s) { s.__mine = true; return s; });
    }
    function reclaimAndRetry() {
      if (log) log("concurrent limit — closing idle sessions to make room", "warn");
      return listSessions(key).then(function (list) {
        if (!list.length) throw new Error("kernel limit reached and nothing to reclaim");
        var victims = list.slice(0, 2); /* oldest first — account caps at 5 */
        return Promise.all(victims.map(function (s) { return deleteSession(key, s.session_id); }))
          .then(function () { return sleep(500); })
          .then(fresh)
          .catch(function () {
            /* still capped → reuse the newest existing browser */
            if (log) log("reclaim failed — reusing the newest browser for this run", "warn");
            return listSessions(key).then(function (l2) {
              if (!l2.length) throw new Error("kernel limit reached and no existing browser to reuse");
              var s = l2[l2.length - 1];
              s.__mine = false;
              return s;
            });
          });
      });
    }
    return fresh().catch(function (e) {
      if (e && (e.limit || e.status === 409 || e.status === 429)) return reclaimAndRetry();
      throw e;
    });
  }

  function runManaged(job, log, onSession, attempt) {
    var key = apiKey();
    var started = Date.now();
    attempt = attempt || 1;
    return acquireManaged(key, log).then(function (session) {
      /* create payloads sometimes omit the CDP/live URLs — fetch them */
      var enrich = (session.cdp_ws_url && session.browser_live_view_url)
        ? Promise.resolve(session)
        : getSession(key, session.session_id).then(function (full) {
            if (full && full.cdp_ws_url) session = full;
            return session;
          }).catch(function () { return session; });
      return enrich.then(function (session) {
        currentLive = session.browser_live_view_url || currentLive;
        if (onSession) { try { onSession(session); } catch (e) {} }
        return openDriver({
          base: session.base_url,
          cdp: session.cdp_ws_url || "",
          jwt: (session.cdp_ws_url || "").split("jwt=")[1] || "",
          live: session.browser_live_view_url || "",
          sid: session.session_id,
        }).then(function (driver) {
          var finishTab = function () {
            return driver.close().then(function () {
              if (session.__mine) return deleteSession(key, session.session_id);
            });
          };
          return Promise.resolve().then(function () { return job(driver, log); }).then(
            function (out) { return finishTab().then(function () { return out; }); },
            function (err) { return finishTab().then(function () { throw err; }); }
          );
        })
        /* a fresh session can briefly 404/race at the WS layer ("Session not
           found") — ONE retry with a brand-new session, transparently */
        .catch(function (err) {
          if (attempt < 2 && session.__mine) {
            if (log) log("browser session vanished (" + (err && err.message || "error") + ") — spinning up a new one", "warn");
            /* the vanished session may still be registered server-side — clean it up */
            return deleteSession(key, session.session_id).then(function () {
              return sleep(400).then(function () { return runManaged(job, log, onSession, attempt + 1); });
            });
          }
          /* no more retries — OUR session must never sit idle */
          if (session.__mine) deleteSession(key, session.session_id);
          throw err;
        });
      });
    }).then(function (out) {
      log("browser session closed (" + Math.round((Date.now() - started) / 1000) + "s)", "ok");
      return out;
    }, function (err) {
      log("browser session closed after error", "err");
      throw err;
    });
  }

  /* ---------- public surface ---------- */
  NB.kernelMode = function () {
    if (TAB_REUSE) return "test";
    if (TEST_MODE) return "demo-browser";
    if (relayBase()) return "fresh-browser";
    if (apiKey()) return "managed";
    return "off";
  };

  /* Can cloud-browser runs start in THIS browser? True when a relay is set
     (the built-in default makes this true out of the box — verified live).
     TEST/TAB_REUSE modes report usable so tests exercise the driver. */
  NB.kernelUsable = function () {
    if (TAB_REUSE || TEST_MODE) return true;
    return !!(relayBase() && relayBase().length);
  };



  /* Live-view URL of the most recent cloud browser (for embedding). */
  NB.kernelLiveUrl = function () {
    if (TAB_REUSE) return "https://demo.kernel.test/browser/live/demo";
    if (TEST_MODE) return "https://demo.kernel.test/browser/live/demo";
    return currentLive;
  };

  NB.kernelAgent = {
    /* can the agent drive a cloud browser right now? */
    available: function () { return "WebSocket" in window && typeof fetch !== "undefined"; },

    /* Verify the Kernel MCP endpoint actually answers for our key.
       Cached for 5 minutes so UI paths can call it freely. */
    ready: function () {
      if (TAB_REUSE || TEST_MODE) return Promise.resolve(true);
      if (!NB.kernelAgent.available()) return Promise.resolve(false);
      var now = Date.now();
      if (readyPromise && now - readyAt < 300000) return readyPromise;
      readyAt = now;
      /* relay first (the built-in default makes this the live path);
         MCP list is the no-relay fallback probe */
      readyPromise = (relayBase() ? probeRelay() : mcpBrowsers({ action: "list" }).then(function () { return true; }))
        .then(function (ok) { readyError = ""; readyIsCors = false; return ok; })
        .catch(function (e) {
          /* one transparent retry with a fresh probe before giving up —
             guards against a cold worker or a stale MCP session id */
          readyPromise = null; readyAt = 0;
          mcpSession = ""; mcpReadyPromise = null;
          return sleep(450).then(function () {
            return relayBase() ? probeRelay() : mcpBrowsers({ action: "list" }).then(function () { return true; });
          }).then(function () { readyError = ""; readyIsCors = false; return true; }).catch(function (e2) {
            readyError = (e2 && e2.message) || (e && e.message) || "unreachable";
            readyIsCors = !!(e2 && e2.cors) || !!(e && e.cors);
            return false;
          });
        });
      return readyPromise;
    },

    /* Run `job(driver, log)` on a cloud browser. ALWAYS closes the per-run
       tab and DELETES fresh sessions when the job settles — success,
       error, or timeout. `onSession(session)` fires as soon as the browser
       exists so the UI can embed its live view. */
    run: function (job, log, onSession) {
      log = log || function () {};
      if (TAB_REUSE || TEST_MODE) {
        var started = Date.now();
        return openDriver({ base: "https://demo.kernel.test/browser/kernel", jwt: "demo", live: "https://demo.kernel.test/browser/live/demo" })
          .then(function (driver) {
            if (onSession) { try { onSession({ browser_live_view_url: driver.session.live }); } catch (e) {} }
            return Promise.resolve().then(function () { return job(driver, log); }).then(
              function (out) { return driver.close().then(function () { return out; }); },
              function (err) { return driver.close().then(function () { throw err; }); }
            );
          }).then(function (out) {
            log("browser session closed (" + Math.round((Date.now() - started) / 1000) + "s)", "ok");
            return out;
          }, function (err) {
            log("browser session closed after error", "err");
            throw err;
          });
      }
      if (relayBase()) {
        var relayStarted = Date.now();
        return openRelayDriver(onSession).then(function (driver) {
          return Promise.resolve().then(function () { return job(driver, log); }).then(
            function (out) { return driver.close().then(function () { return out; }); },
            function (err) { return driver.close().then(function () { throw err; }); }
          );
        }).then(function (out) {
          log("browser session closed (" + Math.round((Date.now() - relayStarted) / 1000) + "s)", "ok");
          return out;
        }, function (err) {
          log("browser session closed after error", "err");
          throw err;
        });
      }
      return runManaged(job, log, onSession);
    },

    /* convenience: real web search inside the cloud browser */
    searchWeb: function (query, log) {
      return NB.kernelAgent.run(function (d, log2) {
        return d.goto("https://duckduckgo.com/?q=" + encodeURIComponent(query)).then(function () {
          return sleep(700);
        }).then(function () { return d.text("#links"); }).then(function (t) {
          return String(t || "").replace(/\s+/g, " ").trim().slice(0, 1200);
        });
      }, log);
    },

    /* read a URL through the cloud browser — rich extraction + lazy-load
       sweep; resolves { title, url, text }. Used by agentBrowse/Live. */
    readPage: function (url, log) {
      return NB.kernelAgent.run(function (d, log2) {
        return d.goto(url).then(function () { return sleep(500); })
          .then(function () { return sweepPage(d); })
          .then(function () { return extractPageText(d, 3600); })
          .then(function (p) {
            if (!p || !String(p.text || "").trim()) throw new Error("empty page");
            return p;
          });
      }, log);
    },
  };

  /* Settings hooks */
  NB.getKernelKey = function () { return lsGet(KEY_LS); };
  NB.setKernelKey = function (v) {
    try { if (v) localStorage.setItem(KEY_LS, String(v).trim()); else localStorage.removeItem(KEY_LS); } catch (e) {}
    readyPromise = null; readyAt = 0; /* re-probe with the new key */
    mcpSession = ""; mcpReadyPromise = null; /* new key → new MCP handshake */
  };
  /* effective relay (stored override or built-in) — Settings prefills this */
  NB.getKernelRelay = function () { return String(lsGet(RELAY_LS) || BUILTIN_RELAY).trim(); };
  NB.setKernelRelay = function (v) {
    try { if (v) localStorage.setItem(RELAY_LS, String(v).trim().replace(/\/+$/, "")); else localStorage.removeItem(RELAY_LS); } catch (e) {}
  };
  NB.kernelEnv = function () {
    var custom = !!lsGet(KEY_LS);
    var customRelay = !!lsGet(RELAY_LS);
    return { mode: NB.kernelMode(), key: custom ? "custom" : "built-in", relay: relayBase(), relayCustom: customRelay, transport: relayBase() ? "relay" : "mcp" };
  };

  /* last probe failure, for the Settings diagnostic */
  var readyError = "", readyIsCors = false;
  NB.kernelProbeError = function () { return readyError; };
  /* true when the probe failed because the browser blocked the call
     (CORS) — the UI uses this to point at the relay instead of
     suggesting the user "check their connection" */
  NB.kernelProbeBlocked = function () { return readyIsCors; };

  /* tests */
  var readyPromise = null, readyAt = 0;
  NB.__kernelInternals = { Cdp: Cdp, openDriver: openDriver, setTabReuse: function (v) { TAB_REUSE = v; }, API: API, MCP_URL: MCP_URL, MAX_TIMEOUT_S: MAX_TIMEOUT_S, extractPageText: extractPageText, sweepPage: sweepPage };
})();
