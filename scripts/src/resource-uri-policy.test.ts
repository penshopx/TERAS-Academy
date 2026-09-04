import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditResourceUris, type ResourceUriRecord } from "./resource-uri-audit.js";
import { classifyUnsafeResourceUri } from "./resource-uri-policy.js";

const corpus = readFileSync(
  new URL("../fixtures/resource-uri-policy-corpus.tsv", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter(line => line && !line.startsWith("#"))
  .map(line => {
    const [id, , classification, ...uriParts] = line.split("\t");
    return { id, classification, uri: uriParts.join("\t") };
  });

for (const { id, classification, uri } of corpus) {
  if (classification === "NULL") continue;
  assert.equal(
    classifyUnsafeResourceUri(uri),
    classification === "SAFE" ? null : classification,
    `audit classifier mismatch for ${id}: ${uri}`,
  );
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