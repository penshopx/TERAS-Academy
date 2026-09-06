import { getAuth } from "@clerk/express";
import { createClerkClient } from "@clerk/backend";
import type { Request, Response } from "express";
import { learnerContext } from "./teras";
import { db, peopleTable, personRolesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { claimInitialSuperAdmin, hasActiveSuperAdmin } from "@workspace/db/admin-membership";
import { allowsDemoAccess } from "@workspace/db/demo-access";

type WorkspaceRole = "trainer" | "assessor";
type AdminRole = "admin" | "super_admin";
export type LearningActorRole = WorkspaceRole | "learner";
export type LearningActor = { id: string; role: LearningActorRole };
export type TestAuthorizationIdentity = {
  userId: string | null;
  role: WorkspaceRole | "learner" | AdminRole | null;
  /** Test-only server injected learner identity; never accepted from HTTP. */
  learnerId?: string;
};
export type LearnerContext = Awaited<ReturnType<typeof learnerContext>>;

/**
 * This symbol is only populated by the in-process integration app factory.
 * It cannot be supplied by an HTTP client, and the production app never sets it.
 */
export const testAuthorizationIdentity = Symbol("teras.testAuthorizationIdentity");

function integrationIdentity(req: Request): TestAuthorizationIdentity | undefined {
  return (req as Request & {
    [testAuthorizationIdentity]?: TestAuthorizationIdentity;
  })[testAuthorizationIdentity];
}

export type AdminActor = { clerkUserId: string; personId: string | null; roles: AdminRole[] };
export type KnowledgeRole = "super_admin" | "admin" | "trainer" | "assessor" | "learner";
export type KnowledgeActor = { clerkUserId: string; roles: KnowledgeRole[] };
export type CurrentSession = { personId: string; name: string; roles: KnowledgeRole[] };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The optional operator value is normalized, but never returned or logged. */
export function configuredBootstrapEmail(): string | null {
  const email = process.env.TERAS_BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return email && emailPattern.test(email) ? email : null;
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "SA";
}

type BootstrapClerkAccount = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: Array<{ emailAddress: string; verification?: { status?: string | null } | null }>;
};

/** Pure validation seam for the bootstrap's Clerk identity-discovery result. */
export function verifiedBootstrapIdentity(
  userId: string,
  bootstrapEmail: string,
  accounts: BootstrapClerkAccount[],
) {
  const verifiedMatches = accounts.filter(account => account.emailAddresses.some(address =>
    address.emailAddress.trim().toLowerCase() === bootstrapEmail
    && address.verification?.status === "verified",
  ));
  if (verifiedMatches.length !== 1 || verifiedMatches[0].id !== userId) return null;
  const account = verifiedMatches[0];
  const verifiedEmail = account.emailAddresses.find(address =>
    address.emailAddress.trim().toLowerCase() === bootstrapEmail
    && address.verification?.status === "verified",
  );
  if (!verifiedEmail) return null;
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || verifiedEmail.emailAddress;
  return {
    clerkUserId: account.id,
    email: verifiedEmail.emailAddress,
    name,
    initials: initialsFor(name),
  };
}

/**
 * A one-time identity-discovery bridge for a newly published production
 * tenant.  It never authorizes by email: Clerk must resolve the already
 * authenticated Clerk user as the sole owner of the exact verified address,
 * and the following request is authorized from the local role just created.
 */
export async function ensureConfiguredBootstrapAdmin(userId: string): Promise<void> {
  const bootstrapEmail = configuredBootstrapEmail();
  if (!bootstrapEmail || await hasActiveSuperAdmin()) return;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return; // Fail closed when this runtime cannot verify Clerk.

  try {
    const clerk = createClerkClient({ secretKey });
    const result = await clerk.users.getUserList({ emailAddress: [bootstrapEmail], limit: 100 });
    // A matching email on another account, an unverified address, or ambiguity
    // never reaches the database mutation.
    const identity = verifiedBootstrapIdentity(userId, bootstrapEmail, result.data);
    if (!identity) return;
    await claimInitialSuperAdmin(identity);
  } catch {
    // Clerk lookup errors are intentionally indistinguishable from no match.
    // The normal local-role check below returns 403 rather than granting access.
  }
}

export async function authorizeCurrentSession(req: Request, res: Response): Promise<CurrentSession | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role) {
      return {
        personId: identity.learnerId ?? identity.userId,
        name: "Test user",
        roles: [identity.role],
      };
    }
    res.status(identity.userId ? 403 : 401).json({
      error: identity.userId ? "A local TERAS role is required" : "Authentication required",
    });
    return null;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  await ensureConfiguredBootstrapAdmin(userId);
  const assignments = await db.select({
    personId: peopleTable.id,
    name: peopleTable.name,
    role: personRolesTable.role,
  }).from(peopleTable)
    .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(eq(peopleTable.clerkUserId, userId), eq(peopleTable.status, "active")));
  const roles = [...new Set(assignments.map(assignment => assignment.role).filter((role): role is KnowledgeRole =>
    ["super_admin", "admin", "trainer", "assessor", "learner"].includes(role),
  ))];
  if (!assignments[0] || !roles.length) {
    res.status(403).json({ error: "A local TERAS role is required" });
    return null;
  }
  return { personId: assignments[0].personId, name: assignments[0].name, roles };
}

/** Authenticated, local-role-derived visibility scope for assistant content. */
export async function authorizeKnowledgeActor(req: Request, res: Response): Promise<KnowledgeActor | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role) return { clerkUserId: identity.userId, roles: [identity.role] };
    res.status(identity.userId ? 403 : 401).json({
      error: identity.userId ? "A local TERAS role is required" : "Authentication required",
    });
    return null;
  }
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return null; }
  const assignments = await db.select({ role: personRolesTable.role }).from(peopleTable).innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(eq(peopleTable.clerkUserId, userId), eq(peopleTable.status, "active")));
  const roles = [...new Set(assignments.map(assignment => assignment.role).filter((role): role is KnowledgeRole =>
    ["super_admin", "admin", "trainer", "assessor", "learner"].includes(role),
  ))];
  if (!roles.length) { res.status(403).json({ error: "A local TERAS role is required" }); return null; }
  return { clerkUserId: userId, roles };
}

/** Administrative authority is a local, active role assignment, never a Clerk
 * public-metadata claim supplied by the browser. */
export async function authorizeAdmin(req: Request, res: Response): Promise<AdminActor | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && (identity.role === "admin" || identity.role === "super_admin")) return { clerkUserId: identity.userId, personId: null, roles: [identity.role] };
    res.status(identity.userId ? 403 : 401).json({ error: "Administrator role required" });
    return null;
  }
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  await ensureConfiguredBootstrapAdmin(userId);
  const assignments = await db.select({ personId: peopleTable.id, role: personRolesTable.role }).from(peopleTable)
    .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(eq(peopleTable.clerkUserId, userId), eq(peopleTable.status, "active"), sql`${personRolesTable.role} IN ('admin', 'super_admin')`));
  if (!assignments.length) {
    req.log.warn({ userId }, "Unauthorized admin mutation");
    res.status(403).json({ error: "Administrator role required" });
    return null;
  }
  return { clerkUserId: userId, personId: assignments[0].personId, roles: assignments.map(item => item.role as AdminRole) };
}

export async function authorizeSuperAdmin(req: Request, res: Response): Promise<AdminActor | null> {
  const actor = await authorizeAdmin(req, res);
  if (!actor) return null;
  if (actor.roles.includes("super_admin")) return actor;
  res.status(403).json({ error: "Super administrator role required" });
  return null;
}

/**
 * Roles are mapped server-side from Clerk identities.  The unauthenticated
 * demo allowance is intentionally development-only and always uses seeded IDs.
 */
export async function authorizeWorkspaceRole(req: Request, res: Response, role: WorkspaceRole): Promise<string | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role === role) {
      const [assignedPerson] = await db.select({ personId: peopleTable.id }).from(peopleTable)
        .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
        .where(and(
          eq(peopleTable.clerkUserId, identity.userId),
          eq(peopleTable.status, "active"),
          eq(personRolesTable.role, role),
        ))
        .limit(1);
      if (assignedPerson) return assignedPerson.personId;
      // In-process test identities are server-injected and cannot be supplied
      // by an HTTP client. Keep the seeded fixture fallback test-only.
      if (process.env.NODE_ENV === "test") {
        const context = await learnerContext();
        return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
      }
    }
    res.status(identity.userId ? 403 : 401).json({ error: "You are not authorized for this action" });
    return null;
  }
  const { userId } = getAuth(req);
  if (userId) {
    const [assignedPerson] = await db.select({ personId: peopleTable.id }).from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        eq(peopleTable.clerkUserId, userId),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, role),
      ))
      .limit(1);
    if (assignedPerson) return assignedPerson.personId;
  }
  if (!userId && allowsDemoAccess()) {
    const context = await learnerContext();
    return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
  }
  req.log.warn({ role, userId: userId ?? null }, "Unauthorized workspace mutation");
  res.status(userId ? 403 : 401).json({ error: "You are not authorized for this action" });
  return null;
}

export async function authorizeLearner(req: Request, res: Response): Promise<string | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role === "learner") {
      const learnerId = identity.learnerId;
      if (learnerId) {
        try {
          return (await learnerContext(learnerId)).learner.id;
        } catch {
          res.status(403).json({ error: "You are not authorized for this learner" });
          return null;
        }
      }
      return (await learnerContext()).learner.id;
    }
    res.status(identity.userId ? 403 : 401).json({ error: "You are not authorized for this learner" });
    return null;
  }
  const { userId } = getAuth(req);
  if (!userId && allowsDemoAccess()) {
    return (await learnerContext()).learner.id;
  }
  if (userId) {
    const [assignedLearner] = await db.select({ personId: peopleTable.id }).from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        eq(peopleTable.clerkUserId, userId),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, "learner"),
      ))
      .limit(1);
    if (assignedLearner) {
      try {
        return (await learnerContext(assignedLearner.personId)).learner.id;
      } catch {
        // A learner role still requires an active enrollment.
      }
    }
  }
  req.log.warn({ userId: userId ?? null }, "Unauthorized learner mutation");
  res.status(userId ? 403 : 401).json({ error: "You are not authorized for this learner" });
  return null;
}

export async function authorizeLearningActor(req: Request, res: Response): Promise<LearningActor | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (!identity.userId || !identity.role) {
      res.status(identity.userId ? 403 : 401).json({ error: "You are not authorized for this learning transition" });
      return null;
    }
    if (identity.role === "learner") {
      const context = await learnerContext(identity.learnerId);
      return { id: context.learner.id, role: "learner" };
    }
    if (identity.role !== "trainer" && identity.role !== "assessor") {
      res.status(403).json({ error: "You are not authorized for this learning transition" });
      return null;
    }
    // Test identities are injected by the integration app, but must still be
    // resolved through the same local active role assignment as production.
    const [workspaceActor] = await db.select({ personId: peopleTable.id }).from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        eq(peopleTable.clerkUserId, identity.userId),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, identity.role),
      ))
      .limit(1);
    if (workspaceActor) return { id: workspaceActor.personId, role: identity.role };
    // Some legacy in-process fixtures do not create Clerk-mapped people.
    // This fallback is unavailable to HTTP clients and remains test-only.
    if (process.env.NODE_ENV === "test") {
      const context = await learnerContext(identity.learnerId);
      const id = identity.role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
      if (id) return { id, role: identity.role };
    }
    res.status(403).json({ error: "You are not authorized for this learning transition" });
    return null;
  }

  const { userId } = getAuth(req);
  if (!userId && allowsDemoAccess()) {
    const context = await learnerContext();
    return { id: context.learner.id, role: "learner" };
  }
  if (userId) {
    const [workspaceActor] = await db.select({
      personId: peopleTable.id,
      role: personRolesTable.role,
    }).from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        eq(peopleTable.clerkUserId, userId),
        eq(peopleTable.status, "active"),
        sql`${personRolesTable.role} IN ('trainer', 'assessor')`,
      ))
      .limit(1);
    if (workspaceActor) {
      return {
        id: workspaceActor.personId,
        role: workspaceActor.role as WorkspaceRole,
      };
    }

    const [assignedLearner] = await db.select({ personId: peopleTable.id }).from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        eq(peopleTable.clerkUserId, userId),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, "learner"),
      ))
      .limit(1);
    if (assignedLearner) {
      try {
        const context = await learnerContext(assignedLearner.personId);
        return { id: context.learner.id, role: "learner" };
      } catch {
        // Learner role requires an active enrollment.
      }
    }
  }
  req.log.warn({ userId: userId ?? null }, "Unauthorized learning transition");
  res.status(userId ? 403 : 401).json({ error: "You are not authorized for this learning transition" });
  return null;
}