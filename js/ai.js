/* ============================================================
   NeuroBot — ai.js
   Gemini integration (pure fetch, no SDK). The AI sees EVERYTHING:
   every note, idea, goal, knowledge item, activity log + chat memory.
   School project — key is hardcoded by design (owner's key).
   ============================================================ */

import {
  GEMINI_KEY, GEMINI_MODEL, getStore, setChat, esc, el, $, toast, openModal,
  formatDay, timeAgo,
} from "./core.js";

export { GEMINI_MODEL };

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/* ---------------- Context builder ---------------- */

/** Serializes the entire brain so Gemini can see everything. */
export function buildBrainContext() {
  const s = getStore();
  const lines = [];

  lines.push("## NOTES");
  if (s.notes.length === 0) lines.push("(none)");
  for (const n of s.notes) {
    lines.push(`- [${formatDay(n.createdAt)}] "${n.title}" (category: ${n.category})${n.pinned ? " [pinned]" : ""}: ${n.body}`);
  }

  lines.push("## IDEAS");
  if (s.ideas.length === 0) lines.push("(none)");
  for (const i of s.ideas) {
    lines.push(`- [${formatDay(i.createdAt)}] "${i.title}" (category: ${i.category}, status: ${i.status})${i.pinned ? " [pinned]" : ""}: ${i.body}`);
  }

  lines.push("## GOALS");
  if (s.goals.length === 0) lines.push("(none)");
  for (const g of s.goals) {
    lines.push(`- [deadline ${g.deadline}] "${g.title}" (progress: ${g.progress}%, status: ${g.status})${g.pinned ? " [pinned]" : ""}: ${g.body}`);
  }

  lines.push("## KNOWLEDGE");
  if (s.knowledge.length === 0) lines.push("(none)");
  for (const k of s.knowledge) {
    lines.push(`- [${formatDay(k.createdAt)}] "${k.title}" (topic: ${k.topic}, source: ${k.source})${k.pinned ? " [pinned]" : ""}: ${k.body}`);
  }

  lines.push("## RECENT ACTIVITY");
  if (s.activity.length === 0) lines.push("(none)");
  for (const a of s.activity.slice(0, 15)) {
    lines.push(`- [${timeAgo(a.createdAt)}] ${a.title}`);
  }

  return lines.join("\n");
}

export function brainStats() {
  const s = getStore();
  return {
    notes: s.notes.length,
    ideas: s.ideas.length,
    goals: s.goals.length,
    knowledge: s.knowledge.length,
    total: s.notes.length + s.ideas.length + s.goals.length + s.knowledge.length,
  };
}

/* ---------------- Gemini call (vanilla fetch) ---------------- */

/**
 * askGemini — sends the full brain + chat history + user question to Gemini.
 * Returns the assistant's reply text. Throws with a friendly message.
 */
export async function askGemini(question) {
  const s = getStore();
  const stats = brainStats();
  const now = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

  const systemPrompt = `You are NeuroBot, the user's personal second brain — an AI that has read every note, idea, goal, and piece of knowledge its owner has captured. You are not a generic assistant: you are THEIR brain, speaking in first person about THEIR memories.

Today is ${now}.
Brain inventory: ${stats.notes} notes, ${stats.ideas} ideas, ${stats.goals} goals, ${stats.knowledge} knowledge items (${stats.total} total memories).

OWNER'S ENTIRE SECOND BRAIN:
${buildBrainContext()}

RULES:
1. Answer ONLY from the memories above when the question is about the owner's life, notes, ideas, goals or knowledge. Quote or reference specific memories when relevant (e.g. your note "Latency budget for v1").
2. If something is not in the brain, say so plainly and offer your general knowledge clearly labelled as such.
3. Be concise, warm, and useful. Use short paragraphs or tight bullet lists. No markdown headers.
4. The owner is Tanishq, a student building this for a school project. Keep tone friendly.
5. Never invent memories that are not in the brain.`;

  // Chat memory: previous turns (trimmed), mapped to Gemini's contents format.
  // Drop the trailing user turn — it is sent as the final contents entry below.
  let trimmed = s.chat.slice(-12);
  if (trimmed.length && trimmed[trimmed.length - 1].role === "user") {
    trimmed = trimmed.slice(0, -1);
  }
  const history = trimmed.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...history, { role: "user", parts: [{ text: question }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024, topP: 0.95 },
    safetySettings: [],
  };

  let res;
  try {
    res = await fetch(ENDPOINT(GEMINI_MODEL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error — could not reach Gemini. Check your connection.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || "";
    } catch { /* ignore */ }
    if (res.status === 429) throw new Error("Gemini rate limit hit — wait a moment and ask again.");
    if (res.status === 400 && /API key/i.test(detail)) throw new Error("Gemini rejected the API key. " + detail);
    if (res.status === 403) throw new Error("Gemini key lacks permission for this model. " + detail);
    throw new Error(`Gemini error ${res.status}. ${detail}`.trim());
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(
      reason === "SAFETY"
        ? "Gemini blocked that response for safety reasons. Try rephrasing."
        : "Gemini returned an empty response. Try again.",
    );
  }
  return text;
}

/* ---------------- Chat UI ---------------- */

/**
 * attachBrainChat — wires the dashboard "Ask your brain anything…" box:
 * renders the conversation, calls Gemini, stores memory in localStorage.
 */
export function attachBrainChat(container) {
  const s = getStore();
  const stats = brainStats();

  container.innerHTML = `
    <div class="spread">
      <div class="row">
        <span class="stat-icon" style="color:var(--primary);border-color:oklch(0.4744 0.1136 150.86/40%)">✦</span>
        <span class="text-xs" style="text-transform:uppercase;letter-spacing:0.12em;color:var(--muted-foreground)">ask your brain</span>
      </div>
      <span class="text-xs muted">Gemini · sees all ${stats.total} memories</span>
    </div>
    <div class="ai-log" id="ai-log"></div>
    <form class="ask-bar" id="ai-form" style="border-radius:0;border:0;border-top:1px solid var(--border)">
      <span class="prompt">&gt;</span>
      <input id="ai-input" placeholder="Ask your brain anything…" autocomplete="off" />
      <button type="button" class="icon-btn" id="ai-mic" title="Voice input (coming soon)" style="width:2rem;height:2rem">🎙</button>
      <button type="submit" class="btn btn-primary btn-sm" id="ai-send" disabled>Send</button>
    </form>
  `;

  const log = $("#ai-log", container);
  const form = $("#ai-form", container);
  const input = $("#ai-input", container);
  const send = $("#ai-send", container);

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  const renderMsg = (m) => {
    const isUser = m.role === "user";
    const node = el(`
      <div class="msg ${isUser ? "user" : "bot"}">
        ${esc(m.text)}
        <span class="meta">${isUser ? "you" : "neurobot · gemini"}${m.ts ? " · " + timeAgo(m.ts) : ""}</span>
      </div>
    `);
    log.appendChild(node);
    return node;
  };

  // Restore persisted conversation.
  if (chat.length === 0) {
    log.appendChild(el(`
      <div class="msg bot">Brain online. I can see every note, idea, goal and piece of knowledge you've captured — ask me anything about them.<span class="meta">neurobot · ${GEMINI_MODEL}</span></div>
    `));
  } else {
    chat.forEach(renderMsg);
    scrollDown();
  }

  input.addEventListener("input", () => { send.disabled = !input.value.trim(); });

  $("#ai-mic", container).addEventListener("click", () =>
    toast("Voice input is coming soon — see the Live button."),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    send.disabled = true;

    renderMsg({ role: "user", text: q, ts: Date.now() });
    scrollDown();

    // Optimistic conversation copy — only persisted on success.
    const next = [...getStore().chat, { role: "user", text: q, ts: Date.now() }];
    setChat(next);

    const typing = el(`
      <div class="msg bot" id="ai-typing">
        <span class="typing"><i></i><i></i><i></i></span>
        <span class="meta">reading your brain…</span>
      </div>
    `);
    log.appendChild(typing);
    scrollDown();

    try {
      const answer = await askGemini(q);
      $("#ai-typing", log)?.remove();
      renderMsg({ role: "model", text: answer, ts: Date.now() });
      setChat([...getStore().chat, { role: "model", text: answer, ts: Date.now() }]);
      scrollDown();
    } catch (err) {
      $("#ai-typing", log)?.remove();
      log.appendChild(el(`<div class="msg err">⚠ ${esc(err.message)}</div>`));
      scrollDown();
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
}

/* ---------------- NeuroVision (coming soon, no capture) ---------------- */

export function openNeuroVision() {
  const modal = openModal({ subtitle: "$ neurobot vision --screen", title: "NeuroVision" });
  modal.body.innerHTML = `
    <div style="text-align:center;padding:1.25rem 0">
      <div style="font-size:2rem">👁</div>
      <h3 class="mt-2" style="font-weight:700">NeuroVision</h3>
      <p class="text-sm muted" style="margin:0.5rem auto 0;max-width:22rem">
        Let NeuroBot understand what's on your screen. Screen understanding is coming soon — nothing is being recorded or captured.
      </p>
      <div class="chip amber" style="margin-top:1rem">coming soon</div>
    </div>
  `;
}
