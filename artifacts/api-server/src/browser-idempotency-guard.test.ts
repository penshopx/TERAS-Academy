import assert from "node:assert/strict";
import { requiredTestDatabaseUrl } from "./browser-idempotency-guard.js";

const validUrl = "postgresql://test:test@127.0.0.1:5432/integration_admin";

for (const nodeEnvironment of ["production", "development", undefined]) {
  assert.throws(
    () => requiredTestDatabaseUrl({
      NODE_ENV: nodeEnvironment,
      INTEGRATION_TEST_POSTGRES_URL: validUrl,
    }),
    {
      message: "The browser idempotency harness may only run with NODE_ENV=test.",
    },
  );
}

assert.throws(
  () => requiredTestDatabaseUrl({ NODE_ENV: "test" }),
  {
    message: "INTEGRATION_TEST_POSTGRES_URL is required; it must point at a PostgreSQL server used only to create disposable test databases.",
  },
);

assert.throws(
  () => requiredTestDatabaseUrl({
    NODE_ENV: "test",
    INTEGRATION_TEST_POSTGRES_URL: "https://example.com/integration_admin",
  }),
  {
    message: "INTEGRATION_TEST_POSTGRES_URL must be a PostgreSQL URL.",
  },
);

for (const applicationUrl of [
  validUrl,
  "postgres://other-credentials@127.0.0.1/integration_admin",
  "postgresql://other-credentials@LOCALHOST:5432/integration_admin",
]) {
  assert.throws(
    () => requiredTestDatabaseUrl({
      NODE_ENV: "test",
      INTEGRATION_TEST_POSTGRES_URL: validUrl.replace("127.0.0.1", "localhost"),
      DATABASE_URL: applicationUrl.replace("127.0.0.1", "localhost"),
    }),
    {
      message: "INTEGRATION_TEST_POSTGRES_URL must not equal DATABASE_URL; refusing to touch the configured application database.",
    },
  );
}

assert.equal(
  requiredTestDatabaseUrl({
    NODE_ENV: "test",
    INTEGRATION_TEST_POSTGRES_URL: validUrl,
  }).toString(),
  validUrl,
);