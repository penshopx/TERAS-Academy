import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { learnerContext } from "./teras";

type WorkspaceRole = "trainer" | "assessor";

/**
 * Roles are mapped server-side from Clerk identities.  The unauthenticated
 * demo allowance is intentionally development-only and always uses seeded IDs.
 */
export async function authorizeWorkspaceRole(req: Request, res: Response, role: WorkspaceRole): Promise<string | null> {
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
  const { userId } = getAuth(req);
  if (process.env.NODE_ENV !== "production") {
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