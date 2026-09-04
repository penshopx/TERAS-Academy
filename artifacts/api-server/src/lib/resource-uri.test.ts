import assert from "node:assert/strict";
import { RESOURCE_URI_ERROR, validateResourceUri } from "./resource-uri.js";

for (const uri of [
  "http://example.com/material.pdf",
  "https://academy.example.com/lesson?id=1#intro",
  "http://192.0.2.10/material.pdf",
  "https://[2001:db8::1]/lesson",
  "https://[9999::1]/",
]) {
  assert.equal(validateResourceUri(uri), uri);
}

for (const uri of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "ftp://example.com/material.pdf",
  "/materials/lesson.pdf",
  "materials/lesson.pdf",
  "not a url",
  "https://",
  "https://example.com/has space",
  "https://example.com:65536/material.pdf",
  "https://[example]/x",
  "https://%",
  "https://999.1.1.1/x",
]) {
  assert.throws(() => validateResourceUri(uri), {
    message: RESOURCE_URI_ERROR,
  });
}

assert.equal(validateResourceUri(null), null);
assert.equal(validateResourceUri(undefined), undefined);