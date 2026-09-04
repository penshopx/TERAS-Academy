import { createIntegrationTestApp } from "./integration-test-app";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  const app = createIntegrationTestApp(() => ({ userId: "learner-test", role: "learner" }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Test server did not bind");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/users`);
    assert(response.status === 403, "A learner must not access administrative user records");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
await run();