import assert from "node:assert/strict";
import test from "node:test";
import { adminErrorMessage, filterQueueItems, isAdminForbidden } from "../pages/admin";

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

test("queue filters combine available operational context safely", () => {
  const items = [
    { id: "one", learnerId: "learner-a", pathwayId: "path-a", trainerId: "trainer-a", assessorId: null },
    { id: "two", learnerId: "learner-b", pathwayId: "path-b", trainerId: null, assessorId: "assessor-b" },
  ];
  assert.deepEqual(filterQueueItems(items, { learner: "learner-a", pathway: "path-a", trainer: "trainer-a", assessor: "unassigned" }).map(item => item.id), ["one"]);
  assert.deepEqual(filterQueueItems(items, { learner: "", pathway: "", trainer: "unassigned", assessor: "" }).map(item => item.id), ["two"]);
  assert.deepEqual(filterQueueItems(items, { learner: "unknown", pathway: "", trainer: "", assessor: "" }), []);
});
