import type { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";
export enum ObjectPermission { READ = "read", WRITE = "write" }
export interface ObjectAclPolicy { owner: string; visibility: "private"; }

/** Object ACLs are deliberately person-id based; external authentication is
 * resolved into a local role/pathway identity before object authorization. */
export async function setObjectAclPolicy(file: File, policy: ObjectAclPolicy): Promise<void> {
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Object not found: ${file.name}`);
  await file.setMetadata({ metadata: { [ACL_POLICY_METADATA_KEY]: JSON.stringify(policy) } });
}

export async function canAccessObject(file: File, personId: string, permission: ObjectPermission): Promise<boolean> {
  if (permission !== ObjectPermission.READ) return false;
  const [metadata] = await file.getMetadata();
  const raw = metadata.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!raw || typeof raw !== "string") return false;
  try {
    const policy = JSON.parse(raw) as Partial<ObjectAclPolicy>;
    return policy.visibility === "private" && policy.owner === personId;
  } catch {
    return false;
  }
}