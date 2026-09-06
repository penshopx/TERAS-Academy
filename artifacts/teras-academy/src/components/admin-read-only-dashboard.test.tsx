import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("administrator navigation and dashboard pages use explicit read-only projections", async () => {
  const [sidebar, learner, trainer, assessor, projection] = await Promise.all([
    readFile(new URL("./layout/sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pages/dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pages/trainer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../pages/assessor.tsx", import.meta.url), "utf8"),
    readFile(new URL("./admin-read-only-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  for (const href of ["/dashboard", "/trainer", "/assessor", "/admin"]) assert.match(sidebar, new RegExp(`href: "${href}"`));
  for (const source of [learner, trainer, assessor]) {
    assert.match(source, /roles\.has\("admin"\).*!\s*roles\.has/);
    assert.match(source, /adminReadOnly/);
    assert.match(source, /AdminReadOnlyDashboard/);
  }
  assert.match(learner, /useGetAdminLearnerDashboardProjection/);
  assert.match(trainer, /useGetAdminTrainerDashboardProjection/);
  assert.match(assessor, /useGetAdminAssessorDashboardProjection/);
  assert.match(projection, /Admin read-only mode/);
  assert.match(projection, /all actor-specific actions are unavailable/);
});