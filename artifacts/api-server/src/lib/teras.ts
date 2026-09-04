import { and, desc, eq } from "drizzle-orm";
import { db, assessmentAttemptsTable, assessmentCriteriaTable, assessmentsTable, criterionObservationsTable, enrollmentPathwayEventsTable, enrollmentsTable, evidenceRequirementsTable, evidenceReviewsTable, evidenceTable, gapEventsTable, gapsTable, learningRecordLinksTable, modulesTable, pathwaysTable, peopleTable, practiceAttemptsTable, practiceTasksTable, programsTable, readinessEventsTable, readinessGatesTable, remediationActivitiesTable, remediationEventsTable, remediationPlansTable } from "@workspace/db";
export const DEMO_LEARNER = "learner-demo";
const latest = <T extends { createdAt: Date }, K extends string>(rows: T[], key: (row: T) => K) => { const result = new Map<K, T>(); for (const row of rows) if (!result.has(key(row)) || result.get(key(row))!.createdAt < row.createdAt) result.set(key(row), row); return result; };
export async function catalogue() { const [programs, paths, modules, tasks, requirements, assessments, gates, enrollments] = await Promise.all([db.select().from(programsTable), db.select().from(pathwaysTable), db.select().from(modulesTable), db.select().from(practiceTasksTable), db.select().from(evidenceRequirementsTable), db.select().from(assessmentsTable), db.select().from(readinessGatesTable), db.select().from(enrollmentsTable)]); return { programs, paths, modules, tasks, requirements, assessments, gates, enrollments }; }
export const moduleSummary = (module: { id: string; pathwayId: string; code: string; name: string; capability: string; evidence: string }, progress = 0, status = "Not started") => ({ ...module, progress, status });
export const profile = (person: { id: string; name: string; initials: string; role: string; organization: string | null }) => person;
export async function learnerContext(learnerId = DEMO_LEARNER) {
  const [enrollment] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.learnerId, learnerId)).orderBy(desc(enrollmentsTable.createdAt));
  const [learner] = await db.select().from(peopleTable).where(eq(peopleTable.id, learnerId));
  if (!enrollment || !learner) throw new Error(`Learner ${learnerId} has no valid enrollment`);
  const [program] = await db.select().from(programsTable).where(eq(programsTable.id, enrollment.programId));
  const [pathwayEvent] = await db.select().from(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId, enrollment.id)).orderBy(desc(enrollmentPathwayEventsTable.sequence), desc(enrollmentPathwayEventsTable.createdAt), desc(enrollmentPathwayEventsTable.id)).limit(1);
  const [pathway] = await db.select().from(pathwaysTable).where(eq(pathwaysTable.id, pathwayEvent?.pathwayId ?? enrollment.pathwayId));
  if (!program || !pathway) throw new Error("Enrollment references missing catalogue records");
  return { enrollment, learner, program, pathway };
}
/** Current, active learner pathways explicitly assigned to a workspace actor.
 * This is deliberately enrollment-based rather than derived from a default learner. */
export async function workspaceAssignmentContexts(actorId: string, role: "trainer" | "assessor") {
  const [enrollments, learners, programs, pathways, pathwayEvents] = await Promise.all([
    db.select().from(enrollmentsTable).where(and(
      eq(role === "trainer" ? enrollmentsTable.trainerId : enrollmentsTable.assessorId, actorId),
      eq(enrollmentsTable.status, "active"),
    )),
    db.select().from(peopleTable),
    db.select().from(programsTable),
    db.select().from(pathwaysTable),
    db.select().from(enrollmentPathwayEventsTable),
  ]);
  const learnerById = new Map(learners.map((learner) => [learner.id, learner]));
  const programById = new Map(programs.map((program) => [program.id, program]));
  const pathwayById = new Map(pathways.map((pathway) => [pathway.id, pathway]));
  const latestPathwayEvent = new Map<string, typeof pathwayEvents[number]>();
  for (const event of pathwayEvents) {
    const current = latestPathwayEvent.get(event.enrollmentId);
    if (!current || event.sequence > current.sequence ||
      (event.sequence === current.sequence && event.createdAt > current.createdAt)) {
      latestPathwayEvent.set(event.enrollmentId, event);
    }
  }
  return enrollments.flatMap((enrollment) => {
    const pathway = pathwayById.get(latestPathwayEvent.get(enrollment.id)?.pathwayId ?? enrollment.pathwayId);
    const learner = learnerById.get(enrollment.learnerId);
    const program = programById.get(enrollment.programId);
    // Corrupt catalogue references must never broaden an actor's scope.
    return learner && program && pathway && pathway.programId === enrollment.programId
      ? [{ enrollment, learner, program, pathway }]
      : [];
  });
}
/** Resolves a specific active learner/pathway pair without letting the most
 * recently-created enrollment substitute a different pathway. */
export async function activeLearnerPathwayContext(learnerId: string, pathwayId: string) {
  const contexts = await Promise.all(
    (await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.learnerId, learnerId), eq(enrollmentsTable.status, "active"))))
      .map(async (enrollment) => {
        const [learner, program, pathway, pathwayEvent] = await Promise.all([
          db.select().from(peopleTable).where(eq(peopleTable.id, learnerId)).then((rows) => rows[0]),
          db.select().from(programsTable).where(eq(programsTable.id, enrollment.programId)).then((rows) => rows[0]),
          db.select().from(pathwaysTable).where(eq(pathwaysTable.id, pathwayId)).then((rows) => rows[0]),
          db.select().from(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId, enrollment.id)).orderBy(desc(enrollmentPathwayEventsTable.sequence), desc(enrollmentPathwayEventsTable.createdAt), desc(enrollmentPathwayEventsTable.id)).limit(1).then((rows) => rows[0]),
        ]);
        const activePathwayId = pathwayEvent?.pathwayId ?? enrollment.pathwayId;
        return learner && program && pathway && activePathwayId === pathwayId && pathway.programId === enrollment.programId
          ? { enrollment, learner, program, pathway }
          : null;
      }),
  );
  return contexts.find((context) => context !== null) ?? null;
}
export async function pathwaySummary(pathwayId: string) { const { paths, modules, gates } = await catalogue(); const pathway = paths.find((item) => item.id === pathwayId); if (!pathway) return null; const pathwayGates = gates.filter((gate) => gate.pathwayId === pathwayId).sort((a, b) => a.sequence - b.sequence).map(({ id, code, name, sequence, requirement }) => ({ id, code, name, sequence, requirement })); return { ...pathway, moduleCount: modules.filter((module) => module.pathwayId === pathwayId).length, gateCount: pathwayGates.length, gates: pathwayGates }; }
export async function progressByModule(learnerId = DEMO_LEARNER, pathwayId?: string) { const activePathwayId = pathwayId ?? (await learnerContext(learnerId)).pathway.id; const [attempts, assessments, practiceAttempts, evidence] = await Promise.all([db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.learnerId, learnerId), eq(assessmentAttemptsTable.pathwayId, activePathwayId))), db.select().from(assessmentsTable), db.select().from(practiceAttemptsTable).where(and(eq(practiceAttemptsTable.learnerId, learnerId), eq(practiceAttemptsTable.pathwayId, activePathwayId))), db.select().from(evidenceTable).where(and(eq(evidenceTable.learnerId, learnerId), eq(evidenceTable.pathwayId, activePathwayId)))]); const assessmentModules = new Map(assessments.map((assessment) => [assessment.id, assessment.moduleId])); const completed = new Set(attempts.filter((attempt) => attempt.decision === "Competent").map((attempt) => assessmentModules.get(attempt.assessmentId))); const practiced = new Set(practiceAttempts.map((attempt) => attempt.taskId.replace(/^task-/, ""))); const evidenced = new Set(evidence.map((item) => item.moduleId)); return (id: string) => completed.has(id) ? { progress: 100, status: "Complete" } : evidenced.has(id) ? { progress: 60, status: "In progress" } : practiced.has(id) ? { progress: 30, status: "In progress" } : { progress: 0, status: "Not started" }; }
export async function evidenceRecords(learnerId = DEMO_LEARNER, pathwayId?: string) { const activePathwayId = pathwayId ?? (await learnerContext(learnerId)).pathway.id; const [evidence, reviews, modules, people, links] = await Promise.all([db.select().from(evidenceTable), db.select().from(evidenceReviewsTable), db.select().from(modulesTable), db.select().from(peopleTable), db.select().from(learningRecordLinksTable).where(and(eq(learningRecordLinksTable.learnerId, learnerId), eq(learningRecordLinksTable.pathwayId, activePathwayId)))]); const reviewMap = latest(reviews, (review) => review.evidenceId), moduleMap = new Map(modules.map((module) => [module.id, module])), personMap = new Map(people.map((person) => [person.id, person])), linkMap = latest(links.filter((link): link is typeof link & { evidenceId: string } => Boolean(link.evidenceId)), (link) => link.evidenceId); return evidence.filter((item) => item.learnerId === learnerId && item.pathwayId === activePathwayId).map((item) => { const review = reviewMap.get(item.id), module = moduleMap.get(item.moduleId), link = linkMap.get(item.id); return { id: item.id, title: item.title, type: item.type, moduleId: item.moduleId, moduleName: module?.name ?? "Unknown module", taskId: item.taskId, pathwayId: item.pathwayId, sourceActivityId: link?.activityId ?? null, practiceAttemptId: link?.practiceAttemptId ?? null, description: item.description, status: review?.status ?? "Under review", submittedAt: item.createdAt, reviewer: review?.reviewerId ? personMap.get(review.reviewerId)?.name ?? null : null, reviewerComment: review?.comment ?? null, fileName: item.fileName, quality: review?.quality ?? { valid: false, relevant: false, sufficient: false, traceable: false } }; }); }
export async function gapRecords(learnerId = DEMO_LEARNER, pathwayId?: string) { const activePathwayId = pathwayId ?? (await learnerContext(learnerId)).pathway.id; const [gaps, events] = await Promise.all([db.select().from(gapsTable), db.select().from(gapEventsTable)]); const statuses = latest(events, (event) => event.gapId); return gaps.filter((gap) => gap.learnerId === learnerId && gap.pathwayId === activePathwayId).map((gap) => ({ ...gap, status: statuses.get(gap.id)?.status ?? "Open" })); }
export async function remediationRecords(learnerId = DEMO_LEARNER, pathwayId?: string) { const gaps = await gapRecords(learnerId, pathwayId), gapIds = new Set(gaps.map((gap) => gap.id)); const [plans, activities, events] = await Promise.all([db.select().from(remediationPlansTable), db.select().from(remediationActivitiesTable), db.select().from(remediationEventsTable)]); const state = latest(events, (event) => event.activityId); return plans.filter((plan) => gapIds.has(plan.gapId)).map((plan) => { const planActivities = activities.filter((activity) => activity.planId === plan.id).map((activity) => ({ ...activity, status: state.get(activity.id)?.status ?? "Not started" })); return { ...plan, status: planActivities.every((activity) => activity.status === "Completed") ? "Completed" : planActivities.some((activity) => activity.status === "In progress") ? "In progress" : "Not started", activities: planActivities }; }); }
export async function assessmentSummary(assessment: { id: string; moduleId: string; name: string; gateCode?: string | null }, learnerId = DEMO_LEARNER, pathwayId?: string) { const activePathwayId = pathwayId ?? (await learnerContext(learnerId)).pathway.id; const [attempts, criteria, observations] = await Promise.all([db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.assessmentId, assessment.id), eq(assessmentAttemptsTable.learnerId, learnerId), eq(assessmentAttemptsTable.pathwayId, activePathwayId))), db.select().from(assessmentCriteriaTable).where(eq(assessmentCriteriaTable.assessmentId, assessment.id)), db.select().from(criterionObservationsTable)]); const latestAttempt = attempts.sort((a, b) => b.number - a.number || b.createdAt.getTime() - a.createdAt.getTime())[0]; const byCriterion = new Map(observations.filter((observation) => observation.attemptId === latestAttempt?.id).map((observation) => [observation.criterionId, observation])); const scores = criteria.map((criterion) => byCriterion.get(criterion.id)?.score).filter((score): score is number => score !== undefined); return { id: assessment.id, moduleId: assessment.moduleId, name: assessment.name, gateCode: assessment.gateCode ?? null, status: latestAttempt?.status ?? "Not started", score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length / 3 * 100) : 0, attemptCount: attempts.length, criticalFailure: Boolean(latestAttempt) && criteria.some((criterion) => criterion.critical && (byCriterion.get(criterion.id)?.score ?? 0) < 2) }; }
export async function readiness(context?: Awaited<ReturnType<typeof learnerContext>>) {
  const activeContext = context ?? await learnerContext();
  const [allModules, gates, events, gaps, evidences, allAssessments, allRequirements] = await Promise.all([
    db.select().from(modulesTable),
    db.select().from(readinessGatesTable).where(eq(readinessGatesTable.pathwayId, activeContext.pathway.id)).orderBy(readinessGatesTable.sequence),
    db.select().from(readinessEventsTable).where(and(eq(readinessEventsTable.enrollmentId, activeContext.enrollment.id), eq(readinessEventsTable.pathwayId, activeContext.pathway.id))),
    gapRecords(activeContext.learner.id, activeContext.pathway.id),
    evidenceRecords(activeContext.learner.id, activeContext.pathway.id),
    db.select().from(assessmentsTable),
    db.select().from(evidenceRequirementsTable),
  ]);
  const modules = allModules.filter((module) => module.pathwayId === activeContext.pathway.id);
  const moduleIds = new Set(modules.map((module) => module.id));
  const assessments = allAssessments.filter((assessment) => moduleIds.has(assessment.moduleId));
  const requirements = allRequirements.filter((requirement) => moduleIds.has(requirement.moduleId));
  const assessmentStates = await Promise.all(assessments.map((assessment) => assessmentSummary(assessment, activeContext.learner.id, activeContext.pathway.id)));
  const stateByAssessment = new Map(assessmentStates.map((assessment) => [assessment.id, assessment]));
  const validEvidenceModules = new Set(evidences.filter((evidence) => evidence.status === "Valid").map((evidence) => evidence.moduleId));
  const latestEvents = latest(events, (event) => event.gateId);
  const safetyBlockers = [
    ...assessmentStates.filter((assessment) => assessment.criticalFailure).map((assessment) => `Critical safety failure in ${assessment.name}`),
    ...gaps.filter((gap) => gap.status !== "Resolved" && gap.severity === "Critical").map((gap) => gap.diagnosis),
  ];
  let previousPassed = true;
  const gateViews = gates.map((gate) => {
    const gateAssessments = gate.assessmentMode === "All"
      ? assessments
      : gate.assessmentMode === "Mapped"
        ? assessments.filter((assessment) => assessment.gateCode === gate.code)
        : [];
    const gateModuleIds = new Set(gateAssessments.map((assessment) => assessment.moduleId));
    const gateRequirements = gate.evidenceMode === "All"
      ? requirements
      : gate.evidenceMode === "Mapped"
        ? requirements.filter((requirement) => gateModuleIds.has(requirement.moduleId))
        : [];
    const failedAssessments = gateAssessments.filter((assessment) => {
      const state = stateByAssessment.get(assessment.id);
      return !state || state.status !== "Completed" || state.criticalFailure;
    });
    const missingRequirements = gateRequirements.filter((requirement) => !validEvidenceModules.has(requirement.moduleId));
    const policyBlockers = [
      ...failedAssessments.map((assessment) => stateByAssessment.get(assessment.id)?.criticalFailure ? `Critical safety failure in ${assessment.name}` : `Assessment not complete: ${assessment.name}`),
      ...missingRequirements.map((requirement) => `Valid evidence required: ${requirement.name}`),
    ];
    const passed = previousPassed && policyBlockers.length === 0 && safetyBlockers.length === 0;
    const status = passed ? "Passed" : previousPassed ? "In progress" : "Locked";
    previousPassed = passed;
    return { id: gate.id, code: gate.code, name: gate.name, requirement: gate.requirement, status, blockers: [...policyBlockers, ...(latestEvents.get(gate.id)?.blockers ?? [])] };
  });
  const activeGate = gateViews.find((gate) => gate.status === "In progress") ?? [...gateViews].reverse().find((gate) => gate.status === "Passed") ?? gateViews[0];
  if (!activeGate) throw new Error(`No readiness gates configured for ${activeContext.pathway.name}`);
  const currentIndex = gateViews.findIndex((gate) => gate.id === activeGate.id);
  const requiredAssessmentCount = assessments.length;
  const completeAssessmentCount = assessmentStates.filter((assessment) => assessment.status === "Completed" && !assessment.criticalFailure).length;
  const requiredEvidenceCount = requirements.length;
  const validEvidenceCount = requirements.filter((requirement) => validEvidenceModules.has(requirement.moduleId)).length;
  const completedRequirements = completeAssessmentCount + validEvidenceCount;
  const totalRequirements = requiredAssessmentCount + requiredEvidenceCount;
  const currentBlockers = gateViews.filter((gate) => gate.status === "In progress").flatMap((gate) => gate.blockers);
  return {
    pathway: await pathwaySummary(activeContext.pathway.id),
    status: safetyBlockers.length ? "Blocked" : activeGate.status,
    score: totalRequirements ? Math.round(completedRequirements / totalRequirements * 100) : 100,
    currentGate: { id: activeGate.id, code: activeGate.code, name: activeGate.name, requirement: activeGate.requirement, status: activeGate.status },
    nextGate: gateViews[currentIndex + 1] ? (({ id, code, name, requirement, status }) => ({ id, code, name, requirement, status }))(gateViews[currentIndex + 1]) : null,
    gates: gateViews.map(({ id, code, name, requirement, status }) => ({ id, code, name, requirement, status })),
    blockers: [...safetyBlockers, ...currentBlockers],
    outstandingGapCount: gaps.filter((gap) => gap.status !== "Resolved").length,
    missingEvidenceCount: requirements.filter((requirement) => !validEvidenceModules.has(requirement.moduleId)).length,
  };
}