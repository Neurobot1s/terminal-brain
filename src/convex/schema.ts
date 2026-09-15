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

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ── NeuroBot second-brain tables (per-user, single user per email) ──

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
