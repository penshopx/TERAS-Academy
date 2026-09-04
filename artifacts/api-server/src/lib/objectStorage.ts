import { randomUUID } from "crypto";
import { Readable } from "stream";
import { File, Storage } from "@google-cloud/storage";
import { canAccessObject, type ObjectAclPolicy, ObjectPermission, setObjectAclPolicy } from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";
export const objectStorageClient = new Storage({
  credentials: { audience: "replit", subject_token_type: "access_token", token_url: `${SIDECAR}/token`, type: "external_account", credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } }, universe_domain: "googleapis.com" },
  projectId: "",
});
export class ObjectNotFoundError extends Error { constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; } }

function privateDir() {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR must be configured for managed learning resources");
  return value.replace(/\/$/, "");
}
function parse(path: string) {
  const parts = path.replace(/^\//, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) throw new Error("Invalid object storage path");
  return { bucket: parts[0], name: parts.slice(1).join("/") };
}

export class ObjectStorageService {
  async getObjectEntityUploadURL(): Promise<string> {
    const { bucket, name } = parse(`${privateDir()}/uploads/${randomUUID()}`);
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket_name: bucket, object_name: name, method: "PUT", expires_at: new Date(Date.now() + 900_000).toISOString() }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Object storage signing failed (${response.status})`);
    return (await response.json() as { signed_url: string }).signed_url;
  }
  normalizeObjectEntityPath(url: string) {
    if (!url.startsWith("https://storage.googleapis.com/")) return url;
    const pathname = new URL(url).pathname;
    const prefix = `/${privateDir()}/`;
    return pathname.startsWith(prefix) ? `/objects/${pathname.slice(prefix.length)}` : pathname;
  }
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) throw new ObjectNotFoundError();
    const { bucket, name } = parse(`${privateDir()}/${objectPath.slice("/objects/".length)}`);
    const file = objectStorageClient.bucket(bucket).file(name);
    if (!(await file.exists())[0]) throw new ObjectNotFoundError();
    return file;
  }
  async setPrivateOwner(objectPath: string, owner: string) {
    const file = await this.getObjectEntityFile(objectPath);
    await setObjectAclPolicy(file, { owner, visibility: "private" });
  }
  async verifyUploadedMetadata(objectPath: string, expected: { size: number; mimeType: string }) {
    const [metadata] = await (await this.getObjectEntityFile(objectPath)).getMetadata();
    if (Number(metadata.size) !== expected.size || metadata.contentType !== expected.mimeType) {
      throw new Error("Uploaded object size or MIME type does not match the authorized upload");
    }
  }
  async ownerCanRead(objectPath: string, personId: string) {
    return canAccessObject(await this.getObjectEntityFile(objectPath), personId, ObjectPermission.READ);
  }
  async downloadObject(file: File) {
    const [metadata] = await file.getMetadata();
    const headers: Record<string, string> = { "Content-Type": String(metadata.contentType || "application/octet-stream"), "Cache-Control": "private, no-store" };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, { headers });
  }
}