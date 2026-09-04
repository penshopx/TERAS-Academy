import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectNotFoundError, ObjectStorageService, objectStorageClient } from "./lib/objectStorage";

const configuredPrivateDir = process.env.PRIVATE_OBJECT_DIR?.replace(/\/$/, "");
assert(configuredPrivateDir, "PRIVATE_OBJECT_DIR is required for the real App Storage evidence test");

const runId = process.env.TERAS_APP_STORAGE_RUN_ID ?? randomUUID();
assert(/^[a-zA-Z0-9._-]+$/.test(runId), "TERAS_APP_STORAGE_RUN_ID contains unsafe path characters");

const disposablePrivateDir = `${configuredPrivateDir}/certification-evidence/${runId}`;
process.env.PRIVATE_OBJECT_DIR = disposablePrivateDir;

const [bucketName, ...prefixParts] = disposablePrivateDir.replace(/^\//, "").split("/");
assert(bucketName && prefixParts.length > 0, "PRIVATE_OBJECT_DIR must include a bucket and object prefix");
const prefix = `${prefixParts.join("/")}/`;
const bucket = objectStorageClient.bucket(bucketName);
const storage = new ObjectStorageService();
const payload = Buffer.from(`TERAS App Storage evidence ${runId}`, "utf8");
const mimeType = "text/plain";
const ownerId = `trainer-owner-${runId}`;
const otherUserId = `trainer-other-${runId}`;
const createdObjectNames = new Set<string>();
let primaryFailure: unknown;
let activeCheck = "initialization";
const completedChecks: string[] = [];

function log(status: "START" | "PASS" | "FAIL", check: string, detail?: string) {
  console.log(JSON.stringify({
    smoke: "app-storage-sidecar",
    runId,
    status,
    check,
    ...(detail ? { detail } : {}),
    releaseApproval: false,
  }));
}

async function check<T>(name: string, action: () => Promise<T>): Promise<T> {
  activeCheck = name;
  log("START", name);
  try {
    const result = await action();
    completedChecks.push(name);
    log("PASS", name);
    return result;
  } catch (error) {
    log("FAIL", name, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function expectObjectNotFound(action: () => Promise<unknown>, message: string) {
  await assert.rejects(action, error => error instanceof ObjectNotFoundError, message);
}

try {
  const uploadURL = await check("signing", () => storage.getObjectEntityUploadURL());
  const uploadedUrl = new URL(uploadURL);
  const uploadedPath = decodeURIComponent(uploadedUrl.pathname).replace(/^\//, "");
  assert(uploadedPath.startsWith(`${bucketName}/${prefix}`), "signed upload escaped the disposable run prefix");
  createdObjectNames.add(uploadedPath.slice(bucketName.length + 1));

  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  assert.match(objectPath, /^\/objects\/uploads\/[0-9a-f-]{36}$/i);

  await check("upload", async () => {
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    assert(uploadResponse.ok, `App Storage upload failed (${uploadResponse.status})`);
  });

  await check("metadata", () =>
    storage.verifyUploadedMetadata(objectPath, { size: payload.byteLength, mimeType }));
  await check("acl", async () => {
    await storage.setPrivateOwner(objectPath, ownerId);
    assert.equal(await storage.ownerCanRead(objectPath, ownerId), true, "owner must be able to read");
    assert.equal(await storage.ownerCanRead(objectPath, otherUserId), false, "cross-user read must be denied");
  });

  await check("download", async () => {
    const download = await storage.downloadObject(await storage.getObjectEntityFile(objectPath));
    assert.equal(download.headers.get("content-type"), mimeType);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), payload);
  });

  await check("path-isolation", async () => {
    await expectObjectNotFound(
      () => storage.getObjectEntityFile(`/objects/uploads/${randomUUID()}`),
      "a different object path must not resolve",
    );
    await expectObjectNotFound(
      () => storage.getObjectEntityFile(`/objects/../${randomUUID()}`),
      "a path traversal attempt must be rejected",
    );
  });

} catch (error) {
  primaryFailure = error;
} finally {
  let cleanupFailure: unknown;
  activeCheck = "cleanup";
  log("START", activeCheck);
  try {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      createdObjectNames.add(file.name);
      await file.delete();
    }
    const [remaining] = await bucket.getFiles({ prefix });
    assert.equal(remaining.length, 0, `cleanup left ${remaining.length} object(s) under the disposable prefix`);
    for (const name of createdObjectNames) {
      assert.equal((await bucket.file(name).exists())[0], false, `cleanup did not remove ${name}`);
    }
    completedChecks.push(activeCheck);
    log("PASS", activeCheck);
  } catch (error) {
    cleanupFailure = error;
    log("FAIL", activeCheck, error instanceof Error ? error.message : String(error));
  }

  if (cleanupFailure) {
    throw new AggregateError(
      [primaryFailure, cleanupFailure].filter((error): error is NonNullable<typeof error> => error != null),
      "App Storage evidence failed and disposable object cleanup did not complete",
    );
  }
  if (primaryFailure) throw primaryFailure;
  console.log(JSON.stringify({
    smoke: "app-storage-sidecar",
    runId,
    disposablePrefix: `/${bucketName}/${prefix}`,
    checks: completedChecks,
    status: "PASS",
    releaseApproval: false,
    note: "Operational smoke evidence only; this result never approves a release.",
  }));
}