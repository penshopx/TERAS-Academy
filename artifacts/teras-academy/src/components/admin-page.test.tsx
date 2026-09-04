import assert from "node:assert/strict";
import test from "node:test";
import { adminErrorMessage, isAdminForbidden } from "../pages/admin";

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