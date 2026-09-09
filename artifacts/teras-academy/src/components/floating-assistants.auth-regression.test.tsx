import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signed-out visitors do not mount floating assistants or their knowledge request path", async () => {
  const app = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
  const assistants = await readFile(new URL("./floating-assistants.tsx", import.meta.url), "utf8");

  // Supabase auth state gates ChatPanel, so a signed-out visitor never mounts
  // the request owner and cannot issue a knowledge request.
  assert.match(app, /return isLoaded && user && !isAuthRoute[\s\S]*<FloatingAssistants\s*\/>/);
  assert.match(app, /<ErrorBoundary FallbackComponent=\{AssistantErrorFallback\}>[\s\S]*<AuthenticatedFloatingAssistants\s*\/>/);
  assert.match(assistants, /function ChatPanel[\s\S]*await searchAssistantKnowledge/);
  assert.match(assistants, /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
  assert.match(assistants, /catch\s*\{/);
  assert.match(assistants, /data-testid=\{`button-floating-assistant-\$\{kind\}`\}/);
  assert.doesNotMatch(assistants, /useSearchAssistantKnowledge/);
});