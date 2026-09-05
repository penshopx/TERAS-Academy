import assert from "node:assert/strict";
import test from "node:test";
import { homeForRoles } from "./role-navigation";

test("role home destinations follow explicit operational priority", () => {
  assert.equal(homeForRoles(["learner"]), "/dashboard");
  assert.equal(homeForRoles(["assessor"]), "/assessor");
  assert.equal(homeForRoles(["trainer", "learner"]), "/trainer");
  assert.equal(homeForRoles(["admin", "trainer", "learner"]), "/admin");
});

test("users without an active role have no workspace destination", () => {
  assert.equal(homeForRoles([]), null);
  assert.equal(homeForRoles(["unknown"]), null);
});