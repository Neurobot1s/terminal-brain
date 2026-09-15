/**
 * sessions.ts — resolve a vanilla-client session token to a user id.
 */
import { Id } from "./_generated/dataModel";

export async function requireUserByToken(
  ctx: any,
  token: string,
): Promise<Id<"users"> | null> {
  if (!token) return null;
  const session = await ctx.db
    .query("nbSessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .unique();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return session.userId;
}
