import { provisionSuperAdmin } from "@workspace/db/admin-membership";
import { verifySupabaseJwt } from "@workspace/db/supabase-auth";
import { allowsSuperAdminMfa } from "@workspace/db/super-admin-mfa-policy";

const argumentsByName = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || !value) {
    throw new Error("Usage: provision:super-admin --verified-email <email> --confirm-production PROVISION [--name <name>]");
  }
  argumentsByName.set(name, value);
}
const token = process.env.SUPABASE_BOOTSTRAP_ACCESS_TOKEN?.trim();
const requestedEmail = argumentsByName.get("--verified-email")?.trim().toLowerCase();
const confirmation = argumentsByName.get("--confirm-production");
const requestedName = argumentsByName.get("--name")?.trim();
if (!token) throw new Error("SUPABASE_BOOTSTRAP_ACCESS_TOKEN must be supplied as a temporary Replit Secret.");
if (!requestedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) throw new Error("--verified-email must be a valid email address.");
if (confirmation !== "PROVISION") throw new Error("Refusing provisioning without --confirm-production PROVISION.");
if (process.env.NODE_ENV !== "production" || process.env.REPLIT_DEPLOYMENT !== "1") {
  throw new Error("Refusing provisioning outside a Replit Production deployment.");
}

// Verification includes issuer, audience, expiry, signature/JWKS and subject.
// Do not log token parsing failures: an access token must never reach output.
let identity;
try {
  identity = await verifySupabaseJwt(token);
} catch {
  throw new Error("The supplied Supabase access token is invalid for this Production project.");
}
if (!allowsSuperAdminMfa({ aal: identity.aal, test: false }, process.env)) {
  throw new Error("Supabase aal2 with locked MFA enrollment is required to provision a Production super administrator.");
}
if (!identity.email || !identity.emailVerified || identity.email !== requestedEmail) {
  throw new Error("The supplied Supabase access token does not contain the requested verified email.");
}
const name = requestedName || identity.email;
const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "SA";
const result = await provisionSuperAdmin({ authSubject: identity.subject, email: identity.email, name, initials });
if (result.status !== "active" || !result.roles.includes("super_admin")) {
  throw new Error("Provisioning completed without an active local super_admin assignment.");
}
process.stdout.write(`Verified active Supabase super_admin (person ${result.personId}).\n`);