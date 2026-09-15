/* ============================================================
   NeuroBot — ai.js
   Gemini integration (school project, hardcoded key).

   Model: gemini-2.0-flash (free tier, ~1500 requests/day).
   Sends a compact digest of the user's localStorage brain as
   context and asks Gemini to answer strictly from it.
   ============================================================ */
import { getStore, totalItems } from "./core.js";

/* Hardcoded API key (school project — owner accepted the tradeoff). */
const GEMINI_KEY = "AQ.Ab8RN6JvNBW1MK9_Hv41sCU7IjDuDr3MGnrWIVRGEDAACSSiQQ";
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

const MODELS = ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];

/* ---------------- Context builder ---------------- */

function brainContext() {
  const s = getStore();
  const lines = [];
  s.knowledge.forEach((k) => lines.push(`- [knowledge/${k.topic}] ${k.title}: ${k.body} (source: ${k.source})`));
  s.notes.forEach((n) => lines.push(`- [note/${n.category}] ${n.title}: ${n.body}`));
  s.ideas.forEach((i) => lines.push(`- [idea/${i.category}, status ${i.status}] ${i.title}: ${i.body}`));
  s.goals.forEach((g) => lines.push(`- [goal, ${g.progress}%, ${g.status}] ${g.title}: ${g.body} (deadline ${g.deadline})`));
  return lines.join("\n");
}

function buildPrompt(question) {
  return [
    "You are NeuroBot, a personal second-brain assistant.",
    "Answer the user's question using ONLY the memories below.",
    "If the memories do not contain the answer, say so briefly and offer what is closest.",
    "Be concise (max ~120 words). Plain text only.",
    "",
    `MEMORIES (${totalItems()} items):`,
    brainContext(),
    "",
    `QUESTION: ${question}`,
  ].join("\n");
}

/* ---------------- API call ---------------- */

let callCount = 0; // in-memory counter for the day (demo guardrail)

export async function askGemini(question) {
  if (callCount >= 100) {
    throw new Error("Demo limit reached (100 asks this session) — protects your free-tier quota.");
  }
  callCount++;

  const body = {
    contents: [{ role: "user", parts: [{ text: buildPrompt(question) }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
  };

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(GEMINI_URL(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = new Error(`Gemini API error ${res.status}`);
        continue; // try next model
      }
      const data = await res.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ?? "";
      if (text) return text;
      lastErr = new Error("Gemini returned an empty response.");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Gemini request failed.");
}

/* ---------------- Ask modal + answer rendering ---------------- */

export function openAskModal(preFill) {
  // Imported lazily to avoid a circular import at module-eval time.
  import("./core.js").then(({ openModal, esc, toast }) => {
    const modal = openModal({ title: "Ask your brain", subtitle: "$ neurobot ask --gemini" });
    modal.body.innerHTML = `
      <div class="ask-modal">
        <p class="muted-sm">Gemini answers using your ${totalItems()} memories as context.</p>
        <textarea id="ask-q" rows="3" placeholder="e.g. Summarize what I've captured about AI…">${esc(preFill || "")}</textarea>
        <div class="form-actions">
          <button class="btn btn-outline btn-sm" data-cancel>Cancel</button>
          <button class="btn btn-primary btn-sm" id="ask-go">✦ Ask Gemini</button>
        </div>
        <div id="ask-out" class="ask-out hidden"></div>
      </div>`;
    modal.body.querySelector("[data-cancel]").addEventListener("click", modal.close);
    modal.body.querySelector("#ask-go").addEventListener("click", async () => {
      const q = modal.body.querySelector("#ask-q").value.trim();
      if (!q) return;
      const out = modal.body.querySelector("#ask-out");
      out.classList.remove("hidden");
      out.innerHTML = `<div class="ask-loading">✦ Thinking with ${totalItems()} memories…</div>`;
      try {
        const answer = await askGemini(q);
        out.innerHTML = `<div class="ask-answer">${esc(answer)}</div>`;
      } catch (err) {
        out.innerHTML = `<div class="ask-error">⚠ ${esc(err.message || "Request failed")}</div>`;
      }
    });
    setTimeout(() => modal.body.querySelector("#ask-q")?.focus(), 30);
  });
}
