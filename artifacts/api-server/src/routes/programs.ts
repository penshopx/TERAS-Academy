import { Router, type IRouter } from "express";
import { GetModuleParams, GetModuleResponse, GetProgramParams, GetProgramResponse, ListPracticeTasksResponse, ListProgramsResponse } from "@workspace/api-zod";
import { catalogue, moduleSummary, progressByModule, assessmentSummary } from "../lib/teras";

const router: IRouter = Router();
router.get("/programs", async (req, res): Promise<void> => {
  req.log.info("Listing programs");
  const { programs, modules } = await catalogue();
  res.json(ListProgramsResponse.parse(programs.map(p => ({...p,moduleCount:modules.filter(m=>m.programId===p.id).length,learnerCount:p.id==="solar-pv-tech"?1:0}))));
});
router.get("/programs/:programId", async (req,res): Promise<void> => {
  const parsed=GetProgramParams.safeParse(req.params); if(!parsed.success){req.log.warn("Invalid program id");res.status(400).json({error:parsed.error.message});return;}
  const {programs,paths,modules}=await catalogue(), program=programs.find(p=>p.id===parsed.data.programId);
  if(!program){res.status(404).json({error:"Program not found"});return;}
  const progress=await progressByModule();
  res.json(GetProgramResponse.parse({...program,moduleCount:modules.filter(m=>m.programId===program.id).length,learnerCount:1,pathways:paths.filter(p=>p.programId===program.id).map(({id,name,type,outcome})=>({id,name,type,outcome})),modules:modules.filter(m=>m.programId===program.id).sort((a,b)=>a.sequence-b.sequence).map(m=>moduleSummary(m,progress(m.id).progress,progress(m.id).status))}));
});
router.get("/modules/:moduleId", async(req,res):Promise<void>=>{
  const parsed=GetModuleParams.safeParse(req.params);if(!parsed.success){res.status(400).json({error:parsed.error.message});return;}
  const {modules,tasks,requirements,assessments}=await catalogue(), module=modules.find(m=>m.id===parsed.data.moduleId);
  if(!module){res.status(404).json({error:"Module not found"});return;}
  const progress=await progressByModule(), assessment=assessments.find(a=>a.moduleId===module.id);
  if(!assessment){res.status(404).json({error:"Module assessment not found"});return;}
  res.json(GetModuleResponse.parse({module:moduleSummary(module,progress(module.id).progress,progress(module.id).status),learningOutcomes:module.learningOutcomes,theory:module.theory,practiceTasks:tasks.filter(t=>t.moduleId===module.id).map(t=>({...t,status:"Available"})),assessment:await assessmentSummary(assessment),evidenceRequirement:requirements.find(r=>r.moduleId===module.id)}));
});
router.get("/practice/tasks",async(req,res):Promise<void>=>{req.log.info("Listing practice tasks");const {tasks}=await catalogue();res.json(ListPracticeTasksResponse.parse(tasks.map(t=>({...t,status:"Available"}))));});
export default router;