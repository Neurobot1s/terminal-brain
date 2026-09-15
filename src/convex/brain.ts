/**
 * brain.ts — NeuroBot second-brain data layer.
 *
 * Per-user CRUD for notes / ideas / goals / knowledge + an activity feed.
 * All queries and mutations are scoped to the signed-in user (getAuthUserId);
 * `requireUser` throws when not signed in so nothing leaks across accounts.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";  // eslint-disable-line -- verified
import { query, mutation, type MutationCtx } from "./_generated/server";

const IDEA_STATUSES = ["new", "exploring", "building", "completed"] as const;
const GOAL_STATUSES = ["active", "paused", "completed"] as const;
const ITEM_KINDS = ["note", "idea", "goal", "knowledge"] as const;

const ideaStatus = v.union(...IDEA_STATUSES.map((s) => v.literal(s)));
const goalStatus = v.union(...GOAL_STATUSES.map((s) => v.literal(s)));
const itemKind = v.union(...ITEM_KINDS.map((k) => v.literal(k)));

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not signed in");
  }
  return userId;
}

/** Everything the UI needs, in one reactive query. */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        notes: [],
        ideas: [],
        goals: [],
        knowledge: [],
        activity: [],
      };
    }
    const [notes, ideas, goals, knowledge, activity] = await Promise.all([
      ctx.db
        .query("brainNotes")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("brainIdeas")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("brainGoals")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("brainKnowledge")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("brainActivity")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    // Newest first everywhere; activity trimmed client-side.
    const byCreated = <T extends { createdAt: number }>(a: T, b: T) =>
      b.createdAt - a.createdAt;

    return {
      notes: notes
        .map(({ _id, ...n }) => ({ id: _id, kind: "note" as const, ...n }))
        .sort(byCreated),
      ideas: ideas
        .map(({ _id, ...n }) => ({ id: _id, kind: "idea" as const, ...n }))
        .sort(byCreated),
      goals: goals
        .map(({ _id, ...n }) => ({ id: _id, kind: "goal" as const, ...n }))
        .sort(byCreated),
      knowledge: knowledge
        .map(({ _id, ...n }) => ({ id: _id, kind: "knowledge" as const, ...n }))
        .sort(byCreated),
      activity: activity
        .map(({ _id, ...n }) => ({ id: _id, ...n }))
        .sort(byCreated),
    };
  },
});

/* ------------------------------ notes ------------------------------ */

export const addNote = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("brainNotes", { userId, ...args, createdAt: now, updatedAt: now });
    await logActivity(ctx, userId, "note", `Note captured: ${args.title}`, now);
  },
});

export const updateNote = mutation({
  args: {
    id: v.id("brainNotes"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Note not found");
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const removeNote = mutation({
  args: { id: v.id("brainNotes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.delete(id);
    await logActivity(ctx, userId, "note", `Note deleted: ${doc.title}`, Date.now());
  },
});

/* ------------------------------ ideas ------------------------------ */

export const addIdea = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    category: v.string(),
    status: ideaStatus,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("brainIdeas", { userId, ...args, createdAt: now, updatedAt: now });
    await logActivity(ctx, userId, "idea", `Idea logged: ${args.title}`, now);
  },
});

export const updateIdea = mutation({
  args: {
    id: v.id("brainIdeas"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(ideaStatus),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Idea not found");
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const removeIdea = mutation({
  args: { id: v.id("brainIdeas") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.delete(id);
    await logActivity(ctx, userId, "idea", `Idea deleted: ${doc.title}`, Date.now());
  },
});

/* ------------------------------ goals ------------------------------ */

export const addGoal = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    progress: v.number(),
    deadline: v.string(),
    status: goalStatus,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("brainGoals", { userId, ...args, createdAt: now, updatedAt: now });
    await logActivity(ctx, userId, "goal", `Goal set: ${args.title}`, now);
  },
});

export const updateGoal = mutation({
  args: {
    id: v.id("brainGoals"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    progress: v.optional(v.number()),
    deadline: v.optional(v.string()),
    status: v.optional(goalStatus),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Goal not found");
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const removeGoal = mutation({
  args: { id: v.id("brainGoals") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.delete(id);
    await logActivity(ctx, userId, "goal", `Goal deleted: ${doc.title}`, Date.now());
  },
});

/* ---------------------------- knowledge ---------------------------- */

export const addKnowledge = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    topic: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    await ctx.db.insert("brainKnowledge", { userId, ...args, createdAt: now, updatedAt: now });
    await logActivity(ctx, userId, "knowledge", `Knowledge captured: ${args.title}`, now);
  },
});

export const updateKnowledge = mutation({
  args: {
    id: v.id("brainKnowledge"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    topic: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) throw new Error("Knowledge item not found");
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const removeKnowledge = mutation({
  args: { id: v.id("brainKnowledge") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.delete(id);
    await logActivity(ctx, userId, "knowledge", `Knowledge deleted: ${doc.title}`, Date.now());
  },
});

/* ------------------------------ pins ------------------------------- */

export const setNotePinned = mutation({
  args: { id: v.id("brainNotes"), pinned: v.boolean() },
  handler: async (ctx, { id, pinned }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(id, { pinned });
  },
});

export const setIdeaPinned = mutation({
  args: { id: v.id("brainIdeas"), pinned: v.boolean() },
  handler: async (ctx, { id, pinned }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(id, { pinned });
  },
});

export const setGoalPinned = mutation({
  args: { id: v.id("brainGoals"), pinned: v.boolean() },
  handler: async (ctx, { id, pinned }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(id, { pinned });
  },
});

export const setKnowledgePinned = mutation({
  args: { id: v.id("brainKnowledge"), pinned: v.boolean() },
  handler: async (ctx, { id, pinned }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(id, { pinned });
  },
});

/* ----------------------------- activity ---------------------------- */

export const removeActivity = mutation({
  args: { id: v.id("brainActivity") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const doc = await ctx.db.get(id);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.delete(id);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    for (const table of [
      "brainNotes",
      "brainIdeas",
      "brainGoals",
      "brainKnowledge",
      "brainActivity",
    ] as const) {
      const docs = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
      }
    }
  },
});

/** Seed a brain with the demo dataset. `force` wipes existing data first. */
export const seedBrain = mutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.force) {
      for (const table of [
        "brainNotes",
        "brainIdeas",
        "brainGoals",
        "brainKnowledge",
        "brainActivity",
      ] as const) {
        const docs = await ctx.db
          .query(table)
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
        for (const doc of docs) await ctx.db.delete(doc._id);
      }
    }
    const existing = await ctx.db
      .query("brainNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return; // already has data

    const now = Date.now();
    const min = (n: number) => now - n * 60_000;
    const hour = (n: number) => now - n * 3_600_000;
    const day = (n: number) => now - n * 86_400_000;

    const notes = [
      {
        title: "Attention is all you need — key takeaways",
        body: "Self-attention lets every token attend to every other token. Multi-head = parallel subspaces. Positional encoding injects order.",
        category: "AI",
        createdAt: min(24),
        pinned: true,
      },
      {
        title: "Latency budget for v1",
        body: "p95 under 250ms end-to-end; warm start matters more than cold throughput. Cache the graph snapshot, invalidate on write.",
        category: "Engineering",
        createdAt: hour(5),
      },
      {
        title: "Questions after 'Thinking, Fast and Slow'",
        body: "Which recent decisions were System 1? Where do I over-trust small samples? Keep a decision journal for 30 days.",
        category: "Psychology",
        createdAt: day(1),
      },
      {
        title: "Design partner call — notes",
        body: "They want Markdown export and an offline mode before adopting. Both feasible post-v1. Follow up Friday with a one-pager.",
        category: "Business",
        createdAt: day(2),
      },
    ];
    for (const n of notes) {
      await ctx.db.insert("brainNotes", { userId, ...n, updatedAt: n.createdAt });
      await logActivity(ctx, userId, "note", `Note captured: ${n.title}`, n.createdAt);
    }

    const ideas = [
      {
        title: "Spaced-repetition graph pulses",
        body: "Nodes softly pulse when their linked notes haven't been reviewed in a while — review becomes ambient instead of a chore.",
        category: "Learning",
        status: "exploring" as const,
        createdAt: min(90),
        pinned: true,
      },
      {
        title: "Weekly brain digest",
        body: "Auto-compile the week's captures into a one-screen digest: 3 ideas, 2 connections, 1 open goal.",
        category: "Product",
        status: "new" as const,
        createdAt: hour(8),
      },
      {
        title: "Local-first sync engine",
        body: "CRDT-backed sync so the brain works offline and merges without conflicts. The server becomes a dumb relay.",
        category: "Engineering",
        status: "building" as const,
        createdAt: day(3),
      },
      {
        title: "Voice capture → auto-linking",
        body: "60-second voice notes, transcribed and auto-linked to existing nodes. Pairs with the upcoming Live mode.",
        category: "Product",
        status: "completed" as const,
        createdAt: day(5),
      },
    ];
    for (const i of ideas) {
      await ctx.db.insert("brainIdeas", { userId, ...i, updatedAt: i.createdAt });
      await logActivity(ctx, userId, "idea", `Idea logged: ${i.title}`, i.createdAt);
    }

    const goals = [
      {
        title: "Finish 'Deep Learning' specialization",
        body: "5 courses, 2 remaining. Target: 3 sessions/week, notes captured into NeuroBot after each.",
        progress: 62,
        deadline: "2026-11-30",
        status: "active" as const,
        createdAt: day(12),
        pinned: true,
      },
      {
        title: "Publish 10 technical posts",
        body: "3 down, 7 to go. One post per topic in the knowledge graph — writing tied back into the brain.",
        progress: 30,
        deadline: "2026-12-31",
        status: "active" as const,
        createdAt: day(20),
      },
      {
        title: "Prototype the connection engine",
        body: "Ship the first real (non-demo) similarity pass over captured notes.",
        progress: 15,
        deadline: "2026-10-15",
        status: "active" as const,
        createdAt: day(6),
      },
      {
        title: "Read 24 books this year",
        body: "Paused until the specialization finishes. Currently on book 14.",
        progress: 58,
        deadline: "2026-12-31",
        status: "paused" as const,
        createdAt: day(40),
      },
    ];
    for (const g of goals) {
      await ctx.db.insert("brainGoals", { userId, ...g, updatedAt: g.createdAt });
      await logActivity(ctx, userId, "goal", `Goal set: ${g.title}`, g.createdAt);
    }

    const knowledge = [
      {
        title: "Transformer architecture",
        body: "Seq2seq model built entirely on attention — no recurrence, no convolutions. Enables massive parallelism during training.",
        topic: "AI",
        source: "arXiv 1706.03762",
        createdAt: day(4),
        pinned: true,
      },
      {
        title: "Gradient descent variants",
        body: "SGD, momentum, RMSProp, Adam: adaptive learning rates trade generalization for convergence speed.",
        topic: "Programming",
        source: "course notes",
        createdAt: day(6),
      },
      {
        title: "CRDTs",
        body: "Conflict-free replicated data types merge concurrent edits without coordination — the backbone of local-first software.",
        topic: "Programming",
        source: "Ink & Switch",
        createdAt: day(8),
      },
      {
        title: "Diffusion models 101",
        body: "Learn to add noise, learn to reverse it. Sampling is iterative denoising; guidance steers the trajectory.",
        topic: "AI",
        source: "paper summary",
        createdAt: day(9),
      },
      {
        title: "Compositional memory",
        body: "Episodic vs semantic memory in humans maps cleanly onto notes vs distilled knowledge in a second brain.",
        topic: "Science",
        source: "reading notes",
        createdAt: day(11),
      },
      {
        title: "Second-brain methodology",
        body: "Capture → organize → distill → express. The value is in retrieval speed, not storage.",
        topic: "Business",
        source: "BASB",
        createdAt: day(13),
      },
      {
        title: "Spaced repetition",
        body: "Expanding intervals at the edge of forgetting maximize retention per review minute.",
        topic: "Education",
        source: "SM-2 algorithm",
        createdAt: day(14),
      },
      {
        title: "Zettelkasten",
        body: "Atomic notes + explicit links = emergent structure. Writing is thinking made visible.",
        topic: "Education",
        source: "Luhmann method",
        createdAt: day(16),
      },
    ];
    for (const k of knowledge) {
      await ctx.db.insert("brainKnowledge", { userId, ...k, updatedAt: k.createdAt });
      await logActivity(ctx, userId, "knowledge", `Knowledge captured: ${k.title}`, k.createdAt);
    }
  },
});

async function logActivity(
  ctx: MutationCtx,
  userId: Id<"users">,
  kind: (typeof ITEM_KINDS)[number],
  title: string,
  createdAt: number,
) {
  await ctx.db.insert("brainActivity", { userId, kind, title, createdAt });
}
