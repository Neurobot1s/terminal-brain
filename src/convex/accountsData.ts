/**
 * accountsData.ts — DB operations for auth (mutations/queries).
 * Called from accounts.ts actions via ctx.runMutation / ctx.runQuery.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const getAccountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx: any, args: any) => {
    return await ctx.db
      .query("nbAccounts")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();
  },
});

export const createUserWithAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
  },
  handler: async (ctx: any, args: any): Promise<string> => {
    const existing = await ctx.db
      .query("nbAccounts")
      .withIndex("by_email", (q: any) => q.eq("email", args.email))
      .unique();
    if (existing) throw new Error("An account with this email already exists. Try signing in.");
    const userId: string = await ctx.db.insert("users", { email: args.email, name: args.name });
    await ctx.db.insert("nbAccounts", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      salt: args.salt,
      userId,
    });
    return userId;
  },
});

export const insertSession = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    await ctx.db.insert("nbSessions", {
      token: args.token,
      userId: args.userId,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
    return true;
  },
});

export const deleteSession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    const session = await ctx.db
      .query("nbSessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return true;
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query("nbSessions")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const user = await ctx.db.get(session.userId);
    if (!user) return null;
    return {
      id: user._id as string,
      email: user.email ?? "",
      name: user.name ?? user.email?.split("@")[0] ?? "Explorer",
    };
  },
});
