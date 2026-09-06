import assert from "node:assert/strict";
import { configuredBootstrapEmail, verifiedBootstrapIdentity } from "./authorization";

const configured = process.env.TERAS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
process.env.TERAS_BOOTSTRAP_SUPER_ADMIN_EMAIL = "  Owner@Example.Test ";
assert.equal(configuredBootstrapEmail(), "owner@example.test", "configured bootstrap email is normalized");

const verifiedOwner = {
  id: "clerk-owner",
  firstName: "Owner",
  lastName: "Account",
  emailAddresses: [{ emailAddress: "owner@example.test", verification: { status: "verified" } }],
};
assert.deepEqual(
  verifiedBootstrapIdentity("clerk-owner", "owner@example.test", [verifiedOwner]),
  { clerkUserId: "clerk-owner", email: "owner@example.test", name: "Owner Account", initials: "OA" },
  "the exact verified Clerk owner is the only valid claimant",
);
assert.equal(
  verifiedBootstrapIdentity("clerk-other", "owner@example.test", [verifiedOwner]),
  null,
  "a different authenticated Clerk user cannot claim the configured address",
);
assert.equal(
  verifiedBootstrapIdentity("clerk-owner", "owner@example.test", [{
    ...verifiedOwner,
    emailAddresses: [{ emailAddress: "owner@example.test", verification: { status: "unverified" } }],
  }]),
  null,
  "an unverified address cannot claim bootstrap access",
);
assert.equal(
  verifiedBootstrapIdentity("clerk-owner", "owner@example.test", [verifiedOwner, { ...verifiedOwner, id: "duplicate" }]),
  null,
  "ambiguous verified Clerk ownership fails closed",
);
if (configured === undefined) delete process.env.TERAS_BOOTSTRAP_SUPER_ADMIN_EMAIL;
else process.env.TERAS_BOOTSTRAP_SUPER_ADMIN_EMAIL = configured;