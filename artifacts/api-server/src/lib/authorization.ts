import type { Request, Response } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import { db, peopleTable, personRolesTable } from "@workspace/db";
import { allowsDemoAccess } from "@workspace/db/demo-access";
import { allowsAdministrativeRoles } from "@workspace/db/super-admin-mfa-policy";
import { learnerContext } from "./teras";
import { supabaseIdentity } from "./supabase-auth";

type WorkspaceRole = "trainer" | "assessor";
type AdminRole = "admin" | "super_admin";
export type LearningActorRole = WorkspaceRole | "learner";
export type LearningActor = { id: string; role: LearningActorRole };
export type TestAuthorizationIdentity = { userId: string | null; role: WorkspaceRole | "learner" | AdminRole | null; learnerId?: string };
export type LearnerContext = Awaited<ReturnType<typeof learnerContext>>;

/** Only the in-process integration factory can set this symbol. */
export const testAuthorizationIdentity = Symbol("teras.testAuthorizationIdentity");
function integrationIdentity(req: Request): TestAuthorizationIdentity | undefined {
  if (process.env.NODE_ENV !== "test") return undefined;
  return (req as Request & { [testAuthorizationIdentity]?: TestAuthorizationIdentity })[testAuthorizationIdentity];
}

export type AdminActor = { authSubject: string; personId: string | null; roles: AdminRole[] };
export type KnowledgeRole = "super_admin" | "admin" | "trainer" | "assessor" | "learner";
export type KnowledgeActor = { authSubject: string; roles: KnowledgeRole[] };
export type CurrentSession = { personId: string; name: string; roles: KnowledgeRole[] };
type AuthenticatedIdentity = { subject: string; aal: string | null; test: boolean };

const knownRoles = (roles: string[]) => [...new Set(roles.filter((role): role is KnowledgeRole =>
  ["super_admin", "admin", "trainer", "assessor", "learner"].includes(role)))];
const subjectWhere = (subject: string, test: boolean) => test
  // Legacy IDs are available solely to the server-injected test harness. A
  // production Supabase subject must never be matched against a Clerk value.
  ? or(and(eq(peopleTable.authProvider, "supabase"), eq(peopleTable.authSubject, subject)), eq(peopleTable.clerkUserId, subject))
  : and(eq(peopleTable.authProvider, "supabase"), eq(peopleTable.authSubject, subject));

async function identity(req: Request): Promise<AuthenticatedIdentity | null> {
  const test = integrationIdentity(req);
  if (test) return test.userId ? { subject: test.userId, aal: "aal2", test: true } : null;
  const verified = await supabaseIdentity(req);
  return verified ? { ...verified, test: false } : null;
}
function deny(req: Request, res: Response, authenticated: boolean, message: string) {
  res.status(authenticated ? 403 : 401).json({ error: message });
  return null;
}
async function assignments(subject: string, test: boolean, roles?: string[]) {
  return db.select({ personId: peopleTable.id, name: peopleTable.name, role: personRolesTable.role })
    .from(peopleTable).innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
    .where(and(subjectWhere(subject, test), eq(peopleTable.status, "active"),
      roles ? sql`${personRolesTable.role} IN (${sql.join(roles.map(role => sql`${role}`), sql`, `)})` : undefined));
}

export async function authorizeCurrentSession(req: Request, res: Response): Promise<CurrentSession | null> {
  const actor = await identity(req);
  if (!actor) return deny(req, res, false, "Authentication required");
  if (actor.test) {
    const test = integrationIdentity(req)!;
    if (test.role) return { personId: test.learnerId ?? actor.subject, name: "Test user", roles: [test.role] };
  }
  const rows = await assignments(actor.subject, actor.test);
  const roles = knownRoles(rows.map(row => row.role));
  return rows[0] && roles.length ? { personId: rows[0].personId, name: rows[0].name, roles }
    : deny(req, res, true, "A local TERAS role is required");
}

export async function authorizeKnowledgeActor(req: Request, res: Response): Promise<KnowledgeActor | null> {
  const actor = await identity(req);
  if (!actor) return deny(req, res, false, "Authentication required");
  const test = integrationIdentity(req);
  if (actor.test && test?.role) return { authSubject: actor.subject, roles: [test.role] };
  const roles = knownRoles((await assignments(actor.subject, actor.test)).map(row => row.role));
  return roles.length ? { authSubject: actor.subject, roles } : deny(req, res, true, "A local TERAS role is required");
}

/** Authority is always the local active role assignment, never a JWT claim. */
export async function authorizeAdmin(req: Request, res: Response): Promise<AdminActor | null> {
  const actor = await identity(req);
  if (!actor) return deny(req, res, false, "Authentication required");
  const test = integrationIdentity(req);
  if (actor.test && (test?.role === "admin" || test?.role === "super_admin")) {
    const roles = [test.role];
    if (!allowsAdministrativeRoles(roles, actor, process.env)) {
      return deny(req, res, true, "Super administrator MFA (aal2) with locked enrollment is required");
    }
    return { authSubject: actor.subject, personId: null, roles };
  }
  const rows = await assignments(actor.subject, actor.test, ["admin", "super_admin"]);
  if (!rows.length) {
    req.log.warn({ authSubject: actor.subject }, "Unauthorized admin mutation");
    return deny(req, res, true, "Administrator role required");
  }
  const roles = rows.map(row => row.role as AdminRole);
  // This applies even where an ordinary admin route is used by a Super Admin.
  if (!allowsAdministrativeRoles(roles, actor, process.env)) {
    return deny(req, res, true, "Super administrator MFA (aal2) with locked enrollment is required");
  }
  return { authSubject: actor.subject, personId: rows[0].personId, roles };
}

export async function authorizeSuperAdmin(req: Request, res: Response): Promise<AdminActor | null> {
  const actor = await authorizeAdmin(req, res);
  if (!actor) return null;
  if (!actor.roles.includes("super_admin")) return deny(req, res, true, "Super administrator role required");
  return actor;
}

export async function authorizeWorkspaceRole(req: Request, res: Response, role: WorkspaceRole): Promise<string | null> {
  const actor = await identity(req);
  const test = integrationIdentity(req);
  if (actor?.test && test?.role !== role) {
    return deny(req, res, true, "You are not authorized for this action");
  }
  if (actor) {
    const [assigned] = await assignments(actor.subject, actor.test, [role]);
    if (assigned) return assigned.personId;
    if (actor.test && test?.role === role) {
      const context = await learnerContext(test.learnerId);
      return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
    }
    return deny(req, res, true, "You are not authorized for this action");
  }
  if (allowsDemoAccess()) {
    const context = await learnerContext(); return role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
  }
  return deny(req, res, false, "You are not authorized for this action");
}

export async function authorizeLearner(req: Request, res: Response): Promise<string | null> {
  const actor = await identity(req);
  const test = integrationIdentity(req);
  if (actor?.test && test?.role === "learner") {
    try { return (await learnerContext(test.learnerId)).learner.id; } catch { return deny(req, res, true, "You are not authorized for this learner"); }
  }
  if (actor) {
    const [assigned] = await assignments(actor.subject, actor.test, ["learner"]);
    if (assigned) try { return (await learnerContext(assigned.personId)).learner.id; } catch { /* active enrollment required */ }
    return deny(req, res, true, "You are not authorized for this learner");
  }
  if (allowsDemoAccess()) return (await learnerContext()).learner.id;
  return deny(req, res, false, "You are not authorized for this learner");
}

export async function authorizeLearningActor(req: Request, res: Response): Promise<LearningActor | null> {
  const actor = await identity(req);
  const test = integrationIdentity(req);
  if (actor?.test && test?.role === "learner") {
    const context = await learnerContext(test.learnerId); return { id: context.learner.id, role: "learner" };
  }
  if (actor) {
    const [workspace] = await assignments(actor.subject, actor.test, ["trainer", "assessor"]);
    if (workspace) return { id: workspace.personId, role: workspace.role as WorkspaceRole };
    const [learner] = await assignments(actor.subject, actor.test, ["learner"]);
    if (learner) try { return { id: (await learnerContext(learner.personId)).learner.id, role: "learner" }; } catch { /* enrollment required */ }
    if (actor.test && process.env.NODE_ENV === "test" && (test?.role === "trainer" || test?.role === "assessor")) {
      const context = await learnerContext(test.learnerId);
      const id = test.role === "trainer" ? context.enrollment.trainerId : context.enrollment.assessorId;
      if (id) return { id, role: test.role };
    }
    return deny(req, res, true, "You are not authorized for this learning transition");
  }
  if (allowsDemoAccess()) return { id: (await learnerContext()).learner.id, role: "learner" };
  return deny(req, res, false, "You are not authorized for this learning transition");
}