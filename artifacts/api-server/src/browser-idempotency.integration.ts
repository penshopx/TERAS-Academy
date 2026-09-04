import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import express from "express";
import pg from "pg";
import { chromium } from "playwright";
import type { Express } from "express";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");
const { Client } = pg;
const replitChromiumPath = "/repl/tools/bin/chromium";

function chromiumExecutablePath() {
  const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configuredPath) return configuredPath;
  return existsSync(replitChromiumPath) ? replitChromiumPath : undefined;
}

function requiredTestDatabaseUrl(): URL {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The browser idempotency harness may only run with NODE_ENV=test.");
  }
  const value = process.env.INTEGRATION_TEST_POSTGRES_URL;
  if (!value) {
    throw new Error("INTEGRATION_TEST_POSTGRES_URL is required; it must point at a PostgreSQL server used only to create disposable test databases.");
  }
  if (value === process.env.DATABASE_URL) {
    throw new Error("INTEGRATION_TEST_POSTGRES_URL must not equal DATABASE_URL; refusing to touch the configured application database.");
  }
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("INTEGRATION_TEST_POSTGRES_URL must be a PostgreSQL URL.");
  }
  return url;
}

async function run(command: string, args: string[], databaseUrl: string, extraEnvironment: NodeJS.ProcessEnv = {}) {
  await execFileAsync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnvironment, NODE_ENV: "test", DATABASE_URL: databaseUrl },
  });
}

async function count(client: pg.Client, table: "teras_practice_attempts" | "teras_evidence") {
  return Number((await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE learner_id = 'learner-demo'`)).rows[0]?.count);
}

async function setState(client: pg.Client, activityId: string, state: string) {
  await client.query(
    `INSERT INTO teras_learning_transition_events
      (id, activity_id, learner_id, enrollment_id, program_id, pathway_id, from_state, to_state, actor_id, actor_role, entity_reference, reason, idempotency_key, metadata, created_by)
     VALUES ($1, $2, 'learner-demo', 'enrol-demo', 'solar-pv-tech', 'path-a', 'TEST_SETUP', $3, 'learner-demo', 'learner', 'task-41', 'Isolated browser harness setup', $4, '{}'::jsonb, 'task-41')`,
    [`task-41-state-${crypto.randomUUID()}`, activityId, state, `task-41-state-${crypto.randomUUID()}`],
  );
}

function requestPath(request: express.Request) {
  return new URL(request.originalUrl, "http://browser-harness.test").pathname;
}

async function main() {
  const adminUrl = requiredTestDatabaseUrl();
  const databaseName = `teras_task41_${crypto.randomUUID().replaceAll("-", "")}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let appServer: Express | undefined;
  let server: ReturnType<Express["listen"]> | undefined;
  let database: pg.Client | undefined;
  let applicationPool: pg.Pool | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await run("pnpm", ["--filter", "@workspace/db", "exec", "drizzle-kit", "push", "--force", "--config", "./drizzle.config.ts"], databaseUrl.toString());
    await run("pnpm", ["--filter", "@workspace/scripts", "run", "seed:demo"], databaseUrl.toString());
    await run("pnpm", ["--filter", "@workspace/teras-academy", "exec", "vite", "build", "--config", "vite.config.ts", "--mode", "test"], databaseUrl.toString(), {
      BASE_PATH: "/",
      PORT: "4173",
      VITE_INTEGRATION_TEST_MODE: "true",
    });

    database = new Client({ connectionString: databaseUrl.toString() });
    await database.connect();
    // The forms submit through the real learner routes.  These state rows only
    // prepare the isolated learner for the same gated workflow a browser sees.
    await setState(database, "activity-m03-safe-isolation", "PRACTICE_REQUIRED");

    const requests: Array<{ path: string; key: string }> = [];
    const heldResponses = new Set(["/api/practice/tasks/task-m03/attempts", "/api/evidence"]);
    const commitWaiters = new Map<string, () => void>();
    const waitForCommit = (requestPath: string) => new Promise<void>((resolve) => {
      commitWaiters.set(requestPath, resolve);
    });
    // Database modules read DATABASE_URL at import time.  This assignment occurs
    // only after the disposable database exists and before the test app imports.
    process.env.DATABASE_URL = databaseUrl.toString();
    ({ pool: applicationPool } = await import("@workspace/db"));
    const { createIntegrationTestApp } = await import("./integration-test-app");
    appServer = createIntegrationTestApp(
      () => ({ userId: "task-41-browser", role: "learner", learnerId: "learner-demo" }),
      {
        afterCommit: (request) => {
          if (request.method === "POST" && typeof request.body?.idempotencyKey === "string") {
            const path = requestPath(request);
            requests.push({ path, key: request.body.idempotencyKey });
            commitWaiters.get(path)?.();
            commitWaiters.delete(path);
          }
        },
        holdResponseAfterCommit: (request) => {
          const path = requestPath(request);
          return request.method === "POST" && heldResponses.delete(path);
        },
      },
    );
    const frontend = path.join(root, "artifacts/teras-academy/dist/public");
    appServer.use(express.static(frontend));
    appServer.get(/.*/, (_req, res) => res.sendFile(path.join(frontend, "index.html")));
    server = appServer.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not determine test server address.");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch({
      headless: true,
      executablePath: chromiumExecutablePath(),
    });
    const page = await browser.newPage();
    page.on("console", message => {
      if (message.type() === "error") process.stderr.write(`[browser console] ${message.text()}\n`);
    });
    page.on("pageerror", error => process.stderr.write(`[browser pageerror] ${error.message}\n`));
    page.on("requestfailed", request => process.stderr.write(`[browser requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}\n`));
    const practiceUrl = `${baseUrl}/practice?taskId=task-m03&activityId=activity-m03-safe-isolation`;
    await page.goto(practiceUrl);
    await page.locator("textarea").nth(0).fill("First isolated output");
    await page.locator("textarea").nth(1).fill("First isolated reflection");
    const firstPracticeCommit = waitForCommit("/api/practice/tasks/task-m03/attempts");
    await page.getByRole("button", { name: "COMMIT ATTEMPT RECORD" }).click();
    await firstPracticeCommit;
    await page.reload();
    await page.locator("textarea").nth(0).fill("First isolated output");
    await page.locator("textarea").nth(1).fill("First isolated reflection");
    await page.getByRole("button", { name: "COMMIT ATTEMPT RECORD" }).click();
    const evidenceHref = await page.getByRole("link", { name: "CONTINUE TO EVIDENCE" }).getAttribute("href");
    if (!evidenceHref) throw new Error("The real practice form did not return its evidence link.");
    if (await count(database, "teras_practice_attempts") !== 1) throw new Error("Retrying the identical practice draft did not leave exactly one practice record.");
    const practiceKeys = requests.filter(item => item.path.includes("/practice/")).map(item => item.key);
    if (practiceKeys.length < 2 || practiceKeys[0] !== practiceKeys[1]) throw new Error("Reload and retry did not reuse the practice idempotency key.");

    // A remediation state permits another real practice submission on the same
    // flow, so changing the draft (not the route) must allocate a fresh key.
    await setState(database, "activity-m03-safe-isolation", "REMEDIATION");
    await page.goto(practiceUrl);
    await page.locator("textarea").nth(0).fill("Changed isolated output");
    await page.locator("textarea").nth(1).fill("First isolated reflection");
    await page.getByRole("button", { name: "COMMIT ATTEMPT RECORD" }).click();
    await page.getByRole("link", { name: "CONTINUE TO EVIDENCE" }).waitFor();
    if (await count(database, "teras_practice_attempts") !== 2) throw new Error("Changing the practice draft did not create a second record.");
    if (new Set(requests.filter(item => item.path.includes("/practice/")).map(item => item.key)).size !== 2) throw new Error("Changing the practice draft did not allocate a new idempotency key.");

    const evidenceUrl = new URL(evidenceHref, baseUrl).toString();
    await page.goto(evidenceUrl);
    await page.locator("input").fill("First isolated evidence");
    await page.locator("textarea").fill("Evidence created after the isolated practice attempt.");
    const firstEvidenceCommit = waitForCommit("/api/evidence");
    await page.getByRole("button", { name: "SUBMIT FOR REVIEW" }).click();
    await firstEvidenceCommit;
    await page.reload();
    await page.locator("input").fill("First isolated evidence");
    await page.locator("textarea").fill("Evidence created after the isolated practice attempt.");
    await page.getByRole("button", { name: "SUBMIT FOR REVIEW" }).click();
    await page.getByText("Evidence submitted", { exact: true }).waitFor();
    if (await count(database, "teras_evidence") !== 3) throw new Error("Retrying the identical evidence draft did not leave exactly one new evidence record.");
    const evidenceKeys = requests.filter(item => item.path === "/api/evidence").map(item => item.key);
    if (evidenceKeys.length < 2 || evidenceKeys[0] !== evidenceKeys[1]) throw new Error("Reload and retry did not reuse the evidence idempotency key.");
    process.stdout.write("browser idempotency integration passed\n");
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    await database?.end();
    await applicationPool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});