import type { Request } from "express";
export { verifySupabaseJwt, type SupabaseIdentity } from "@workspace/db/supabase-auth";
import { verifySupabaseJwt, type SupabaseIdentity } from "@workspace/db/supabase-auth";

const requestIdentity = Symbol("teras.supabaseIdentity");
const bearerToken = (req: Request) => req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

export async function supabaseIdentity(req: Request): Promise<SupabaseIdentity | null> {
  const cached = (req as Request & { [requestIdentity]?: Promise<SupabaseIdentity | null> })[requestIdentity];
  if (cached) return cached;
  const token = bearerToken(req);
  const result = token ? verifySupabaseJwt(token).catch(() => null) : Promise.resolve(null);
  (req as Request & { [requestIdentity]?: Promise<SupabaseIdentity | null> })[requestIdentity] = result;
  return result;
}

export async function supabaseEmailIsVerified(req: Request, identity: SupabaseIdentity): Promise<boolean> {
  if (identity.emailVerified) return true;
  const token = bearerToken(req);
  const projectUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const apiKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!token || !projectUrl || !apiKey || !identity.email) return false;
  try {
    const response = await fetch(`${projectUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: apiKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const user = await response.json() as { id?: string; email?: string; email_confirmed_at?: string | null };
    return user.id === identity.subject
      && user.email?.trim().toLowerCase() === identity.email
      && typeof user.email_confirmed_at === "string";
  } catch {
    return false;
  }
}