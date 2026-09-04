import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signed-out visitors do not mount floating assistants or their knowledge request path", async () => {
  const app = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
  const assistants = await readFile(new URL("./floating-assistants.tsx", import.meta.url), "utf8");

  // Clerk's declarative gate avoids evaluating/mounting ChatPanel while the
  // visitor is signed out. The search mutation is deliberately owned only by
  // ChatPanel, so it cannot issue a request in that state.
  assert.match(app, /<Show when="signed-in">[\s\S]*?<FloatingAssistants\s*\/>[\s\S]*?<\/Show>/);
  assert.match(assistants, /function ChatPanel[\s\S]*useSearchAssistantKnowledge/);
  assert.doesNotMatch(assistants.match(/export function FloatingAssistants[\s\S]*/)?.[0] ?? "", /useSearchAssistantKnowledge/);
});