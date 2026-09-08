import assert from "node:assert/strict";
import test from "node:test";
import app from "./app";

test("API responses cannot be reused across authenticated sessions or publishes", async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/not-found`, {
      headers: { "If-None-Match": "\"stale-production-response\"" },
    });

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("etag"), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});