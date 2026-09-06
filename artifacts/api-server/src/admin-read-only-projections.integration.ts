import { createIntegrationTestApp } from "./integration-test-app";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function withServer(role: "admin" | "learner", run: (baseUrl: string) => Promise<void>) {
  const app = createIntegrationTestApp(() => ({ userId: `${role}-projection-test`, role }));
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Test server did not bind");
  try {
    await run(`http://127.0.0.1:${address.port}/api`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

await withServer("learner", async baseUrl => {
  const response = await fetch(`${baseUrl}/admin/projections/learner-dashboard`);
  assert(response.status === 403, "Non-admin users must not read an admin projection");
});

await withServer("admin", async baseUrl => {
  for (const projection of ["learner-dashboard", "trainer-dashboard", "assessor-dashboard"]) {
    const response = await fetch(`${baseUrl}/admin/projections/${projection}`);
    assert(response.status === 200, `Admin must read ${projection}`);
    const body = await response.json() as { metrics?: unknown[]; incompleteAssignments?: unknown };
    assert(Array.isArray(body.metrics) && body.incompleteAssignments, "Projection must provide an aggregate operational view");
  }
  const learnerMutation = await fetch(`${baseUrl}/practice/tasks/not-authorized/attempts`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ reflection: "x", outputSummary: "x", sourceActivityId: "activity", idempotencyKey: "admin-denial-test" }),
  });
  assert(learnerMutation.status === 403, "Admin-only session must not create learner work");
  const trainerMutation = await fetch(`${baseUrl}/trainer/practice/not-authorized/review`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "Reviewed", feedback: "x" }),
  });
  assert(trainerMutation.status === 403, "Admin-only session must not review trainer work");
  const assessorMutation = await fetch(`${baseUrl}/assessor/assessments/not-authorized/decision`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ learnerId: "learner", decision: "Competent", observation: "x", criteria: [{ criterionId: "criterion", score: 3, observation: null, evidenceId: null }] }),
  });
  assert(assessorMutation.status === 403, "Admin-only session must not submit assessor decisions");
});