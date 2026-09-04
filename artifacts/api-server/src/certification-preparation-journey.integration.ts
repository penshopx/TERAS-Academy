/**
 * A single, fresh-database release journey.  Every identity below is created
 * through the admin API and all subsequent requests use those same identities.
 * The gate drops the database, so this deliberately has no demo cleanup path.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import {
  assessmentAttemptsTable, assessmentCriteriaTable, assessmentsTable, contentResourcesTable, courseVersionsTable, coursesTable, db, evidenceRequirementsTable,
  evidenceReviewsTable, gapsTable, gapEventsTable, learningRecordLinksTable, reassessmentLinksTable, readinessTransferEventsTable,
  modulesTable, practiceAttemptsTable, practiceReviewsTable, remediationActivitiesTable, remediationEventsTable,
  remediationPlansTable, practiceTasksTable, readinessGatesTable,
} from "@workspace/db";
import { createIntegrationTestApp } from "./integration-test-app";
import { ObjectStorageService } from "./lib/objectStorage";

const run = crypto.randomUUID();
const storageScope = (process.env.TERAS_GATE_STORAGE_NAMESPACE ?? "local-test").replace(/[^a-zA-Z0-9._-]/g, "-");
const id = (kind: string) => `gate-${run}-${kind}`;
const ids = {
  admin: id("admin"), learner: id("learner"), otherLearner: id("other-learner"),
  trainer: id("trainer"), assessor: id("assessor"), otherTrainer: id("other-trainer"), otherAssessor: id("other-assessor"),
  program: id("program"), otherProgram: id("other-program"), path: id("path"),
  otherPath: id("other-path"), cohort: id("cohort"), enrollment: id("enrollment"),
  module: id("module"), task: id("task"), assessment: id("assessment"), gate: id("gate"),
  course: id("course"), draft: id("draft"), objectPath: `/objects/uploads/${storageScope}-${run}.pdf`,
};
class GateStorageAdapter {
  readonly objects = new Map<string, { bytes: string; mime: string; owner: string | null; verified: unknown }>();
  constructor(readonly namespace: string, readonly path: string) { assert(path.includes(namespace.replace(/[^a-zA-Z0-9._-]/g, "-"))); this.objects.set(path, { bytes: "gate protected media", mime: "application/pdf", owner: null, verified: null }); }
  record(path: string) { const object = this.objects.get(path); assert(object, `storage path outside ${this.namespace}`); return object; }
}
const storage = new GateStorageAdapter(process.env.TERAS_GATE_STORAGE_NAMESPACE ?? "local-test", ids.objectPath);
ObjectStorageService.prototype.getObjectEntityUploadURL = async () => `https://storage.googleapis.com/test/${run}.pdf`;
ObjectStorageService.prototype.normalizeObjectEntityPath = () => ids.objectPath;
ObjectStorageService.prototype.verifyUploadedMetadata = async (path, expected) => { storage.record(path).verified = expected; };
ObjectStorageService.prototype.setPrivateOwner = async (path, value) => { storage.record(path).owner = value; };
ObjectStorageService.prototype.ownerCanRead = async (path, value) => storage.record(path).owner === value;
ObjectStorageService.prototype.getObjectEntityFile = async (path) => path as never;
ObjectStorageService.prototype.downloadObject = async (path) => { const object = storage.record(path as unknown as string); return new Response(object.bytes, { headers: { "content-type": object.mime } }); };

type Role = "admin" | "learner" | "trainer" | "assessor" | "none";
async function main() {
  const app = createIntegrationTestApp(req => {
    const role = (req.get("x-gate-role") || "none") as Role;
    const users: Record<Role, string | null> = { admin: ids.admin, learner: ids.learner, trainer: ids.trainer, assessor: ids.assessor, none: null };
    if (role === "learner" && req.get("x-gate-other") === "1") return { userId: ids.otherLearner, role, learnerId: ids.otherLearner };
    if (role === "trainer" && req.get("x-gate-other") === "1") return { userId: ids.otherTrainer, role };
    if (role === "assessor" && req.get("x-gate-other") === "1") return { userId: ids.otherAssessor, role };
    return { userId: users[role], role: role === "none" ? null : role, learnerId: role === "learner" ? ids.learner : undefined };
  });
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const s = app.listen(0, () => resolve(s)); });
  const address = server.address() as AddressInfo;
  const request = async (path: string, role: Role, body?: unknown, method = body === undefined ? "GET" : "POST", other = false) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method, headers: { "content-type": "application/json", "x-gate-role": role, ...(other ? { "x-gate-other": "1" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return response;
  };
  const expect = async (path: string, role: Role, body: unknown, status = 201, method = "POST") => {
    const response = await request(path, role, body, method);
    assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`);
    return response.json() as Promise<any>;
  };
  try {
    // Admin owns the identities, programme, pathway, cohort and active enrollment.
    for (const [person, name, role] of [[ids.learner, "Gate Learner", "learner"], [ids.otherLearner, "Other Learner", "learner"], [ids.trainer, "Gate Instructor", "trainer"], [ids.otherTrainer, "Other Instructor", "trainer"], [ids.assessor, "Gate Validator", "assessor"], [ids.otherAssessor, "Other Validator", "assessor"]] as const)
      await expect("/admin/users", "admin", { id: person, name, initials: name.slice(0, 2), email: `${person}@test.invalid`, clerkUserId: person, organization: null, status: "active", roles: [role] });
    await expect("/admin/programs", "admin", { id: ids.program, domain: "Gate", name: "Certification preparation", description: "run scoped", status: "active" });
    await expect("/admin/programs", "admin", { id: ids.otherProgram, domain: "Other", name: "Other program", description: "run scoped", status: "active" });
    await expect("/admin/pathways", "admin", { id: ids.path, programId: ids.program, name: "Preparation pathway", type: "Standard", outcome: "Internal readiness", status: "active" });
    await expect("/admin/pathways", "admin", { id: ids.otherPath, programId: ids.otherProgram, name: "Other pathway", type: "Standard", outcome: "Other", status: "active" });
    await expect("/admin/cohorts", "admin", { id: ids.cohort, programId: ids.program, name: `Cohort ${run}`, status: "active", startsOn: null, endsOn: null });
    await expect("/admin/enrollments", "admin", { id: ids.enrollment, learnerId: ids.learner, programId: ids.program, pathwayId: ids.path, trainerId: ids.trainer, assessorId: ids.assessor, cohortId: ids.cohort, status: "active" });
    await expect("/admin/enrollments", "admin", { id: id("other-enrollment"), learnerId: ids.otherLearner, programId: ids.otherProgram, pathwayId: ids.otherPath, trainerId: ids.otherTrainer, assessorId: ids.otherAssessor, cohortId: null, status: "active" });
    assert.equal((await request("/admin/users", "learner")).status, 403, "cross-role admin access");

    // The authoring API creates the full publishable hierarchy and claims managed media.
    await db.insert(modulesTable).values({ id: ids.module, programId: ids.program, pathwayId: ids.path, sequence: 1, code: "GATE", name: "Gate capability", capability: "Safe gate practice", evidence: "Observed record", learningOutcomes: [], theory: [] });
    const otherModule = id("other-module"), otherTask = id("other-task");
    await db.insert(modulesTable).values({ id: otherModule, programId: ids.otherProgram, pathwayId: ids.otherPath, sequence: 1, code: "OTHER", name: "Other capability", capability: "Other", evidence: "Other", learningOutcomes: [], theory: [] });
    await db.insert(practiceTasksTable).values({ id: otherTask, moduleId: otherModule, title: "Other task", description: "Other", mode: "Observed", durationMinutes: 5, output: "Other" });
    const author = async (body: object, status = 201) => expect("/trainer/authoring/commands", "trainer", body, status);
    await author({ action: "CREATE", entity: "COURSE", id: ids.course, courseId: ids.course, data: { programId: ids.program, pathwayId: ids.path, title: "Published course", description: "Safe content", sequence: 1 } });
    assert.equal((await request("/trainer/authoring/commands", "trainer", { action: "CREATE", entity: "COURSE", id: id("stolen"), courseId: ids.course, data: { programId: ids.program, pathwayId: ids.path, title: "stolen" } }, "POST", true)).status, 403, "unassigned instructor rejected");
    await author({ action: "CREATE", entity: "COURSE", id: ids.draft, courseId: ids.draft, data: { programId: ids.program, pathwayId: ids.path, title: "Draft course", description: "Hidden", sequence: 2 } });
    const link = await author({ action: "CREATE", entity: "COURSE_MODULE", courseId: ids.course, data: { moduleId: ids.module } });
    const lesson = await author({ action: "CREATE", entity: "LESSON", courseId: ids.course, data: { courseModuleId: link.id, title: "Learn", description: "Learn safely" } });
    const activity = await author({ action: "CREATE", entity: "ACTIVITY", courseId: ids.course, data: { lessonId: lesson.id, title: "Practice", description: "Practice safely", type: "READING" } });
    const outcome = await author({ action: "CREATE", entity: "OUTCOME", courseId: ids.course, data: { activityId: activity.id, capabilityModuleId: ids.module, description: "Outcome", verificationMethod: "TRAINER_REVIEW" } });
    await author({ action: "CREATE", entity: "RESOURCE", courseId: ids.course, data: { activityId: activity.id, type: "TEXT", title: "Guide", content: "Safe guide" } });
    const resourcesBeforeUnsafe = (await db.select().from(contentResourcesTable)).length;
    assert.equal((await request("/learning/resources", "trainer", { activityId: activity.id, type: "LINK", title: "unsafe", uri: "javascript:alert(1)" })).status, 400, "unsafe media rejected");
    assert.equal((await db.select().from(contentResourcesTable)).length, resourcesBeforeUnsafe);
    await expect("/storage/uploads/request-url", "trainer", { name: "guide.pdf", size: 1, contentType: "application/pdf" }, 200);
    await author({ action: "CREATE", entity: "RESOURCE", courseId: ids.course, data: { activityId: activity.id, type: "PDF", title: "Protected", objectPath: ids.objectPath, mimeType: "application/pdf" } });
    assert.deepEqual(storage.record(ids.objectPath).verified, { size: 1, mimeType: "application/pdf" });
    assert.equal(storage.record(ids.objectPath).owner, ids.trainer);
    assert.deepEqual([...storage.objects.keys()], [ids.objectPath]);
    assert.equal((await request("/storage" + ids.objectPath, "learner")).status, 404, "draft media hidden");
    const firstPublish = await expect(`/trainer/authoring/courses/${ids.course}/publish`, "trainer", {}, 201);
    const originalSnapshot = structuredClone((await db.select().from(courseVersionsTable)).find(row => row.courseId === ids.course && row.version === 1)!.snapshot);
    await author({ action: "UPDATE", entity: "LESSON", id: lesson.id, courseId: ids.course, data: { title: "Learn revised after v1" } }, 200);
    const publish = await Promise.all([request(`/trainer/authoring/courses/${ids.course}/publish`, "trainer", {}), request(`/trainer/authoring/courses/${ids.course}/publish`, "trainer", {})]);
    assert.deepEqual(publish.map(x => x.status).sort(), [201, 201], "concurrent publish serialized");
    const publishBodies = await Promise.all(publish.map(response => response.json() as Promise<any>));
    assert.deepEqual([firstPublish.version, ...publishBodies.map(item => item.version)].sort(), [1, 2, 3]);
    const versions = (await db.select().from(courseVersionsTable)).filter(row => row.courseId === ids.course);
    const [publishedCourse] = (await db.select().from(coursesTable)).filter(row => row.id === ids.course);
    assert.equal(versions.length, 3); assert.equal(publishedCourse.publishedVersionId, versions.find(row => row.version === 3)?.id);
    assert.deepEqual(versions.find(row => row.version === 1)?.snapshot, originalSnapshot, "v1 remains immutable after authoring update");
    assert(versions.filter(row => row.version > 1).every(row => JSON.stringify(row.snapshot).includes("Learn revised after v1")));
    assert(versions.every(row => JSON.stringify(row.snapshot).includes(ids.objectPath)), "immutable snapshots retain hierarchy and managed resource");
    const media = await request("/storage" + ids.objectPath, "learner"); assert.equal(media.status, 200); assert.equal(media.headers.get("content-type"), "application/pdf"); assert.equal(await media.text(), "gate protected media");
    assert.equal((await request("/storage" + ids.objectPath, "learner", undefined, "GET", true)).status, 403);
    assert.equal((await request("/storage" + ids.objectPath, "trainer", undefined, "GET", true)).status, 403);
    const visibleResponse = await request("/learning/courses", "learner");
    assert.equal(visibleResponse.status, 200, await visibleResponse.text());
    const visible = await (await request("/learning/courses", "learner")).json() as any[];
    assert.equal(visible.length, 1, "only published active-path content is visible");
    assert.equal(visible[0].id, ids.course); const otherCourses = await request("/learning/courses", "learner", undefined, "GET", true); assert.equal(otherCourses.status, 200); assert.deepEqual(await otherCourses.json(), [], "other-path learner sees no course");

    // The activity uses the same published activity ID; attempts/evidence are route writes.
    await db.insert(practiceTasksTable).values({ id: ids.task, moduleId: ids.module, title: "Gate task", description: "Practice", mode: "Observed", durationMinutes: 5, output: "Record" });
    const attemptsBeforeCrossPath = (await db.select().from(practiceAttemptsTable)).length;
    assert.equal((await request(`/practice/tasks/${otherTask}/attempts`, "learner", { reflection: "cross path", outputSummary: "must not write", sourceActivityId: activity.id, idempotencyKey: id("cross-path") })).status, 404, "other-path task rejected");
    assert.equal((await db.select().from(practiceAttemptsTable)).length, attemptsBeforeCrossPath, "cross-path rejection made no attempt");
    await db.insert(assessmentsTable).values({ id: ids.assessment, moduleId: ids.module, name: "Gate assessment", gateCode: "G1" });
    await db.insert(assessmentCriteriaTable).values(["valid", "relevant", "sufficient", "traceable"].map((code, index) => ({ id: id(`criterion-${code}`), assessmentId: ids.assessment, code, label: code, layer: "evidence", critical: index === 0 })));
    await db.insert(evidenceRequirementsTable).values({ id: id("requirement"), moduleId: ids.module, code: "E1", name: "Gate evidence", description: "Valid evidence", allowedTypes: ["Checklist"] });
    await db.insert(readinessGatesTable).values({ id: ids.gate, programId: ids.program, pathwayId: ids.path, sequence: 1, code: "G1", name: "Internal gate", requirement: "Internal preparation", assessmentMode: "Mapped", evidenceMode: "Mapped" });
    const criteria = (await db.select().from(assessmentCriteriaTable)).filter(row => row.assessmentId === ids.assessment);
    const transition = (currentState: string, targetState: string, key: string, references: object = {}) => ({ currentState, targetState, learnerId: ids.learner, pathwayId: ids.path, programId: ids.program, activityId: activity.id, entityReference: key, reason: "gate journey", idempotencyKey: id(key), references });
    await expect("/learning/transitions", "learner", transition("NOT_STARTED", "IN_PROGRESS", "learn"), 201);
    await expect("/learning/transitions", "learner", transition("IN_PROGRESS", "LEARNING_COMPLETED", "complete"), 201);
    await expect("/learning/transitions", "trainer", transition("LEARNING_COMPLETED", "OUTCOME_VERIFIED", "verify", { outcomeId: outcome.id }), 201);
    await expect("/learning/transitions", "trainer", transition("OUTCOME_VERIFIED", "PRACTICE_REQUIRED", "required"), 201);
    const practiceBody = { reflection: "Run-scoped practice", outputSummary: "Safe completion", sourceActivityId: activity.id, idempotencyKey: id("practice") };
    const practice = await expect(`/practice/tasks/${ids.task}/attempts`, "learner", practiceBody);
    const retry = await expect(`/practice/tasks/${ids.task}/attempts`, "learner", practiceBody, 200);
    assert.equal(retry.id, practice.id, "reload retry must not duplicate practice");
    assert.equal((await request(`/practice/tasks/${ids.task}/attempts`, "learner", { ...practiceBody, reflection: "conflicting reuse" })).status, 409);
    assert.equal((await db.select().from(practiceAttemptsTable)).filter(row => row.learnerId === ids.learner).length, 1);
    await expect(`/trainer/practice/${practice.id}/review`, "trainer", { status: "Needs revision", feedback: "Repeat under supervision" }, 200);
    assert.equal((await db.select().from(practiceReviewsTable)).filter(row => row.attemptId === practice.id).length, 1);
    const evidenceBody = { moduleId: ids.module, taskId: ids.task, title: "Run-scoped evidence", type: "Checklist", description: "Traceable evidence", fileName: null, sourceActivityId: activity.id, practiceAttemptId: practice.id, idempotencyKey: id("evidence") };
    const evidence = await expect("/evidence", "learner", evidenceBody);
    assert.equal((await expect("/evidence", "learner", evidenceBody, 200)).id, evidence.id, "reload retry must not duplicate evidence");
    assert.equal((await request("/evidence", "learner", { ...evidenceBody, description: "conflicting reuse" })).status, 409);
    const beforeLearnerReview = (await db.select().from(evidenceReviewsTable)).length;
    assert.equal((await request(`/trainer/evidence/${evidence.id}/review`, "learner", { status: "Valid", comment: "no", quality: { valid: true, relevant: true, sufficient: true, traceable: true } })).status, 403, "learner cannot validate");
    assert.equal((await db.select().from(evidenceReviewsTable)).length, beforeLearnerReview);
    const reviewCountBeforeOther = (await db.select().from(evidenceReviewsTable)).filter(row => row.evidenceId === evidence.id).length;
    assert.equal((await request(`/trainer/evidence/${evidence.id}/review`, "trainer", { status: "Valid", comment: "unassigned", quality: { valid: true, relevant: true, sufficient: true, traceable: true } }, "POST", true)).status, 403);
    assert.equal((await db.select().from(evidenceReviewsTable)).filter(row => row.evidenceId === evidence.id).length, reviewCountBeforeOther);
    const gapId = id("gap"), planId = id("remediation"), remediationActivityId = id("remediation-activity");
    await db.insert(gapsTable).values({ id: gapId, learnerId: ids.learner, pathwayId: ids.path, moduleId: ids.module, capability: "Safe gate practice", criterion: "Sufficiency", severity: "Moderate", priority: "High", diagnosis: "Evidence requires remediation", gate: "G1", recommendedAction: "Repeat practice" });
    await db.insert(remediationPlansTable).values({ id: planId, gapId, title: "Repeat supervised practice", description: "Complete remediation before reassessment", dueLabel: "Gate run" });
    await db.insert(remediationActivitiesTable).values({ id: remediationActivityId, planId, title: "Supervised re-practice", description: "Repeat the practice safely", type: "Practice" });
    await expect(`/trainer/evidence/${evidence.id}/review`, "trainer", { status: "Needs revision", comment: "Remediate", quality: { valid: true, relevant: true, sufficient: false, traceable: true } }, 200);
    await expect(`/assessor/assessments/${ids.assessment}/decision`, "assessor", { learnerId: ids.learner, decision: "Not competent", observation: "Initial assessment failed before remediation", criteria: criteria.map(row => ({ criterionId: row.id, score: row.id === criteria[0]?.id ? 1 : 3, observation: "Needs remediation", evidenceId: row.id === criteria[0]?.id ? evidence.id : null })) });
    const failedAssessment = (await db.select().from(assessmentAttemptsTable)).filter(row => row.assessmentId === ids.assessment).at(-1)!;
    const revisionReview = (await db.select().from(evidenceReviewsTable)).filter(row => row.evidenceId === evidence.id).at(-1)!;
    assert.equal((await db.select().from(gapEventsTable)).filter(row => row.gapId === gapId).at(-1)?.status, "Open", "revision must append gap opening");
    assert.equal((await db.select().from(remediationEventsTable)).filter(row => row.activityId === remediationActivityId).at(-1)?.status, "In progress", "revision must append remediation opening");
    await expect("/learning/transitions", "trainer", transition("EVIDENCE_SUBMITTED", "UNDER_REVIEW", "under-review", { evidenceId: evidence.id }), 201);
    await expect("/learning/transitions", "trainer", transition("UNDER_REVIEW", "REVISION_REQUIRED", "revision", { evidenceId: evidence.id, evidenceReviewId: revisionReview.id }), 201);
    await expect("/learning/transitions", "trainer", transition("REVISION_REQUIRED", "REMEDIATION", "remediation", { gapId, remediationPlanId: planId }), 201);
    const beforeRejectedCompletion = (await db.select().from(remediationEventsTable)).filter(row => row.activityId === remediationActivityId).length;
    assert.equal((await request(`/remediation/${planId}/complete`, "learner", {})).status, 409);
    assert.equal((await db.select().from(remediationEventsTable)).filter(row => row.activityId === remediationActivityId).length, beforeRejectedCompletion);
    const completionBody = { idempotencyKey: id("remediation-complete"), completionNote: "Completed assigned coaching activity" };
    const concurrentCompletion = await Promise.all([request(`/remediation/${planId}/activities/${remediationActivityId}/complete`, "learner", completionBody), request(`/remediation/${planId}/activities/${remediationActivityId}/complete`, "learner", completionBody)]);
    assert.deepEqual(concurrentCompletion.map(response => response.status).sort(), [200, 201]);
    const beforeCompletionConflict = (await db.select().from(remediationEventsTable)).length;
    assert.equal((await request(`/remediation/${planId}/activities/${remediationActivityId}/complete`, "learner", { ...completionBody, completionNote: "changed payload" })).status, 409);
    assert.equal((await db.select().from(remediationEventsTable)).length, beforeCompletionConflict);
    assert.equal((await request(`/remediation/${planId}/complete`, "learner", {})).status, 409, "activity alone cannot close causal remediation");
    const remediationHistory = (await db.select().from(remediationEventsTable)).filter(row => row.activityId === remediationActivityId).map(row => row.status);
    assert(remediationHistory.includes("In progress") && remediationHistory.filter(status => status === "Completed").length === 1);
    const rePractice = await expect(`/practice/tasks/${ids.task}/attempts`, "learner", { ...practiceBody, reflection: "Run-scoped re-practice", idempotencyKey: id("re-practice") });
    const reEvidence = await expect("/evidence", "learner", { ...evidenceBody, title: "Revised run-scoped evidence", practiceAttemptId: rePractice.id, idempotencyKey: id("re-evidence") });
    await expect(`/trainer/evidence/${reEvidence.id}/review`, "trainer", { status: "Valid", comment: "All four dimensions pass", quality: { valid: true, relevant: true, sufficient: true, traceable: true } }, 200);
    const attemptsBeforeOtherAssessor = (await db.select().from(assessmentAttemptsTable)).length;
    assert.equal((await request(`/assessor/assessments/${ids.assessment}/decision`, "assessor", { learnerId: ids.learner, decision: "Competent", observation: "unassigned", criteria: criteria.map(row => ({ criterionId: row.id, score: 3, observation: "no", evidenceId: null })) }, "POST", true)).status, 403);
    assert.equal((await db.select().from(assessmentAttemptsTable)).length, attemptsBeforeOtherAssessor);
    const attempts = (await db.select().from(practiceAttemptsTable)).filter(row => row.learnerId === ids.learner);
    assert.equal(attempts.length, 2, "initial and re-practice history must be append-only");
    assert.equal((await db.select().from(evidenceReviewsTable)).filter(row => row.evidenceId === evidence.id).length, 2, "old evidence review history retained");
    assert.equal((await db.select().from(learningRecordLinksTable)).filter(row => row.learnerId === ids.learner && row.activityId === activity.id).length >= 4, true, "causal activity links recorded");
    await expect("/learning/transitions", "trainer", transition("EVIDENCE_SUBMITTED", "UNDER_REVIEW", "re-under-review", { evidenceId: reEvidence.id }), 201);
    const beforePrematurePass = (await db.select().from(assessmentAttemptsTable)).length;
    assert.equal((await request(`/assessor/assessments/${ids.assessment}/decision`, "assessor", { learnerId: ids.learner, decision: "Competent", observation: "premature pass", criteria: criteria.map(row => ({ criterionId: row.id, score: 3, observation: "premature", evidenceId: null })) })).status, 409);
    assert.equal((await db.select().from(assessmentAttemptsTable)).length, beforePrematurePass, "premature pass made no attempt");
    await expect(`/assessor/assessments/${ids.assessment}/decision`, "assessor", { learnerId: ids.learner, decision: "Not competent", observation: "Remediation reassessment requires one more observation", criteria: criteria.map(row => ({ criterionId: row.id, score: row.id === criteria[0]?.id ? 1 : 3, observation: "Reassess", evidenceId: row.id === criteria[0]?.id ? reEvidence.id : null })) });
    const reassessmentAttempt = (await db.select().from(assessmentAttemptsTable)).filter(row => row.assessmentId === ids.assessment).at(-1)!;
    const reassessmentReferences = { practiceAttemptId: rePractice.id, evidenceId: reEvidence.id, evidenceReviewId: (await db.select().from(evidenceReviewsTable)).filter(row => row.evidenceId === reEvidence.id).at(-1)!.id, gapId, remediationPlanId: planId, reassessmentAttemptId: reassessmentAttempt.id, previousAssessmentAttemptId: failedAssessment.id };
    await expect("/learning/transitions", "assessor", transition("UNDER_REVIEW", "REASSESSMENT", "reassessment", reassessmentReferences), 201);
    const eventsBeforePrematureClosure = (await db.select().from(remediationEventsTable)).length;
    assert.equal((await request(`/remediation/${planId}/complete`, "learner", {})).status, 409, "failed linked reassessment cannot close plan");
    assert.equal((await db.select().from(remediationEventsTable)).length, eventsBeforePrematureClosure);
    await expect(`/assessor/assessments/${ids.assessment}/decision`, "assessor", { learnerId: ids.learner, decision: "Competent", observation: "Passing reassessment", criteria: criteria.map(row => ({ criterionId: row.id, score: 3, observation: "Verified", evidenceId: row.id === criteria[0]?.id ? reEvidence.id : null })) });
    const passedAssessment = (await db.select().from(assessmentAttemptsTable)).filter(row => row.assessmentId === ids.assessment).at(-1)!;
    assert.equal((await request(`/remediation/${planId}/complete`, "learner", {})).status, 200, "plan closes only after causal reassessment");
    await expect("/learning/transitions", "assessor", transition("REASSESSMENT", "READY", "ready", { reassessmentAttemptId: passedAssessment.id }), 201);
    const readinessResponse = await request("/readiness", "learner"); assert.equal(readinessResponse.status, 200); assert.equal((await readinessResponse.json() as any).status, "Passed");
    assert.equal((await db.select().from(reassessmentLinksTable)).filter(row => row.reassessmentAttemptId === reassessmentAttempt.id && row.previousAssessmentAttemptId === failedAssessment.id && row.evidenceId === reEvidence.id).length, 1, "reassessment causal link retained");
    assert.equal((await db.select().from(reassessmentLinksTable)).filter(row => row.reassessmentAttemptId === passedAssessment.id && row.previousAssessmentAttemptId === reassessmentAttempt.id && row.remediationPlanId === planId).length, 1, "competent reassessment is causally linked");
    assert.equal((await db.select().from(readinessTransferEventsTable)).filter(row => row.learnerId === ids.learner && row.enrollmentId === ids.enrollment && row.reassessmentReferences.includes(passedAssessment.id) && row.evidenceReferences.includes(reEvidence.id) && row.practiceReferences.includes(rePractice.id)).length, 1, "ready transfer is append-only and scoped");
    const passportResponse = await request("/passport", "learner");
    assert.equal(passportResponse.status, 200, await passportResponse.text());
    const passport = await (await request("/passport", "learner")).json() as any;
    assert.match(passport.readinessDisclaimer, /not an official competency decision or certification claim/i);
    assert.equal(passport.achievements[0].capability, "Safe gate practice");
    process.stdout.write(`Certification preparation shared-state journey passed (${run})\n`);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
await main();