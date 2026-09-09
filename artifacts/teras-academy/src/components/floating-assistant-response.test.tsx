import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAssistantResponse } from "../lib/floating-assistant-response";

test("normalizes a valid grounded assistant response", () => {
  assert.deepEqual(normalizeAssistantResponse({
    answer: "Gunakan menu Security & Access.",
    mode: "ai",
    citations: [{ title: "Panduan Admin", version: 2 }],
  }), {
    answer: "Gunakan menu Security & Access.",
    mode: "ai",
    citations: [{ title: "Panduan Admin", version: 2 }],
  });
});

test("malformed success payloads remain render-safe", () => {
  assert.deepEqual(normalizeAssistantResponse({
    answer: { unexpected: true },
    mode: "unknown",
    citations: [{ title: { nested: true }, version: "2" }, null],
  }), {
    answer: "Maaf, jawaban TERAS belum dapat ditampilkan. Silakan coba kembali.",
    mode: "knowledge_fallback",
    citations: [],
  });
});