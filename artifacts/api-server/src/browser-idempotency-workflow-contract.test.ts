import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../../../.github/workflows/browser-idempotency.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");

function jobBody(source: string, jobName: string): string {
  const body = source.match(
    new RegExp(
      `^  ${jobName}:\\s*\\n(?<body>[\\s\\S]*?)(?=^  \\S[^\\n]*:\\s*(?:\\n|$)|(?![\\s\\S]))`,
      "m",
    ),
  )?.groups?.body;

  assert.ok(body, `Workflow must define the "${jobName}" job.`);
  return body;
}

function browserJobNeedsDatabaseGuard(source: string): void {
  const browserJob = jobBody(source, "browser-idempotency");
  assert.match(
    browserJob,
    /^    needs:\s*browser-idempotency-guard\s*$/m,
    'The "browser-idempotency" job must need "browser-idempotency-guard".',
  );
}

function guardJobStaysInfrastructureFree(source: string): void {
  const guardJob = jobBody(source, "browser-idempotency-guard");

  assert.match(
    guardJob,
    /^\s+run:\s*pnpm install --frozen-lockfile --ignore-scripts\s*$/m,
    'The "browser-idempotency-guard" job must disable dependency lifecycle scripts.',
  );
  assert.doesNotMatch(
    guardJob,
    /^    services:\s*$[\s\S]*?^      postgres:\s*$/m,
    'The "browser-idempotency-guard" job must not define a PostgreSQL service.',
  );
  assert.doesNotMatch(
    guardJob,
    /^\s+(?:run|uses):.*(?:playwright|setup:browser-idempotency|test:browser-idempotency(?:\s|$))/im,
    'The "browser-idempotency-guard" job must not install or execute a browser.',
  );
}

browserJobNeedsDatabaseGuard(workflow);
guardJobStaysInfrastructureFree(workflow);

assert.throws(
  () => guardJobStaysInfrastructureFree(
    workflow.replace(
      "pnpm install --frozen-lockfile --ignore-scripts",
      "pnpm install --frozen-lockfile",
    ),
  ),
  {
    message:
      'The "browser-idempotency-guard" job must disable dependency lifecycle scripts.',
  },
);

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
  () => guardJobStaysInfrastructureFree(
    workflow.replace(
      /^    steps:\s*$/m,
      [
        "    services:",
        "      postgres:",
        "        image: postgres:17-alpine",
        "    steps:",
      ].join("\n"),
    ),
  ),
  {
    message:
      'The "browser-idempotency-guard" job must not define a PostgreSQL service.',
  },
);

for (const forbiddenStep of [
  "      - name: Install browser\n        run: pnpm run setup:browser-idempotency",
  "      - name: Install Playwright\n        run: pnpm exec playwright install chromium",
  "      - name: Execute browser integration\n        run: pnpm run test:browser-idempotency",
  "      - name: Set up browser\n        uses: microsoft/playwright-github-action@v1",
]) {
  assert.throws(
    () => guardJobStaysInfrastructureFree(
      workflow.replace(
        /^      - name: Check out repository$/m,
        `${forbiddenStep}\n\n      - name: Check out repository`,
      ),
    ),
    {
      message:
        'The "browser-idempotency-guard" job must not install or execute a browser.',
    },
  );
}

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