/* NeuroBot — terminal.js (classic script; extends window.NB).
   In-app command console: type commands to drive the brain. */
(function () {
  "use strict";
  if (!window.NB) return;
  var $ = NB.$, el = NB.el, esc = NB.esc;
  var getStore = NB.getStore, totalItems = NB.totalItems;
  var HISTORY = [], histIdx = -1;

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
        ["new <kind>", "capture note/idea/goal/knowledge"], ["ask <question>", "query gemini"],
        ["theme <name>", "dark / midnight / forest"], ["export", "download brain as json"],
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
      return [
        ["t-acc", "brain stats"],
        ["t-info", "  notes      " + s.notes.length],
        ["t-info", "  ideas      " + s.ideas.length],
        ["t-info", "  goals      " + s.goals.length],
        ["t-info", "  knowledge  " + s.knowledge.length],
        ["t-ok",   "  total      " + totalItems() + " memories"],
      ];
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
    ask: { desc: "query gemini", run: function (args) {
      var q = args.join(" ").trim();
      if (!q) return [["t-err", "usage: ask <question>"]];
      NB.openAskModal(q);
      return [["t-ok", "$ gemini — thinking with " + totalItems() + " memories…"]];
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
    clear: { desc: "wipe screen", run: function () { return { clear: true }; } },
    exit: { desc: "close terminal", run: function () { return { close: true }; } },
    echo: { desc: "print text", run: function (args) { return [["t-info", args.join(" ")]]; } },
    sudo: { desc: "nice try", run: function () { return [["t-err", "sudo: permission denied — this brain belongs to tanishq 😄"]]; } },
  };
  CMDS.goto = CMDS.cd;
  CMDS.grep = CMDS.find;
  CMDS.quit = CMDS.exit;
  CMDS[":q"] = CMDS.exit;

  NB.openTerminal = function () {
    var root = $("#term-root");
    if (!root || root.childElementCount) return;
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

    print([
      ["t-acc", "NeuroBot terminal — Your Second Brain."],
      ["t-dim", "  type 'help' for commands · 'exit' to close"],
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
        if (!cmd) { print([["t-err", "command not found: " + name + " — try 'help'"]]); return; }
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
