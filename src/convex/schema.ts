import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // ── NeuroBot accounts (custom email + password, plain Convex tables) ──
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

    // ── NeuroBot second-brain tables (per-user) ──

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
