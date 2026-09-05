import { createIntegrationTestApp } from "./integration-test-app";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function requestAccess(role: "admin" | "learner") {
  const app = createIntegrationTestApp(() => ({ userId: `${role}-test`, role }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  assert(address && typeof address !== "string", "Test server did not bind");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/access`);
    return {
      status: response.status,
      body: await response.json() as { authorized?: boolean },
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function run() {
  const learnerResponse = await requestAccess("learner");
  assert(learnerResponse.status === 403, "A learner must fail the administrative access gate");

  const adminResponse = await requestAccess("admin");
  assert(adminResponse.status === 200, "An administrator must pass the administrative access gate");
  assert(adminResponse.body.authorized === true, "The successful gate must confirm administrator access");
}

await run();