import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Standalone Convex schema — NeuroBot handles auth itself
// (scrypt password hashes + session tokens in nbAccounts / nbSessions).

const schema = defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
  }).index("email", ["email"]),

  nbAccounts: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    passwordHash: v.string(),
    salt: v.string(),
    userId: v.id("users"),
  })
    .index("by_email", ["email"])
    .index("by_user", ["userId"]),

  nbSessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  brainNotes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    category: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    pinned: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  brainIdeas: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    category: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("exploring"),
      v.literal("building"),
      v.literal("completed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    pinned: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  brainGoals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    progress: v.number(),
    deadline: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    pinned: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  brainKnowledge: defineTable({
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    topic: v.string(),
    source: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    pinned: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  brainActivity: defineTable({
    userId: v.id("users"),
    kind: v.union(
      v.literal("note"),
      v.literal("idea"),
      v.literal("goal"),
      v.literal("knowledge"),
    ),
    title: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});

export default schema;
