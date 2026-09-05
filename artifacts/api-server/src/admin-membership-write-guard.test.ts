import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import ts from "typescript";

const src = resolve(import.meta.dirname);
const workspace = resolve(src, "../../..");
const allowedWriter = resolve(workspace, "lib/db/src/admin-membership.ts");
const ignoredDirectories = new Set([".git", ".local", "dist", "migrations", "node_modules"]);
const protectedExports = new Set(["peopleTable", "personRolesTable"]);
const protectedDbModules = new Set(["@workspace/db", "@workspace/db/schema"]);
const mutationMethods = new Set(["insert", "update", "delete"]);
const tableConsumerAllowlist = new Set(["from", "innerJoin", "leftJoin", "rightJoin", "fullJoin"]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(path);
    }
    if (
      ![".ts", ".js", ".mjs"].includes(extname(entry.name))
      || entry.name.endsWith(".test.ts")
      || entry.name.endsWith(".integration.ts")
    ) return [];
    return [path];
  }));
  return files.flat();
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
  ) return unwrap(expression.expression);
  return expression;
}

function mutationPolicyViolations(source: string, fileName = "fixture.ts"): number[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const aliases = new Set<string>();
  const namespaces = new Set<string>();
  const violations: number[] = [];
  const moduleName = (node: ts.Expression | undefined) =>
    node && ts.isStringLiteralLike(node) ? node.text : null;
  const isProtectedDbModule = (node: ts.Expression | undefined) =>
    protectedDbModules.has(moduleName(node) ?? "");
  const isProtectedModuleLoad = (expression: ts.Expression): boolean => {
    const value = unwrap(expression);
    if (ts.isAwaitExpression(value)) return isProtectedModuleLoad(value.expression);
    return ts.isCallExpression(value)
      && (
        value.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(value.expression) && value.expression.text === "require")
      )
      && isProtectedDbModule(value.arguments[0]);
  };

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !isProtectedDbModule(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (protectedExports.has((element.propertyName ?? element.name).text)) aliases.add(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }

  const isProtectedTable = (expression: ts.Expression): boolean => {
    const value = unwrap(expression);
    if (ts.isIdentifier(value)) return aliases.has(value.text);
    return ts.isPropertyAccessExpression(value)
      && (
        (ts.isIdentifier(value.expression) && namespaces.has(value.expression.text))
        || isProtectedModuleLoad(value.expression)
      )
      && protectedExports.has(value.name.text);
  };

  // Resolve local aliases and destructuring before evaluating calls.
  let changed = true;
  while (changed) {
    changed = false;
    const collectAliases = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name) && isProtectedModuleLoad(node.initializer) && !namespaces.has(node.name.text)) {
          namespaces.add(node.name.text);
          changed = true;
        }
        if (ts.isIdentifier(node.name) && isProtectedTable(node.initializer) && !aliases.has(node.name.text)) {
          aliases.add(node.name.text);
          changed = true;
        }
        if (
          ts.isObjectBindingPattern(node.name)
          && (
            (ts.isIdentifier(unwrap(node.initializer)) && namespaces.has((unwrap(node.initializer) as ts.Identifier).text))
            || isProtectedModuleLoad(node.initializer)
          )
        ) {
          for (const element of node.name.elements) {
            const imported = (element.propertyName ?? element.name).getText(file);
            if (protectedExports.has(imported) && ts.isIdentifier(element.name) && !aliases.has(element.name.text)) {
              aliases.add(element.name.text);
              changed = true;
            }
          }
        }
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(file);
  }

  const report = (node: ts.Node) => violations.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  const visit = (node: ts.Node) => {
    if (ts.isExportDeclaration(node) && isProtectedDbModule(node.moduleSpecifier)) {
      if (!node.exportClause || (
        ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.some(element => protectedExports.has((element.propertyName ?? element.name).text))
      )) report(node);
    }
    if (
      (ts.isReturnStatement(node) && node.expression && isProtectedTable(node.expression))
      || (ts.isArrowFunction(node) && ts.isExpression(node.body) && isProtectedTable(node.body))
    ) report(node);
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const method = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee) ? callee.text : "";
      if (node.arguments[0] && isProtectedTable(node.arguments[0])) {
        if (mutationMethods.has(method) || !tableConsumerAllowlist.has(method)) report(node);
      }
    }
    if (ts.isTaggedTemplateExpression(node)) {
      const sqlText = node.template.getText(file);
      if (/\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?teras_(?:people|person_roles)\b/i.test(sqlText)) {
        report(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...new Set(violations)];
}

const violations: string[] = [];
for (const file of await sourceFiles(workspace)) {
  if (file === allowedWriter) continue;
  const source = await readFile(file, "utf8");
  for (const line of mutationPolicyViolations(source, file)) {
    violations.push(`${relative(workspace, file)}:${line}`);
  }
}

assert.deepEqual(violations, [], "Active-admin membership tables must only be written by @workspace/db/admin-membership");

const rejectedByPolicy = [
  `import { peopleTable as users } from "@workspace/db"; tx.update(users).set({ status: "inactive" });`,
  `import { peopleTable as users } from '@workspace/db'; tx.update(users).set({ status: "inactive" });`,
  `import { peopleTable as users } from "@workspace/db/schema"; tx.update(users).set({ status: "inactive" });`,
  `import * as schema from '@workspace/db/schema'; tx.delete(schema.personRolesTable);`,
  `const schema = require('@workspace/db/schema'); tx.update(schema.peopleTable);`,
  `const { personRolesTable: roles } = await import("@workspace/db"); tx.delete(roles);`,
  `import { personRolesTable } from "@workspace/db"; const roles = personRolesTable; db.delete(roles);`,
  `import { peopleTable } from "@workspace/db"; const write = (table: unknown) => tx.insert(table); write(peopleTable);`,
  `import * as schema from "@workspace/db"; const { personRolesTable: roles } = schema; tx.insert(roles);`,
  "db.execute(sql`UPDATE teras_people SET status = 'inactive'`);",
  `export { peopleTable as writablePeople } from "@workspace/db";`,
  `import { peopleTable } from "@workspace/db"; const expose = () => peopleTable; tx.update(expose());`,
];
for (const fixture of rejectedByPolicy) {
  assert.ok(mutationPolicyViolations(fixture).length > 0, `Guard accepted bypass fixture: ${fixture}`);
}

assert.deepEqual(
  mutationPolicyViolations(`import { peopleTable } from "@workspace/db"; db.select().from(peopleTable);`),
  [],
  "Read-only membership queries must remain available",
);