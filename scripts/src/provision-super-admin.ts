import { createClerkClient } from "@clerk/backend";
import { provisionSuperAdmin } from "@workspace/db/admin-membership";

const argumentsByName = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith("--") || !value) {
    throw new Error("Usage: provision:super-admin --clerk-user-id <user_id> --verified-email <email> --confirm-production PROVISION");
  }
  argumentsByName.set(name, value);
}

const clerkUserId = argumentsByName.get("--clerk-user-id")?.trim();
const email = argumentsByName.get("--verified-email")?.trim().toLowerCase();
const confirmation = argumentsByName.get("--confirm-production");
if (!clerkUserId?.startsWith("user_")) throw new Error("--clerk-user-id must be an explicit Clerk user ID.");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("--verified-email must be a valid email address.");
if (confirmation !== "PROVISION") throw new Error("Refusing provisioning without --confirm-production PROVISION.");
if (process.env.NODE_ENV !== "production" || process.env.REPLIT_DEPLOYMENT !== "1") {
  throw new Error("Refusing provisioning outside a Replit Production deployment.");
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY is required to resolve the existing verified Clerk user.");

const clerk = createClerkClient({ secretKey });
const account = await clerk.users.getUser(clerkUserId);
const verifiedEmail = account.emailAddresses.find(address =>
  address.emailAddress.toLowerCase() === email && address.verification?.status === "verified",
);
if (!verifiedEmail) {
  throw new Error("The explicit Production Clerk user does not own this verified email; provisioning refused.");
}
const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || email;
const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const result = await provisionSuperAdmin({ clerkUserId: account.id, email: verifiedEmail.emailAddress, name, initials });
if (result.status !== "active" || !result.roles.includes("super_admin")) {
  throw new Error("Provisioning completed without an active local super_admin assignment.");
}
process.stdout.write(`Verified active super_admin for Clerk user ${account.id} (person ${result.personId}).\n`);
