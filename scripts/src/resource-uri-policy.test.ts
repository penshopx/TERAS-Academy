import assert from "node:assert/strict";
import { auditResourceUris, type ResourceUriRecord } from "./resource-uri-audit.js";
import { classifyUnsafeResourceUri } from "./resource-uri-policy.js";

for (const uri of [
  "http://example.com/material.pdf",
  "https://academy.example.com/lesson?id=1#intro",
  "http://192.0.2.10/material.pdf",
  "https://[2001:db8::1]/lesson",
  "https://[9999::1]/",
]) {
  assert.equal(classifyUnsafeResourceUri(uri), null);
}

for (const uri of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "ftp://example.com/material.pdf",
]) {
  assert.equal(classifyUnsafeResourceUri(uri), "UNSAFE_PROTOCOL");
}

for (const uri of ["/materials/lesson.pdf", "materials/lesson.pdf"]) {
  assert.equal(classifyUnsafeResourceUri(uri), "RELATIVE_URI");
}

for (const uri of [
  "",
  "   ",
  "not a url",
  "https://",
  "https://example.com/has space",
  "https://example.com:65536/material.pdf",
  "https://[example]/x",
  "https://%",
  "https://999.1.1.1/x",
]) {
  assert.equal(classifyUnsafeResourceUri(uri), "MALFORMED_URI");
}

const resources: ResourceUriRecord[] = [
  { id: "safe", uri: "https://example.com/lesson" },
  { id: "unsafe", uri: "javascript:alert(1)" },
  { id: "relative", uri: "/lesson.pdf" },
];

const reported = await auditResourceUris(resources);
assert.deepEqual(
  reported.map(({ id, action }) => ({ id, action })),
  [
    { id: "unsafe", action: "REPORTED" },
    { id: "relative", action: "REPORTED" },
  ],
);

const quarantinedIds: string[] = [];
const quarantined = await auditResourceUris(resources, async resource => {
  quarantinedIds.push(resource.id);
});
assert.deepEqual(quarantinedIds, ["unsafe", "relative"]);
assert.ok(quarantined.every(finding => finding.action === "QUARANTINED"));