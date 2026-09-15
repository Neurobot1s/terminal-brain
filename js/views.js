/* ═══════════════════════════════════════════════════════════
   views.js — page renderers. Each exports render(root, ctx).
   ctx: { state, rerender, openCapture, openEdit, navigate }
   ═══════════════════════════════════════════════════════════ */

import { $, $$, el, esc, ico, timeAgo, fmtDate, greeting, emptyState, mdLite } from "./ui.js";
import { state, brain, counts } from "./api.js";
import { mountGraph } from "./graph.js";
import { openModal, confirmModal, toast } from "./ui.js";

const KIND_META = {
  note: { icon: ico.note, tag: "blue", label: "Note", fields: ["category"] },
  idea: { icon: ico.bulb, tag: "purple", label: "Idea", fields: ["category", "status"] },
  goal: { icon: ico.target, tag: "green", label: "Goal", fields: [] },
  knowledge: { icon: ico.book, tag: "amber", label: "Knowledge", fields: ["topic", "source"] },
};

function head(title, sub, actions) {
  return el("div", { class: "page-head" },
    el("div", {}, el("h1", {}, title), sub ? el("p", {}, sub) : null),
    actions ? el("div", { class: "head-actions" }, actions) : null
  );
}

function statCard(icon, num, label, hue) {
  return el("div", { class: "stat" },
    el("span", { class: "ico", html: icon }),
    el("span", { class: "num" }, String(num)),
    el("span", { class: "lbl" }, label)
  );
}

function tag(text, cls) {
  return el("span", { class: `tag ${cls || ""}` }, text);
}

/* ═══════════════ DASHBOARD ═══════════════ */

export function renderDashboard(root, ctx) {
  const c = counts(state.data);
  const hour = new Date().getHours();

  root.append(head(null, null, null) && el("div", { class: "hero" },
    el("h1", { html: `${greeting()} <span class="wave">👋</span>` }),
    el("p", {}, "Your second brain is ready.")
  ));

  // Ask-your-brain box
  const answerBox = el("div", { class: "ask-answer hidden" });
  const input = el("input", { type: "text", placeholder: "Ask your brain anything…", "aria-label": "Ask your brain" });
  const mic = el("button", { class: "ask-btn mic", title: "Voice (demo)", html: ico.mic, onclick: () => {
    mic.classList.add("listening");
    toast("Voice input is coming with NeuroBot Live.", "ok");
    setTimeout(() => mic.classList.remove("listening"), 1400);
  }});
  const send = el("button", { class: "ask-btn", title: "Ask", html: ico.send, onclick: ask });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });

  const askbox = el("div", { class: "askbox" },
    el("div", { class: "askbox-row" }, input, mic, send),
    answerBox
  );
  root.append(askbox);

  let asking = false;
  async function ask() {
    const q = input.value.trim();
    if (!q || asking) return;
    asking = true;
    answerBox.classList.remove("hidden", "err");
    answerBox.innerHTML = `<span class="who">NeuroBot is thinking…</span>Reading your notes, ideas, goals and knowledge…`;
    try {
      const out = await brain.ask(q);
      answerBox.innerHTML = `<span class="who">NeuroBot · ${esc(out.model)}</span>` + mdLite(out.answer);
      input.value = "";
    } catch (e) {
      answerBox.classList.add("err");
      answerBox.textContent = e.message || "Something went wrong.";
    } finally {
      asking = false;
    }
  }

  // Stats
  root.append(el("div", { class: "stats" },
    statCard(ico.brain, c.knowledge, "Knowledge items"),
    statCard(ico.bulb, c.ideas, "Ideas saved"),
    statCard(ico.target, c.goals, "Active goals"),
    statCard(ico.share, c.connections, "Connections")
  ));

  // Quick capture
  const qc = el("div", { class: "card" },
    el("div", { class: "panel-head" },
      el("h3", {}, "Quick capture"),
      tag("⌘-free, just click", "")
    ),
    el("div", { class: "quick-capture" },
      el("button", { class: "qc-btn", onclick: () => ctx.openCapture("note") }, el("span", { class: "ico", html: ico.note }), "New Note"),
      el("button", { class: "qc-btn", onclick: () => ctx.openCapture("idea") }, el("span", { class: "ico", html: ico.bulb }), "New Idea"),
      el("button", { class: "qc-btn", onclick: () => ctx.openCapture("thought") }, el("span", { class: "ico", html: ico.spark }), "Save Thought"),
      el("button", { class: "qc-btn", onclick: () => ctx.openCapture("goal") }, el("span", { class: "ico", html: ico.target }), "Add Goal")
    )
  );
  root.append(qc);

  // NeuroVision
  root.append(el("div", { class: "neurovision" },
    el("div", {},
      el("h4", {}, "🫧 NeuroVision"),
      el("p", {}, "Let NeuroBot understand what's on your screen.")
    ),
    el("button", { class: "btn", onclick: () => {
      openModal({
        title: "NeuroVision",
        body: el("div", { class: "live-modal" },
          el("div", { class: "mic-orb", html: ico.eye }),
          el("p", {}, "NeuroVision is coming soon. Screen understanding will let NeuroBot read what you see and connect it to your brain."),
        ),
        foot: el("button", { class: "btn primary", onclick: () => document.querySelector(".modal-backdrop")?.remove() }, "Got it"),
      });
    }}, "Try NeuroVision")
  ));

  // Activity + graph
  const actCol = el("div", { class: "card" },
    el("div", { class: "panel-head" }, el("h3", {}, "Recent activity")),
    renderActivity(ctx)
  );

  const graphCol = el("div", { class: "card" },
    el("div", { class: "panel-head" },
      el("h3", {}, "Knowledge map"),
      el("a", { href: "#/connections", class: "btn sm ghost" }, "Open Connections →")
    ),
    el("div", { class: "graph-slot" })
  );

  root.append(el("div", { class: "dash-grid" }, graphCol, actCol));

  mountGraph($(".graph-slot", graphCol), { height: 300, legend: false });
}

function renderActivity(ctx) {
  const acts = state.data.activity.slice(0, 8);
  if (!acts.length) return emptyState("Nothing captured yet. Try Quick capture above.");
  const list = el("div", {});
  for (const a of acts) {
    const meta = KIND_META[a.kind] || KIND_META.note;
    list.append(el("div", { class: "activity-item" },
      el("span", { class: "ico", html: meta.icon }),
      el("div", { class: "meta" },
        el("strong", {}, a.title),
        el("em", {}, `${meta.label} · ${timeAgo(a.createdAt)}`)
      ),
      el("button", { class: "del", title: "Delete entry", html: ico.trash, onclick: async () => {
        const ok = await confirmModal("Remove entry?", `"${a.title}" will be removed from your activity feed.`, "Remove");
        if (!ok) return;
        await brain.removeActivity(a.id);
        toast("Activity entry removed.");
        ctx.rerender();
      }})
    ));
  }
  return list;
}

/* ═══════════════ MY BRAIN ═══════════════ */

export function renderBrain(root, ctx) {
  root.append(head("My Brain", "Everything you've captured — searchable in one place."));

  const q = el("input", { type: "search", placeholder: "Search titles and content…" });
  const kindSel = el("select", {},
    el("option", { value: "all" }, "All types"),
    el("option", { value: "note" }, "Notes"),
    el("option", { value: "idea" }, "Ideas"),
    el("option", { value: "goal" }, "Goals"),
    el("option", { value: "knowledge" }, "Knowledge"),
  );
  const toolbar = el("div", { class: "toolbar" }, q, kindSel);
  const results = el("div", { class: "grid c2" });
  root.append(toolbar, results);

  function draw() {
    const query = q.value.trim().toLowerCase();
    const kind = kindSel.value;
    results.innerHTML = "";

    const pools = [];
    if (kind === "all" || kind === "note")
      state.data.notes.forEach((n) => pools.push({ kind: "note", item: n }));
    if (kind === "all" || kind === "idea")
      state.data.ideas.forEach((n) => pools.push({ kind: "idea", item: n }));
    if (kind === "all" || kind === "goal")
      state.data.goals.forEach((n) => pools.push({ kind: "goal", item: n }));
    if (kind === "all" || kind === "knowledge")
      state.data.knowledge.forEach((n) => pools.push({ kind: "knowledge", item: n }));

    const filtered = pools.filter(({ item }) =>
      !query || item.title.toLowerCase().includes(query) || String(item.body).toLowerCase().includes(query)
    );
    filtered.sort((a, b) => b.item.createdAt - a.item.createdAt);

    if (!filtered.length) { results.append(emptyState("No matches in your brain yet.")); return; }

    for (const { kind: k, item } of filtered.slice(0, 60)) {
      results.append(brainCard(k, item, ctx));
    }
  }
  q.addEventListener("input", draw);
  kindSel.addEventListener("change", draw);
  draw();
}

function brainCard(kind, item, ctx) {
  const meta = KIND_META[kind];
  const extras = [];
  if (kind === "idea") extras.push(tag(item.status, item.status === "completed" ? "green" : item.status === "building" ? "blue" : item.status === "exploring" ? "purple" : ""));
  if (kind === "goal") extras.push(tag(`${item.progress}%`, "green"));
  if (item.category) extras.push(tag(item.category, meta.tag));
  if (kind === "knowledge" && item.topic) extras.push(tag(item.topic, meta.tag));

  return el("div", { class: "item-card" + (item.pinned ? " pinned-card" : "") },
    el("button", { class: "pin" + (item.pinned ? " on" : ""), title: "Pin", html: "★", onclick: async (e) => {
      e.stopPropagation();
      await brain.update(kind, item.id, { pinned: !item.pinned });
      ctx.rerender();
    }}),
    el("div", { class: "row" }, tag(meta.label, meta.tag), ...extras),
    el("h4", {}, item.title),
    el("p", { class: "body" }, item.body.length > 140 ? item.body.slice(0, 140) + "…" : item.body),
    el("div", { class: "row" }, el("span", { class: "goal-date" }, timeAgo(item.createdAt))),
    el("div", { class: "actions" },
      el("button", { class: "btn sm", onclick: () => ctx.openEdit(kind, item) }, "Edit"),
      el("button", { class: "btn sm danger", onclick: async () => {
        const ok = await confirmModal(`Delete ${meta.label.toLowerCase()}?`, `"${item.title}" will be permanently removed.`, "Delete");
        if (!ok) return;
        await brain.remove(kind, item.id);
        toast(`${meta.label} deleted.`);
        ctx.rerender();
      }}, "Delete")
    )
  );
}

/* ═══════════════ NOTES ═══════════════ */

export function renderNotes(root, ctx) {
  root.append(head("Notes", "Capture, edit and organize everything you learn.",
    el("button", { class: "btn primary", html: `${ico.plus} New note`, onclick: () => ctx.openCapture("note") })));

  const q = el("input", { type: "search", placeholder: "Search notes…" });
  const catSel = el("select", {});
  const toolbar = el("div", { class: "toolbar" }, q, catSel);
  const grid = el("div", { class: "grid c3" });
  root.append(toolbar, grid);

  function draw() {
    const cats = [...new Set(state.data.notes.map((n) => n.category).filter(Boolean))].sort();
    catSel.innerHTML = "";
    catSel.append(el("option", { value: "all" }, "All categories"));
    for (const cat of cats) catSel.append(el("option", { value: cat }, cat));
    const query = q.value.trim().toLowerCase();
    const cat = catSel.value;

    const notes = state.data.notes
      .filter((n) => (cat === "all" || n.category === cat) &&
        (!query || n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);

    grid.innerHTML = "";
    if (!notes.length) { grid.append(emptyState("No notes yet — create your first one.")); return; }
    for (const n of notes) grid.append(brainCard("note", n, ctx));
  }
  q.addEventListener("input", draw);
  catSel.addEventListener("change", draw);
  draw();
}

/* ═══════════════ IDEAS ═══════════════ */

const IDEA_STATUSES = ["new", "exploring", "building", "completed"];

export function renderIdeas(root, ctx) {
  root.append(head("Ideas", "Your idea board — move ideas from spark to shipped.",
    el("button", { class: "btn primary", html: `${ico.plus} New idea`, onclick: () => ctx.openCapture("idea") })));

  const chips = el("div", { class: "chips" });
  const board = el("div", { class: "grid c2" });
  root.append(chips, board);

  let filter = "all";
  function drawChips() {
    chips.innerHTML = "";
    for (const s of ["all", ...IDEA_STATUSES]) {
      const c = el("button", { class: "chip" + (filter === s ? " on" : ""), onclick: () => { filter = s; drawChips(); draw(); } },
        s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1));
      chips.append(c);
    }
  }

  function draw() {
    board.innerHTML = "";
    const ideas = state.data.ideas
      .filter((i) => filter === "all" || i.status === filter)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
    if (!ideas.length) { board.append(emptyState("No ideas here yet. Every big thing starts small.")); return; }

    for (const idea of ideas) {
      const statusBtns = el("div", { class: "actions" });
      for (const s of IDEA_STATUSES) {
        if (s === idea.status) continue;
        statusBtns.append(el("button", { class: "btn sm ghost", title: `Move to ${s}`, onclick: async () => {
          await brain.update("idea", idea.id, { status: s });
          toast(`Idea moved to ${s}.`);
          ctx.rerender();
        }}, s));
      }
      const card = brainCard("idea", idea, ctx);
      card.querySelector(".actions").prepend(statusBtns);
      board.append(card);
    }
  }
  drawChips();
  draw();
}

/* ═══════════════ KNOWLEDGE ═══════════════ */

export function renderKnowledge(root, ctx) {
  root.append(head("Knowledge", "What you know, grouped by topic.",
    el("button", { class: "btn primary", html: `${ico.plus} Add knowledge`, onclick: () => ctx.openCapture("knowledge") })));

  const q = el("input", { type: "search", placeholder: "Search knowledge…" });
  root.append(el("div", { class: "toolbar" }, q));

  const wrap = el("div", {});
  root.append(wrap);

  function draw() {
    const query = q.value.trim().toLowerCase();
    const kbs = state.data.knowledge
      .filter((k) => !query || k.title.toLowerCase().includes(query) || k.body.toLowerCase().includes(query))
      .sort((a, b) => b.createdAt - a.createdAt);

    wrap.innerHTML = "";
    if (!kbs.length) { wrap.append(emptyState("No knowledge saved yet.")); return; }

    const groups = new Map();
    for (const k of kbs) {
      const topic = k.topic || "General";
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push(k);
    }

    for (const [topic, items] of groups) {
      const g = el("section", { class: "kb-group" },
        el("h3", {}, `${topic} · ${items.length}`),
        el("div", { class: "grid c3" })
      );
      for (const k of items) {
        const card = brainCard("knowledge", k, ctx);
        if (k.source) card.querySelector(".row").append(tag(k.source, ""));
        $(".grid", g).append(card);
      }
      wrap.append(g);
    }
  }
  q.addEventListener("input", draw);
  draw();
}

/* ═══════════════ GOALS ═══════════════ */

export function renderGoals(root, ctx) {
  root.append(head("Goals", "Where your attention is going.",
    el("button", { class: "btn primary", html: `${ico.plus} New goal`, onclick: () => ctx.openCapture("goal") })));

  const grid = el("div", { class: "grid c2" });
  root.append(grid);

  const goals = state.data.goals.slice().sort((a, b) =>
    (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) || b.createdAt - a.createdAt);

  if (!goals.length) { grid.append(emptyState("No goals yet. Set one and give your brain a direction.")); return; }

  for (const g of goals) {
    const overdue = g.status === "active" && g.deadline && new Date(g.deadline) < new Date();
    grid.append(el("div", { class: "item-card" + (g.pinned ? " pinned-card" : "") },
      el("button", { class: "pin" + (g.pinned ? " on" : ""), html: "★", onclick: async () => {
        await brain.update("goal", g.id, { pinned: !g.pinned });
        ctx.rerender();
      }}),
      el("div", { class: "goal-top" },
        el("h4", {}, g.title),
        el("span", { class: "goal-date" }, (overdue ? "⚠ " : "") + fmtDate(g.deadline))
      ),
      el("p", { class: "body" }, g.body),
      el("div", { class: "row" },
        tag(g.status, g.status === "completed" ? "green" : g.status === "paused" ? "amber" : "blue"),
        overdue ? tag("overdue", "red") : null
      ),
      el("div", { class: "progress", title: `${g.progress}%` }, el("i", { style: `width:${g.progress}%` })),
      el("div", { class: "row" }, el("span", { class: "goal-date" }, `${g.progress}% complete`)),
      el("div", { class: "actions" },
        el("button", { class: "btn sm", onclick: async () => {
          const next = Math.min(100, g.progress + 10);
          await brain.update("goal", g.id, { progress: next, status: next >= 100 ? "completed" : g.status });
          toast(next >= 100 ? "Goal complete! 🎉" : `Progress: ${next}%`);
          ctx.rerender();
        }}, "+10%"),
        g.progress > 0 ? el("button", { class: "btn sm ghost", onclick: async () => {
          const next = Math.max(0, g.progress - 10);
          await brain.update("goal", g.id, { progress: next, status: g.status === "completed" && next < 100 ? "active" : g.status });
          ctx.rerender();
        }}, "−10%") : null,
        g.status !== "completed" ? el("button", { class: "btn sm ghost", onclick: async () => {
          await brain.update("goal", g.id, { status: "completed", progress: 100 });
          toast("Goal complete! 🎉");
          ctx.rerender();
        }}, "Complete") : null,
        el("button", { class: "btn sm", onclick: () => ctx.openEdit("goal", g) }, "Edit"),
        el("button", { class: "btn sm danger", onclick: async () => {
          const ok = await confirmModal("Delete goal?", `"${g.title}" will be permanently removed.`, "Delete");
          if (!ok) return;
          await brain.remove("goal", g.id);
          toast("Goal deleted.");
          ctx.rerender();
        }}, "Delete")
      )
    ));
  }
}

/* ═══════════════ CONNECTIONS ═══════════════ */

export function renderConnections(root, ctx) {
  root.append(head("Connections", "How your knowledge relates — a living map of your second brain."));

  const graphSlot = el("div", {});
  const panel = el("aside", { class: "side-panel" },
    el("div", { class: "card" },
      el("h3", {}, "What are connections?"),
      el("p", {}, "Connections represent relationships between information in your second brain. As NeuroBot grows, it will surface links between your notes, ideas and knowledge automatically."),
      el("div", { class: "kv" }, el("span", {}, "Topics"), el("b", {}, "6")),
      el("div", { class: "kv" }, el("span", {}, "Concepts"), el("b", {}, String(state.data.knowledge.length + state.data.notes.length))),
      el("div", { class: "kv" }, el("span", {}, "Links drawn"), el("b", {}, "10")),
      el("div", { class: "kv" }, el("span", {}, "Generated by"), el("b", {}, "Demo map")),
    ),
    el("div", { class: "card" },
      el("h3", {}, "Coming next"),
      el("p", {}, "In Phase 2, NeuroBot will analyze your content and propose real connections — surfacing non-obvious relationships across everything you've saved."),
      tag("Prototype visualization", "purple")
    )
  );

  root.append(el("div", { class: "conn-grid" }, el("div", { class: "graph-slot" }, graphSlot), panel));
  mountGraph(graphSlot, { height: 480 });
}

/* ═══════════════ SETTINGS ═══════════════ */

export function renderSettings(root, ctx) {
  const prefs = state.prefs;

  function row(title, sub, control) {
    return el("div", { class: "set-row" },
      el("div", { class: "meta" }, el("strong", {}, title), el("em", {}, sub)),
      control
    );
  }
  function toggle(key) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!prefs[key];
    input.addEventListener("change", () => {
      ctx.savePrefs({ [key]: input.checked });
      toast("Preference saved.");
    });
    return el("label", { class: "switch" }, input, el("i", {}));
  }

  const density = el("select", {},
    el("option", { value: "comfortable" }, "Comfortable"),
    el("option", { value: "compact" }, "Compact"),
  );
  density.value = prefs.density;
  density.addEventListener("change", () => {
    ctx.savePrefs({ density: density.value });
    toast("Appearance updated.");
  });

  root.append(
    head("Settings", "Tune NeuroBot to your taste."),

    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🎨 Appearance"),
      row("Theme", "NeuroBot's signature dark theme", tag("Dark", "blue")),
      row("Density", "Spacing of lists and cards", density),
      row("Motion", "Ambient animations and pulses", toggle("motion")),
    ),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🔔 Notifications"),
      row("Weekly digest", "A summary of what you captured each week", toggle("digest")),
      row("Sound effects", "Subtle audio cues on capture", toggle("sound")),
    ),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🗄 Data"),
      row("Your data", `${state.data.notes.length} notes · ${state.data.ideas.length} ideas · ${state.data.goals.length} goals · ${state.data.knowledge.length} knowledge`, tag("Cloud synced", "green")),
      row("Load demo content", "Replace everything with sample data", el("button", { class: "btn sm", onclick: async () => {
        const ok = await confirmModal("Load demo content?", "Your current data will be replaced with a fresh demo brain.", "Load demo");
        if (!ok) return;
        await brain.reseed();
        toast("Demo brain loaded.");
        ctx.rerender();
      }}, "Load demo")),
      row("Delete everything", "Permanently remove all captured items", el("button", { class: "btn sm danger", onclick: async () => {
        const ok = await confirmModal("Delete everything?", "All notes, ideas, goals and knowledge will be permanently deleted. This cannot be undone.", "Delete all");
        if (!ok) return;
        await brain.clearAll();
        toast("Your brain is empty again.");
        ctx.rerender();
      }}, "Delete all")),
    ),
    el("div", { class: "card", style: "margin-bottom:14px" },
      el("h3", { style: "margin-bottom:6px" }, "🔒 Privacy"),
      el("p", { class: "sub", style: "margin:0 0 8px" },
        "Your second brain is stored per-account in the NeuroBot database. Your AI questions send your saved content to Gemini only to generate an answer — it is not used to train models by NeuroBot."),
      row("Session", "Signed in as " + (state.user?.email || "unknown"),
        el("button", { class: "btn sm danger", onclick: async () => {
          const ok = await confirmModal("Sign out?", "You'll need your email and password to sign back in.", "Sign out");
          if (!ok) return;
          const { signOut } = await import("./api.js");
          await signOut();
          location.reload();
        }}, "Sign out")),
    ),
    el("div", { class: "card" },
      el("h3", { style: "margin-bottom:6px" }, "ℹ About NeuroBot"),
      el("p", { class: "sub", style: "margin:0" },
        `NeuroBot — Your Second Brain. Version 1.0 (Phase 1). An AI-powered personal knowledge system: capture, organize, connect and retrieve your knowledge, ideas and goals.`),
      el("p", { class: "sub", style: "margin:10px 0 0" },
        el("strong", {}, "Crafted by Tanishq Lalwani")),
    )
  );
}
