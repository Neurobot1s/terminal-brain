/* ============================================================
   NeuroBot — ai.js (classic script; extends window.NB)
   AI backend: NVIDIA only, ZERO SETUP.

   A built-in NVIDIA key is embedded below (owner-provided), so
   AI works out of the box. Users can still paste their own free
   nvapi- key from build.nvidia.com in Settings to use their own
   quota — the override is stored only in this browser.

   ROUTING (first that answers wins, and is remembered):
     1. your own relay, if deployed (nvidia-relay.js) — optional
     2. NVCF direct: api.nvcf.nvidia.com — NVIDIA's function
        endpoint. UNLIKE integrate.api.nvidia.com it reflects any
        Origin in CORS, so browsers can call it straight from
        GitHub Pages. Function ids/versions are refreshed from
        NVIDIA's own discovery API at runtime (self-healing) with
        a hardcoded snapshot as fallback.
     3. integrate.api.nvidia.com direct (works where NVIDIA's
        CORS allowlist applies, e.g. build.nvidia.com)

   Resilience: transient retries with backoff · walks to the
   next model on 4xx/5xx · reasoning tokens stay out of answers ·
   markdown stripped to plain text · route/model prefs persist.
   ============================================================ */
(function () {
  "use strict";
  if (!window.NB) return;

  var KEY_STORE = "nb_ai_key";      /* user key override (nvapi-…) */
  var MODEL_STORE = "nb_ai_model";  /* preferred model (function name) */
  var RELAY_STORE = "nb_ai_relay";  /* custom relay base URL */
  var ROUTE_STORE = "nb_ai_route";  /* remembered winning route name */
  var FN_CACHE = "nb_ai_fns";       /* cached NVCF function map (12h) */

  /* Owner-provided NVIDIA key, embedded at build time so AI works
     with no setup. Free keys: build.nvidia.com */
  var BUILTIN_KEY = "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";

  /* NVIDIA-hosted models served through NVIDIA's CORS-open NVCF
     endpoint. fn = NVCF function name · slug = integrate.api slug.
     id/ver = verified snapshot (2026-09-17); refreshed at runtime. */
  var MODELS = [
    { fn: "ai-gpt-oss-20b",                   slug: "openai/gpt-oss-20b",                 label: "NVIDIA GPT-OSS 20B (fast)",
      id: "24d90582-d41c-4fc6-adc0-53c97f5a710f", ver: "4eaf8010-614e-4f95-ae24-1e2834a63e60" },
    { fn: "ai-llama-3_2-11b-vision-instruct", slug: "meta/llama-3.2-11b-vision-instruct", label: "NVIDIA Llama 3.2 11B (balanced)",
      id: "9fa6fd04-ba2c-4bb3-90b7-ede407a9290f", ver: "86ee1e94-e54f-4767-a9ef-9731dda68a6a" },
    { fn: "ai-llama-3_2-90b-vision-instruct", slug: "meta/llama-3.2-90b-vision-instruct", label: "NVIDIA Llama 3.2 90B (deep)",
      id: "24e0c62b-f7d0-44ba-8012-012c2a1aaf31", ver: "1fcb4d28-f57f-4585-b11c-ae5eb6b8f464" },
  ];

  var NVCF_BASE = "https://api.nvcf.nvidia.com/v2/nvcf";
  var INTEGRATE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
  var ASK_LIMIT = 100;

  var isFile = location.protocol === "file:";
  var callCount = 0, lastError = "", lastModel = "", lastRoute = "";
  var fnListPromise = null; /* shared in-flight discovery */

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* session-only */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- key handling (built-in by default, user overridable) ---------- */
  function userKey() { return lsGet(KEY_STORE); }
  function effectiveKey() { return userKey() || BUILTIN_KEY; }

  NB.getAIKey = effectiveKey;
  NB.setAIKey = function (k) {
    k = String(k || "").trim();
    if (k) lsSet(KEY_STORE, k); else lsDel(KEY_STORE);
    callCount = 0; lastError = "";
    return true;
  };
  NB.hasCustomKey = function () { return !!userKey(); };

  /* ---------- model preference ---------- */
  NB.AI_MODELS = MODELS.map(function (m) { return m.fn; });
  NB.getAIModel = function () {
    var m = lsGet(MODEL_STORE);
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].fn === m) return m;
    return MODELS[0].fn;
  };
  NB.setAIModel = function (m) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].fn === m) { lsSet(MODEL_STORE, m); return true; }
    return false;
  };
  NB.aiModelLabel = function (fn) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].fn === fn) return MODELS[i].label;
    return String(fn || "");
  };

  /* ---------- custom relay (optional; nvidia-relay.js worker) ---------- */
  NB.getAIRelay = function () { return lsGet(RELAY_STORE).replace(/\/+$/, ""); };
  NB.setAIRelay = function (u) {
    u = String(u || "").trim().replace(/\/+$/, "");
    if (u && !/^https?:\/\//i.test(u)) return false;
    if (u) lsSet(RELAY_STORE, u); else lsDel(RELAY_STORE);
    lsDel(ROUTE_STORE); /* forget the old winning route — new relay first */
    lastRoute = "";
    return true;
  };

  NB.aiStatus = function () {
    return { calls: callCount, lastError: lastError, transport: "nvidia", route: lastRoute, model: lastModel, env: NB.aiEnv() };
  };
  NB.aiEnv = function () {
    return {
      protocol: location.protocol,
      file: isFile,
      relay: NB.getAIRelay() || "(auto)",
      route: lastRoute || "(not tried yet)",
      key: userKey() ? "custom" : "built-in",
      model: NB.getAIModel(),
    };
  };

  /* ---------- brain context ---------- */
  /* ============================================================
     AGENT LAYER — the AI can now operate the brain itself.
     The model replies with optional ACTION lines (JSON ops) followed
     by SAID (the user-facing reply). Ops are applied locally to the
     store, then a second model pass writes the final summary.
     ============================================================ */
  var KIND_KEYS = { note: "notes", notes: "notes", idea: "ideas", ideas: "ideas", goal: "goals", goals: "goals", knowledge: "knowledge" };

  function validCat(c) { return NB.CATEGORIES.indexOf(c) !== -1 ? c : null; }
  function validTopic(t) { return NB.TOPICS.indexOf(t) !== -1 ? t : null; }
  function validIdeaStatus(s) { var ok = ["New", "Exploring", "Building", "Completed"]; return ok.indexOf(s) !== -1 ? s : null; }
  function validGoalStatus(s) { var ok = ["active", "paused", "completed"]; return ok.indexOf(s) !== -1 ? s : null; }

  function findItem(kindKey, match) {
    var list = NB.getStore()[kindKey] || [];
    var m = String(match || "").toLowerCase().trim();
    if (!m) return null;
    var exact = list.filter(function (x) { return String(x.title || "").toLowerCase().trim() === m; });
    if (exact.length) return exact[0];
    var part = list.filter(function (x) { return String(x.title || "").toLowerCase().indexOf(m) !== -1; });
    return part.length ? part[0] : null;
  }

  /* Apply parsed agent ops. Returns human-readable result lines. */
  function applyOps(ops) {
    var results = [];
    ops.slice(0, 5).forEach(function (op) {
      try {
        if (!op || typeof op !== "object" || !op.op) return;
        var kind = KIND_KEYS[String(op.kind || op.type || "").toLowerCase()] ||
          KIND_KEYS[String(op.op || "").replace(/^add_/, "").toLowerCase()]; /* add_idea → ideas */
        var title = String(op.title || op.match || "").trim();
        /* add_note/add_idea/… carry the kind in the op name — the branches
           below default it; only a bare "add" with no kind is dropped */
        if (!kind && op.op === "add") { results.push("add needs a kind (note/idea/goal/knowledge)"); return; }
        if (op.op === "add" || /^add_(note|idea|goal|knowledge)$/.test(op.op)) {
          if (!kind) kind = "notes";
          var t = String(op.title || "").trim() || String(op.body || op.text || op.content || "").trim().slice(0, 60);
          if (!t || t.length < 2) { results.push("skipped an unnamed item"); return; }
          var d = { title: t.slice(0, 120), body: String(op.body || op.text || op.content || "").trim() };
          if (kind === "notes") { d.category = validCat(op.category) || "General"; NB.addNote(d); }
          else if (kind === "ideas") { d.category = validCat(op.category) || "General"; d.status = validIdeaStatus(op.status) || "New"; NB.addIdea(d); }
          else if (kind === "goals") { d.progress = Math.max(0, Math.min(100, parseInt(op.progress, 10) || 0)); d.status = validGoalStatus(op.status) || "active"; if (/^\d{4}-\d{2}-\d{2}$/.test(String(op.deadline || ""))) d.deadline = String(op.deadline); NB.addGoal(d); }
          else { d.topic = validTopic(op.topic) || "AI"; d.source = String(op.source || "").slice(0, 80); NB.addKnowledge(d); }
          results.push("added " + kind.slice(0, -1) + " \u201c" + d.title + "\u201d");
        } else if (op.op === "update" || op.op === "update_note" || op.op === "update_idea" || op.op === "update_goal" || op.op === "update_knowledge") {
          if (!kind) kind = "notes";
          var item = findItem(kind, op.match || op.title);
          if (!item) { results.push("couldn\u2019t find " + kind.slice(0, -1) + " \u201c" + (op.match || op.title) + "\u201d"); return; }
          var patch = {};
          if (op.newTitle || op.title) patch.title = String(op.newTitle || op.title).slice(0, 120);
          if (op.body != null && op.body !== "") patch.body = String(op.body);
          if (op.category && validCat(op.category)) patch.category = op.category;
          if (op.topic && validTopic(op.topic)) patch.topic = op.topic;
          if (op.status) { if (kind === "ideas" && validIdeaStatus(op.status)) patch.status = op.status; if (kind === "goals" && validGoalStatus(op.status)) patch.status = op.status; }
          if (op.progress != null) patch.progress = Math.max(0, Math.min(100, parseInt(op.progress, 10) || 0));
          if (/^\d{4}-\d{2}-\d{2}$/.test(String(op.deadline || ""))) patch.deadline = String(op.deadline);
          if (op.source != null) patch.source = String(op.source).slice(0, 80);
          if (!Object.keys(patch).length) { results.push("nothing to change on \u201c" + item.title + "\u201d"); return; }
          ({ notes: NB.updateNote, ideas: NB.updateIdea, goals: NB.updateGoal, knowledge: NB.updateKnowledge })[kind](item.id, patch);
          results.push("updated " + kind.slice(0, -1) + " \u201c" + item.title + "\u201d");
        } else if (op.op === "delete" || op.op === "remove" || op.op === "delete_note" || op.op === "delete_idea" || op.op === "delete_goal" || op.op === "delete_knowledge") {
          if (!kind) kind = "notes";
          var victim = findItem(kind, op.match || op.title);
          if (!victim) { results.push("couldn\u2019t find " + kind.slice(0, -1) + " \u201c" + (op.match || op.title) + "\u201d"); return; }
          ({ notes: NB.removeNote, ideas: NB.removeIdea, goals: NB.removeGoal, knowledge: NB.removeKnowledge })[kind](victim.id);
          results.push("deleted " + kind.slice(0, -1) + " \u201c" + victim.title + "\u201d");
        } else if (op.op === "pin" || op.op === "unpin" || op.op === "toggle_pin") {
          if (!kind) { results.push("pin needs a kind (note/idea/goal/knowledge)"); return; }
          var target = findItem(kind, op.match || op.title);
          if (!target) { results.push("couldn\u2019t find " + kind.slice(0, -1) + " \u201c" + (op.match || op.title) + "\u201d"); return; }
          NB.togglePin(kind.slice(0, -1) === "knowledge" ? "knowledge" : kind.slice(0, -1), target.id);
          results.push((target.pinned ? "unpinned" : "pinned") + " \u201c" + target.title + "\u201d");
        } else {
          results.push("skipped unknown op " + op.op);
        }
      } catch (e) { results.push("one action failed"); }
    });
    return results;
  }

  /* Parse the model's reply for ACTION blocks + SAID.
     Models often put several ops (or ACTION + SAID) on ONE line, so
     this scans for ACTION followed by a balanced {...} anywhere in the
     text instead of trusting line breaks. */
  function parseAgentReply(text) {
    var s = String(text || ""), ops = [];
    var re = /ACTION\s*\{/gi, blocks = [];
    var m;
    while ((m = re.exec(s)) !== null) {
      var start = s.indexOf("{", m.index), depth = 0, end = -1;
      for (var i = start; i < s.length; i++) {
        if (s.charAt(i) === "{") depth++;
        else if (s.charAt(i) === "}") { depth--; if (!depth) { end = i; break; } }
      }
      if (end === -1) break;
      blocks.push(s.slice(start, end + 1));
      re.lastIndex = end + 1;
    }
    blocks.forEach(function (b) {
      try { ops.push(JSON.parse(b)); } catch (e) {
        try { ops.push(JSON.parse(b.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"))); } catch (e2) {}
      }
    });
    /* strip ACTION blocks, then keep whatever follows the last SAID: */
    var residual = s;
    blocks.forEach(function (b) { residual = residual.replace(b, ""); });
    residual = residual.replace(/ACTIONS?:?/gi, " ");
    var parts = residual.split(/SAID:?\s*/i);
    var said = (parts.length > 1 ? parts[parts.length - 1] : residual).replace(/\s+/g, " ").trim();
    return { ops: ops, said: said };
  }

  function agentSystemPrompt(withTools) {
    var base =
      "You are NeuroBot, a personal second-brain assistant. " +
      "STEP 1 — scan the MEMORIES provided by the user. If they contain anything relevant, answer from them and build on it. " +
      "STEP 2 — if the memories don't cover it, answer from your own general knowledge like a normal helpful assistant (never say there is no relevant memory; just answer). " +
      "Be concise (max ~100 words). Plain text only, no markdown.";
    if (!withTools) return base;
    return base +
      "\n\nYou can also CHANGE the user's brain using these TOOLS (use 1-3 only when the user clearly asks to create, add, remember, update, complete, delete or organize something):" +
      "\nACTION {\"op\":\"add_note\",\"title\":\"...\",\"body\":\"...\",\"category\":\"General|AI|Engineering|Product|Business|Learning|Psychology\"}" +
      "\nACTION {\"op\":\"add_idea\",\"title\":\"...\",\"body\":\"...\",\"category\":\"...\",\"status\":\"New|Exploring|Building|Completed\"}" +
      "\nACTION {\"op\":\"add_goal\",\"title\":\"...\",\"body\":\"...\",\"progress\":0,\"deadline\":\"YYYY-MM-DD or omitted\",\"status\":\"active\"}" +
      "\nACTION {\"op\":\"add_knowledge\",\"title\":\"...\",\"body\":\"...\",\"topic\":\"AI|Programming|Science|Business|Education\",\"source\":\"...\"}" +
      "\nACTION {\"op\":\"update\",\"kind\":\"note|idea|goal|knowledge\",\"match\":\"exact existing title\",\"body\":\"new text\"} — only include fields that change; goal also accepts progress (0-100) and status active|paused|completed" +
      "\nACTION {\"op\":\"delete\",\"kind\":\"note|idea|goal|knowledge\",\"match\":\"exact existing title\"}" +
      "\nACTION {\"op\":\"pin\",\"kind\":\"note|idea|goal|knowledge\",\"match\":\"title\"}" +
      "\nRules: match must copy an EXISTING title from MEMORIES for update/delete/pin. Derive deadlines from today's date if the user says things like 'next month'. " +
      "Only emit ACTION when the user EXPLICITLY asks to save/remember/create/add/update/complete/delete/organize something. " +
      "If the user is only asking a question or chatting, NEVER emit ACTION — answering a question is not a reason to save anything. " +
      "Do not save general-knowledge facts unless asked to remember them. " +
      "Reply format — call tools first, then ALWAYS end with a SAID line:" +
      "\nACTION {\"op\":\"add_note\",\"title\":\"Dentist\",\"body\":\"Friday 3pm\",\"category\":\"General\"}\nSAID: Saved — dentist Friday 3pm is in your notes." +
      "\nIf nothing needs changing, reply with ONLY a SAID line.";
  }

  function brainContext() {
    var s = NB.getStore(), lines = [];
    s.knowledge.forEach(function (k) { lines.push("- [knowledge/" + k.topic + "] " + k.title + ": " + k.body + " (source: " + k.source + ")"); });
    s.notes.forEach(function (n) { lines.push("- [note/" + n.category + "] " + n.title + ": " + n.body); });
    s.ideas.forEach(function (i) { lines.push("- [idea/" + i.category + ", status " + i.status + "] " + i.title + ": " + i.body); });
    s.goals.forEach(function (g) { lines.push("- [goal, " + g.progress + "%, " + g.status + "] " + g.title + ": " + g.body + " (deadline " + g.deadline + ")"); });
    return lines.join("\n");
  }

  function messagesFor(q, opts) {
    opts = opts || {};
    var msgs = [{ role: "system", content: agentSystemPrompt(opts.tools !== false) }];
    (opts.history || []).slice(-6).forEach(function (h) {
      if (h && h.role && h.text) msgs.push({ role: h.role, content: String(h.text).slice(0, 400) });
    });
    msgs.push({
      role: "user",
      content: "MEMORIES (" + NB.totalItems() + " items):\n" + (brainContext() || "(the brain is empty)") + "\n\nTODAY: " + new Date().toISOString().slice(0, 10) + "\n\nQUESTION: " + q,
    });
    return msgs;
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

  /* ---------- NVCF function discovery (self-healing ids) ---------- */
  function getFnMap() {
    if (fnListPromise) return fnListPromise;
    fnListPromise = new Promise(function (resolve) {
      var cached = null;
      try { cached = JSON.parse(lsGet(FN_CACHE) || "null"); } catch (e) { cached = null; }
      if (cached && cached.t && Date.now() - cached.t < 12 * 3600 * 1000 && cached.fns) return resolve(cached.fns);
      fetch(NVCF_BASE + "/functions", { headers: { "Authorization": "Bearer " + effectiveKey(), "Accept": "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var fns = j && j.functions, map = {};
          if (!fns || !fns.length) return resolve(cached && cached.fns ? cached.fns : null);
          fns.forEach(function (f) {
            if (f.status === "ACTIVE" && !map[f.name]) map[f.name] = { id: f.id, ver: f.versionId };
          });
          lsSet(FN_CACHE, JSON.stringify({ t: Date.now(), fns: map }));
          resolve(map);
        })
        .catch(function () { resolve(cached && cached.fns ? cached.fns : null); });
    });
    return fnListPromise;
  }

  /* resolve MODELS entries against live discovery; hardcoded snapshot wins
     only when discovery has nothing on a name */
  function resolveModels(preferred) {
    return getFnMap().then(function (live) {
      var out = [];
      MODELS.forEach(function (m) {
        var l = live && live[m.fn];
        out.push({
          fn: m.fn, slug: m.slug, label: m.label,
          id: (l && l.id) || m.id,
          ver: (l && l.ver) || m.ver,
          live: !!l,
        });
      });
      /* preferred model first, others as fallback (dedup) */
      var sorted = [preferred].concat(out.filter(function (m) { return m.fn !== preferred; }));
      return sorted;
    });
  }

  /* NVIDIA error shapes: {detail}, {error:{message}}, {title} or plain text */
  function upstreamMsg(r, fb) {
    if (r && r.data) {
      var d = r.data;
      if (d.error) {
        if (d.error.message) return String(d.error.message);
        if (typeof d.error === "string") return d.error;
      }
      if (d.detail) return String(d.detail);
      if (d.message) return String(d.message);
      if (d.title) return String(d.title);
    }
    if (r && !r.data && r.text && r.text.length < 200) return String(r.text).trim() || fb || "";
    return fb || "HTTP " + (r ? r.status : "?");
  }

  function keyError(status) {
    return new Error("NVIDIA rejected the key (" + status + ")" + (userKey() ? " — check your key in Settings → AI Connection." : " — the built-in key may have hit its quota; add your own free key from build.nvidia.com in Settings → AI Connection."));
  }

  /* ---------- main transport: relay → NVCF direct → integrate direct ---------- */
  function postAI(messages, maxTokens) {
    var key = effectiveKey();
    if (/^sk-or-/i.test(key)) {
      return Promise.reject(new Error("That looks like an OpenRouter key (sk-or-…). NeuroBot uses NVIDIA — remove it in Settings, or leave the key field empty to use the built-in key."));
    }

    return resolveModels(NB.getAIModel()).then(function (models) {
      var mIdx = 0, routeIdx = 0, transientTries = 0;
      var maxTok = Math.max(64, Math.min(2048, maxTokens || 900));
      var customRelay = NB.getAIRelay();
      var remembered = lsGet(ROUTE_STORE);

      /* per-model route builders, in priority order */
      function routesFor(m) {
        var base = { messages: messages, max_tokens: maxTok, temperature: 0.6 };
        var routes = [];
        if (customRelay) routes.push({ name: "your relay", url: customRelay, body: Object.assign({ model: m.slug }, base) });
        routes.push({ name: "nvidia-nvcf", url: NVCF_BASE + "/pexec/functions/" + m.id + "?versionId=" + m.ver, body: base });
        routes.push({ name: "nvidia-direct", url: INTEGRATE_URL, body: Object.assign({ model: m.slug }, base) });
        /* remembered winner jumps the queue */
        if (remembered) {
          for (var i = 1; i < routes.length; i++) {
            if (routes[i].name === remembered) { var w = routes.splice(i, 1)[0]; routes.unshift(w); break; }
          }
        }
        return routes;
      }

      function attempt() {
        if (mIdx >= models.length) {
          throw new Error("Could not reach NVIDIA right now (all routes and models failed). Check your connection, or try again in a minute.");
        }
        var m = models[mIdx];
        var routes = routesFor(m);
        if (routeIdx >= routes.length) { mIdx++; routeIdx = 0; transientTries = 0; return sleep(150).then(attempt); }
        var route = routes[routeIdx];
        var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + key, "Accept": "application/json" };

        return postOnce(route.url, headers, route.body, 45000).then(function (r) {
          if (r.ok && r.data && r.data.choices) {
            lastModel = m.fn; lastRoute = route.name;
            lsSet(ROUTE_STORE, route.name);
            return r;
          }
          /* rate limited — same model, short backoff, then try other routes */
          if (r.status === 429) {
            if (transientTries < 2 && route.name === "nvidia-nvcf") {
              transientTries++;
              return sleep(1200).then(attempt);
            }
            routeIdx++;
            return sleep(250).then(attempt);
          }
          /* 5xx = THIS NVIDIA function is unhealthy. Its neighbours fail
             independently, so jump straight to the next model instead of
             grinding through this one's remaining routes. */
          if (r.status >= 500) {
            mIdx++;
            routeIdx = 0;
            transientTries = 0;
            return sleep(150).then(attempt);
          }
          if (r.status === 401) throw keyError(401);
          if (r.status === 403) {
            /* on NVCF this is per-key access; on a relay it's the relay refusing */
            if (route.name === "your relay") { routeIdx++; return sleep(200).then(attempt); }
            throw keyError(403);
          }
          /* 400/404/410 → this function/route can't serve this model → next route */
          routeIdx++;
          return sleep(120).then(attempt);
        }).catch(function (err) {
          if (err && err.network) { routeIdx++; return sleep(200).then(attempt); }
          throw err;
        });
      }

      return attempt().catch(function (err) {
        var m = err && err.message ? err.message : String(err);
        lastError = m;
        if (err instanceof Error) { err.message = m; throw err; }
        throw new Error(m);
      });
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
    var c = data && data.choices && data.choices[0] && (data.choices[0].message || data.choices[0]);
    if (!c) return "";
    var text = String(c.content || c.text || "").trim();
    if (!text && (c.reasoning || c.reasoning_content)) {
      var rc = String(c.reasoning || c.reasoning_content || "").trim();
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

  /* Raw model call for internal agents (agentBrowse). messages = OpenAI-style. */
  NB.rawAI = function (messages, maxTokens) {
    return postAI(messages, maxTokens || 500).then(function (r) {
      if (!r || !r.ok) throw new Error(upstreamMsg(r, "HTTP " + (r ? r.status : "?")));
      return extractAnswer(r.data);
    });
  };

  /* Agent internals — exposed for offline tests. */
  NB.__agent = { parseAgentReply: parseAgentReply, applyOps: applyOps, findItem: findItem };

  /* Diagnostic used by Settings → AI Connection and terminal `aitest`. */
  NB.testAI = function () {
    if (callCount >= ASK_LIMIT) {
      return Promise.resolve({ ok: false, message: "Demo limit reached (" + ASK_LIMIT + " asks per session). Refresh the page to reset." });
    }
    callCount++;
    return postAI([{ role: "user", content: "Reply with exactly: OK" }], 150).then(function (r) {
      if (r && r.ok) {
        var t = extractAnswer(r.data);
        lastError = "";
        return { ok: true, message: "AI connection OK (NVIDIA → " + NB.aiModelLabel(lastModel) + " via " + lastRoute + ") — model replied: " + (t || "(empty)") };
      }
      var msg = upstreamMsg(r, "HTTP " + (r ? r.status : "?"));
      lastError = msg;
      return { ok: false, message: friendly(new Error(msg)) };
    }).catch(function (err) {
      lastError = err.message;
      return { ok: false, message: friendly(err) };
    });
  };

  /* Second model pass: turns raw agent output into a clean user reply. */
  function summarizeActions(question, rawReply, results) {
    var msgs = [
      { role: "system", content: "You are NeuroBot. You just performed actions in the user's second brain. Report exactly what was done in at most 30 words, mentioning item titles. If something failed or wasn't found, say so briefly. Plain text, no markdown, no lists." },
      { role: "user", content: "REQUEST: " + question + "\n\nRESULTS:\n- " + results.join("\n- ") + "\n\nYour raw reply was: " + rawReply.slice(0, 300) + "\n\nWrite the user-facing reply now." },
    ];
    return postAI(msgs, 400).then(function (r) {
      var t = r && r.ok ? extractAnswer(r.data) : "";
      return t || results.join(" · ");
    }).catch(function () { return results.join(" · "); });
  }

  NB.askAI = function (question, opts) {
    if (callCount >= ASK_LIMIT) {
      return Promise.reject(new Error("Demo limit reached (" + ASK_LIMIT + " asks per session). Refresh the page to reset."));
    }
    callCount++;
    var msgs = messagesFor(question, opts);
    return postAI(msgs, 1200).then(function (r) {
      if (!r || !r.ok) {
        var msg = upstreamMsg(r, "HTTP " + (r ? r.status : "?"));
        lastError = msg;
        throw new Error("AI: " + msg);
      }
      var text = extractAnswer(r.data);
      if (!text) {
        lastError = "Empty response";
        throw new Error("AI returned an empty response — try rephrasing.");
      }
      lastError = "";
      /* agent path: apply any ACTION ops, then summarize what happened */
      var parsed = parseAgentReply(text);
      if (parsed.ops.length) {
        var results = applyOps(parsed.ops);
        if (results.length) {
          /* refresh the visible view unless a chat is mid-conversation
             (dashboard bubbles live in the view — don't wipe them) */
          if (!NB.suppressRerender) window.dispatchEvent(new Event("hashchange"));
          return summarizeActions(question, text, results);
        }
      }
      return parsed.said || text;
    }).catch(function (err) {
      if (err && err.message && err.message.indexOf("Demo limit") === 0) throw err;
      throw new Error(friendly(err));
    });
  };

  /* Ask modal UI (shared by palette + ✦ Ask buttons) */
  var askHistory = [];
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
      NB.askAI(q, { history: askHistory }).then(function (answer) {
        askHistory.push({ role: "user", text: q }, { role: "assistant", text: answer });
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
