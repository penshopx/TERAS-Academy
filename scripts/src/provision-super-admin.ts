import { createClerkClient } from "@clerk/backend";
import { provisionSuperAdmin } from "@workspace/db/admin-membership";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Usage: pnpm --filter @workspace/scripts provision:super-admin <verified-email>");
}
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY is required to resolve the existing verified Clerk user.");

const clerk = createClerkClient({ secretKey });
const result = await clerk.users.getUserList({ emailAddress: [email], limit: 100 });
const matching = result.data.filter(user => user.emailAddresses.some(address =>
  address.emailAddress.toLowerCase() === email && address.verification?.status === "verified",
));
if (!matching.length) throw new Error("No existing Clerk account with this verified email was found.");
if (matching.length !== 1) throw new Error("Email resolves to multiple verified Clerk accounts; provisioning refused.");
const account = matching[0];
const verifiedEmail = account.emailAddresses.find(address => address.emailAddress.toLowerCase() === email)!;
const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || email;
const initials = name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
await provisionSuperAdmin({ clerkUserId: account.id, email: verifiedEmail.emailAddress, name, initials });
process.stdout.write(`Provisioned super_admin for Clerk user ${account.id}.\n`);