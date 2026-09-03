import { Router, type IRouter } from "express";
import { CreateEvidenceBody, CreateEvidenceResponse, CreatePracticeAttemptBody, CreatePracticeAttemptParams, CreatePracticeAttemptResponse, GetCapabilityPassportResponse, GetLearnerDashboardResponse, GetLearnerJourneyResponse, GetLearnerLearningPlanResponse, GetLearnerReadinessResponse, ListEvidenceResponse, ListGapsResponse, ListRemediationResponse, CompleteRemediationParams, CompleteRemediationResponse, SelectLearnerPathwayBody, SelectLearnerPathwayResponse } from "@workspace/api-zod";
import { db, assessmentAttemptsTable, enrollmentPathwayEventsTable, evidenceReviewsTable, evidenceTable, pathwaysTable, practiceAttemptsTable, practiceTasksTable, remediationActivitiesTable, remediationEventsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { catalogue, DEMO_LEARNER, evidenceRecords, gapRecords, learnerContext, moduleSummary, progressByModule, readiness, remediationRecords } from "../lib/teras";
import { authorizeLearner } from "../lib/authorization";
const router: IRouter=Router(); const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
function bad(req:any,res:any,error:string){req.log.warn({error},"Invalid request");res.status(400).json({error});}
async function pathwayTimeline(){
  const context=await learnerContext();
  const [events,pathways]=await Promise.all([
    db.select().from(enrollmentPathwayEventsTable).where(eq(enrollmentPathwayEventsTable.enrollmentId,context.enrollment.id)).orderBy(enrollmentPathwayEventsTable.sequence),
    db.select().from(pathwaysTable),
  ]);
  const pathwayMap=new Map(pathways.map(pathway=>[pathway.id,pathway]));
  const original=pathwayMap.get(context.enrollment.pathwayId)??context.pathway;
  return {
    context,
    steps:[
      {id:"pathway-enrol",label:"Pathway started",description:`Enrolled on ${original.name}.`,status:"Complete",date:new Date("2025-01-06T09:00:00Z"),href:"/programs/solar-pv-tech"},
      ...events.map(event=>({id:`pathway-${event.id}`,label:"Pathway selected",description:`Activated ${pathwayMap.get(event.pathwayId)?.name??"capability pathway"}.`,status:"Complete",date:event.createdAt,href:"/programs/solar-pv-tech"})),
    ],
  };
}
router.get("/evidence",async(req,res):Promise<void>=>{req.log.info("Listing evidence");res.json(ListEvidenceResponse.parse(await evidenceRecords()));});
router.post("/learner/pathway",async(req,res):Promise<void>=>{
  const parsed=SelectLearnerPathwayBody.safeParse(req.body);
  if(!parsed.success){bad(req,res,parsed.error.message);return;}
  const learnerId=await authorizeLearner(req,res);
  if(!learnerId)return;
  const context=await learnerContext();
  if(context.learner.id!==learnerId){res.status(403).json({error:"You are not authorized for this enrollment"});return;}
  const [pathway]=await db.select().from(pathwaysTable).where(eq(pathwaysTable.id,parsed.data.pathwayId));
  if(!pathway||pathway.programId!==context.program.id){res.status(404).json({error:"Pathway not found for the enrolled program"});return;}
  const event=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${context.enrollment.id}))`);
    const [latestEvent]=await tx.select().from(enrollmentPathwayEventsTable)
      .where(eq(enrollmentPathwayEventsTable.enrollmentId,context.enrollment.id))
      .orderBy(desc(enrollmentPathwayEventsTable.sequence))
      .limit(1);
    const [created]=await tx.insert(enrollmentPathwayEventsTable).values({
      id:id("pathway-selection"),
      enrollmentId:context.enrollment.id,
      pathwayId:pathway.id,
      programId:context.program.id,
      sequence:(latestEvent?.sequence??0)+1,
      createdBy:context.learner.id,
    }).returning();
    return created;
  });
  res.status(201).json(SelectLearnerPathwayResponse.parse({pathway:{id:pathway.id,name:pathway.name,type:pathway.type,outcome:pathway.outcome},programId:pathway.programId,selectedAt:event.createdAt}));
});
router.post("/evidence",async(req,res):Promise<void>=>{
  const parsed=CreateEvidenceBody.safeParse(req.body);if(!parsed.success){bad(req,res,parsed.error.message);return;}
  const task=await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id,parsed.data.taskId)).then(x=>x[0]);
  if(!task || task.moduleId!==parsed.data.moduleId){res.status(404).json({error:"Practice task not found for module"});return;}
  const context=await learnerContext();
  const record={id:id("evidence"),learnerId:DEMO_LEARNER,pathwayId:context.pathway.id,...parsed.data,createdBy:DEMO_LEARNER};
  await db.insert(evidenceTable).values(record);
  await db.insert(evidenceReviewsTable).values({id:id("evidence-review"),evidenceId:record.id,status:"Under review",quality:{valid:false,relevant:false,sufficient:false,traceable:false},createdBy:DEMO_LEARNER});
  const created=(await evidenceRecords()).find(e=>e.id===record.id); res.status(201).json(CreateEvidenceResponse.parse(created));
});
router.post("/practice/tasks/:taskId/attempts",async(req,res):Promise<void>=>{
  const params=CreatePracticeAttemptParams.safeParse(req.params), body=CreatePracticeAttemptBody.safeParse(req.body);
  if(!params.success){bad(req,res,params.error.message);return;}if(!body.success){bad(req,res,body.error.message);return;}
  const [task]=await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id,params.data.taskId));if(!task){res.status(404).json({error:"Practice task not found"});return;}
  const context=await learnerContext();
  const row={id:id("practice"),taskId:task.id,learnerId:DEMO_LEARNER,pathwayId:context.pathway.id,...body.data,status:"Submitted",createdBy:DEMO_LEARNER};
  await db.insert(practiceAttemptsTable).values(row);res.status(201).json(CreatePracticeAttemptResponse.parse({id:row.id,taskId:row.taskId,submittedAt:new Date(),status:row.status,reflection:row.reflection,outputSummary:row.outputSummary,feedback:null}));
});
router.get("/gaps",async(_req,res):Promise<void>=>{res.json(ListGapsResponse.parse(await gapRecords()));});
router.get("/remediation",async(_req,res):Promise<void>=>{res.json(ListRemediationResponse.parse(await remediationRecords()));});
router.post("/remediation/:remediationId/complete",async(req,res):Promise<void>=>{
  const parsed=CompleteRemediationParams.safeParse(req.params);if(!parsed.success){bad(req,res,parsed.error.message);return;}
  const plans=await remediationRecords(), plan=plans.find(p=>p.id===parsed.data.remediationId);if(!plan){res.status(404).json({error:"Remediation plan not found"});return;}
  for(const activity of plan.activities) if(activity.status!=="Completed") await db.insert(remediationEventsTable).values({id:id("remediation-event"),activityId:activity.id,status:"Completed",createdBy:DEMO_LEARNER});
  const updated=(await remediationRecords()).find(p=>p.id===plan.id);res.json(CompleteRemediationResponse.parse(updated));
});
router.get("/readiness",async(_req,res):Promise<void>=>{res.json(GetLearnerReadinessResponse.parse(await readiness()));});
router.get("/learner/journey",async(_req,res):Promise<void>=>{const [{steps},r]=await Promise.all([pathwayTimeline(),readiness()]);res.json(GetLearnerJourneyResponse.parse([...steps,{id:"journey-safety",label:"Safety foundation",description:"M03 critical safety criteria passed.",status:"Complete",date:new Date("2025-02-14T10:00:00Z"),href:"/assessments/assessment-m03"},{id:"journey-current",label:"Current gate",description:r.currentGate.requirement,status:r.status,date:null,href:"/readiness"}]));});
router.get("/learner/learning-plan",async(_req,res):Promise<void>=>{const [context,{modules}]=await Promise.all([learnerContext(),catalogue()]), p=await progressByModule(context.pathway.id);res.json(GetLearnerLearningPlanResponse.parse(modules.filter(m=>p(m.id).progress<100).sort((a,b)=>a.sequence-b.sequence).map((m,i)=>({id:`plan-${m.id}`,module:moduleSummary(m,p(m.id).progress,p(m.id).status),priority:i===0?"High":"Normal",reason:"Continue pathway learning.",estimatedMinutes:90,status:p(m.id).status}))));});
router.get("/learner/dashboard",async(_req,res):Promise<void>=>{const [context,{modules,tasks}]=await Promise.all([learnerContext(),catalogue()]);const [r,gaps,evidence,p]=await Promise.all([readiness(context),gapRecords(context.pathway.id),evidenceRecords(context.pathway.id),progressByModule(context.pathway.id)]);const {learner,program,pathway}=context,current=modules.sort((a,b)=>a.sequence-b.sequence).find(m=>p(m.id).progress<100)??modules[0], task=tasks.find(t=>t.moduleId===current.id)??tasks[0];res.json(GetLearnerDashboardResponse.parse({learner,program:{...program,moduleCount:modules.length,learnerCount:1},pathway,capabilityProgress:Math.round(modules.reduce((sum,m)=>sum+p(m.id).progress,0)/modules.length),readiness:r,currentLearning:moduleSummary(current,p(current.id).progress,p(current.id).status),currentPractice:{...task,status:"Available"},mainGap:gaps.find(g=>g.status!=="Resolved")??null,evidenceCounts:{total:evidence.length,valid:evidence.filter(e=>e.status==="Valid").length,underReview:evidence.filter(e=>e.status==="Under review").length,needsRevision:evidence.filter(e=>e.status==="Needs revision").length},nextAction:{title:`Continue ${current.code}`,description:"Continue your active pathway learning.",href:`/modules/${current.id}`,priority:"High"}}));});
router.get("/passport",async(_req,res):Promise<void>=>{const [timeline,attempts,pathways]=await Promise.all([pathwayTimeline(),db.select().from(assessmentAttemptsTable).where(and(eq(assessmentAttemptsTable.learnerId,DEMO_LEARNER),eq(assessmentAttemptsTable.decision,"Competent"))),db.select().from(pathwaysTable)]);const {learner,program}=timeline.context,r=await readiness(timeline.context),pathwayMap=new Map(pathways.map(item=>[item.id,item]));const m03=attempts.find(attempt=>attempt.assessmentId==="assessment-m03");const achievement=m03?{id:"achievement-m03",capability:"Electrical safety",level:"Verified",program:program.name,pathway:pathwayMap.get(m03.pathwayId)?.name??"Unknown pathway",achievedAt:m03.createdAt,evidenceCount:(await evidenceRecords(m03.pathwayId)).filter(e=>e.moduleId==="m03").length,status:"Achieved" as const}:null;res.json(GetCapabilityPassportResponse.parse({learner,headline:"Solar PV Technician capability passport",subtitle:"A longitudinal record of verified practice and readiness.",readiness:r,achievements:achievement?[achievement]:[],timeline:timeline.steps}));});
export default router;