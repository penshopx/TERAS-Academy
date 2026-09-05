import { createIntegrationTestApp } from "./integration-test-app";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  const roleApp = createIntegrationTestApp(() => ({ userId: "admin-test", role: "admin" }));
  const roleServer = await new Promise<ReturnType<typeof roleApp.listen>>((resolve) => {
    const listener = roleApp.listen(0, () => resolve(listener));
  });
  const roleAddress = roleServer.address();
  assert(roleAddress && typeof roleAddress !== "string", "Role test server did not bind");

  const anonymousApp = createIntegrationTestApp(() => ({ userId: null, role: null }));
  const anonymousServer = await new Promise<ReturnType<typeof anonymousApp.listen>>((resolve) => {
    const listener = anonymousApp.listen(0, () => resolve(listener));
  });
  const anonymousAddress = anonymousServer.address();
  assert(anonymousAddress && typeof anonymousAddress !== "string", "Anonymous test server did not bind");

  try {
    const roleResponse = await fetch(`http://127.0.0.1:${roleAddress.port}/api/session`);
    assert(roleResponse.status === 200, "An assigned role must resolve a current session");
    const roleBody = await roleResponse.json() as { roles?: string[] };
    assert(roleBody.roles?.includes("admin"), "The current session must return its server-derived role");

    const anonymousResponse = await fetch(`http://127.0.0.1:${anonymousAddress.port}/api/session`);
    assert(anonymousResponse.status === 401, "An anonymous request must not resolve a current session");
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => roleServer.close(error => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => anonymousServer.close(error => error ? reject(error) : resolve())),
    ]);
  }
}

await run();