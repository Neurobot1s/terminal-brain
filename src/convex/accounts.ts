"use node";
/**
 * accounts.ts — custom email + password auth actions for NeuroBot.
 * scrypt password hashing (node:crypto) + 30-day session tokens.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scryptAsync(password, salt, 64);
  return derived.toString("hex");
}

function makeToken(): string {
  const bytes = randomBytes(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function startSession(ctx: any, userId: string) {
  const token = makeToken();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await ctx.runMutation(internal.accountsData.insertSession, { userId, token, expiresAt });
  return { token, expiresAt };
}

export const signUp = action({
  args: { email: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx: any, args: any): Promise<{ token: string; expiresAt: number }> => {
    const email = String(args.email || "").trim().toLowerCase();
    const password = String(args.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }
    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    const existing = await ctx.runQuery(internal.accountsData.getAccountByEmail, { email });
    if (existing) throw new Error("An account with this email already exists. Try signing in.");

    const displayName = String(args.name || "").trim() || email.split("@")[0];
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password, salt);

    const userId: string = await ctx.runMutation(internal.accountsData.createUserWithAccount, {
      email,
      name: displayName,
      passwordHash,
      salt,
    });
    return await startSession(ctx, userId);
  },
});

export const signIn = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx: any, args: any): Promise<{ token: string; expiresAt: number }> => {
    const email = String(args.email || "").trim().toLowerCase();
    const password = String(args.password || "");
    const account = await ctx.runQuery(internal.accountsData.getAccountByEmail, { email });
    if (!account) throw new Error("Invalid email or password.");

    const candidate = await hashPassword(password, account.salt);
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(account.passwordHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Invalid email or password.");
    }
    return await startSession(ctx, account.userId);
  },
});

export const signOut = action({
  args: { token: v.string() },
  handler: async (ctx: any, args: any) => {
    if (args.token) {
      await ctx.runMutation(internal.accountsData.deleteSession, { token: args.token });
    }
    return true;
  },
});
