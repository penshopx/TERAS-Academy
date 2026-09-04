import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { learnerContext } from "./teras";

type WorkspaceRole = "trainer" | "assessor";
export type LearningActorRole = WorkspaceRole | "learner";
export type LearningActor = { id: string; role: LearningActorRole };
export type TestAuthorizationIdentity = {
  userId: string | null;
  role: WorkspaceRole | "learner" | null;
};

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

/**
 * Roles are mapped server-side from Clerk identities.  The unauthenticated
 * demo allowance is intentionally development-only and always uses seeded IDs.
 */
export async function authorizeWorkspaceRole(req: Request, res: Response, role: WorkspaceRole): Promise<string | null> {
  const identity = integrationIdentity(req);
  if (identity) {
    if (identity.userId && identity.role === role) {
      const context = await learnerContext();
      return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
    }
    res.status(identity.userId ? 403 : 401).json({ error: "You are not authorized for this action" });
    return null;
  }
  const { userId } = getAuth(req);
  const configuredUserId = role === "trainer" ? process.env.CLERK_TRAINER_USER_ID : process.env.CLERK_ASSESSOR_USER_ID;
  if (userId && configuredUserId && userId === configuredUserId) {
    const context = await learnerContext();
    return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
  }
  if (!userId && process.env.NODE_ENV !== "production") {
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
      return (await learnerContext()).learner.id;
    }
    res.status(identity.userId ? 403 : 401).json({ error: "You are not authorized for this learner" });
    return null;
  }
  const { userId } = getAuth(req);
  if (!userId && process.env.NODE_ENV !== "production") {
    return (await learnerContext()).learner.id;
  }
  if (userId) {
    const context = await learnerContext();
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (context.learner.email && primaryEmail?.toLowerCase() === context.learner.email.toLowerCase()) {
      return context.learner.id;
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
    const context = await learnerContext();
    if (identity.role === "learner") return { id: context.learner.id, role: "learner" };
    if (identity.role === "trainer" && context.enrollment.trainerId) return { id: context.enrollment.trainerId, role: "trainer" };
    if (identity.role === "assessor" && context.enrollment.assessorId) return { id: context.enrollment.assessorId, role: "assessor" };
    res.status(403).json({ error: "You are not authorized for this learning transition" });
    return null;
  }

  const { userId } = getAuth(req);
  const context = await learnerContext();
  if (!userId && process.env.NODE_ENV !== "production") {
    return { id: context.learner.id, role: "learner" };
  }
  if (userId && userId === process.env.CLERK_TRAINER_USER_ID && context.enrollment.trainerId) {
    return { id: context.enrollment.trainerId, role: "trainer" };
  }
  if (userId && userId === process.env.CLERK_ASSESSOR_USER_ID && context.enrollment.assessorId) {
    return { id: context.enrollment.assessorId, role: "assessor" };
  }
  if (userId) {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (context.learner.email && primaryEmail?.toLowerCase() === context.learner.email.toLowerCase()) {
      return { id: context.learner.id, role: "learner" };
    }
  }
  req.log.warn({ userId: userId ?? null }, "Unauthorized learning transition");
  res.status(userId ? 403 : 401).json({ error: "You are not authorized for this learning transition" });
  return null;
}