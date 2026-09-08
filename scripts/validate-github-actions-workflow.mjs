import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { createLinter } from "actionlint";

const workflowPath = process.argv[2];

if (!workflowPath) {
  console.error("Usage: node scripts/validate-github-actions-workflow.mjs <workflow.yml>");
  process.exit(2);
}

const absolutePath = resolve(workflowPath);
const source = await readFile(absolutePath, "utf8");
const lint = await createLinter();
const findings = lint(source, workflowPath).filter(
  (finding) =>
    !(
      finding.kind === "permissions" &&
      finding.message.startsWith('unknown permission scope "attestations"')
    ),
);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column}: ${finding.message} [${finding.kind}]`,
    );
  }
  process.exit(1);
}

console.log(`GitHub Actions workflow is valid: ${workflowPath}`);