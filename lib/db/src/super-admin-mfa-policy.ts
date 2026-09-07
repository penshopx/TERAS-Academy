export type SuperAdminMfaIdentity = {
  aal: string | null;
  test: boolean;
};

export type SuperAdminMfaEnvironment = {
  NODE_ENV?: string;
  SUPABASE_MFA_ENROLLMENT_LOCKED?: string;
};

/**
 * Super Admin AAL2 is trusted only while Supabase factor enrollment is locked.
 * Test identities are an in-process integration facility and never satisfy the
 * production policy.
 */
export function allowsSuperAdminMfa(
  identity: SuperAdminMfaIdentity,
  environment: SuperAdminMfaEnvironment,
): boolean {
  if (identity.test) return environment.NODE_ENV === "test";
  return identity.aal === "aal2"
    && environment.SUPABASE_MFA_ENROLLMENT_LOCKED === "true";
}

export function allowsAdministrativeRoles(
  roles: readonly string[],
  identity: SuperAdminMfaIdentity,
  environment: SuperAdminMfaEnvironment,
): boolean {
  return !roles.includes("super_admin")
    || allowsSuperAdminMfa(identity, environment);
}