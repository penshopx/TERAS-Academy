import { Router, type IRouter } from "express";
import { CreateEvidenceBody, CreateEvidenceResponse, CreatePracticeAttemptBody, CreatePracticeAttemptParams, CreatePracticeAttemptResponse, GetCapabilityPassportResponse, GetLearnerDashboardResponse, GetLearnerJourneyResponse, GetLearnerLearningPlanResponse, GetLearnerReadinessResponse, ListEvidenceResponse, ListGapsResponse, ListRemediationResponse, CompleteRemediationParams, CompleteRemediationResponse } from "@workspace/api-zod";
import { db, evidenceReviewsTable, evidenceTable, practiceAttemptsTable, practiceTasksTable, remediationActivitiesTable, remediationEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { catalogue, DEMO_LEARNER, evidenceRecords, gapRecords, learnerContext, moduleSummary, progressByModule, readiness, remediationRecords } from "../lib/teras";
const router: IRouter=Router(); const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
function bad(req:any,res:any,error:string){req.log.warn({error},"Invalid request");res.status(400).json({error});}
router.get("/evidence",async(req,res):Promise<void>=>{req.log.info("Listing evidence");res.json(ListEvidenceResponse.parse(await evidenceRecords()));});
router.post("/evidence",async(req,res):Promise<void>=>{
  const parsed=CreateEvidenceBody.safeParse(req.body);if(!parsed.success){bad(req,res,parsed.error.message);return;}
  const task=await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id,parsed.data.taskId)).then(x=>x[0]);
  if(!task || task.moduleId!==parsed.data.moduleId){res.status(404).json({error:"Practice task not found for module"});return;}
  const record={id:id("evidence"),learnerId:DEMO_LEARNER,...parsed.data,createdBy:DEMO_LEARNER};
  await db.insert(evidenceTable).values(record);
  await db.insert(evidenceReviewsTable).values({id:id("evidence-review"),evidenceId:record.id,status:"Under review",quality:{valid:false,relevant:false,sufficient:false,traceable:false},createdBy:DEMO_LEARNER});
  const created=(await evidenceRecords()).find(e=>e.id===record.id); res.status(201).json(CreateEvidenceResponse.parse(created));
});
router.post("/practice/tasks/:taskId/attempts",async(req,res):Promise<void>=>{
  const params=CreatePracticeAttemptParams.safeParse(req.params), body=CreatePracticeAttemptBody.safeParse(req.body);
  if(!params.success){bad(req,res,params.error.message);return;}if(!body.success){bad(req,res,body.error.message);return;}
  const [task]=await db.select().from(practiceTasksTable).where(eq(practiceTasksTable.id,params.data.taskId));if(!task){res.status(404).json({error:"Practice task not found"});return;}
  const row={id:id("practice"),taskId:task.id,learnerId:DEMO_LEARNER,...body.data,status:"Submitted",createdBy:DEMO_LEARNER};
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
router.get("/learner/journey",async(_req,res):Promise<void>=>{const r=await readiness();res.json(GetLearnerJourneyResponse.parse([{id:"journey-enrol",label:"Enrolled",description:"Joined the Solar PV Technician pathway.",status:"Complete",date:new Date("2025-01-06T09:00:00Z"),href:"/programs/solar-pv-tech"},{id:"journey-safety",label:"Safety foundation",description:"M03 critical safety criteria passed.",status:"Complete",date:new Date("2025-02-14T10:00:00Z"),href:"/assessments/assessment-m03"},{id:"journey-current",label:"Current gate",description:r.currentGate.requirement,status:r.status,date:null,href:"/readiness"}]));});
router.get("/learner/learning-plan",async(_req,res):Promise<void>=>{const {modules}=await catalogue(), p=await progressByModule();res.json(GetLearnerLearningPlanResponse.parse(modules.filter(m=>p(m.id).progress<100).sort((a,b)=>a.sequence-b.sequence).map((m,i)=>({id:`plan-${m.id}`,module:moduleSummary(m,p(m.id).progress,p(m.id).status),priority:i===0?"High":"Normal",reason:m.id==="m07"?"Resolve commissioning evidence gap.":"Continue pathway learning.",estimatedMinutes:90,status:p(m.id).status}))));});
router.get("/learner/dashboard",async(_req,res):Promise<void>=>{const [{learner,program,pathway},r,{modules,tasks},gaps,evidence]=await Promise.all([learnerContext(),readiness(),catalogue(),gapRecords(),evidenceRecords()]);const p=await progressByModule(), current=modules.find(m=>m.id==="m07")??modules[0], task=tasks.find(t=>t.moduleId===current.id)??tasks[0];res.json(GetLearnerDashboardResponse.parse({learner,program:{...program,moduleCount:modules.length,learnerCount:1},pathway,capabilityProgress:Math.round(modules.reduce((sum,m)=>sum+p(m.id).progress,0)/modules.length),readiness:r,currentLearning:moduleSummary(current,p(current.id).progress,p(current.id).status),currentPractice:{...task,status:"Available"},mainGap:gaps.find(g=>g.status!=="Resolved")??null,evidenceCounts:{total:evidence.length,valid:evidence.filter(e=>e.status==="Valid").length,underReview:evidence.filter(e=>e.status==="Under review").length,needsRevision:evidence.filter(e=>e.status==="Needs revision").length},nextAction:{title:"Complete commissioning review",description:"Submit the M07 commissioning record for review.",href:"/modules/m07",priority:"High"}}));});
router.get("/passport",async(_req,res):Promise<void>=>{const [{learner,program,pathway},r,evidence]=await Promise.all([learnerContext(),readiness(),evidenceRecords()]);res.json(GetCapabilityPassportResponse.parse({learner,headline:"Solar PV Technician capability passport",subtitle:"A longitudinal record of verified practice and readiness.",readiness:r,achievements:[{id:"achievement-m03",capability:"Electrical safety",level:"Verified",program:program.name,pathway:pathway.name,achievedAt:new Date("2025-02-14T10:00:00Z"),evidenceCount:evidence.filter(e=>e.moduleId==="m03").length,status:"Achieved"}],timeline:[{id:"passport-enrol",label:"Pathway started",description:"Enrolled on Path A.",status:"Complete",date:new Date("2025-01-06T09:00:00Z"),href:"/learner/journey"}]}));});
export default router;