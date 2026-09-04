import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { learnerContext } from "./teras";
import { db, peopleTable, personRolesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

type WorkspaceRole = "trainer" | "assessor";
type AdminRole = "admin";
export type LearningActorRole = WorkspaceRole | "learner";
export type LearningActor = { id: string; role: LearningActorRole };
export type TestAuthorizationIdentity = {
  userId: string | null;
  role: WorkspaceRole | "learner" | AdminRole | null;
  /** Test-only server injected learner identity; never accepted from HTTP. */
  learnerId?: string;
};
export type LearnerContext = Awaited<ReturnType<typeof learnerContext>>;
const allowsDemoAccess = () => process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

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

export type AdminActor = { clerkUserId: string; personId: string | null };

/** Administrative authority is a local, active role assignment, never a Clerk
 * public-metadata claim supplied by the browser. */
export async function authorizeAdmin(req: Request, res: Response): Promise<AdminActor | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role === "admin") return { clerkUserId: identity.userId, personId: null };
    res.status(identity.userId ? 403 : 401).json({ error: "Administrator role required" });
    return null;
  }
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const [assignment] = await db.select({ personId: peopleTable.id }).from(peopleTable)
    .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(eq(peopleTable.clerkUserId, userId), eq(peopleTable.status, "active"), eq(personRolesTable.role, "admin")))
    .limit(1);
  if (!assignment) {
    req.log.warn({ userId }, "Unauthorized admin mutation");
    res.status(403).json({ error: "Administrator role required" });
    return null;
  }
  return { clerkUserId: userId, personId: assignment.personId };
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
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (primaryEmail) {
      const [learner] = await db.select().from(peopleTable).where(sql`lower(${peopleTable.email}) = lower(${primaryEmail})`).limit(1);
      if (learner) {
        try {
          return (await learnerContext(learner.id)).learner.id;
        } catch {
          // Signed-in people without a valid enrollment are forbidden.
        }
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
    const context = await learnerContext(identity.learnerId);
    if (identity.role === "learner") return { id: context.learner.id, role: "learner" };
    if (identity.role === "trainer" && context.enrollment.trainerId) return { id: context.enrollment.trainerId, role: "trainer" };
    if (identity.role === "assessor" && context.enrollment.assessorId) return { id: context.enrollment.assessorId, role: "assessor" };
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

    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (primaryEmail) {
      const [learner] = await db.select().from(peopleTable).where(sql`lower(${peopleTable.email}) = lower(${primaryEmail})`).limit(1);
      if (learner) {
        try {
          const context = await learnerContext(learner.id);
          return { id: context.learner.id, role: "learner" };
        } catch {
          // Mapped users need an enrollment.
        }
      }
    }
  }
  req.log.warn({ userId: userId ?? null }, "Unauthorized learning transition");
  res.status(userId ? 403 : 401).json({ error: "You are not authorized for this learning transition" });
  return null;
}