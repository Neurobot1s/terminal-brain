/* NeuroBot — terminal.js (classic script; extends window.NB).
   In-app command console: type commands to drive the brain. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, el = NB.el, esc = NB.esc;
  var getStore = NB.getStore, totalItems = NB.totalItems;
  var HISTORY = [], histIdx = -1, PY_SCOPE = {};

  /* ---------- tiny Python interpreter (py) ---------- */
  var PY_PREC = { "or": 1, "and": 2, "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5, "//": 5, "%": 5, "**": 6 };
  /* each builtin receives the array of evaluated argument values */
  function flat(args) { return args.length === 1 && args[0] && typeof args[0] === "object" && args[0].length != null ? args[0] : args; }
  var PY_FUNCS = {
    print: function (args) { return { print: args.map(pyStr).join(" ") }; },
    len: function (args) { var a = args.length === 1 ? args[0] : args; return a != null && a.length != null ? a.length : String(a).length; },
    abs: function (args) { return Math.abs(args[0]); },
    min: function (args) { return Math.min.apply(null, flat(args)); },
    max: function (args) { return Math.max.apply(null, flat(args)); },
    round: function (args) { var a = args[0], p = args[1] || 0; return Math.round(a * Math.pow(10, p)) / Math.pow(10, p); },
    int: function (args) { return Math.trunc(Number(args[0])) || 0; },
    float: function (args) { return Number(args[0]) || 0; },
    str: function (args) { return pyStr(args[0]); },
    sum: function (args) { return flat(args).reduce(function (x, y) { return x + y; }, 0); },
  };
  function pyStr(v) {
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "number" && !isFinite(v)) return "inf";
    if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10);
    return String(v);
  }
  function pyTokenize(src) {
    var toks = [], i = 0;
    while (i < src.length) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "#") break;
      if (c === "\"" || c === "'") {
        var q = c, j = i + 1, s = "";
        while (j < src.length && src[j] !== q) { s += src[j] + (src[j] === "\\" ? (src[j + 1] || "") : ""); if (src[j] === "\\") j += 2; else j++; }
        if (j >= src.length) throw new Error("unterminated string");
        toks.push({ t: "str", v: s.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\").replace(/\\"/g, "\"").replace(/\\'/g, "'") }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        var n = src.slice(i).match(/^([0-9]*\.?[0-9]+)(e[+-]?[0-9]+)?/i)[0];
        toks.push({ t: "num", v: Number(n) }); i += n.length; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var w = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
        if (w === "and" || w === "or") { toks.push({ t: "op", v: w }); i += w.length; continue; }
        toks.push({ t: w === "True" || w === "False" || w === "None" ? "num" : "id", v: w === "True" ? true : w === "False" ? false : w === "None" ? null : w }); i += w.length; continue;
      }
      var two = src.slice(i, i + 2);
      if (two === "**" || two === "//" || two === "==" || two === "!=" || two === "<=" || two === ">=") { toks.push({ t: "op", v: two }); i += 2; continue; }
      if ("+-*/%<>=(),:".indexOf(c) !== -1) { toks.push({ t: "op", v: c }); i++; continue; }
      throw new Error("unexpected character '" + c + "'");
    }
    return toks;
  }
  function pyParse(toks, scope) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function eat() { return toks[pos++]; }
    function expr(minP) {
      var left = unary();
      for (;;) {
        var tk = peek();
        if (!tk || tk.t !== "op" || !(tk.v in PY_PREC)) break;
        var p = PY_PREC[tk.v];
        if (p < minP) break;
        var op = eat().v;
        var right = op === "**" ? expr(p) : expr(p + 1);
        left = binop(op, left, right);
      }
      /* ternary: A if COND else B */
      var tk2 = peek();
      if (minP <= 0 && tk2 && tk2.t === "id" && tk2.v === "if") {
        eat();
        var cond = expr(0);
        var nx = peek();
        if (!nx || nx.t !== "id" || nx.v !== "else") throw new Error("expected 'else' in conditional expression");
        eat();
        var alt = expr(0);
        left = cond ? left : alt;
      }
      return left;
    }
    function binop(op, a, b) {
      switch (op) {
        case "+": return typeof a === "string" || typeof b === "string" ? pyStr(a) + pyStr(b) : a + b;
        case "-": return a - b; case "*": return typeof a === "string" && typeof b === "number" ? a.repeat(Math.max(0, b | 0)) : a * b;
        case "/": if (b === 0) throw new Error("division by zero"); return a / b;
        case "//": if (b === 0) throw new Error("division by zero"); return Math.floor(a / b);
        case "%": return ((a % b) + b) % b;
        case "**": return Math.pow(a, b);
        case "==": return a === b; case "!=": return a !== b;
        case "<": return a < b; case ">": return a > b; case "<=": return a <= b; case ">=": return a >= b;
        case "and": return a ? b : a; case "or": return a ? a : b;
      }
      throw new Error("bad operator " + op);
    }
    function unary() {
      var tk = peek();
      if (tk && tk.t === "op" && tk.v === "-") { eat(); return -unary(); }
      if (tk && tk.t === "op" && tk.v === "+") { eat(); return unary(); }
      return primary();
    }
    function primary() {
      var tk = eat();
      if (!tk) throw new Error("unexpected end of expression");
      if (tk.t === "num" || tk.t === "str") return tk.v;
      if (tk.t === "op" && tk.v === "(") { var v = expr(0); var nx = eat(); if (!nx || nx.v !== ")") throw new Error("missing )"); return v; }
      if (tk.t === "id") {
        var name = tk.v;
        if (peek() && peek().t === "op" && peek().v === "(") {
          eat();
          var args = [];
          if (!(peek() && peek().v === ")")) { args.push(expr(0)); while (peek() && peek().v === ",") { eat(); args.push(expr(0)); } }
          var close = eat(); if (!close || close.v !== ")") throw new Error("missing )");
          var fn = PY_FUNCS[name];
          if (!fn) throw new Error("unknown function '" + name + "'");
          return fn(args, scope);
        }
        if (name in scope) return scope[name];
        if (["list", "dict", "input", "open", "range"].indexOf(name) !== -1) throw new Error("'" + name + "' is not supported in this mini interpreter");
        throw new Error("name '" + name + "' is not defined");
      }
      throw new Error("unexpected '" + (tk.v || tk.t) + "'");
    }
    return { expr: expr, done: function () { return pos >= toks.length; }, peekTok: peek, eatTok: eat };
  }
  function pySplitTop(src) {
    var parts = [], cur = "", depth = 0, q = null;
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (q) { cur += c; if (c === "\\") { cur += src[i + 1] || ""; i++; } else if (c === q) q = null; continue; }
      if (c === "\"" || c === "'") { q = c; cur += c; continue; }
      if (c === "(" || c === "[") depth++; if (c === ")" || c === "]") depth--;
      if (c === ";" && depth === 0) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim()) parts.push(cur);
    return parts;
  }
  function pyExec(src, scope) {
    var outs = [];
    pySplitTop(src).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|=)\s*([\s\S]+)$/);
      if (m && m[2] !== "+=" && m[2] !== "-=" && m[3] !== undefined && !/^=/.test(m[3])) {
        var p = pyParse(pyTokenize(m[3]), scope);
        scope[m[1]] = p.expr(0);
        if (!p.done()) throw new Error("unexpected token after expression");
        return;
      }
      if (m && (m[2] === "+=" || m[2] === "-=")) {
        if (!(m[1] in scope)) throw new Error("name '" + m[1] + "' is not defined");
        var p2 = pyParse(pyTokenize(m[3]), scope);
        var v2 = p2.expr(0);
        scope[m[1]] = m[2] === "+=" ? scope[m[1]] + v2 : scope[m[1]] - v2;
        return;
      }
      var p3 = pyParse(pyTokenize(line), scope);
      var val = p3.expr(0);
      if (p3.peekTok() && p3.peekTok().v === ",") {
        var items = [val];
        while (p3.peekTok() && p3.peekTok().v === ",") { p3.eatTok(); items.push(p3.expr(0)); }
        if (!p3.done()) throw new Error("unexpected token after expression");
        outs.push(["t-info", "(" + items.map(pyStr).join(", ") + (items.length === 1 ? "," : "") + ")"]);
      } else {
        if (!p3.done()) throw new Error("unexpected token after expression");
        if (val && typeof val === "object" && val.print) outs.push(["t-ok", val.print]);
        else if (val !== undefined && val !== null) outs.push(["t-info", pyStr(val)]);
      }
    });
    return outs;
  }

  var PAGES = {
    dashboard: "#/", home: "#/", brain: "#/brain", "my-brain": "#/brain",
    notes: "#/notes", ideas: "#/ideas", knowledge: "#/knowledge",
    goals: "#/goals", connections: "#/connections", settings: "#/settings",
  };
  var KINDS = { notes: "note", ideas: "idea", goals: "goal", knowledge: "knowledge" };

  function pad(s, n) { s = String(s == null ? "" : s); while (s.length < n) s += " "; return s; }

  var CMDS = {
    help: { desc: "show this list", run: function () {
      var out = [["t-info", "available commands:"]];
      var rows = [
        ["help", "show this list"], ["whoami", "who built this"], ["stats", "brain summary"],
        ["health", "brain health"], ["ls <kind>", "list notes/ideas/goals/knowledge"],
        ["find <query>", "search everything"], ["cd <page>", "jump to a page"],
        ["new <kind>", "capture note/idea/goal/knowledge"], ["ask <question>", "query the AI"],
        ["py <code>", "mini python (print, math, vars)"], ["print <text>", "echo text as output"],
        ["key / aitest", "set or test the AI key"], ["theme <name>", "dark / midnight / forest"], ["export", "download brain as json"],
        ["clear", "wipe the screen"], ["exit", "close terminal"],
      ];
      rows.forEach(function (r) { out.push(["t-cmd", "  " + pad(r[0], 18) + " " + r[1]]); });
      return out;
    } },
    whoami: { desc: "who built this", run: function () {
      return [["t-acc", "tanishq lalwani"], ["t-dim", "  designer & builder — NeuroBot, Your Second Brain."]];
    } },
    date: { desc: "current time", run: function () { return [["t-info", new Date().toString()]]; } },
    stats: { desc: "brain summary", run: function () {
      var s = getStore();
      var rows = [["notes", s.notes.length], ["ideas", s.ideas.length], ["goals", s.goals.length], ["knowledge", s.knowledge.length]];
      var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
      var out = [["t-acc", "brain stats"]];
      rows.forEach(function (r) {
        var bar = "";
        for (var i = 0; i < Math.round((r[1] / max) * 20); i++) bar += "█";
        out.push(["t-cmd", "  " + pad(r[0], 11) + pad(r[1], 4) + bar]);
      });
      out.push(["t-ok", "  " + pad("total", 11) + totalItems() + " memories"]);
      return out;
    } },
    health: { desc: "brain health", run: function () {
      var n = totalItems();
      if (n === 0) return [["t-warn", "warming up — capture something first"]];
      if (n < 8) return [["t-ok", "healthy — " + n + " items stored locally"]];
      return [["t-ok", "thriving — " + n + " items stored locally"]];
    } },
    ls: { desc: "list items", run: function (args) {
      var s = getStore(), what = (args[0] || "").toLowerCase();
      if (!what || what === "all") {
        return [["t-info", "usage: ls notes | ideas | goals | knowledge"],
          ["t-dim", "  counts: notes " + s.notes.length + " · ideas " + s.ideas.length + " · goals " + s.goals.length + " · knowledge " + s.knowledge.length]];
      }
      if (!KINDS[what]) return [["t-err", "ls: unknown kind '" + args[0] + "' — try notes, ideas, goals, knowledge"]];
      var list = s[what];
      if (!list.length) return [["t-dim", "(empty)"]];
      var out = [["t-acc", what + " (" + list.length + ")"]];
      list.forEach(function (x, i) {
        var meta = x.category || x.topic || (x.progress != null ? x.progress + "%" : "");
        out.push(["t-info", "  " + pad(i + 1 + ".", 4) + pad("[" + KINDS[what] + "]", 12) + pad(x.title, 38) + " · " + (meta || "—")]);
      });
      return out;
    } },
    find: { desc: "search everything", run: function (args) {
      var q = args.join(" ").toLowerCase().trim();
      if (!q) return [["t-err", "usage: find <query>"]];
      var s = getStore(), out = [["t-acc", "searching for \"" + q + "\"…"]], hits = 0;
      ["notes", "ideas", "goals", "knowledge"].forEach(function (key) {
        s[key].forEach(function (x) {
          if ((x.title + " " + (x.body || "")).toLowerCase().indexOf(q) !== -1 && hits < 12) {
            hits++;
            var meta = x.category || x.topic || x.status || "";
            out.push(["t-ok", "  [" + KINDS[key] + "] " + x.title + (meta ? " · " + meta : "")]);
          }
        });
      });
      if (!hits) out.push(["t-dim", "  no matches — your brain doesn't know that yet"]);
      return out;
    } },
    cd: { desc: "jump to a page", run: function (args) {
      var name = (args[0] || "").toLowerCase().replace(/^#\//, "").replace(/\.html$/, "");
      if (name === "" || name === "~") name = "dashboard";
      if (!PAGES[name]) return [["t-err", "cd: no such page '" + (args[0] || "") + "' — try: " + Object.keys(PAGES).join(", ")]];
      window.location.hash = PAGES[name];
      return [["t-ok", "$ cd " + name + " → ok"]];
    } },
    new: { desc: "capture something", run: function (args) {
      var map = { note: "note", idea: "idea", goal: "goal", thought: "knowledge", knowledge: "knowledge" };
      var kind = map[(args[0] || "").toLowerCase()];
      if (!kind) return [["t-err", "usage: new note | idea | goal | knowledge"]];
      NB.openCapture(kind);
      return [["t-ok", "opening capture form for a new " + kind + "…"]];
    } },
    ask: { desc: "query the AI", run: function (args) {
      var q = args.join(" ").trim();
      if (!q) return [["t-err", "usage: ask <question>"]];
      NB.openAskModal(q);
      return [["t-ok", "$ ai — thinking with " + totalItems() + " memories…"]];
    } },
    theme: { desc: "switch theme", run: function (args) {
      var t = (args[0] || "").toLowerCase();
      if (["dark", "midnight", "forest"].indexOf(t) === -1) return [["t-err", "usage: theme dark | midnight | forest"]];
      NB.savePrefs(Object.assign({}, NB.loadPrefs(), { theme: t }));
      return [["t-ok", "theme set → " + t]];
    } },
    export: { desc: "download brain json", run: function () {
      var blob = new Blob([JSON.stringify(getStore(), null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "neurobot-brain.json"; a.click();
      URL.revokeObjectURL(url);
      return [["t-ok", "exported → neurobot-brain.json"]];
    } },
    history: { desc: "recent commands", run: function () {
      if (!HISTORY.length) return [["t-dim", "(no history yet)"]];
      var out = [["t-acc", "command history"]];
      HISTORY.slice(-15).forEach(function (h, i) {
        out.push(["t-info", "  " + pad(HISTORY.length - Math.min(HISTORY.length, 15) + i + 1, 4) + h]);
      });
      return out;
    } },
    open: { desc: "open a page", run: function (args) { return CMDS.cd.run(args); } },
    clear: { desc: "wipe screen", run: function () { return { clear: true }; } },
    exit: { desc: "close terminal", run: function () { return { close: true }; } },
    echo: { desc: "print text", run: function (args) { return [["t-info", args.join(" ")]]; } },
    print: { desc: "print text to output", run: function (args) { return [["t-ok", args.join(" ")]]; } },
    py: { desc: "run python-ish code", run: function (args) {
      var src = args.join(" ").trim();
      if (!src || src === "help" || src === "-h") {
        return [["t-acc", "mini python (py) — quick reference"],
          ["t-info", "  py 2 ** 10 + 5              → 1029"],
          [`t-info`, `  py x = 7; print(x * 6)     → 42`],
          ["t-info", `  py name = 'neo'; print('hi ' + name)`],
          ["t-info", `  py round(3.14159, 2) , 10 % 3`],
          ["t-dim", "  supported: + - * / // % ** ( ) strings, True/False/None"],
          ["t-dim", "  fns: print, len, int, float, str, round, abs, min, max, sum"],
          ["t-dim", "  variables persist in this terminal session (x = 5 stays set)"],
          ["t-dim", "  no lists/dicts ([ ]) — pass values directly, e.g. min(3, 1, 2)"]];
      }
      try { return pyExec(src, PY_SCOPE); }
      catch (e) { return [["t-err", "py: " + (e.message || "error")]]; }
    } },
    key: { desc: "set/view AI key override", run: function (args) {
      if (!args.length) {
        var k = NB.getGeminiKey();
        return [["t-info", "custom key: " + (k ? (k.length > 14 ? k.slice(0, 7) + "…" + k.slice(-4) : k) : "server default")], ["t-dim", "  set one:  key <your-api-key>   ·   clear:  key clear"]];
      }
      var v = args.join("");
      if (v.toLowerCase() === "clear") { NB.setGeminiKey(""); return [["t-ok", "override cleared — using server key"]]; }
      NB.setGeminiKey(v);
      return [["t-ok", "key override saved — run 'aitest' to verify"]];
} },
    aitest: { desc: "test AI connection", run: function () {
      NB.testGemini().then(function (r) {
        var term = document.querySelector(".term-out");
        if (!term) return;
        var d = document.createElement("div");
        d.className = "term-line " + (r.ok ? "t-ok" : "t-err");
        d.textContent = (r.ok ? "✓ " : "⚠ ") + r.message;
        term.appendChild(d);
        term.scrollTop = term.scrollHeight;
      });
      return [["t-info", "$ ai --test … pinging the model…"]];
    } },
    sudo: { desc: "nice try", run: function () { return [["t-err", "sudo: permission denied — this brain belongs to tanishq 😄"]]; } },
  };
  CMDS.goto = CMDS.cd;
  CMDS.grep = CMDS.find;
  CMDS.quit = CMDS.exit;
  CMDS[":q"] = CMDS.exit;
  CMDS.python = CMDS.py;
  CMDS.py3 = CMDS.py;
  CMDS.puts = CMDS.print;

  NB.openTerminal = function () {
    var root = $("#term-root");
    if (!root || root.childElementCount) return;
    PY_SCOPE = {};
    var wrap = el(
      '<div class="term-backdrop"><div class="term-win" role="dialog" aria-label="NeuroBot terminal">' +
        '<div class="term-head">' +
          '<span class="term-dots"><i></i><i></i><i></i></span>' +
          '<span class="term-title">$ neurobot --terminal</span>' +
          '<button class="modal-close term-close" aria-label="Close">✕</button>' +
        "</div>" +
        '<div class="term-out" id="term-out"></div>' +
        '<div class="term-input-row">' +
          '<span class="p">guest@neurobot:~$</span>' +
          '<input id="term-input" autocomplete="off" spellcheck="false" />' +
        "</div>" +
      "</div></div>"
    );
    root.appendChild(wrap);
    var out = $("#term-out", wrap), input = $("#term-input", wrap);

    function print(lines) {
      lines.forEach(function (ln) {
        var d = document.createElement("div");
        d.className = "term-line " + (ln[0] || "t-info");
        d.textContent = ln[1];
        out.appendChild(d);
      });
      out.scrollTop = out.scrollHeight;
    }
    function printEcho(cmd) {
      var d = document.createElement("div");
      d.className = "term-line t-in";
      var p = document.createElement("span"); p.className = "p"; p.textContent = "guest@neurobot:~$ ";
      d.appendChild(p); d.appendChild(document.createTextNode(cmd));
      out.appendChild(d);
      out.scrollTop = out.scrollHeight;
    }

    function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    $(".term-close", wrap).addEventListener("click", close);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    input.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) { e.preventDefault(); out.innerHTML = ""; input.focus(); }
    });

    print([
      ["t-acc", "NeuroBot terminal — Your Second Brain."],
      ["t-dim", "  type 'help' for commands · 'exit' to close · Ctrl+L clears"],
      ["t-info", "  " + totalItems() + " memories loaded from localStorage"],
    ]);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var raw = input.value.trim();
        input.value = "";
        if (!raw) return;
        HISTORY.push(raw); histIdx = HISTORY.length;
        printEcho(raw);
        var parts = raw.split(/\s+/), name = parts[0].toLowerCase(), args = parts.slice(1);
        var cmd = CMDS[name];
        if (!cmd) {
          var names = Object.keys(CMDS).filter(function (k) { return k.indexOf(name) === 0 || name.indexOf(k) === 0; }).slice(0, 5);
          print([["t-err", "command not found: " + name]].concat(
            names.length ? [["t-dim", "  did you mean: " + names.join(", ") + "?"]] : [["t-dim", "  try 'help'"]]
          ));
          return;
        }
        var res = cmd.run(args);
        if (!res) return;
        if (res.clear) { out.innerHTML = ""; return; }
        if (res.close) { close(); return; }
        print(res);
      } else if (e.key === "ArrowUp") {
        if (histIdx > 0) { histIdx--; input.value = HISTORY[histIdx] || ""; }
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        if (histIdx < HISTORY.length) { histIdx++; input.value = HISTORY[histIdx] || ""; }
        e.preventDefault();
      }
    });
    setTimeout(function () { input.focus(); }, 30);
  };
})();
