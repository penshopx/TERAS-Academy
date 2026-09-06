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
const membershipTables = new Set(["peopleTable", "personRolesTable"]);

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

type MembershipOperation = {
  name: string;
  line: number;
  hasSharedLock: boolean;
};

function adminMembershipOperations(source: string, fileName = "admin-membership.ts"): MembershipOperation[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  const exportedNames = new Map<string, string>();
  const tableAliases = new Set(membershipTables);

  const isSharedLockStatement = (statement: ts.Statement, txName: string): boolean => {
    if (!ts.isExpressionStatement(statement)) return false;
    const expression = unwrap(statement.expression);
    if (!ts.isAwaitExpression(expression)) return false;
    const call = unwrap(expression.expression);
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(unwrap(call.expression))) return false;
    const callee = unwrap(call.expression) as ts.PropertyAccessExpression;
    return callee.name.text === "execute"
      && ts.isIdentifier(unwrap(callee.expression))
      && (unwrap(callee.expression) as ts.Identifier).text === txName
      && call.arguments.length === 1
      && ts.isIdentifier(unwrap(call.arguments[0]))
      && (unwrap(call.arguments[0]) as ts.Identifier).text === "mutationLock";
  };

  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      const isExported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
      const localName = statement.name?.text ?? (isExported && isDefault ? "<default>" : null);
      if (localName) {
        functions.set(localName, statement);
        if (isExported) exportedNames.set(localName, isDefault ? "default" : localName);
      }
    }
    if (ts.isVariableStatement(statement)) {
      const exported = statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer ? unwrap(declaration.initializer) : undefined;
        if (
          ts.isIdentifier(declaration.name)
          && initializer
          && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        ) {
          functions.set(declaration.name.text, initializer);
          if (exported) exportedNames.set(declaration.name.text, declaration.name.text);
        }
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exportedNames.set((element.propertyName ?? element.name).text, element.name.text);
      }
    }
  }

  let aliasesChanged = true;
  while (aliasesChanged) {
    aliasesChanged = false;
    const collectTableAliases = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && ts.isIdentifier(unwrap(node.initializer))
        && tableAliases.has((unwrap(node.initializer) as ts.Identifier).text)
        && !tableAliases.has(node.name.text)
      ) {
        tableAliases.add(node.name.text);
        aliasesChanged = true;
      }
      ts.forEachChild(node, collectTableAliases);
    };
    collectTableAliases(file);
  }

  const mutationLockState = (node: ts.Node): boolean => {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (
        (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
        && ts.isCallExpression(current.parent)
        && current.parent.arguments.some(argument => unwrap(argument) === current)
        && ts.isPropertyAccessExpression(unwrap(current.parent.expression))
        && (unwrap(current.parent.expression) as ts.PropertyAccessExpression).name.text === "transaction"
      ) {
        return current.parameters.length === 1
          && ts.isIdentifier(current.parameters[0].name)
          && ts.isBlock(current.body)
          && current.body.statements.length > 0
          && isSharedLockStatement(current.body.statements[0], current.parameters[0].name.text);
      }
      current = current.parent;
    }
    return false;
  };

  const directMutations = new Map<string, boolean[]>();
  const calls = new Map<string, Set<string>>();
  for (const [name, declaration] of functions) {
    const states: boolean[] = [];
    const callees = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        if (ts.isIdentifier(callee) && functions.has(callee.text)) callees.add(callee.text);
        if (
          ts.isPropertyAccessExpression(callee)
          && mutationMethods.has(callee.name.text)
          && node.arguments[0]
        ) {
          const table = unwrap(node.arguments[0]);
          if (ts.isIdentifier(table) && tableAliases.has(table.text)) {
            states.push(mutationLockState(node));
          }
        }
      }
      if (
        ts.isTaggedTemplateExpression(node)
        && /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?teras_(?:people|person_roles)\b/i.test(
          node.template.getText(file),
        )
      ) {
        states.push(mutationLockState(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration);
    directMutations.set(name, states);
    calls.set(name, callees);
  }

  const reachableMutationStates = (name: string, seen = new Set<string>()): boolean[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    return [
      ...(directMutations.get(name) ?? []),
      ...[...(calls.get(name) ?? [])].flatMap(callee => reachableMutationStates(callee, new Set(seen))),
    ];
  };

  const operations: MembershipOperation[] = [];
  for (const [localName, publicName] of exportedNames) {
    const declaration = functions.get(localName);
    if (!declaration) continue;
    const states = reachableMutationStates(localName);
    if (states.length === 0) continue;
    operations.push({
      name: publicName,
      line: file.getLineAndCharacterOfPosition(declaration.getStart(file)).line + 1,
      hasSharedLock: states.every(Boolean),
    });
  }

  return operations.sort((left, right) => left.line - right.line);
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

const allowedWriterSource = await readFile(allowedWriter, "utf8");
const membershipOperations = adminMembershipOperations(allowedWriterSource, allowedWriter);
assert.deepEqual(
  membershipOperations.map(operation => operation.name),
  [
    "createManagedUser",
    "updateManagedUser",
    "replaceManagedUserRoles",
    "reviewAdminAccessRequest",
    "provisionSuperAdmin",
    "ensureConfiguredAdmin",
    "seedManagedPeople",
  ],
  "The active-admin mutation inventory changed; review every new public operation before updating this contract",
);
assert.deepEqual(
  membershipOperations.filter(operation => !operation.hasSharedLock),
  [],
  "Every public active-admin mutation must take mutationLock as the first transaction operation",
);

const unlockedOperationFixture = `
  import { peopleTable } from "./index";
  export async function unsafeStatusChange() {
    return db.transaction(async tx => {
      await tx.update(peopleTable).set({ status: "inactive" });
    });
  }
`;
assert.deepEqual(
  adminMembershipOperations(unlockedOperationFixture).map(operation => ({
    name: operation.name,
    hasSharedLock: operation.hasSharedLock,
  })),
  [{ name: "unsafeStatusChange", hasSharedLock: false }],
  "The contract fixture must prove an exported mutation cannot bypass the shared transaction lock",
);

const delegatedArrowFixture = `
  import { personRolesTable } from "./index";
  async function replaceRoles(tx) {
    await tx.delete(personRolesTable);
  }
  const changeRoles = async () => db.transaction(async tx => replaceRoles(tx));
  export { changeRoles as unsafeRoleChange };
`;
assert.deepEqual(
  adminMembershipOperations(delegatedArrowFixture).map(operation => ({
    name: operation.name,
    hasSharedLock: operation.hasSharedLock,
  })),
  [{ name: "unsafeRoleChange", hasSharedLock: false }],
  "The contract must follow exported aliases, arrow functions, and delegated mutations",
);

const unrelatedLockedTransactionFixture = `
  import { peopleTable } from "./index";
  export async function unsafeStatusChange() {
    await db.transaction(async tx => {
      await tx.execute(mutationLock);
      await tx.select().from(peopleTable);
    });
    return db.transaction(async tx => {
      await tx.update(peopleTable).set({ status: "inactive" });
    });
  }
`;
assert.deepEqual(
  adminMembershipOperations(unrelatedLockedTransactionFixture).map(operation => operation.hasSharedLock),
  [false],
  "A lock in an unrelated transaction must not protect the transaction containing the mutation",
);

const aliasedRawMutationFixture = `
  import { peopleTable } from "./index";
  const users = peopleTable;
  export const unsafeAlias = async () => db.transaction(async tx => tx.update(users));
  export const unsafeSql = async () => db.transaction(async tx => {
    await tx.execute(sql\`UPDATE teras_person_roles SET role = 'learner'\`);
  });
`;
assert.deepEqual(
  adminMembershipOperations(aliasedRawMutationFixture).map(operation => ({
    name: operation.name,
    hasSharedLock: operation.hasSharedLock,
  })),
  [
    { name: "unsafeAlias", hasSharedLock: false },
    { name: "unsafeSql", hasSharedLock: false },
  ],
  "Local table aliases and raw SQL mutations must remain inside the lock contract",
);