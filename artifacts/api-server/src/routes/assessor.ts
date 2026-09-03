import { Router, type IRouter } from "express";
import { GetAssessmentParams, GetAssessmentResponse, GetAssessorDashboardResponse, GetAssessorQueueResponse, ListAssessmentsResponse, SubmitAssessmentDecisionBody, SubmitAssessmentDecisionParams, SubmitAssessmentDecisionResponse } from "@workspace/api-zod";
import { db, assessmentAttemptsTable, assessmentCriteriaTable, assessmentsTable, criterionObservationsTable, enrollmentsTable, gapEventsTable, gapsTable, modulesTable, peopleTable, readinessEventsTable, readinessGatesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { assessmentSummary, DEMO_LEARNER, evidenceRecords, gapRecords, learnerContext } from "../lib/teras";
import { authorizeWorkspaceRole } from "../lib/authorization";
const router: IRouter=Router();
const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
async function assessmentDetail(assessment:{id:string;moduleId:string;name:string}){const [criteria,attempts,obs,people]=await Promise.all([db.select().from(assessmentCriteriaTable).where(eq(assessmentCriteriaTable.assessmentId,assessment.id)),db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.assessmentId,assessment.id),eq(assessmentAttemptsTable.learnerId,DEMO_LEARNER))),db.select().from(criterionObservationsTable),db.select().from(peopleTable)]);const latestAttempt=attempts.sort((a,b)=>b.number-a.number||b.createdAt.getTime()-a.createdAt.getTime())[0],observations=new Map(obs.filter(o=>o.attemptId===latestAttempt?.id).map(o=>[o.criterionId,o])),persons=new Map(people.map(p=>[p.id,p.name]));return{assessment:await assessmentSummary(assessment),criteria:criteria.map(c=>{const o=observations.get(c.id);return{id:c.id,code:c.code,label:c.label,layer:c.layer,critical:c.critical,score:o?.score??null,observation:o?.observation??null,evidenceId:o?.evidenceId??null};}),attempts:attempts.sort((a,b)=>b.number-a.number||b.createdAt.getTime()-a.createdAt.getTime()).map(a=>({id:a.id,number:a.number,submittedAt:a.createdAt,assessor:a.assessorId?persons.get(a.assessorId)??null:null,status:a.status,decision:a.decision}))};}
router.get("/assessments",async(req,res):Promise<void>=>{req.log.info("Listing assessments");const rows=await db.select().from(assessmentsTable);res.json(ListAssessmentsResponse.parse(await Promise.all(rows.map(assessmentSummary))));});
router.get("/assessments/:assessmentId",async(req,res):Promise<void>=>{
 const parsed=GetAssessmentParams.safeParse(req.params);if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}
 const [assessment]=await db.select().from(assessmentsTable).where(eq(assessmentsTable.id,parsed.data.assessmentId));if(!assessment){res.status(404).json({error:"Assessment not found"});return;}
 res.json(GetAssessmentResponse.parse(await assessmentDetail(assessment)));
});
router.get("/assessor/queue",async(_req,res):Promise<void>=>{const [assessments,modules]=await Promise.all([db.select().from(assessmentsTable),db.select().from(modulesTable)]), ctx=await learnerContext();const summaries=await Promise.all(assessments.map(assessmentSummary));res.json(GetAssessorQueueResponse.parse(summaries.filter(s=>s.status!=="Completed"||s.criticalFailure).map(s=>({id:s.id,kind:"Assessment",learnerName:ctx.learner.name,moduleName:modules.find(m=>m.id===s.moduleId)?.name??"Module",title:s.name,status:s.status,priority:s.criticalFailure?"Critical":"Normal",updatedAt:new Date()}))));});
router.get("/assessor/dashboard",async(_req,res):Promise<void>=>{const [ctx,queue,evidence,gaps]=await Promise.all([learnerContext(),db.select().from(assessmentsTable),evidenceRecords(),gapRecords()]);const summaries=await Promise.all(queue.map(assessmentSummary));const assessor=await db.select().from(peopleTable).where(eq(peopleTable.id,ctx.enrollment.assessorId!)).then(x=>x[0]);const activity=(await Promise.all(summaries.filter(s=>s.status!=="Completed").map(async s=>({id:s.id,kind:"Assessment",learnerName:ctx.learner.name,moduleName:s.moduleId,title:s.name,status:s.status,priority:s.criticalFailure?"Critical":"Normal",updatedAt:new Date()}))));res.json(GetAssessorDashboardResponse.parse({assessor,pendingAssessmentCount:summaries.filter(s=>s.status!=="Completed").length,pendingEvidenceCount:evidence.filter(e=>e.status==="Under review").length,reassessmentCount:summaries.filter(s=>s.criticalFailure).length,blockedGateCount:gaps.filter(g=>g.status!=="Resolved"&&g.severity==="Critical").length,recentActivity:activity}));});
router.post("/assessor/assessments/:assessmentId/decision",async(req,res):Promise<void>=>{
  const params=SubmitAssessmentDecisionParams.safeParse(req.params);
  if(!params.success){req.log.warn("Invalid assessor decision parameters");res.status(400).json({error:params.error.message});return;}
  const body=SubmitAssessmentDecisionBody.safeParse(req.body);
  if(!body.success){req.log.warn("Invalid assessor decision body");res.status(400).json({error:body.error.message});return;}
  const assessorId=await authorizeWorkspaceRole(req,res,"assessor");
  if(!assessorId)return;
  const [assessment]=await db.select().from(assessmentsTable).where(eq(assessmentsTable.id,params.data.assessmentId));
  if(!assessment){res.status(404).json({error:"Assessment not found"});return;}
   const context=await learnerContext();
   const [enrollment]=await db.select().from(enrollmentsTable).where(and(eq(enrollmentsTable.learnerId,context.learner.id),eq(enrollmentsTable.assessorId,assessorId)));
   if(!enrollment){res.status(403).json({error:"You are not assigned to this learner"});return;}
   const [assessmentModule]=await db.select().from(modulesTable).where(eq(modulesTable.id,assessment.moduleId));
   if(!assessmentModule||assessmentModule.programId!==enrollment.programId){
     req.log.warn({assessmentId:assessment.id,programId:enrollment.programId},"Assessment is outside the learner enrollment");
     res.status(403).json({error:"Assessment is outside the learner's enrolled program"});
     return;
   }
  const criteria=await db.select().from(assessmentCriteriaTable).where(eq(assessmentCriteriaTable.assessmentId,assessment.id));
  const inputs=new Map(body.data.criteria.map(item=>[item.criterionId,item]));
  if(inputs.size!==body.data.criteria.length||criteria.some(criterion=>!inputs.has(criterion.id))||inputs.size!==criteria.length){
    res.status(400).json({error:"A score is required for every assessment criterion"});
    return;
  }
  const criticalFailure=criteria.some(criterion=>criterion.critical&&(inputs.get(criterion.id)?.score??0)<2);
  const decision=criticalFailure?"Not competent":body.data.decision;
  const gateCode=assessment.moduleId==="m03"?"G1":assessment.moduleId==="m07"?"G2":null;
  const attemptId=id("assessment-attempt");
  await db.transaction(async tx=>{
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${assessment.id}), hashtext(${context.learner.id}))`);
     const attempts=await tx.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.assessmentId,assessment.id),eq(assessmentAttemptsTable.learnerId,context.learner.id)));
    await tx.insert(assessmentAttemptsTable).values({
      id:attemptId,
      assessmentId:assessment.id,
      learnerId:context.learner.id,
      number:Math.max(0,...attempts.map(item=>item.number))+1,
      assessorId,
      status:decision==="Competent"?"Completed":"Needs reassessment",
      decision,
      decisionRationale:body.data.observation,
      createdBy:assessorId,
    });
    await tx.insert(criterionObservationsTable).values(body.data.criteria.map(item=>({
      id:id("criterion-observation"),
      attemptId,
      criterionId:item.criterionId,
      score:item.score,
      observation:item.observation,
      evidenceId:item.evidenceId,
      createdBy:assessorId,
    })));
     const moduleGaps=await tx.select().from(gapsTable).where(and(eq(gapsTable.moduleId,assessment.moduleId),eq(gapsTable.learnerId,context.learner.id)));
    if(moduleGaps.length)await tx.insert(gapEventsTable).values(moduleGaps.map(gap=>({
      id:id("gap-event"),
      gapId:gap.id,
      status:decision==="Competent"?"Resolved":"Open",
      createdBy:assessorId,
    })));
    if(gateCode){
      const [gate]=await tx.select().from(readinessGatesTable).where(and(
        eq(readinessGatesTable.programId,enrollment.programId),
        eq(readinessGatesTable.code,gateCode),
      ));
      if(gate)await tx.insert(readinessEventsTable).values({
        id:id("readiness-event"),
        enrollmentId:context.enrollment.id,
        gateId:gate.id,
        status:decision==="Competent"?"Passed":"In progress",
        score:Math.round(body.data.criteria.reduce((sum,item)=>sum+item.score,0)/body.data.criteria.length/3*100),
        blockers:decision==="Competent"?[]:[criticalFailure?`Critical safety criterion failed in ${assessment.name}`:`Assessment decision is Not competent for ${assessment.name}`],
        createdBy:assessorId,
      });
    }
  });
  req.log.info({assessmentId:assessment.id,decision,criticalFailure},"Recorded assessor decision");
  res.status(201).json(SubmitAssessmentDecisionResponse.parse(await assessmentDetail(assessment)));
});
export default router;