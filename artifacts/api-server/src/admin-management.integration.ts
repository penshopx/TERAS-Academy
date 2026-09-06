import { createIntegrationTestApp } from "./integration-test-app";
import { adminAuditEventsTable, cohortsTable, db, enrollmentsTable, pathwaysTable, peopleTable, personRolesTable, programsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { claimInitialSuperAdmin, updateManagedUser } from "@workspace/db/admin-membership";
import { ensureConfiguredBootstrapAdmin } from "./lib/authorization";

const suffix = crypto.randomUUID();
const ids = {
  learner: `admin-learner-${suffix}`, trainer: `admin-trainer-${suffix}`,
  administrator: `admin-administrator-${suffix}`,
  controlAdministrator: `admin-control-administrator-${suffix}`,
  bootstrapAdministrator: `bootstrap-admin-bootstrap-${suffix}`,
  initialClaimantOne: `initial-claimant-one-${suffix}`,
  initialClaimantTwo: `initial-claimant-two-${suffix}`,
  program: `admin-program-${suffix}`, otherProgram: `admin-other-program-${suffix}`,
  pathway: `admin-path-${suffix}`, otherPathway: `admin-other-path-${suffix}`,
  cohort: `admin-cohort-${suffix}`, otherCohort: `admin-other-cohort-${suffix}`,
  enrollment: `admin-enrollment-${suffix}`,
};
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function run() {
  const schema = await db.execute(sql`select to_regclass('public.teras_admin_audit_events') as audit_table`);
  if (!schema.rows[0]?.audit_table) {
    throw new Error("Admin management migration 0005 is not installed; refusing to run integration fixtures against an unupgraded database");
  }
  const app = createIntegrationTestApp(
    () => ({ userId: `admin-${suffix}`, role: "super_admin" }),
    { activeAdminFixtureIds: [ids.administrator, ids.controlAdministrator] },
  );
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const listener = app.listen(0, () => resolve(listener)); });
  const address = server.address(); assert(address && typeof address !== "string", "Test server did not bind");
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = async (path: string, body?: unknown, method = "POST") => fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    if (process.env.TERAS_TEST_INITIAL_SUPER_ADMIN_CLAIM === "1") {
      // The isolated harness explicitly opts into first-claim coverage. Direct
      // runs against Development may already have a legitimate super admin.
      await db.insert(peopleTable).values([
      {
        id: ids.initialClaimantOne, name: "Initial Claimant One", initials: "IO",
        email: `${ids.initialClaimantOne}@example.test`, role: "Learner",
        clerkUserId: `initial-clerk-one-${suffix}`, status: "active", createdBy: `admin-${suffix}`,
      },
      {
        id: ids.initialClaimantTwo, name: "Initial Claimant Two", initials: "IT",
        email: `${ids.initialClaimantTwo}@example.test`, role: "Learner",
        clerkUserId: `initial-clerk-two-${suffix}`, status: "active", createdBy: `admin-${suffix}`,
      },
      ]);
      const initialClaims = await Promise.all([
      claimInitialSuperAdmin({
        clerkUserId: `initial-clerk-one-${suffix}`,
        email: `${ids.initialClaimantOne}@example.test`,
        name: "Initial Claimant One",
        initials: "IO",
      }),
      claimInitialSuperAdmin({
        clerkUserId: `initial-clerk-two-${suffix}`,
        email: `${ids.initialClaimantTwo}@example.test`,
        name: "Initial Claimant Two",
        initials: "IT",
      }),
      ]);
      assert(
        initialClaims.filter(claim => claim.kind === "claimed").length === 1
          && initialClaims.filter(claim => claim.kind === "already_claimed").length === 1,
        "Concurrent initial super-admin claims must have exactly one winner",
      );
      const initialSuperAdmins = await db.select({ personId: personRolesTable.personId })
      .from(personRolesTable)
      .innerJoin(peopleTable, eq(peopleTable.id, personRolesTable.personId))
      .where(and(
        inArray(personRolesTable.personId, [ids.initialClaimantOne, ids.initialClaimantTwo]),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, "super_admin"),
      ));
      assert(initialSuperAdmins.length === 1, "Concurrent claims must leave exactly one active initial super_admin");
      const initialBootstrapAudits = await db.select({ id: adminAuditEventsTable.id })
      .from(adminAuditEventsTable)
      .where(and(
        inArray(adminAuditEventsTable.entityId, [ids.initialClaimantOne, ids.initialClaimantTwo]),
        eq(adminAuditEventsTable.action, "initial_super_admin_bootstrap"),
      ));
      assert(initialBootstrapAudits.length === 1, "Concurrent claims must record exactly one immutable bootstrap audit event");
    }

    for (const [id, name, roles] of [[ids.learner, "Managed Learner", ["learner"]], [ids.trainer, "Managed Trainer", ["trainer"]]] as const) {
      const response = await request("/admin/users", { id, name, initials: name.slice(0, 2), email: `${id}@example.test`, organization: null, clerkUserId: null, status: "active", roles });
      assert(response.status === 201, `Admin user create failed: ${await response.text()}`);
    }
    let response = await request("/admin/users", { id: ids.administrator, name: "Sole Managed Admin", initials: "SA", email: `${ids.administrator}@example.test`, organization: null, clerkUserId: null, status: "active", roles: ["admin"] });
    assert(response.status === 403, "Direct privileged-role creation must be rejected even for super administrators");
    await db.insert(peopleTable).values({ id: ids.administrator, name: "Sole Managed Admin", initials: "SA", email: `${ids.administrator}@example.test`, role: "Administrator", status: "active", createdBy: `admin-${suffix}` });
    await db.insert(personRolesTable).values({ personId: ids.administrator, role: "admin", createdBy: `admin-${suffix}` });
    response = await request(`/admin/users/${ids.administrator}/roles`, { roles: ["learner"] }, "PUT");
    assert(response.status === 409, "Removing the last active fixture admin must return 409 even when other admins exist");
    await db.insert(peopleTable).values({ id: ids.controlAdministrator, name: "Control Administrator", initials: "CA", email: `${ids.controlAdministrator}@example.test`, role: "Administrator", status: "active", createdBy: `admin-${suffix}` });
    await db.insert(personRolesTable).values({ personId: ids.controlAdministrator, role: "admin", createdBy: `admin-${suffix}` });
    const concurrentResponses = await Promise.all([
      request(`/admin/users/${ids.administrator}/roles`, { roles: ["learner"] }, "PUT"),
      request(`/admin/users/${ids.controlAdministrator}`, { status: "inactive" }, "PATCH"),
    ]);
    const concurrentStatuses = concurrentResponses.map(item => item.status).sort();
    assert(concurrentStatuses.join(",") === "200,409", `Concurrent admin removal must allow exactly one request and reject one, received ${concurrentStatuses.join(",")}`);
    const activeFixtureAdmins = await db.select({ id: peopleTable.id })
      .from(peopleTable)
      .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
      .where(and(
        inArray(peopleTable.id, [ids.administrator, ids.controlAdministrator]),
        eq(peopleTable.status, "active"),
        eq(personRolesTable.role, "admin"),
      ));
    assert(activeFixtureAdmins.length === 1, `Concurrent admin changes must leave exactly one active administrator fixture, received ${activeFixtureAdmins.length}`);
    const directServiceOutcome = await updateManagedUser(
      activeFixtureAdmins[0].id,
      { status: "inactive" },
      { clerkUserId: `admin-${suffix}`, personId: null },
      { activeAdminFixtureIds: [ids.administrator, ids.controlAdministrator] },
    );
    assert(
      directServiceOutcome.kind === "last_admin",
      "A direct job/script service call must not deactivate the final active administrator",
    );
    const bootstrapClerkUserId = `bootstrap-${suffix}`;
    const previousBootstrapAdmin = process.env.TERAS_BOOTSTRAP_ADMIN_CLERK_USER_ID;
    process.env.TERAS_BOOTSTRAP_ADMIN_CLERK_USER_ID = bootstrapClerkUserId;
    await db.insert(peopleTable).values({
      id: ids.bootstrapAdministrator,
      name: "Pending Bootstrap Administrator",
      initials: "BA",
      role: "Learner",
      email: `${ids.bootstrapAdministrator}@example.test`,
      organization: null,
      clerkUserId: bootstrapClerkUserId,
      status: "inactive",
      createdBy: `admin-${suffix}`,
    });
    await db.insert(personRolesTable).values({
      personId: ids.bootstrapAdministrator,
      role: "learner",
      createdBy: `admin-${suffix}`,
    });
    try {
      const bootstrapRace = await Promise.all([
        ensureConfiguredBootstrapAdmin(bootstrapClerkUserId),
        updateManagedUser(
          activeFixtureAdmins[0].id,
          { status: "inactive" },
          { clerkUserId: `admin-${suffix}`, personId: null },
          { activeAdminFixtureIds: [activeFixtureAdmins[0].id, ids.bootstrapAdministrator] },
        ),
      ]);
      assert(
        bootstrapRace[1].kind === "updated" || bootstrapRace[1].kind === "last_admin",
        "Concurrent bootstrap race must complete through the guarded admin service",
      );
      const activeAdminsAfterBootstrapRace = await db.select({ id: peopleTable.id })
        .from(peopleTable)
        .innerJoin(personRolesTable, eq(personRolesTable.personId, peopleTable.id))
        .where(and(
          inArray(peopleTable.id, [activeFixtureAdmins[0].id, ids.bootstrapAdministrator]),
          eq(peopleTable.status, "active"),
          eq(personRolesTable.role, "admin"),
        ));
      assert(
        activeAdminsAfterBootstrapRace.length >= 1,
        "Bootstrap and final-admin revocation must share one transaction lock and leave an active administrator",
      );
    } finally {
      if (previousBootstrapAdmin === undefined) {
        delete process.env.TERAS_BOOTSTRAP_ADMIN_CLERK_USER_ID;
      } else {
        process.env.TERAS_BOOTSTRAP_ADMIN_CLERK_USER_ID = previousBootstrapAdmin;
      }
    }
    response = await request(`/admin/users/${ids.learner}`, { status: "inactive" }, "PATCH");
    assert(response.status === 200 && (await response.json() as any).status === "inactive", "Admin did not deactivate user");
    response = await request(`/admin/users/${ids.learner}/roles`, { roles: ["learner", "assessor"] }, "PUT");
    assert(response.status === 200 && (await response.json() as any).roles.includes("assessor"), "Admin role assignment failed");
    response = await request(`/admin/users/${ids.learner}`, { status: "active" }, "PATCH"); assert(response.status === 200, "Admin did not reactivate user");
    for (const [id, domain] of [[ids.program, "Admin Test"], [ids.otherProgram, "Other Test"]] as const) {
      response = await request("/admin/programs", { id, domain, name: `${domain} Program`, description: "Integration lifecycle fixture", status: "active" });
      assert(response.status === 201, `Program create failed: ${await response.text()}`);
    }
    response = await request("/admin/programs", { id: ids.program, domain: "Admin Test", name: "Duplicate", description: "duplicate", status: "active" });
    assert(response.status === 409, "Duplicate program must return 409");
    for (const [id, programId] of [[ids.pathway, ids.program], [ids.otherPathway, ids.otherProgram]] as const) {
      response = await request("/admin/pathways", { id, programId, name: "Managed Pathway", type: "Standard", outcome: "Safe completion", status: "active" });
      assert(response.status === 201, `Pathway create failed: ${await response.text()}`);
    }
    for (const [id, programId] of [[ids.cohort, ids.program], [ids.otherCohort, ids.otherProgram]] as const) {
      response = await request("/admin/cohorts", { id, programId, name: `Cohort ${id}`, status: "active", startsOn: null, endsOn: null });
      assert(response.status === 201, `Cohort create failed: ${await response.text()}`);
    }
    const enrollment = { id: ids.enrollment, learnerId: ids.learner, programId: ids.program, pathwayId: ids.pathway, trainerId: ids.trainer, assessorId: null, cohortId: ids.cohort, status: "active" };
    response = await request("/admin/enrollments", enrollment); assert(response.status === 201, `Enrollment create failed: ${await response.text()}`);
    response = await request("/admin/enrollments", { ...enrollment, id: `${ids.enrollment}-cross-path`, pathwayId: ids.otherPathway });
    assert(response.status === 409, "Cross-program pathway must return 409");
    response = await request("/admin/enrollments", { ...enrollment, id: `${ids.enrollment}-cross-cohort`, cohortId: ids.otherCohort });
    assert(response.status === 409, "Cross-program cohort must return 409");
    response = await request(`/admin/enrollments/${ids.enrollment}`, { pathwayId: ids.otherPathway }, "PATCH");
    assert(response.status === 409, "Enrollment update to cross-program pathway must return 409");
    response = await request("/admin/summary", undefined, "GET");
    const summary = await response.json() as any;
    assert(response.status === 200, "Admin operational summary must return 200");
    assert(summary.metrics.some((metric: any) => metric.id === "enrollments" && metric.value >= 1), "Summary must count active enrollments");
    assert(summary.incompleteAssignments.assessor >= 1, "Summary must expose incomplete assessor assignments");
    assert(summary.queues.map((queue: any) => queue.id).join(",") === "evidence,assessment,remediation,reassessment", "Summary must expose every operational queue");
    assert(summary.bottleneck && Array.isArray(summary.actions), "Summary must expose bottleneck and quick actions");
    response = await request("/admin/audit", undefined, "GET"); const audit = await response.json() as any[];
    assert(response.status === 200 && audit.some((event: any) => event.entityId === ids.enrollment && event.action === "create"), "Admin audit event was not recorded");
  } finally {
    await db.delete(adminAuditEventsTable).where(inArray(adminAuditEventsTable.entityId, Object.values(ids)));
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.id, ids.enrollment));
    await db.delete(cohortsTable).where(inArray(cohortsTable.id, [ids.cohort, ids.otherCohort]));
    await db.delete(pathwaysTable).where(inArray(pathwaysTable.id, [ids.pathway, ids.otherPathway]));
    await db.delete(programsTable).where(inArray(programsTable.id, [ids.program, ids.otherProgram]));
    await db.delete(personRolesTable).where(inArray(personRolesTable.personId, [
      ids.learner, ids.trainer, ids.administrator, ids.controlAdministrator, ids.bootstrapAdministrator,
      ids.initialClaimantOne, ids.initialClaimantTwo,
    ]));
    await db.delete(peopleTable).where(inArray(peopleTable.id, [
      ids.learner, ids.trainer, ids.administrator, ids.controlAdministrator, ids.bootstrapAdministrator,
      ids.initialClaimantOne, ids.initialClaimantTwo,
    ]));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
await run();