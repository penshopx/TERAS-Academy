import { createPublicKey, verify } from "node:crypto";

export type SupabaseIdentity = { subject: string; aal: string | null; email: string | null; emailVerified: boolean };
type Header = { alg?: string; kid?: string };
type Claims = { sub?: string; iss?: string; aud?: string | string[]; exp?: number; nbf?: number; aal?: string; email?: string; email_confirmed_at?: string; email_verified?: boolean };
type Jwk = { kty: string; n?: string; e?: string; crv?: string; x?: string; y?: string; kid?: string; alg?: string; use?: string };
const cache: { keys: Jwk[]; expiresAt: number } = { keys: [], expiresAt: 0 };
const issuer = () => {
  const projectUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  return process.env.SUPABASE_JWT_ISSUER?.trim()
    || (projectUrl ? `${projectUrl.replace(/\/$/, "")}/auth/v1` : undefined);
};
const decode = <T>(part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
const expectedAudience = (audience: Claims["aud"]) => {
  const expected = process.env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
};
async function keysFor(expectedIssuer: string) {
  if (cache.expiresAt > Date.now() && cache.keys.length) return cache.keys;
  const response = await fetch(`${expectedIssuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error("Supabase JWKS unavailable");
  const body = await response.json() as { keys?: Jwk[] };
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("Supabase JWKS is invalid");
  cache.keys = body.keys; cache.expiresAt = Date.now() + 5 * 60_000;
  return cache.keys;
}
function signatureIsValid(token: string, header: Header, key: Jwk) {
  if (!header.alg || header.alg === "none" || key.use === "enc" || (key.alg && key.alg !== header.alg)) return false;
  const signed = Buffer.from(token.slice(0, token.lastIndexOf(".")));
  const signature = Buffer.from(token.slice(token.lastIndexOf(".") + 1), "base64url");
  const publicKey = createPublicKey({ key, format: "jwk" });
  if (header.alg === "RS256") return verify("RSA-SHA256", signed, publicKey, signature);
  if (header.alg === "ES256") return verify("sha256", signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
  return false;
}
/** Verifies a Supabase access token against the configured project JWKS. */
export async function verifySupabaseJwt(token: string): Promise<SupabaseIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed bearer token");
  const header = decode<Header>(parts[0]); const claims = decode<Claims>(parts[1]); const expectedIssuer = issuer();
  if (!expectedIssuer || !header.kid || !claims.sub || claims.iss !== expectedIssuer || !expectedAudience(claims.aud)) throw new Error("Supabase token claims are invalid");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp! <= now || (claims.nbf !== undefined && claims.nbf > now)) throw new Error("Supabase token is expired or not active");
  const key = (await keysFor(expectedIssuer)).find(item => item.kid === header.kid);
  if (!key || !signatureIsValid(token, header, key)) throw new Error("Supabase token signature is invalid");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  return { subject: claims.sub, aal: typeof claims.aal === "string" ? claims.aal : null, email, emailVerified: claims.email_verified === true || typeof claims.email_confirmed_at === "string" };
}