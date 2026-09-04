import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RESOURCE_URI_ERROR, validateResourceUri } from "./resource-uri.js";

const corpus = readFileSync(
  new URL("../../../../scripts/fixtures/resource-uri-policy-corpus.tsv", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter(line => line && !line.startsWith("#"))
  .map(line => {
    const [id, expected, , ...uriParts] = line.split("\t");
    return { id, expected, uri: uriParts.join("\t") === "\\N" ? null : uriParts.join("\t") };
  });

for (const { id, expected, uri } of corpus) {
  if (expected === "allow") {
    assert.equal(validateResourceUri(uri), uri, `application mismatch for ${id}: ${String(uri)}`);
  } else {
    assert.throws(
      () => validateResourceUri(uri),
      { message: RESOURCE_URI_ERROR },
      `application mismatch for ${id}: ${String(uri)}`,
    );
  }
}

assert.equal(validateResourceUri(undefined), undefined);