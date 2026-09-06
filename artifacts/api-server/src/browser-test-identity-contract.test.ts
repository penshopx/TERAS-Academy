import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const identityEventName = "teras:test-identity-change";
const sourceDirectory = import.meta.dirname;
const sourceFilePattern = /\.[cm]?[jt]sx?$/;
const browserTestFilePattern = /\.(?:integration|test|spec)\.[cm]?[jt]sx?$/;
const ignoredDirectories = new Set(["dist", "node_modules"]);
const exemptFiles = new Set([
  "browser-test-identity-contract.test.ts",
  "browser-test-identity-harness.ts",
]);

function sourceFile(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function isPlaywrightModule(moduleName: string): boolean {
  return (
    moduleName === "playwright" ||
    moduleName.startsWith("playwright/") ||
    moduleName === "playwright-core" ||
    moduleName.startsWith("playwright-core/") ||
    moduleName === "@playwright/test" ||
    moduleName.startsWith("@playwright/test/")
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(entryPath);
    }
    return sourceFilePattern.test(entry.name) ? [entryPath] : [];
  });
}

function identityContractViolations(source: string, fileName: string): string[] {
  const file = sourceFile(source, fileName);
  const imports = file.statements.flatMap(statement =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [{ statement, moduleName: statement.moduleSpecifier.text }]
      : [],
  );
  const violations: string[] = [];
  const referencedModules = new Set(imports.map(({ moduleName }) => moduleName));
  const harnessNames = new Set<string>();
  let manuallyReferencesIdentityEvent = false;
  let createsHarnessedPage = false;
  let createsPageDirectly = false;
  let launchesPersistentContext = false;

  for (const { statement, moduleName } of imports) {
    if (!moduleName.endsWith("/browser-test-identity-harness.js")) {
      continue;
    }
    for (const element of statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
      ? statement.importClause.namedBindings.elements
      : []) {
      if ((element.propertyName ?? element.name).text === "BrowserTestIdentityHarness") {
        harnessNames.add(element.name.text);
      }
    }
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isExportDeclaration(node) || ts.isImportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      referencedModules.add(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      referencedModules.add(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      referencedModules.add(node.arguments[0].text);
    }

    if (ts.isStringLiteralLike(node) && node.text === identityEventName) {
      manuallyReferencesIdentityEvent = true;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      harnessNames.has(node.expression.expression.text) &&
      node.expression.name.text === "createPage"
    ) {
      createsHarnessedPage = true;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "newPage"
    ) {
      createsPageDirectly = true;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "launchPersistentContext"
    ) {
      launchesPersistentContext = true;
    }

    ts.forEachChild(node, visit);
  }

  visit(file);

  if (manuallyReferencesIdentityEvent) {
    violations.push(
      `${fileName} must not reference "${identityEventName}" directly; use BrowserTestIdentityHarness.`,
    );
  }
  const playwrightModules = [...referencedModules].filter(isPlaywrightModule);
  const isBrowserTest =
    browserTestFilePattern.test(fileName) && playwrightModules.length > 0;

  if (
    playwrightModules.some(moduleName => moduleName.startsWith("@playwright/test"))
  ) {
    violations.push(
      `${fileName} must not use the @playwright/test page fixture; create every page through BrowserTestIdentityHarness.createPage.`,
    );
  }
  if (createsPageDirectly) {
    violations.push(
      `${fileName} must not call newPage directly; use BrowserTestIdentityHarness.createPage so identity is installed atomically.`,
    );
  }
  if (launchesPersistentContext) {
    violations.push(
      `${fileName} must not call launchPersistentContext because it creates an uninstrumented page.`,
    );
  }
  if (isBrowserTest && (harnessNames.size === 0 || !createsHarnessedPage)) {
    violations.push(
      `${fileName} must create its browser page through BrowserTestIdentityHarness.createPage.`,
    );
  }

  return violations;
}

const unsafeFixture = `
  import { test } from "@playwright/test";
  window.dispatchEvent(new CustomEvent("teras:test-identity-change"));
`;
assert.deepEqual(
  identityContractViolations(unsafeFixture, "unsafe.integration.ts"),
  [
    'unsafe.integration.ts must not reference "teras:test-identity-change" directly; use BrowserTestIdentityHarness.',
    "unsafe.integration.ts must not use the @playwright/test page fixture; create every page through BrowserTestIdentityHarness.createPage.",
    "unsafe.integration.ts must create its browser page through BrowserTestIdentityHarness.createPage.",
  ],
  "the contract must reject manual identity events and missing harness installation",
);

const secondUninstrumentedPageFixture = `
  import { chromium } from "playwright";
  import { BrowserTestIdentityHarness } from "../browser-test-identity-harness.js";
  const { page } = await BrowserTestIdentityHarness.createPage(browser, "admin");
  const secondPage = await browser.newPage();
`;
assert.deepEqual(
  identityContractViolations(
    secondUninstrumentedPageFixture,
    "nested/second-page.spec.ts",
  ),
  [
    "nested/second-page.spec.ts must not call newPage directly; use BrowserTestIdentityHarness.createPage so identity is installed atomically.",
  ],
  "the contract must reject a second page created outside the harness",
);

const deferredInstallFixture = `
  import { chromium } from "playwright";
  import { BrowserTestIdentityHarness } from "../browser-test-identity-harness.js";
  async function deferredInstall(page) {
    await BrowserTestIdentityHarness.install(page, "admin");
  }
  const page = await browser.newPage();
  await page.goto("/admin");
`;
assert.deepEqual(
  identityContractViolations(deferredInstallFixture, "nested/deferred.test.ts"),
  [
    "nested/deferred.test.ts must not call newPage directly; use BrowserTestIdentityHarness.createPage so identity is installed atomically.",
    "nested/deferred.test.ts must create its browser page through BrowserTestIdentityHarness.createPage.",
  ],
  "the contract must reject a deferred install that does not protect page creation",
);

const dynamicImportFixture = `
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch();
  const page = await browser.newPage();
`;
assert.deepEqual(
  identityContractViolations(dynamicImportFixture, "dynamic.integration.ts"),
  [
    "dynamic.integration.ts must not call newPage directly; use BrowserTestIdentityHarness.createPage so identity is installed atomically.",
    "dynamic.integration.ts must create its browser page through BrowserTestIdentityHarness.createPage.",
  ],
  "the contract must reject dynamic playwright-core imports that bypass the harness",
);

const requireFixture = `
  const playwright = require("playwright");
  const context = await playwright.chromium.launchPersistentContext("/tmp/profile");
`;
assert.deepEqual(
  identityContractViolations(requireFixture, "require.spec.cjs"),
  [
    "require.spec.cjs must not call launchPersistentContext because it creates an uninstrumented page.",
    "require.spec.cjs must create its browser page through BrowserTestIdentityHarness.createPage.",
  ],
  "the contract must reject CommonJS browser creation that bypasses the harness",
);

const violations = sourceFiles(sourceDirectory)
  .filter(filePath => !exemptFiles.has(path.basename(filePath)))
  .flatMap(filePath =>
    identityContractViolations(
      readFileSync(filePath, "utf8"),
      path.relative(sourceDirectory, filePath),
    ),
  );

assert.deepEqual(
  violations,
  [],
  `Browser identity contract failed:\n${violations.map(violation => `- ${violation}`).join("\n")}`,
);

process.stdout.write("browser test identity contract passed\n");