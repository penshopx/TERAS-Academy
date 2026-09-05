import { execFile } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");
const replitChromiumPath = "/repl/tools/bin/chromium";
const detailPaths = [
  "/api/admin/users",
  "/api/admin/programs",
  "/api/admin/pathways",
  "/api/admin/cohorts",
  "/api/admin/enrollments",
  "/api/admin/audit",
  "/api/admin/knowledge",
  "/api/admin/summary",
];

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function chromiumExecutablePath() {
  const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (configuredPath) return configuredPath;
  return existsSync(replitChromiumPath) ? replitChromiumPath : undefined;
}

const summary = {
  generatedAt: new Date(0).toISOString(),
  metrics: [],
  bottleneck: {
    stage: "clear",
    label: "Tidak ada bottleneck",
    description: "Semua antrean operasional bersih.",
    count: 0,
  },
  incompleteAssignments: { trainer: 0, assessor: 0 },
  queues: [],
  actions: [],
};

async function main() {
  await execFileAsync(
    "pnpm",
    ["--filter", "@workspace/teras-academy", "exec", "vite", "build", "--config", "vite.config.ts", "--mode", "test"],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        BASE_PATH: "/",
        PORT: "4173",
        VITE_INTEGRATION_TEST_MODE: "true",
      },
    },
  );

  let role: "admin" | "learner" = "admin";
  let phase = "prime-admin-cache";
  let gateResolved = false;
  const requests: Array<{ phase: string; path: string; beforeGateResolved: boolean }> = [];
  const app = express();
  const frontend = path.join(root, "artifacts/teras-academy/dist/public");

  app.get("/api/admin/access", async (_request, response) => {
    gateResolved = false;
    requests.push({ phase, path: "/api/admin/access", beforeGateResolved: true });
    await new Promise(resolve => setTimeout(resolve, 75));
    gateResolved = true;
    if (role === "admin") response.json({ authorized: true });
    else response.status(403).json({ error: "Admin role required" });
  });
  app.get("/api/admin/*path", (request, response) => {
    requests.push({ phase, path: request.path, beforeGateResolved: !gateResolved });
    if (request.path === "/api/admin/summary") response.json(summary);
    else response.json([]);
  });
  app.use(express.static(frontend));
  app.get(/.*/, (_request, response) => response.sendFile(path.join(frontend, "index.html")));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string", "Browser admin test server did not bind");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutablePath() });

  try {
    const page = await browser.newPage();
    page.on("pageerror", error => process.stderr.write(`[browser pageerror] ${error.message}\n`));

    await page.goto(`${baseUrl}/admin`);
    await page.getByTestId("admin-operational-summary").waitFor();

    role = "learner";
    phase = "cached-admin-to-learner";
    gateResolved = false;
    await page.goto(`${baseUrl}/`);
    await page.goto(`${baseUrl}/admin`);
    await page.getByTestId("admin-access-denied").waitFor();
    await page.waitForTimeout(150);

    const learnerRequests = requests.filter(request => request.phase === phase);
    assert(
      learnerRequests.length === 1 && learnerRequests[0]?.path === "/api/admin/access",
      `A denied remount must call only the access gate; saw ${learnerRequests.map(request => request.path).join(", ")}`,
    );

    role = "admin";
    phase = "admin-after-denial";
    gateResolved = false;
    await page.reload();
    await page.getByTestId("admin-operational-summary").waitFor();

    const adminRequests = requests.filter(request => request.phase === phase);
    assert(adminRequests[0]?.path === "/api/admin/access", "The admin access gate must be the first dashboard request");
    assert(
      detailPaths.every(expected => adminRequests.some(request => request.path === expected)),
      `The authorized dashboard did not load every detail query; saw ${adminRequests.map(request => request.path).join(", ")}`,
    );
    assert(
      adminRequests.filter(request => detailPaths.includes(request.path)).every(request => !request.beforeGateResolved),
      "An admin detail query started before the successful access gate completed",
    );

    process.stdout.write("browser admin access integration passed\n");
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});