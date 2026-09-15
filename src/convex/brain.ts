/**
 * brain.ts — second-brain data layer (vanilla client, token auth).
 */
import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { requireUserByToken } from "./sessions";

function now(): number {
  return Date.now();
}

async function logActivity(ctx: any, userId: any, kind: string, title: string) {
  await ctx.db.insert("brainActivity", { userId, kind, title, createdAt: now() });
}

async function wipeAll(ctx: any, userId: any) {
  for (const table of ["brainNotes", "brainIdeas", "brainGoals", "brainKnowledge", "brainActivity"]) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

/** Internal: gather all brain content for the AI context builder (ai.ts). */
export const gatherForAi = internalQuery({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) return null;
    const [notes, ideas, goals, knowledge] = await Promise.all([
      ctx.db.query("brainNotes").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainIdeas").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainGoals").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainKnowledge").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
    ]);
    return { notes, ideas, goals, knowledge };
  },
});

export const listAll = query({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) return null;
    const [notes, ideas, goals, knowledge, activity] = await Promise.all([
      ctx.db.query("brainNotes").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainIdeas").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainGoals").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db.query("brainKnowledge").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect(),
      ctx.db
        .query("brainActivity")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .order("desc")
        .take(50),
    ]);
    const map = (d: any) => ({
      id: d._id as string,
      title: d.title,
      body: d.body,
      category: d.category ?? d.topic ?? "",
      status: d.status ?? undefined,
      progress: d.progress ?? undefined,
      deadline: d.deadline ?? undefined,
      topic: d.topic ?? undefined,
      source: d.source ?? undefined,
      kind: d.kind ?? undefined,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      pinned: !!d.pinned,
    });
    return {
      notes: notes.map(map),
      ideas: ideas.map(map),
      goals: goals.map(map),
      knowledge: knowledge.map(map),
      activity: activity.map((d: any) => ({
        id: d._id as string,
        kind: d.kind as string,
        title: d.title,
        createdAt: d.createdAt,
      })),
    };
  },
});

export const addNote = mutation({
  args: { token: v.string(), title: v.string(), body: v.string(), category: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const ts = now();
    const id = await ctx.db.insert("brainNotes", {
      userId, title: args.title, body: args.body, category: args.category, createdAt: ts, updatedAt: ts,
    });
    await logActivity(ctx, userId, "note", args.title);
    return id;
  },
});

export const updateNote = mutation({
  args: {
    token: v.string(), id: v.id("brainNotes"),
    title: v.optional(v.string()), body: v.optional(v.string()),
    category: v.optional(v.string()), pinned: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Note not found");
    const { token: _t, id: _i, ...patch } = args;
    await ctx.db.patch(args.id, { ...patch, updatedAt: now() });
    return args.id;
  },
});

export const removeNote = mutation({
  args: { token: v.string(), id: v.id("brainNotes") },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Note not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const addIdea = mutation({
  args: {
    token: v.string(), title: v.string(), body: v.string(), category: v.string(),
    status: v.union(v.literal("new"), v.literal("exploring"), v.literal("building"), v.literal("completed")),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const ts = now();
    const id = await ctx.db.insert("brainIdeas", {
      userId, title: args.title, body: args.body, category: args.category, status: args.status, createdAt: ts, updatedAt: ts,
    });
    await logActivity(ctx, userId, "idea", args.title);
    return id;
  },
});

export const updateIdea = mutation({
  args: {
    token: v.string(), id: v.id("brainIdeas"),
    title: v.optional(v.string()), body: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(v.union(v.literal("new"), v.literal("exploring"), v.literal("building"), v.literal("completed"))),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Idea not found");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Idea not found");
    const { token: _t, id: _i, ...patch } = args;
    await ctx.db.patch(args.id, { ...patch, updatedAt: now() });
    return args.id;
  },
});

export const removeIdea = mutation({
  args: { token: v.string(), id: v.id("brainIdeas") },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Idea not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const addGoal = mutation({
  args: {
    token: v.string(), title: v.string(), body: v.string(), progress: v.number(),
    deadline: v.string(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("completed")),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const ts = now();
    const id = await ctx.db.insert("brainGoals", {
      userId, title: args.title, body: args.body, progress: args.progress,
      deadline: args.deadline, status: args.status, createdAt: ts, updatedAt: ts,
    });
    await logActivity(ctx, userId, "goal", args.title);
    return id;
  },
});

export const updateGoal = mutation({
  args: {
    token: v.string(), id: v.id("brainGoals"),
    title: v.optional(v.string()), body: v.optional(v.string()),
    progress: v.optional(v.number()), deadline: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("completed"))),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Goal not found");
    const { token: _t, id: _i, ...patch } = args;
    await ctx.db.patch(args.id, { ...patch, updatedAt: now() });
    return args.id;
  },
});

export const removeGoal = mutation({
  args: { token: v.string(), id: v.id("brainGoals") },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Goal not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const addKnowledge = mutation({
  args: {
    token: v.string(), title: v.string(), body: v.string(), topic: v.string(), source: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const ts = now();
    const id = await ctx.db.insert("brainKnowledge", {
      userId, title: args.title, body: args.body, topic: args.topic, source: args.source, createdAt: ts, updatedAt: ts,
    });
    await logActivity(ctx, userId, "knowledge", args.title);
    return id;
  },
});

export const updateKnowledge = mutation({
  args: {
    token: v.string(), id: v.id("brainKnowledge"),
    title: v.optional(v.string()), body: v.optional(v.string()),
    topic: v.optional(v.string()), source: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Knowledge not found");
    const { token: _t, id: _i, ...patch } = args;
    await ctx.db.patch(args.id, { ...patch, updatedAt: now() });
    return args.id;
  },
});

export const removeKnowledge = mutation({
  args: { token: v.string(), id: v.id("brainKnowledge") },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Knowledge not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const removeActivity = mutation({
  args: { token: v.string(), id: v.id("brainActivity") },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) throw new Error("Entry not found");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const clearAll = mutation({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    await wipeAll(ctx, userId);
    return true;
  },
});

export const reseed = mutation({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await requireUserByToken(ctx, args.token);
    if (!userId) throw new Error("Not signed in");
    await wipeAll(ctx, userId);
    const ts = now();
    const notes = [
      { title: "How transformers work", body: "Self-attention lets every token look at every other token. Q, K, V matrices compute relevance; multi-head runs this in parallel subspaces.", category: "AI" },
      { title: "SQL vs NoSQL tradeoffs", body: "SQL: strong schema, joins, ACID. NoSQL: flexible docs, horizontal scale. Pick by data shape and consistency needs.", category: "Programming" },
      { title: "Spaced repetition", body: "Review at expanding intervals: 1d, 3d, 7d, 21d. Active recall beats rereading.", category: "Learning" },
    ];
    for (const s of notes) {
      await ctx.db.insert("brainNotes", { userId, ...s, createdAt: ts, updatedAt: ts });
      await ctx.db.insert("brainActivity", { userId, kind: "note", title: s.title, createdAt: ts });
    }
    const ideas = [
      { title: "AI study group matcher", body: "Match students by complementary strengths using course data + availability windows.", category: "EdTech", status: "exploring" as const },
      { title: "Campus food-waste marketplace", body: "Cafés list surplus meals at discount before closing; students reserve in-app.", category: "Sustainability", status: "building" as const },
      { title: "Podcast to flashcards", body: "Transcribe episodes, extract Q/A pairs, export to Anki automatically.", category: "Productivity", status: "new" as const },
    ];
    for (const s of ideas) {
      await ctx.db.insert("brainIdeas", { userId, ...s, createdAt: ts, updatedAt: ts });
      await ctx.db.insert("brainActivity", { userId, kind: "idea", title: s.title, createdAt: ts });
    }
    const goals = [
      { title: "Ship NeuroBot demo", body: "Vanilla frontend + Convex backend + auth, deployed.", progress: 85, deadline: "2026-10-01", status: "active" as const },
      { title: "Read 12 books this year", body: "Two non-fiction per quarter, one novel per month.", progress: 50, deadline: "2026-12-31", status: "active" as const },
    ];
    for (const g of goals) {
      await ctx.db.insert("brainGoals", { userId, ...g, createdAt: ts, updatedAt: ts });
      await ctx.db.insert("brainActivity", { userId, kind: "goal", title: g.title, createdAt: ts });
    }
    const knowledge = [
      { title: "Gradient descent", body: "Iteratively nudge parameters opposite to the loss gradient. Learning rate scales each step.", topic: "AI", source: "Course notes" },
      { title: "Big-O cheat sheet", body: "Array access O(1), search O(n), sort O(n log n). HashMap lookup amortized O(1).", topic: "Programming", source: "Interview prep" },
      { title: "Photosynthesis", body: "Light reactions split water and make ATP; the Calvin cycle fixes CO2 into sugar.", topic: "Science", source: "Biology class" },
      { title: "Unit economics", body: "LTV:CAC above 3 is healthy. Payback under 12 months keeps startups alive.", topic: "Business", source: "Y Combinator" },
      { title: "Feynman technique", body: "Explain it simply; gaps reveal what you don't actually know.", topic: "Education", source: "Study methods" },
    ];
    for (const k of knowledge) {
      await ctx.db.insert("brainKnowledge", { userId, ...k, createdAt: ts, updatedAt: ts });
      await ctx.db.insert("brainActivity", { userId, kind: "knowledge", title: k.title, createdAt: ts });
    }
    return true;
  },
});
