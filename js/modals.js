/* ═══════════════════════════════════════════════════════════
   modals.js — capture forms (note/idea/goal/knowledge/thought),
   command palette, and the Live modal.
   ═══════════════════════════════════════════════════════════ */

import { el, openModal, toast, ico, field } from "./ui.js";
import { brain } from "./api.js";

/* ── capture modal ── */

const IDEA_STATUS_OPTS = ["new", "exploring", "building", "completed"];

export function openCapture(kind, onDone) {
  if (kind === "thought") return openThought(onDone);

  const conf = {
    note: { title: "New Note", icon: ico.note },
    idea: { title: "New Idea", icon: ico.bulb },
    goal: { title: "New Goal", icon: ico.target },
    knowledge: { title: "Add Knowledge", icon: ico.book },
  }[kind];
  if (!conf) return;

  const title = el("input", { type: "text", placeholder: conf.title + " title…" });
  const body = el("textarea", { placeholder: "Write everything down — your brain will do the connecting." });

  const category = el("input", { type: "text", placeholder: "e.g. AI, Health, Business…" });
  const topic = el("input", { type: "text", placeholder: "e.g. AI, Programming, Science…" });
  const source = el("input", { type: "text", placeholder: "Where did this come from? (optional)" });

  const status = el("select", {}, ...IDEA_STATUS_OPTS.map((s) => el("option", { value: s }, s)));
  const progress = el("input", { type: "number", min: "0", max: "100", value: "0" });
  const deadline = el("input", { type: "date" });

  const err = el("div", { class: "auth-err hidden" });
  const form = el("form", {},
    field("Title", title),
    field("Details", body),
    kind === "note" ? field("Category", category) : null,
    kind === "idea" ? field("Category", category) : null,
    kind === "idea" ? field("Status", status) : null,
    kind === "knowledge" ? field("Topic", topic) : null,
    kind === "knowledge" ? field("Source", source) : null,
    kind === "goal" ? field("Deadline", deadline) : null,
    kind === "goal" ? field("Starting progress %", progress) : null,
    err
  );

  const saveBtn = el("button", { class: "btn primary", type: "submit" }, `Save ${conf.title.replace("New ", "")}`);
  const form2 = el("form", { style: "display:contents" });
  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    saveBtn
  );
  const modal = openModal({ title: `${conf.icon} ${conf.title}`, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { err.textContent = "Give it a title first."; err.classList.remove("hidden"); return; }
    saveBtn.disabled = true;
    try {
      if (kind === "note") await brain.add("note", { title: t, body: body.value.trim(), category: category.value.trim() || "General" });
      if (kind === "idea") await brain.add("idea", { title: t, body: body.value.trim(), category: category.value.trim() || "General", status });
      if (kind === "goal") await brain.add("goal", {
        title: t, body: body.value.trim(),
        progress: Math.max(0, Math.min(100, Number(progress.value) || 0)),
        deadline: deadline.value || "No deadline",
        status: "active",
      });
      if (kind === "knowledge") await brain.add("knowledge", { title: t, body: body.value.trim(), topic: topic.value.trim() || "General", source: source.value.trim() });
      toast(`${conf.title.replace("New ", "")} saved to your brain.`);
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
      saveBtn.disabled = false;
    }
  });
}

function openThought(onDone) {
  const ta = el("textarea", { placeholder: "What's on your mind? One thought, saved forever.", style: "min-height:110px" });
  const cat = el("input", { type: "text", placeholder: "Optional tag (e.g. shower thought, lecture, book)" });
  const err = el("div", { class: "auth-err hidden" });
  const form = el("form", {}, field("Thought", ta), field("Tag", cat), err);
  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", type: "submit" }, "Save thought")
  );
  const modal = openModal({ title: `${ico.spark} Save a thought`, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) { err.textContent = "Type your thought first."; err.classList.remove("hidden"); return; }
    const firstLine = text.split("\n")[0].slice(0, 60);
    try {
      await brain.add("note", {
        title: firstLine.length > 52 ? firstLine.slice(0, 52) + "…" : firstLine,
        body: text,
        category: cat.value.trim() || "Thoughts",
      });
      toast("Thought saved to your brain.");
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
    }
  });
}

/* ── edit modal ── */

export function openEdit(kind, item, onDone) {
  const conf = {
    note: { title: "Edit Note" },
    idea: { title: "Edit Idea" },
    goal: { title: "Edit Goal" },
    knowledge: { title: "Edit Knowledge" },
  }[kind];

  const title = el("input", { type: "text", value: item.title });
  const body = el("textarea", {}, item.body || "");

  const category = el("input", { type: "text", value: item.category || "" });
  const topic = el("input", { type: "text", value: item.topic || "" });
  const source = el("input", { type: "text", value: item.source || "" });

  const status = el("select", {}, ...IDEA_STATUS_OPTS.map((s) => el("option", { value: s }, s)));
  if (kind === "idea") status.value = item.status;

  const progress = el("input", { type: "number", min: "0", max: "100", value: String(item.progress ?? 0) });
  const deadline = el("input", { type: "date", value: /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || "") ? item.deadline : "" });

  const err = el("div", { class: "auth-err hidden" });
  const form = el("form", {},
    field("Title", title),
    field("Details", body),
    kind === "note" ? field("Category", category) : null,
    kind === "idea" ? field("Category", category) : null,
    kind === "idea" ? field("Status", status) : null,
    kind === "knowledge" ? field("Topic", topic) : null,
    kind === "knowledge" ? field("Source", source) : null,
    kind === "goal" ? field("Deadline", deadline) : null,
    kind === "goal" ? field("Progress %", progress) : null,
    err
  );
  const foot = el("div", { style: "display:flex;gap:9px" },
    el("button", { class: "btn ghost", type: "button", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", type: "submit" }, "Save changes")
  );
  const modal = openModal({ title: conf.title, body: form, foot });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t) { err.textContent = "Title can't be empty."; err.classList.remove("hidden"); return; }
    try {
      if (kind === "note") await brain.update("note", item.id, { title: t, body: body.value.trim(), category: category.value.trim() || "General" });
      if (kind === "idea") await brain.update("idea", item.id, { title: t, body: body.value.trim(), category: category.value.trim() || "General", status: status.value });
      if (kind === "goal") await brain.update("goal", item.id, {
        title: t, body: body.value.trim(),
        progress: Math.max(0, Math.min(100, Number(progress.value) || 0)),
        deadline: deadline.value || "No deadline",
      });
      if (kind === "knowledge") await brain.update("knowledge", item.id, { title: t, body: body.value.trim(), topic: topic.value.trim() || "General", source: source.value.trim() });
      toast("Changes saved.");
      modal.close();
      if (onDone) onDone();
    } catch (e2) {
      err.textContent = e2.message || "Could not save.";
      err.classList.remove("hidden");
    }
  });
}

/* ── command palette ── */

export function openPalette(ctx) {
  const root = document.querySelector("#cmdk-root");
  root.innerHTML = "";
  const backdrop = el("div", { class: "cmdk-backdrop" });

  const input = el("input", { type: "text", placeholder: "Search your brain or type a command…" });
  const list = el("div", { class: "cmdk-list" });

  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", keyHandler);
  };
  function keyHandler(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", keyHandler);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });

  const box = el("div", { class: "cmdk" }, input, list);
  backdrop.append(box);
  root.append(backdrop);
  setTimeout(() => input.focus(), 40);

  function commands() {
    const q = input.value.trim().toLowerCase();
    const cmds = [
      { ico: ico.note, label: "New Note", hint: "capture", run: () => ctx.openCapture("note") },
      { ico: ico.bulb, label: "New Idea", hint: "capture", run: () => ctx.openCapture("idea") },
      { ico: ico.spark, label: "Save Thought", hint: "capture", run: () => ctx.openCapture("thought") },
      { ico: ico.target, label: "New Goal", hint: "capture", run: () => ctx.openCapture("goal") },
      { ico: ico.book, label: "Add Knowledge", hint: "capture", run: () => ctx.openCapture("knowledge") },
      { ico: ico.dashboard, label: "Go to Dashboard", hint: "navigate", run: () => (location.hash = "#/") },
      { ico: ico.brain, label: "Go to My Brain", hint: "navigate", run: () => (location.hash = "#/brain") },
      { ico: ico.note, label: "Go to Notes", hint: "navigate", run: () => (location.hash = "#/notes") },
      { ico: ico.bulb, label: "Go to Ideas", hint: "navigate", run: () => (location.hash = "#/ideas") },
      { ico: ico.book, label: "Go to Knowledge", hint: "navigate", run: () => (location.hash = "#/knowledge") },
      { ico: ico.target, label: "Go to Goals", hint: "navigate", run: () => (location.hash = "#/goals") },
      { ico: ico.share, label: "Go to Connections", hint: "navigate", run: () => (location.hash = "#/connections") },
      { ico: ico.gear, label: "Go to Settings", hint: "navigate", run: () => (location.hash = "#/settings") },
      { ico: ico.eye, label: "Try NeuroVision", hint: "coming soon", run: () => (location.hash = "#/") },
    ];

    // content results
    const d = ctx.state.data;
    const items = [
      ...d.notes.map((n) => ({ ico: ico.note, label: n.title, hint: "note", run: () => (location.hash = "#/notes") })),
      ...d.ideas.map((i) => ({ ico: ico.bulb, label: i.title, hint: "idea", run: () => (location.hash = "#/ideas") })),
      ...d.goals.map((g) => ({ ico: ico.target, label: g.title, hint: "goal", run: () => (location.hash = "#/goals") })),
      ...d.knowledge.map((k) => ({ ico: ico.book, label: k.title, hint: "knowledge", run: () => (location.hash = "#/knowledge") })),
    ];

    const all = [...cmds, ...items];
    if (!q) return all.slice(0, 10);
    return all.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 12);
  }

  let sel = 0;
  function draw() {
    const items = commands();
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = "";
    if (!items.length) {
      list.append(el("div", { class: "cmdk-empty" }, "Nothing found in your brain."));
      return;
    }
    items.forEach((c, idx) => {
      const b = el("button", { class: "cmdk-item" + (idx === sel ? " sel" : "") },
        el("span", { class: "ico", html: c.ico }),
        el("span", {}, c.label),
        el("span", { class: "hint" }, c.hint || "")
      );
      b.addEventListener("click", () => { close(); c.run(); });
      b.addEventListener("mousemove", () => { if (sel !== idx) { sel = idx; [...list.children].forEach((n, i) => n.classList.toggle("sel", i === sel)); } });
      list.append(b);
    });
  }
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll(".cmdk-item");
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); }
    else if (e.key === "Enter") { e.preventDefault(); const item = items[sel]; if (item) item.click(); return; }
    else return;
    items.forEach((n, i) => n.classList.toggle("sel", i === sel));
  });
  draw();
}

/* ── live modal ── */

export function openLive() {
  openModal({
    title: "NeuroBot Live",
    body: el("div", { class: "live-modal" },
      el("div", { class: "mic-orb" }, "🎙️"),
      el("p", {}, "Real-time voice conversations are coming soon."),
      el("p", { class: "sub", style: "font-size:12px;color:var(--faint)" }, "Talk to your second brain — ask questions, capture thoughts, review goals — just by speaking.")
    ),
    foot: el("button", { class: "btn primary", onclick: () => document.querySelector(".modal-backdrop")?.remove() }, "Can't wait ✨"),
  });
}
