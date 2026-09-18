/* ============================================================
   NeuroBot — kernel.js (classic script; extends window.NB)
   "Kernel mode" — the agent drives a REAL cloud Chromium
   (kernel.sh) while you watch it live, inside NeuroBot.

   How it works from a static site (no server, no key setup):
   • Kernel's REST API blocks browser CORS, BUT the browser's
     CDP WebSocket accepts any Origin — and WebSockets aren't
     subject to CORS at all. So everything after "connect"
     happens straight from your page, no relay needed.
   • The built-in demo browser (owned by NeuroBot's key) runs
     with the MAXIMUM idle timeout (72h). Every agent run gets
     a FRESH TAB (about:blank) and the tab is CLOSED the moment
     the run finishes — nothing of your session lingers; the
     browser itself goes to standby automatically.
   • If you deploy the optional kernel relay (see HANDOFF.md)
     and paste its URL in Settings, every run spins a brand-new
     browser instead and DELETES it when done.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  /* ---------- built-in demo browser (rotatable by the owner) ----------
     JWT is scoped to THIS session only and lives for ~1 year.
     If it ever goes stale, the owner re-creates a session with:
       curl -X POST https://api.onkernel.com/browsers \
         -H "Authorization: Bearer $KERNEL_KEY" \
         -d '{"timeout_seconds": 259200}'
     and pastes the 4 values below. */
  var DEMO = {
    sid: "rkn6w70gate2f12t8vmoql9i",
    base: "https://proxy.jfk-peaceful-ramanujan.onkernel.com:8443/browser/kernel",
    live: "https://proxy.jfk-peaceful-ramanujan.onkernel.com:8443/browser/live/nIlZgjwqEuH0",
    jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE4MjEyNjM3ODMsInNlc3Npb24iOnsiaWQiOiJya242dzcwZ2F0ZTJmMTJ0OHZtb3FsOWkiLCJjZHBQb3J0Ijo5MjIyLCJjZHBXc1BhdGgiOiIiLCJpbnN0YW5jZU5hbWUiOiJicm93c2VyLXByb3h5djMtcHJvZHVjdGlvbi1hYTk2Zm8wcHNycnkwajN5M2puMGhrNGt2emowY3dvbGFwaDQiLCJpbnN0YW5jZVV1aWQiOiI2YzRkYjUzZi0wMjViLTRjY2YtYTY3Yy1kNTYwY2MwZGJjOWEiLCJmcWRuIjoiZGFtcC1zaWxlbmNlLWYzNTdsdTV5LnByb2QtamZrLXVuaWtyYWZ0LTExLm9ua2VybmVsLmFwcCIsIm1ldHJvIjoiaHR0cHM6Ly9hcGkucHJvZC1qZmstdW5pa3JhZnQtMTEub25rZXJuZWwucnVuL3YxIiwidXNlcklkIjoibzB3ZmplOTRhOWtyamZ3YzRwcWxlcXpnIiwib3JnSWQiOiJhNDM4dmR0MmJwN2ZsYmllMndiNXgyNzgiLCJzdGVhbHRoIjpmYWxzZSwiaGVhZGxlc3MiOmZhbHNlLCJrZXJuZWxIdHRwU2VydmVyUG9ydCI6NDQ0LCJ0aW1lb3V0U2Vjb25kcyI6MjU5MjAwLCJjcmVhdGVkQXQiOiIyMDI2LTA5LTE4VDEwOjM2OjIzLjMzNjE2MzUyOFoiLCJpbWFnZSI6Im9ua2VybmVsL2tlcm5lbC1jdS12Njk6NjM3NjE2ZmEiLCJsaXZlU2x1ZyI6Im5JbFpnandxRXVIMCIsInByaXZhdGVJUCI6IjE3Mi4xNi4xLjIxMyIsIm1lbW9yeSI6IjhHaUIiLCJyZWdpb24iOiJ1cy1lYXN0In19.Q9l6UO_mVK8nKOJhJD4qUR3pStVhpUQutVDJdHEs-WI",
  };
  var RELAY_LS = "nb_kernel_relay";
  var MAX_TIMEOUT_S = 259200; /* 72h — kernel's max idle timeout */

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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
        }, 25000);
      });
    });
  };
  Cdp.prototype.onEvent = function (h) { this.evHandlers.push(h); };
  Cdp.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

  /* ---------- session acquisition ----------
     relay deployed → fresh browser per run (created + deleted per run)
     otherwise    → built-in demo browser, fresh TAB per run          */
  function relayBase() { return String(lsGet(RELAY_LS) || NB.getKernelRelay && NB.getKernelRelay() || "").trim(); }

  function createViaRelay() {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
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
    });
  }
  function deleteViaRelay(sid) {
    try { fetch(relayBase() + "/browsers/" + sid, { method: "DELETE" }); } catch (e) {}
  }

  /* ---------- one agent run on a cloud browser ----------
     Returns a driver: goto/click/type/text/screenshot/press/close. */
  var TAB_REUSE = false; /* tests flip this to skip real sockets */

  function openDriver(session) {
    /* CDP lives at <host>/browser/cdp — the REST base is <host>/browser/kernel */
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
      /* wait for the document to stop loading (best effort, 8s cap) */
      settle: function () {
        var t0 = Date.now();
        function poll() {
          return cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, attached)
            .then(function (r) {
              var s = r && r.result && r.result.value;
              if (s === "complete" || Date.now() - t0 > 8000) return;
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
      /* run over → kill the tab. The cloud browser goes to standby on its own. */
      close: function () {
        var p = (tabId ? cdp.send("Target.closeTarget", { targetId: tabId }).catch(function () {}) : Promise.resolve());
        return p.then(function () { cdp.close(); });
      },
    };
    return driver.start();
  }

  /* fresh browser via relay — created and torn down per run */
  function openRelayDriver() {
    return createViaRelay().then(function (s) {
      return openDriver({
        base: s.base_url, jwt: (s.cdp_ws_url || "").split("jwt=")[1] || "",
        live: s.browser_live_view_url, sid: s.session_id, fresh: true,
      }).then(function (d) {
        d.close = (function (orig) {
          return function () { return orig().then(function () { deleteViaRelay(d.session.sid); }); };
        })(d.close);
        return d;
      });
    });
  }

  /* ---------- public surface ---------- */
  NB.kernelMode = function () {
    if (TAB_REUSE) return "test";
    if (relayBase()) return "fresh-browser";
    return "demo-browser";
  };
  NB.kernelLiveUrl = function () {
    return relayBase() ? "" : DEMO.live;
  };
  NB.kernelAgent = {
    /* can the agent drive a cloud browser right now? */
    available: function () { return "WebSocket" in window; },

    /* Run `job(driver, log)` on a cloud browser. ALWAYS closes the
       per-run tab when the job settles — success, error, or timeout. */
    run: function (job, log) {
      log = log || function () {};
      var useRelay = !!relayBase();
      var started = Date.now();
      var open = useRelay ? openRelayDriver() : openDriver({ base: DEMO.base, jwt: DEMO.jwt, live: DEMO.live, sid: DEMO.sid });
      return open.then(function (driver) {
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
    },

    /* convenience: real Google-style search inside the cloud browser */
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

  /* Settings hook: optional relay URL for true fresh-browser-per-run */
  NB.getKernelRelay = function () { return lsGet(RELAY_LS); };
  NB.setKernelRelay = function (v) {
    try { if (v) localStorage.setItem(RELAY_LS, String(v).trim()); else localStorage.removeItem(RELAY_LS); } catch (e) {}
  };

  /* tests */
  NB.__kernelInternals = { Cdp: Cdp, openDriver: openDriver, DEMO: DEMO, setTabReuse: function (v) { TAB_REUSE = v; } };
})();
