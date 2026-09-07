import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifySupabaseJwt } from "./supabase-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const kid = "supabase-auth-test-key";
const issuer = "https://test-project.supabase.co/auth/v1";

function token(claims: Record<string, unknown>, signingKey = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(content), signingKey).toString("base64url");
  return `${content}.${signature}`;
}

test("Supabase JWT verification rejects invalid security claims and accepts signed aal2", async () => {
  const previousFetch = globalThis.fetch;
  const previousIssuer = process.env.SUPABASE_JWT_ISSUER;
  const previousAudience = process.env.SUPABASE_JWT_AUDIENCE;
  process.env.SUPABASE_JWT_ISSUER = issuer;
  process.env.SUPABASE_JWT_AUDIENCE = "authenticated";
  globalThis.fetch = async () => new Response(JSON.stringify({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const now = Math.floor(Date.now() / 1000);
  const base = {
    sub: "00000000-0000-4000-8000-000000000001",
    iss: issuer,
    aud: "authenticated",
    exp: now + 300,
    aal: "aal2",
    email: "owner@example.test",
    email_verified: true,
  };

  try {
    const identity = await verifySupabaseJwt(token(base));
    assert.equal(identity.subject, base.sub);
    assert.equal(identity.aal, "aal2");
    assert.equal(identity.emailVerified, true);

    await assert.rejects(
      verifySupabaseJwt(token({ ...base, aud: "anon" })),
      /claims are invalid/,
    );
    await assert.rejects(
      verifySupabaseJwt(token({ ...base, iss: `${issuer}/other` })),
      /claims are invalid/,
    );
    await assert.rejects(
      verifySupabaseJwt(token({ ...base, exp: now - 1 })),
      /expired or not active/,
    );

    const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    await assert.rejects(
      verifySupabaseJwt(token(base, otherKey)),
      /signature is invalid/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousIssuer === undefined) delete process.env.SUPABASE_JWT_ISSUER;
    else process.env.SUPABASE_JWT_ISSUER = previousIssuer;
    if (previousAudience === undefined) delete process.env.SUPABASE_JWT_AUDIENCE;
    else process.env.SUPABASE_JWT_AUDIENCE = previousAudience;
  }
});