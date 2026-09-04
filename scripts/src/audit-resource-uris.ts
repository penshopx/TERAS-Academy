import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { auditResourceUris, type ResourceUriRecord } from "./resource-uri-audit.js";

const quarantine = process.argv.includes("--quarantine");
const failOnFindings = process.argv.includes("--fail-on-findings");
const actorArgument = process.argv.find(argument => argument.startsWith("--actor="));
const actor = actorArgument?.slice("--actor=".length).trim();

if (quarantine && !actor) {
  throw new Error("--quarantine requires a non-empty --actor=<operator> audit identity");
}

async function run(): Promise<void> {
  const client = await pool.connect();
  let findings = 0;
  let quarantined = 0;

  try {
    await client.query("BEGIN");
    const result = await client.query<ResourceUriRecord>(
      `SELECT id, uri
         FROM teras_content_resources
        WHERE uri IS NOT NULL
        ORDER BY id
        ${quarantine ? "FOR UPDATE" : ""}`,
    );

    const auditFindings = await auditResourceUris(
      result.rows,
      quarantine
        ? async (resource, finding) => {
            const existing = await client.query(
              `SELECT 1
                 FROM teras_content_resource_uri_audit
                WHERE resource_id = $1
                  AND original_uri = $2
                  AND action = 'QUARANTINED'
                  AND resolved_at IS NULL
                LIMIT 1`,
              [resource.id, resource.uri],
            );

            if (existing.rowCount === 0) {
              await client.query(
                `INSERT INTO teras_content_resource_uri_audit
                  (id, resource_id, original_uri, finding, action, actor)
                 VALUES ($1, $2, $3, $4, 'QUARANTINED', $5)`,
                [randomUUID(), resource.id, resource.uri, finding, actor],
              );
            }
            await client.query(
              `UPDATE teras_content_resources
                  SET uri = NULL, updated_at = now()
                WHERE id = $1 AND uri = $2`,
              [resource.id, resource.uri],
            );
            quarantined += 1;
          }
        : undefined,
    );

    findings = auditFindings.length;
    for (const finding of auditFindings) {
      process.stdout.write(`${JSON.stringify({
        resourceId: finding.id,
        uri: finding.uri,
        finding: finding.finding,
        action: finding.action,
      })}\n`);
    }

    await client.query(quarantine ? "COMMIT" : "ROLLBACK");
    process.stdout.write(`${JSON.stringify({ summary: { findings, quarantined } })}\n`);
    if (failOnFindings && findings > 0) process.exitCode = 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});