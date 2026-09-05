import { createIntegrationTestApp } from "./integration-test-app";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  const app = createIntegrationTestApp(() => ({ userId: "admin-control-room-test", role: "admin" }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Test server did not bind");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/control-room`);
    assert(response.status === 200, `Control room must respond with 200, received ${response.status}`);
    const body = await response.json() as {
      counts?: { activeEnrollments?: number };
      assignmentGaps?: { missingTrainer?: number };
      queues?: { evidence?: number };
      bottlenecks?: { counts?: Record<string, number> };
    };
    assert(typeof body.counts?.activeEnrollments === "number", "Control room must expose active enrollment count");
    assert(typeof body.assignmentGaps?.missingTrainer === "number", "Control room must expose assignment gaps");
    assert(typeof body.queues?.evidence === "number", "Control room must expose operational queues");
    assert(typeof body.bottlenecks?.counts?.Readiness === "number", "Control room must expose lifecycle bottlenecks");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

await run();