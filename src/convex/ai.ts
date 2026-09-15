"use node";
/**
 * ai.ts — "Ask your brain" powered by Gemini. Sees all of the user's content.
 * Content gathering happens in brain.gatherForAi (a query); this file only
 * holds the node-runtime action that calls the Gemini API.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const GEMINI_API_KEY = "AQ.Ab8RN6JvNBW1MK9_Hv41sCU7IjDuDr3MGnrWIVRGEDAACSSiQQ";

export const ask = action({
  args: { token: v.string(), question: v.string() },
  handler: async (ctx: any, args: any): Promise<{ answer: string; model: string }> => {
    const brain = await ctx.runQuery(internal.brain.gatherForAi, { token: args.token });
    if (!brain) throw new Error("Not signed in");

    const q = String(args.question || "").trim();
    if (!q) throw new Error("Ask a question first.");

    const sections: string[] = [];
    if (brain.notes?.length)
      sections.push("NOTES:\n" + brain.notes.map((n: any) => `- [${n.category}] ${n.title}: ${n.body}`).join("\n"));
    if (brain.ideas?.length)
      sections.push("IDEAS:\n" + brain.ideas.map((i: any) => `- [${i.category} · ${i.status}] ${i.title}: ${i.body}`).join("\n"));
    if (brain.goals?.length)
      sections.push("GOALS:\n" + brain.goals.map((g: any) => `- [${g.status}, ${g.progress}% by ${g.deadline}] ${g.title}: ${g.body}`).join("\n"));
    if (brain.knowledge?.length)
      sections.push("KNOWLEDGE:\n" + brain.knowledge.map((k: any) => `- [${k.topic}] ${k.title}: ${k.body}`).join("\n"));

    const context =
      sections.length > 0
        ? `Here is the user's entire second brain:\n\n${sections.join("\n\n")}`
        : "The user's second brain is currently empty (no notes, ideas, goals or knowledge saved yet).";

    const prompt = `You are NeuroBot, the user's personal second-brain assistant. Answer using the user's saved content when relevant, and your own knowledge otherwise. Be concise, warm and useful (max ~180 words). You may use light markdown.\n\n${context}\n\nUser's question: ${q}`;

    const models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
    let lastErr = "";
    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
            }),
          },
        );
        if (!res.ok) {
          lastErr = `${model}: HTTP ${res.status}`;
          continue;
        }
        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text)
            .filter(Boolean)
            .join("\n") ?? "";
        if (text.trim()) return { answer: text.trim(), model };
        lastErr = `${model}: empty response`;
      } catch (e: any) {
        lastErr = `${model}: ${e?.message ?? String(e)}`;
      }
    }
    throw new Error("NeuroBot couldn't reach Gemini (" + lastErr + "). Check the API key and try again.");
  },
});
