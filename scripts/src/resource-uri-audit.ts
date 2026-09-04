import {
  classifyUnsafeResourceUri,
  type UnsafeResourceUriFinding,
} from "./resource-uri-policy.js";

export type ResourceUriRecord = { id: string; uri: string };
export type ResourceUriAuditFinding = ResourceUriRecord & {
  finding: UnsafeResourceUriFinding;
  action: "REPORTED" | "QUARANTINED";
};

export async function auditResourceUris(
  resources: ResourceUriRecord[],
  quarantineFinding?: (
    resource: ResourceUriRecord,
    finding: UnsafeResourceUriFinding,
  ) => Promise<void>,
): Promise<ResourceUriAuditFinding[]> {
  const findings: ResourceUriAuditFinding[] = [];

  for (const resource of resources) {
    const finding = classifyUnsafeResourceUri(resource.uri);
    if (!finding) continue;

    if (quarantineFinding) await quarantineFinding(resource, finding);
    findings.push({
      ...resource,
      finding,
      action: quarantineFinding ? "QUARANTINED" : "REPORTED",
    });
  }

  return findings;
}