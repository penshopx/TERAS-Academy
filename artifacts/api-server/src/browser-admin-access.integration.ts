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

const adminCacheMarker = "DATA ADMIN A — RAHASIA";
const workspaceMarkers = {
  learner: { first: "LEARNER A — RAHASIA", second: "LEARNER B — TERISOLASI" },
  trainer: { first: "TRAINER A — RAHASIA", second: "TRAINER B — TERISOLASI" },
  assessor: { first: "ASSESSOR A — RAHASIA", second: "ASSESSOR B — TERISOLASI" },
} as const;
const summary = {
  generatedAt: new Date(0).toISOString(),
  metrics: [],
  bottleneck: {
    stage: "clear",
    label: adminCacheMarker,
    description: "Semua antrean operasional bersih.",
    count: 0,
  },
  incompleteAssignments: { trainer: 0, assessor: 0 },
  queues: [],
  actions: [],
};

type WorkspaceRole = keyof typeof workspaceMarkers;
type Account = "first" | "second";

const profile = (role: WorkspaceRole, account: Account) => ({
  id: `${role}-${account}`,
  name: workspaceMarkers[role][account],
  initials: account === "first" ? "AA" : "BB",
  role,
  organization: "TERAS integration",
});

const queueItem = (role: "trainer" | "assessor", account: Account) => ({
  id: `${role}-${account}-queue`,
  kind: role === "trainer" ? "Evidence" : "Assessment",
  learnerId: `learner-${account}`,
  learnerName: `${workspaceMarkers[role][account]} learner`,
  moduleName: "Safety foundations",
  title: `${workspaceMarkers[role][account]} queue`,
  status: "Pending",
  priority: "High",
  updatedAt: new Date(0).toISOString(),
  pathwayName: "Integration pathway",
});

function learnerDashboard(account: Account) {
  const marker = workspaceMarkers.learner[account];
  const gate = { id: "gate-1", code: "G1", name: "Foundation", status: "In progress", requirement: "Complete learning" };
  return {
    learner: profile("learner", account),
    program: { id: "program-1", domain: "Energy", name: marker, description: "Integration fixture", moduleCount: 1, learnerCount: 1, status: "Active" },
    pathway: { id: "pathway-1", name: "Integration pathway", type: "Learning", outcome: "Ready" },
    capabilityProgress: 25,
    readiness: { status: "IN PROGRESS", score: 25, currentGate: gate, nextGate: null, gates: [gate], blockers: [], outstandingGapCount: 0, missingEvidenceCount: 0 },
    currentLearning: { id: "module-1", code: "M1", name: `${marker} module`, capability: "Safety", evidence: "Observation", progress: 25, status: "In progress" },
    currentPractice: { id: "practice-1", moduleId: "module-1", title: "Safety practice", description: "Integration fixture", mode: "Guided", durationMinutes: 10, status: "Available", output: "Notes", safetyNote: null },
    mainGap: null,
    evidenceCounts: { total: 0, valid: 0, underReview: 0, needsRevision: 0 },
    nextAction: { title: "Continue learning", description: "Integration fixture", href: "/learning", priority: "NORMAL" },
  };
}

function trainerDashboard(account: Account) {
  return {
    trainer: profile("trainer", account),
    assignedLearnerCount: 1,
    pendingFeedbackCount: 1,
    pendingEvidenceCount: 0,
    activeRemediationCount: 0,
    blockedLearnerCount: 0,
    recentActivity: [queueItem("trainer", account)],
    reviewHistory: [],
    bottlenecks: {
      asOf: new Date(0).toISOString(),
      assignedContextCount: 0,
      counts: {},
      mostStalled: null,
    },
  };
}

function assessorDashboard(account: Account) {
  return {
    assessor: profile("assessor", account),
    pendingAssessmentCount: 1,
    pendingEvidenceCount: 0,
    reassessmentCount: 0,
    blockedGateCount: 0,
    recentActivity: [queueItem("assessor", account)],
  };
}

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

  let role: "admin" | WorkspaceRole = "admin";
  let account: Account = "first";
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
  app.get("/api/learner/dashboard", (request, response) => {
    requests.push({ phase, path: request.path, beforeGateResolved: false });
    if (role !== "learner") return response.status(403).json({ error: "Learner role required" });
    return response.json(learnerDashboard(account));
  });
  app.get("/api/readiness", (request, response) => {
    requests.push({ phase, path: request.path, beforeGateResolved: false });
    if (role !== "learner") return response.status(403).json({ error: "Learner role required" });
    return response.json(learnerDashboard(account).readiness);
  });
  app.get("/api/trainer/dashboard", (request, response) => {
    requests.push({ phase, path: request.path, beforeGateResolved: false });
    if (role !== "trainer") return response.status(403).json({ error: "Trainer role required" });
    return response.json(trainerDashboard(account));
  });
  app.get("/api/assessor/dashboard", (request, response) => {
    requests.push({ phase, path: request.path, beforeGateResolved: false });
    if (role !== "assessor") return response.status(403).json({ error: "Assessor role required" });
    return response.json(assessorDashboard(account));
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
    await page.getByText(adminCacheMarker, { exact: true }).waitFor();

    phase = "clerk-admin-to-signed-out";
    gateResolved = false;
    await page.evaluate(() => {
      const browserGlobal = globalThis as typeof globalThis & {
        dispatchEvent(event: unknown): boolean;
        CustomEvent: new (type: string, init: { detail: string | null }) => unknown;
      };
      browserGlobal.dispatchEvent(
        new browserGlobal.CustomEvent("teras:test-identity-change", { detail: null }),
      );
    });
    await page.getByRole("link", { name: "Masuk", exact: true }).first().waitFor();
    assert(
      await page.getByText(adminCacheMarker, { exact: true }).count() === 0,
      "The signed-out page appeared while cached dashboard data from the previous account was still visible",
    );
    assert(
      requests.filter(request => request.phase === phase).length === 0,
      "Signing out must not start authenticated admin requests",
    );

    role = "learner";
    phase = "clerk-signed-out-to-learner";
    gateResolved = false;
    await page.evaluate(() => {
      const browserGlobal = globalThis as typeof globalThis & {
        dispatchEvent(event: unknown): boolean;
        CustomEvent: new (type: string, init: { detail: string | null }) => unknown;
      };
      browserGlobal.dispatchEvent(
        new browserGlobal.CustomEvent("teras:test-identity-change", { detail: "integration-learner" }),
      );
    });
    await page.getByTestId("admin-access-denied").waitFor();
    await page.waitForTimeout(150);
    assert(
      await page.getByText(adminCacheMarker, { exact: true }).count() === 0,
      "The account signed in after logout saw cached dashboard data from the previous admin identity",
    );

    const learnerRequests = requests.filter(request => request.phase === phase);
    assert(
      learnerRequests.length === 1 && learnerRequests[0]?.path === "/api/admin/access",
      `A denied account switch must call only the access gate; saw ${learnerRequests.map(request => request.path).join(", ")}`,
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

    const workspacePaths: Record<WorkspaceRole, string> = {
      learner: "/dashboard",
      trainer: "/trainer",
      assessor: "/assessor",
    };
    const workspaceRequestPaths: Record<WorkspaceRole, string[]> = {
      learner: ["/api/learner/dashboard", "/api/readiness"],
      trainer: ["/api/trainer/dashboard"],
      assessor: ["/api/assessor/dashboard"],
    };

    for (const workspaceRole of Object.keys(workspacePaths) as WorkspaceRole[]) {
      role = workspaceRole;
      account = "first";
      phase = `${workspaceRole}-first-account`;
      await page.goto(`${baseUrl}${workspacePaths[workspaceRole]}`);
      await page.getByText(workspaceMarkers[workspaceRole].first).first().waitFor();

      phase = `${workspaceRole}-signed-out`;
      await page.evaluate(() => {
        const browserGlobal = globalThis as typeof globalThis & {
          dispatchEvent(event: unknown): boolean;
          CustomEvent: new (type: string, init: { detail: string | null }) => unknown;
        };
        browserGlobal.dispatchEvent(new browserGlobal.CustomEvent("teras:test-identity-change", { detail: null }));
      });
      await page.getByRole("link", { name: "Masuk", exact: true }).first().waitFor();
      assert(
        await page.getByText(workspaceMarkers[workspaceRole].first).count() === 0,
        `The signed-out page exposed cached ${workspaceRole} data from the previous account`,
      );
      assert(
        requests.filter(request => request.phase === phase).length === 0,
        `Signing out from ${workspaceRole} must not start authenticated requests`,
      );

      account = "second";
      phase = `${workspaceRole}-second-account`;
      await page.evaluate((nextUserId) => {
        const browserGlobal = globalThis as typeof globalThis & {
          dispatchEvent(event: unknown): boolean;
          CustomEvent: new (type: string, init: { detail: string | null }) => unknown;
        };
        browserGlobal.dispatchEvent(new browserGlobal.CustomEvent("teras:test-identity-change", { detail: nextUserId }));
      }, `integration-${workspaceRole}-second`);
      await page.getByText(workspaceMarkers[workspaceRole].second).first().waitFor();
      assert(
        await page.getByText(workspaceMarkers[workspaceRole].first).count() === 0,
        `The second ${workspaceRole} account saw cached data from the first account`,
      );
      const secondAccountRequests = requests.filter(request => request.phase === phase);
      assert(
        workspaceRequestPaths[workspaceRole].every(expected => secondAccountRequests.some(request => request.path === expected))
          && secondAccountRequests.every(request => workspaceRequestPaths[workspaceRole].includes(request.path)),
        `The second ${workspaceRole} account loaded data outside its workspace; saw ${secondAccountRequests.map(request => request.path).join(", ")}`,
      );
    }

    process.stdout.write("browser account-switch isolation integration passed\n");
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});