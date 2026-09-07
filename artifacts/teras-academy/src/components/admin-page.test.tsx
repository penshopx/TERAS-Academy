import assert from "node:assert/strict";
import test from "node:test";
import { adminErrorMessage, filterQueueItems, isAdminForbidden, isAdminMfaRequired, queueStateFromSearch, shouldEnableAdminQueries, validateQueueFilters } from "../pages/admin";

test("admin conflict errors provide an actionable accessible message", () => {
  assert.equal(
    adminErrorMessage({ status: 409, data: { error: "duplicate" } }),
    "Konflik: data sudah ada atau berubah. Muat ulang lalu coba lagi.",
  );
});

test("admin errors retain the API message when no conflict exists", () => {
  assert.equal(adminErrorMessage({ data: { error: "Tidak diizinkan" } }), "Tidak diizinkan");
});

test("admin forbidden response has a safe access-denied state", () => {
  assert.equal(isAdminForbidden({ status: 403 }), true);
  assert.equal(adminErrorMessage({ status: 403 }), "Anda tidak memiliki akses admin.");
});

test("admin MFA denial is distinguished from a missing role", () => {
  assert.equal(isAdminMfaRequired({ status: 403, data: { error: "Super administrator MFA (aal2) is required" } }), true);
  assert.equal(isAdminMfaRequired({ status: 403, data: { error: "Administrator role required" } }), false);
});

test("admin detail queries wait for a completed successful access gate", () => {
  assert.equal(shouldEnableAdminQueries({ isSuccess: false, isFetching: true }), false);
  assert.equal(shouldEnableAdminQueries({ isSuccess: true, isFetching: true, data: { authorized: true } }), false);
  assert.equal(shouldEnableAdminQueries({ isSuccess: false, isFetching: false, data: { authorized: true } }), false);
  assert.equal(shouldEnableAdminQueries({ isSuccess: true, isFetching: false, data: { authorized: true } }), true);
});

test("queue filters combine available operational context safely", () => {
  const items = [
    { id: "one", learnerId: "learner-a", pathwayId: "path-a", trainerId: "trainer-a", assessorId: null },
    { id: "two", learnerId: "learner-b", pathwayId: "path-b", trainerId: null, assessorId: "assessor-b" },
  ];
  assert.deepEqual(filterQueueItems(items, { learner: "learner-a", pathway: "path-a", trainer: "trainer-a", assessor: "unassigned" }).map(item => item.id), ["one"]);
  assert.deepEqual(filterQueueItems(items, { learner: "", pathway: "", trainer: "unassigned", assessor: "" }).map(item => item.id), ["two"]);
  assert.deepEqual(filterQueueItems(items, { learner: "unknown", pathway: "", trainer: "", assessor: "" }), []);
});

test("queue links restore the selected detail and filters from the URL", () => {
  const restored = queueStateFromSearch("?queue=remediation&learner=learner-a&trainer=unassigned");
  assert.deepEqual(restored, {
    selectedQueue: "remediation",
    filters: { learner: "learner-a", pathway: "", trainer: "unassigned", assessor: "" },
  });
  assert.deepEqual(validateQueueFilters([
    { learnerId: "learner-a", pathwayId: "path-a", trainerId: null, assessorId: "assessor-a" },
  ], restored.filters), restored.filters);
});

test("switching queues through the URL clears filters unavailable in the active queue", () => {
  const restored = queueStateFromSearch("?queue=assessment&learner=learner-from-remediation&trainer=trainer-a&assessor=unassigned");
  assert.deepEqual(validateQueueFilters([
    { learnerId: "learner-assessment", pathwayId: "path-a", trainerId: "trainer-a", assessorId: "assessor-a" },
  ], restored.filters), {
    learner: "",
    pathway: "",
    trainer: "trainer-a",
    assessor: "",
  });
});

test("stale or missing queue links clear the selected detail safely", () => {
  assert.deepEqual(queueStateFromSearch("?queue=unknown&assessor=assessor-a"), {
    selectedQueue: null,
    filters: { learner: "", pathway: "", trainer: "", assessor: "assessor-a" },
  });
  assert.deepEqual(queueStateFromSearch(""), {
    selectedQueue: null,
    filters: { learner: "", pathway: "", trainer: "", assessor: "" },
  });
});
