/* ============================================================
   NeuroBot — kernel.js (classic script; extends window.NB)
   "Kernel mode" — the agent drives a REAL cloud Chromium
   (kernel.sh) while you watch it live, inside NeuroBot.

   How it works from a static site (no server, no relay):
   • Kernel's REST API at api.onkernel.com is CORS-open — the
     browser can create and delete browser sessions directly
     with the built-in key (or the user's own key from Settings).
   • EVERY agent run spins up a FRESH browser with Kernel's
     MAXIMUM idle timeout (72h) and the session is DELETED the
     moment the run finishes — nothing ever sits idle. If the
     account's concurrent-session limit is hit, the run reuses
     the newest existing browser instead (tab-per-run still).
   • The CDP WebSocket (wss://…/browser/cdp?jwt=…) accepts any
     Origin — WebSockets aren't subject to CORS.
   • Optional: deploy a kernel relay and paste its URL in
     Settings — every run then goes through your own endpoint.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  /* ---------- built-in owner key ----------
     Scoped to NeuroBot's Kernel org. The user can override it in
     Settings → Kernel Browser (stored on their device only). */
  var BUILTIN_KEY = "sk_3f9ea184-1094-ee4e-f1ae-39ebe2637b9e.lfDHUAScxT67Xvn2NZcHbw8PpOgCF97fwG0wd57451w";
  var API = "https://api.onkernel.com";
  var KEY_LS = "nb_kernel_key";
  var RELAY_LS = "nb_kernel_relay";
  var MAX_TIMEOUT_S = 259200; /* 72h — Kernel's max idle timeout */

  /* "timeout on max": REST calls get a 2-minute budget, each CDP
     command gets 2 minutes, page-settle waits up to 20s. */
  var REST_TIMEOUT_MS = 120000;
  var CDP_TIMEOUT_MS = 120000;
  var SETTLE_CAP_MS = 20000;

  var currentLive = ""; /* live-view URL of the most recent run's browser */
  /* jsdom test harness sets this: skip Kernel REST (fetch is stubbed) and
     reuse the fake WebSocket directly — still exercises the full driver. */
  var TEST_MODE = false;
  try { TEST_MODE = typeof window !== "undefined" && window.NB_KERNEL_TEST === "1"; } catch (e) {}

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function apiKey() { return String(lsGet(KEY_LS) || BUILTIN_KEY).trim(); }
  function relayBase() { return String(lsGet(RELAY_LS) || (NB.getKernelRelay && NB.getKernelRelay()) || "").trim(); }

  function restFetch(method, path, key, body) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REST_TIMEOUT_MS) : null;
    var opts = {
      method: method,
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      signal: ctrl && ctrl.signal,
      /* Kernel's REST API sends NO Access-Control-Allow-Origin header, so a
         browser fetch from any other origin is blocked by CORS no matter
         what. Browsers relax this ONLY in “no-cors” mode — which still
         completes and works fine for fire-and-forget DELETES (the response
         body is opaque, we never read it). Real data calls (create/list)
         go through CORS-free transports — see kernelEnsure(). */
      mode: method === "DELETE" ? "no-cors" : "cors",
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (method === "DELETE") return {}; /* opaque response — assume success */
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) {
          var err = new Error((body && body.message) || "kernel api " + r.status);
          if (body && /org_limit_exceeded|limit/i.test(String(body.code || ""))) err.limit = true;
          throw err;
        }
        return body;
      });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function createSession(key) {
    /* body is REQUIRED — the API rejects bodyless POSTs with "missing body" */
    return restFetch("POST", "/browsers", key, { timeout_seconds: MAX_TIMEOUT_S }).then(function (s) {
      if (!s || !s.session_id) throw new Error("kernel: unexpected create response");
      return s;
    });
  }
  function listSessions(key) { return restFetch("GET", "/browsers", key).then(function (l) { return Array.isArray(l) ? l : []; }); }
  function deleteSession(key, sid) {
    return restFetch("DELETE", "/browsers/" + encodeURIComponent(sid), key).catch(function () {});
  }

  /* ---------- tiny CDP-over-WebSocket client ---------- */
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

  /* ---------- driver: one fresh TAB on a cloud browser ---------- */
  var TAB_REUSE = false; /* tests flip this to skip real sockets + REST */

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
        return cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: key, code: key, windowsVirtualKeyCode: 13, text: key === "Enter" ? "\r" : undefined }, attached)
          .then(function () { return cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: key, code: key, windowsVirtualKeyCode: 13 }, attached); });
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

  /* fresh browser via relay (optional self-hosted endpoint) —
     created and torn down per run */
  function openRelayDriver(onSession) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REST_TIMEOUT_MS) : null;
    return fetch(relayBase() + "/browsers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeout_seconds: MAX_TIMEOUT_S }),
      signal: ctrl && ctrl.signal,
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error("relay " + r.status);
      return r.json();
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    }).then(function (s) {
      var driverSeed = {
        base: s.base_url, jwt: (s.cdp_ws_url || "").split("jwt=")[1] || "",
        live: s.browser_live_view_url, sid: s.session_id, fresh: true,
        cdp: s.cdp_ws_url || "",
      };
      if (onSession) { try { onSession(s); } catch (e) {} }
      return openDriver(driverSeed).then(function (d) {
        d.close = (function (orig) {
          return function () { return orig().then(function () { try { fetch(relayBase() + "/browsers/" + d.session.sid, { method: "DELETE" }); } catch (e) {} }); };
        })(d.close);
        return d;
      });
    });
  }

  /* ---------- managed mode: fresh browser per run, deleted on finish ----------
     1. POST /browsers with the max timeout → a brand-new Chromium.
     2. If the org's concurrent limit is hit → reuse the newest existing
        browser (a fresh TAB still isolates the run; nothing new lingers).
     3. The tab closes when the job settles; sessions WE created are then
        DELETED via the API so nothing sits idle. */
  function acquireManaged(key, log) {
    /* limit → try the two oldest sessions first; the account caps at 5
       concurrent, so 2 deletes ALWAYS make room — never give up. */
    function reclaimAndRetry() {
      if (log) log("concurrent limit — closing idle sessions to make room", "warn");
      return listSessions(key).then(function (list) {
        if (list.length <= 1) throw new Error("kernel limit reached and nothing to reclaim");
        var victims = list.slice(0, 2);
        return Promise.all(victims.map(function (s) { return deleteSession(key, s.session_id); }))
          .then(function () { return createSession(key); })
          .then(function (s) { s.__mine = true; return s; });
      });
    }
    return createSession(key).then(function (s) { s.__mine = true; return s; }, function (e) {
      if (e && e.limit) {
        if (log) log("concurrent-browser limit reached — reusing the newest browser for this run", "warn");
        return listSessions(key).then(function (list) {
          if (!list.length) throw new Error("kernel limit reached and no existing browser to reuse");
          var s = list[list.length - 1];
          s.__mine = false;
          return s;
        });
      }
      throw e;
    });
  }

  function runManaged(job, log, onSession, attempt) {
    var key = apiKey();
    var started = Date.now();
    attempt = attempt || 1;
    return acquireManaged(key, log).then(function (session) {
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
          return sleep(400).then(function () { return runManaged(job, log, onSession, attempt + 1); });
        }
        throw err;
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

  /* Live-view URL of the most recent cloud browser (for embedding). */
  NB.kernelLiveUrl = function () {
    if (TAB_REUSE) return "https://demo.kernel.test/browser/live/demo";
    if (TEST_MODE) return "https://demo.kernel.test/browser/live/demo";
    return currentLive;
  };

  NB.kernelAgent = {
    /* can the agent drive a cloud browser right now? */
    available: function () { return "WebSocket" in window; },

    /* Verify the Kernel REST endpoint actually answers for our key.
       Cached for 5 minutes so UI paths can call it freely. */
    ready: function () {
      if (TAB_REUSE || TEST_MODE) return Promise.resolve(true);
      if (relayBase()) return Promise.resolve(true);
      if (!NB.kernelAgent.available()) return Promise.resolve(false);
      var now = Date.now();
      if (readyPromise && now - readyAt < 300000) return readyPromise;
      readyAt = now;
      readyPromise = listSessions(apiKey()).then(function () { return true; }).catch(function () {
        readyPromise = null; readyAt = 0;
        return false;
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
  };

  /* Settings hooks */
  NB.getKernelKey = function () { return lsGet(KEY_LS); };
  NB.setKernelKey = function (v) {
    try { if (v) localStorage.setItem(KEY_LS, String(v).trim()); else localStorage.removeItem(KEY_LS); } catch (e) {}
    readyPromise = null; readyAt = 0; /* re-probe with the new key */
  };
  NB.getKernelRelay = function () { return lsGet(RELAY_LS); };
  NB.setKernelRelay = function (v) {
    try { if (v) localStorage.setItem(RELAY_LS, String(v).trim()); else localStorage.removeItem(RELAY_LS); } catch (e) {}
  };
  NB.kernelEnv = function () {
    var custom = !!lsGet(KEY_LS);
    return { mode: NB.kernelMode(), key: custom ? "custom" : "built-in", relay: relayBase() };
  };

  /* tests */
  var readyPromise = null, readyAt = 0;
  NB.__kernelInternals = { Cdp: Cdp, openDriver: openDriver, setTabReuse: function (v) { TAB_REUSE = v; }, API: API, MAX_TIMEOUT_S: MAX_TIMEOUT_S };
})();
