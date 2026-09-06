import assert from "node:assert/strict";
import {
  allowsDemoAccess,
  allowsDemoFixtures,
  isProductionLike,
} from "@workspace/db/demo-access";

const safeDevelopment = {
  NODE_ENV: "development",
  TERAS_ENABLE_DEMO_ACCESS: "1",
  TERAS_ENABLE_DEMO_FIXTURES: "1",
};

assert.equal(allowsDemoAccess(safeDevelopment), true, "explicit development access is allowed");
assert.equal(allowsDemoFixtures(safeDevelopment), true, "explicit development fixtures are allowed");
assert.equal(allowsDemoAccess({ ...safeDevelopment, NODE_ENV: "production" }), false);
assert.equal(allowsDemoFixtures({ ...safeDevelopment, NODE_ENV: "production" }), false);
assert.equal(allowsDemoAccess({ ...safeDevelopment, REPLIT_DEPLOYMENT: "1" }), false);
assert.equal(allowsDemoFixtures({ ...safeDevelopment, REPLIT_DEPLOYMENT: "1" }), false);
assert.equal(isProductionLike({ NODE_ENV: "development", REPLIT_DEPLOYMENT: "1" }), true);
assert.equal(allowsDemoAccess({ NODE_ENV: "development" }), false, "the auth fallback requires its flag");
assert.equal(allowsDemoFixtures({ NODE_ENV: "development" }), false, "fixtures require their flag");
assert.equal(allowsDemoAccess({ ...safeDevelopment, NODE_ENV: undefined }), false);
assert.equal(allowsDemoFixtures({ ...safeDevelopment, NODE_ENV: "developmnt" }), false);
assert.equal(allowsDemoAccess({ ...safeDevelopment, NODE_ENV: "staging" }), false);
assert.equal(allowsDemoFixtures({ ...safeDevelopment, NODE_ENV: "test" }), true);

process.stdout.write("Demo access policy checks passed\n");