import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../../../.github/workflows/browser-idempotency.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");

function browserJobNeedsDatabaseGuard(source: string): void {
  const browserJob = source.match(
    /^  browser-idempotency:\s*\n(?<body>(?: {4}.*(?:\n|$))*)/m,
  )?.groups?.body;

  assert.ok(
    browserJob,
    'Workflow must define the "browser-idempotency" job.',
  );
  assert.match(
    browserJob,
    /^    needs:\s*browser-idempotency-guard\s*$/m,
    'The "browser-idempotency" job must need "browser-idempotency-guard".',
  );
}

browserJobNeedsDatabaseGuard(workflow);

assert.throws(
  () => browserJobNeedsDatabaseGuard(
    workflow.replace(/^    needs: browser-idempotency-guard\s*$/m, ""),
  ),
  {
    message:
      'The "browser-idempotency" job must need "browser-idempotency-guard".',
  },
);

assert.throws(
  () => browserJobNeedsDatabaseGuard(
    workflow.replace(
      /^    needs: browser-idempotency-guard\s*$/m,
      "    needs: unrelated-job",
    ),
  ),
  {
    message:
      'The "browser-idempotency" job must need "browser-idempotency-guard".',
  },
);