import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("floating assistants expose grounded-answer status without provider keys", async () => {
  const source = await readFile(new URL("./floating-assistants.tsx", import.meta.url), "utf8");
  assert.match(source, /AI berbasis Knowledge TERAS/);
  assert.match(source, /Jawaban dari sumber terkurasi/);
  assert.match(source, /Tidak ditemukan/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /knowledge\.isPending/);
  assert.doesNotMatch(source, /AI_INTEGRATIONS_OPENROUTER_/);
});