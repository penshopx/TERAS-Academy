import { and, desc, eq } from "drizzle-orm";
import { db, assessmentAttemptsTable, assessmentCriteriaTable, assessmentsTable, criterionObservationsTable, enrollmentPathwayEventsTable, enrollmentsTable, evidenceRequirementsTable, evidenceReviewsTable, evidenceTable, gapEventsTable, gapsTable, modulesTable, pathwaysTable, peopleTable, practiceAttemptsTable, practiceTasksTable, programsTable, readinessEventsTable, readinessGatesTable, remediationActivitiesTable, remediationEventsTable, remediationPlansTable } from "@workspace/db";

export const DEMO_LEARNER = "learner-demo";
const latest = <T extends { createdAt: Date }, K extends string>(rows: T[], key: (row: T) => K) => {
  const result = new Map<K, T>();
  for (const row of rows) if (!result.has(key(row)) || result.get(key(row))!.createdAt < row.createdAt) result.set(key(row), row);
  return result;
};
export async function catalogue() {
  const [programs, paths, modules, tasks, requirements, assessments] = await Promise.all([
    db.select().from(programsTable), db.select().from(pathwaysTable), db.select().from(modulesTable),
    db.select().from(practiceTasksTable), db.select().from(evidenceRequirementsTable), db.select().from(assessmentsTable),
  ]);
  return { programs, paths, modules, tasks, requirements, assessments };
}
export const moduleSummary = (m: { id:string; code:string; name:string; capability:string; evidence:string }, progress = 0, status = "Not started") => ({ ...m, progress, status });
export const profile = (p: {id:string;name:string;initials:string;role:string;organization:string|null}) => p;
export async function learnerContext() {
  const [enrollment] = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.learnerId, DEMO_LEARNER));
  const [learner] = await db.select().from(peopleTable).where(eq(peopleTable.id, DEMO_LEARNER));
  if (!enrollment || !learner) throw new Error("Demo learner enrollment has not been seeded");
  const [program] = await db.select().from(programsTable).where(eq(programsTable.id, enrollment.programId));
  const [pathwayEvent] = await db.select().from(enrollmentPathwayEventsTable)
    .where(eq(enrollmentPathwayEventsTable.enrollmentId, enrollment.id))
    .orderBy(desc(enrollmentPathwayEventsTable.sequence),desc(enrollmentPathwayEventsTable.createdAt),desc(enrollmentPathwayEventsTable.id))
    .limit(1);
  const [pathway] = await db.select().from(pathwaysTable).where(eq(pathwaysTable.id, pathwayEvent?.pathwayId ?? enrollment.pathwayId));
  if (!program || !pathway) throw new Error("Enrollment references missing catalogue records");
  return { enrollment, learner, program, pathway };
}
export async function progressByModule(pathwayId?: string) {
  const activePathwayId=pathwayId ?? (await learnerContext()).pathway.id;
  const attempts = await db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.learnerId, DEMO_LEARNER),eq(assessmentAttemptsTable.pathwayId,activePathwayId)));
  const assessments = await db.select().from(assessmentsTable);
  const map = new Map(assessments.map(a => [a.id, a.moduleId]));
  const completed = new Set(attempts.filter(a => a.decision === "Competent").map(a => map.get(a.assessmentId)));
  return (id: string) => completed.has(id) ? { progress: 100, status: "Complete" } : activePathwayId==="path-a" && id==="m07" ? { progress: 60, status: "In progress" } : { progress: 0, status: "Not started" };
}
export async function evidenceRecords(pathwayId?: string) {
  const activePathwayId=pathwayId ?? (await learnerContext()).pathway.id;
  const [evidence, reviews, modules, people] = await Promise.all([db.select().from(evidenceTable), db.select().from(evidenceReviewsTable), db.select().from(modulesTable), db.select().from(peopleTable)]);
  const reviewMap = latest(reviews, r => r.evidenceId), moduleMap = new Map(modules.map(m => [m.id,m])), personMap = new Map(people.map(p => [p.id,p]));
  return evidence.filter(e => e.learnerId === DEMO_LEARNER && e.pathwayId===activePathwayId).map(e => {
    const review = reviewMap.get(e.id), module = moduleMap.get(e.moduleId);
    return { id:e.id,title:e.title,type:e.type,moduleId:e.moduleId,moduleName:module?.name ?? "Unknown module",taskId:e.taskId,description:e.description,status:review?.status ?? "Under review",submittedAt:e.createdAt,reviewer:review?.reviewerId ? personMap.get(review.reviewerId)?.name ?? null : null,reviewerComment:review?.comment ?? null,fileName:e.fileName,quality:review?.quality ?? {valid:false,relevant:false,sufficient:false,traceable:false} };
  });
}
export async function gapRecords(pathwayId?: string) {
  const activePathwayId=pathwayId ?? (await learnerContext()).pathway.id;
  const [gaps, events] = await Promise.all([db.select().from(gapsTable), db.select().from(gapEventsTable)]);
  const statuses = latest(events, e => e.gapId);
  return gaps.filter(g => g.learnerId === DEMO_LEARNER && g.pathwayId===activePathwayId).map(g => ({...g, status:statuses.get(g.id)?.status ?? "Open"}));
}
export async function remediationRecords(pathwayId?: string) {
  const activePathwayId=pathwayId ?? (await learnerContext()).pathway.id;
  const [plans, activities, events, gaps] = await Promise.all([db.select().from(remediationPlansTable),db.select().from(remediationActivitiesTable),db.select().from(remediationEventsTable),gapRecords(activePathwayId)]);
  const state = latest(events, e => e.activityId);
  const gapIds=new Set(gaps.map(gap=>gap.id));
  return plans.filter(p=>gapIds.has(p.gapId)).map(p => { const acts=activities.filter(a=>a.planId===p.id).map(a=>({...a,status:state.get(a.id)?.status ?? "Not started"})); return {id:p.id,gapId:p.gapId,title:p.title,description:p.description,dueLabel:p.dueLabel,status:acts.every(a=>a.status==="Completed")?"Completed":acts.some(a=>a.status==="In progress")?"In progress":"Not started",activities:acts}; });
}
export async function readiness(context?: Awaited<ReturnType<typeof learnerContext>>) {
  const activeContext=context ?? await learnerContext();
  const [gates, events, gaps, evidences, assessments] = await Promise.all([db.select().from(readinessGatesTable).orderBy(readinessGatesTable.sequence),db.select().from(readinessEventsTable).where(and(eq(readinessEventsTable.enrollmentId,activeContext.enrollment.id),eq(readinessEventsTable.pathwayId,activeContext.pathway.id))),gapRecords(activeContext.pathway.id),evidenceRecords(activeContext.pathway.id),db.select().from(assessmentsTable)]);
  const assessmentStates = await Promise.all(assessments.map(assessment=>assessmentSummary(assessment,activeContext.pathway.id)));
  const states=latest(events,e=>e.gateId);
  const gateViews=gates.map(g=>({id:g.id,code:g.code,name:g.name,requirement:g.requirement,status:states.get(g.id)?.status ?? "Locked"}));
  // A critical rubric criterion is only passing at 2 (meets standard) or 3
  // (exceeds standard); a 0/1 safety result can never be hidden by an average.
  const blockers=[...assessmentStates.filter(a=>a.criticalFailure).map(a=>`Critical safety failure in ${a.name}`),...gaps.filter(g=>g.status!=="Resolved" && g.severity==="Critical").map(g=>g.diagnosis),...gateViews.filter(g=>g.status==="In progress").flatMap(g=>states.get(g.id)?.blockers ?? [])];
  const current=gateViews.find(g=>g.status==="In progress") ?? [...gateViews].reverse().find(g=>g.status==="Passed") ?? gateViews[0];
  const index=gateViews.findIndex(g=>g.id===current.id), next=gateViews[index+1] ?? null;
  const score=Math.max(0,Math.min(100,states.get(current.id)?.score ?? 0));
  return {status:blockers.length?"Blocked":current.status,score,currentGate:current,nextGate:next,gates:gateViews,blockers,outstandingGapCount:gaps.filter(g=>g.status!=="Resolved").length,missingEvidenceCount:Math.max(0,10-evidences.filter(e=>e.status==="Valid").length)};
}
export async function assessmentSummary(assessment: {id:string;moduleId:string;name:string}, pathwayId?: string) {
  const activePathwayId=pathwayId ?? (await learnerContext()).pathway.id;
  const [attempts, criteria, observations] = await Promise.all([db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.assessmentId,assessment.id),eq(assessmentAttemptsTable.learnerId,DEMO_LEARNER),eq(assessmentAttemptsTable.pathwayId,activePathwayId))),db.select().from(assessmentCriteriaTable).where(eq(assessmentCriteriaTable.assessmentId,assessment.id)),db.select().from(criterionObservationsTable)]);
  const latestAttempt=attempts.sort((a,b)=>b.number-a.number||b.createdAt.getTime()-a.createdAt.getTime())[0];
  const obs=latestAttempt ? new Map(observations.filter(o=>o.attemptId===latestAttempt.id).map(o=>[o.criterionId,o])) : new Map();
  const scores=criteria.map(c=>obs.get(c.id)?.score).filter((s):s is number=>s!==undefined);
  const criticalFailure=Boolean(latestAttempt) && criteria.some(c=>c.critical && (obs.get(c.id)?.score ?? 0) < 2);
  return {id:assessment.id,moduleId:assessment.moduleId,name:assessment.name,status:latestAttempt?.status ?? "Not started",score:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length/3*100):0,attemptCount:attempts.length,criticalFailure};
}