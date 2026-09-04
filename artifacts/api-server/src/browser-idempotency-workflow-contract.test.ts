import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const workflowPath = fileURLToPath(
  new URL("../../../.github/workflows/browser-idempotency.yml", import.meta.url),
);
const workflow = readFileSync(workflowPath, "utf8");
const guardSources = [
  {
    name: "browser-idempotency-guard.ts",
    source: readFileSync(
      fileURLToPath(new URL("./browser-idempotency-guard.ts", import.meta.url)),
      "utf8",
    ),
    allowedImports: new Set<string>(),
  },
  {
    name: "browser-idempotency-guard.test.ts",
    source: readFileSync(
      fileURLToPath(new URL("./browser-idempotency-guard.test.ts", import.meta.url)),
      "utf8",
    ),
    allowedImports: new Set([
      "node:assert/strict",
      "./browser-idempotency-guard.js",
    ]),
  },
  {
    name: "browser-idempotency-workflow-contract.test.ts",
    source: readFileSync(
      fileURLToPath(
        new URL("./browser-idempotency-workflow-contract.test.ts", import.meta.url),
      ),
      "utf8",
    ),
    allowedImports: new Set([
      "node:assert/strict",
      "node:fs",
      "node:url",
      "typescript",
    ]),
  },
];

function importedModules(source: string, sourceName: string): string[] {
  const sourceFile = ts.createSourceFile(
    sourceName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const modules: string[] = [];

  function recordModuleSpecifier(node: ts.Expression): void {
    modules.push(
      ts.isStringLiteralLike(node)
        ? node.text
        : "<non-literal module specifier>",
    );
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      recordModuleSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      recordModuleSpecifier(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      if (node.arguments.length !== 1) {
        modules.push("<non-literal module specifier>");
      } else {
        recordModuleSpecifier(node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return modules;
}

function guardSourceUsesOnlyLightweightDependencies(
  source: string,
  sourceName: string,
  allowedImports: ReadonlySet<string>,
): void {
  for (const importedModule of importedModules(source, sourceName)) {
    assert.ok(
      allowedImports.has(importedModule),
      `${sourceName} must only import lightweight Node.js APIs and the guard module; found "${importedModule}".`,
    );
  }
}

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
for (const guardSource of guardSources) {
  guardSourceUsesOnlyLightweightDependencies(
    guardSource.source,
    guardSource.name,
    guardSource.allowedImports,
  );
}

for (const forbiddenImport of [
  "@workspace/db",
  "pg",
  "playwright",
  "./browser-idempotency.integration.js",
  "node:net",
  "node:tls",
  "node:child_process",
]) {
  assert.throws(
    () => guardSourceUsesOnlyLightweightDependencies(
      ["import ", JSON.stringify(forbiddenImport), ";"].join(""),
      "browser-idempotency-guard.test.ts",
      new Set(["./browser-idempotency-guard.js"]),
    ),
    {
      message:
        `browser-idempotency-guard.test.ts must only import lightweight Node.js APIs and the guard module; found "${forbiddenImport}".`,
    },
  );
}

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