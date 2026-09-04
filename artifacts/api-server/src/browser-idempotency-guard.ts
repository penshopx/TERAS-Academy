function postgresTarget(url: URL): string | undefined {
  if (!["postgres:", "postgresql:"].includes(url.protocol)) return undefined;

  return JSON.stringify({
    hostname: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  });
}

export function requiredTestDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): URL {
  if (environment.NODE_ENV !== "test") {
    throw new Error("The browser idempotency harness may only run with NODE_ENV=test.");
  }

  const value = environment.INTEGRATION_TEST_POSTGRES_URL;
  if (!value) {
    throw new Error("INTEGRATION_TEST_POSTGRES_URL is required; it must point at a PostgreSQL server used only to create disposable test databases.");
  }
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("INTEGRATION_TEST_POSTGRES_URL must be a PostgreSQL URL.");
  }

  if (environment.DATABASE_URL) {
    const applicationUrl = new URL(environment.DATABASE_URL);
    if (postgresTarget(url) === postgresTarget(applicationUrl)) {
      throw new Error("INTEGRATION_TEST_POSTGRES_URL must not equal DATABASE_URL; refusing to touch the configured application database.");
    }
  }

  return url;
}