import { db, peopleTable, programsTable, pathwaysTable, modulesTable, practiceTasksTable, evidenceRequirementsTable, assessmentsTable, assessmentCriteriaTable, enrollmentsTable, evidenceTable, evidenceReviewsTable, assessmentAttemptsTable, criterionObservationsTable, gapsTable, gapEventsTable, remediationPlansTable, remediationActivitiesTable, remediationEventsTable, readinessGatesTable, readinessEventsTable } from "@workspace/db";

const insert = async (table: any, values: any[]) => db.insert(table).values(values).onConflictDoNothing();
const now = new Date("2025-02-14T10:00:00.000Z");
const modules = [
  ["m01","M01","PV foundations","System fundamentals"], ["m02","M02","Site assessment","Survey and shading"],
  ["m03","M03","Electrical safety","Safe isolation and verification"], ["m04","M04","Array design","PV array configuration"],
  ["m05","M05","Mounting systems","Mechanical installation"], ["m06","M06","DC installation","Cabling and protection"],
  ["m07","M07","Inverter commissioning","Commissioning and test"], ["m08","M08","Monitoring","Performance monitoring"],
  ["m09","M09","Fault finding","Diagnosis and rectification"], ["m10","M10","Handover","Customer handover"],
];
async function seed(): Promise<void> {
  await insert(peopleTable, [
    { id:"learner-demo", name:"Demo Learner", initials:"DL", role:"Solar PV Technician", organization:"TERAS Academy" },
    { id:"trainer-aria", name:"Aria Trainer", initials:"AT", role:"Trainer", organization:"TERAS Academy" },
    { id:"assessor-sam", name:"Sam Assessor", initials:"SA", role:"Assessor", organization:"TERAS Academy" },
  ]);
  await insert(programsTable, [{ id:"solar-pv-tech", domain:"Renewable Energy", name:"Solar PV Technician", description:"Capability pathway for safe residential Solar PV installation.", status:"Active" }]);
  await insert(pathwaysTable, [
    {id:"path-a",programId:"solar-pv-tech",name:"Path A — Installation",type:"Primary",outcome:"Install and commission residential PV systems"},
  ]);
  const pathB={id:"path-b",programId:"solar-pv-tech",name:"Path B — Design",type:"Secondary",outcome:"Design and assure PV systems"};
  await db.insert(pathwaysTable).values(pathB).onConflictDoUpdate({target:pathwaysTable.id,set:pathB});
  await insert(modulesTable, modules.map(([id, code, name, capability], i) => ({id, programId:"solar-pv-tech", sequence:i+1, code, name, capability, evidence:`${code} practical evidence`, learningOutcomes:[`Apply ${name.toLowerCase()} procedures`], theory:[`${name} guide`]})));
  await insert(practiceTasksTable, modules.map(([id,,name], i) => ({id:`task-${id}`,moduleId:id,title:`${name} practical`,description:`Complete the ${name.toLowerCase()} supervised exercise.`,mode:i===2?"Workshop":"Guided practice",durationMinutes:45,output:"Supervisor-ready work record",safetyNote:i===2?"Safe isolation procedure is mandatory.":null})));
  await insert(evidenceRequirementsTable, modules.map(([id, code, name]) => ({id:`req-${id}`,moduleId:id,code:`EV-${code}`,name:`${name} evidence`,description:`Traceable evidence for ${name}.`,allowedTypes:["Photo","Checklist","Report"]})));
  await insert(assessmentsTable, modules.map(([id, code]) => ({id:`assessment-${id}`,moduleId:id,name:`${code} practical assessment`})));
  await insert(assessmentCriteriaTable, [
    {id:"crit-m03-isolation",assessmentId:"assessment-m03",code:"SAFE-01",label:"Proves safe isolation",layer:"Safety",critical:true},
    {id:"crit-m03-test",assessmentId:"assessment-m03",code:"SAFE-02",label:"Selects and proves test equipment",layer:"Safety",critical:true},
    {id:"crit-m07-commission",assessmentId:"assessment-m07",code:"TECH-01",label:"Completes commissioning sequence",layer:"Technical",critical:false},
    {id:"crit-m07-results",assessmentId:"assessment-m07",code:"TECH-02",label:"Records test results",layer:"Evidence",critical:false},
  ]);
  await insert(enrollmentsTable, [{id:"enrol-demo",learnerId:"learner-demo",programId:"solar-pv-tech",pathwayId:"path-a",trainerId:"trainer-aria",assessorId:"assessor-sam"}]);
  await insert(evidenceTable, [
    {id:"evidence-m03",learnerId:"learner-demo",pathwayId:"path-a",moduleId:"m03",taskId:"task-m03",title:"Safe isolation checklist",type:"Checklist",description:"Recorded safe isolation and proving sequence.",fileName:"m03-safe-isolation.pdf",createdAt:now},
    {id:"evidence-m07",learnerId:"learner-demo",pathwayId:"path-a",moduleId:"m07",taskId:"task-m07",title:"Commissioning test record",type:"Report",description:"Inverter commissioning values and checks.",fileName:"m07-commissioning.pdf",createdAt:now},
  ]);
  await insert(evidenceReviewsTable, [
    {id:"review-m03",evidenceId:"evidence-m03",reviewerId:"trainer-aria",status:"Valid",comment:"Clear traceable safety record.",quality:{valid:true,relevant:true,sufficient:true,traceable:true},createdAt:now},
    {id:"review-m07",evidenceId:"evidence-m07",reviewerId:"assessor-sam",status:"Under review",comment:null,quality:{valid:false,relevant:true,sufficient:false,traceable:true},createdAt:now},
  ]);
  await insert(assessmentAttemptsTable, [{id:"attempt-m03-1",assessmentId:"assessment-m03",learnerId:"learner-demo",pathwayId:"path-a",number:1,assessorId:"assessor-sam",status:"Completed",decision:"Competent",createdAt:now}]);
  await insert(criterionObservationsTable, [
    {id:"obs-m03-1",attemptId:"attempt-m03-1",criterionId:"crit-m03-isolation",score:3,observation:"Sequence completed without prompting.",evidenceId:"evidence-m03"},
    {id:"obs-m03-2",attemptId:"attempt-m03-1",criterionId:"crit-m03-test",score:3,observation:"Tester proven before and after use.",evidenceId:"evidence-m03"},
  ]);
  await insert(gapsTable, [{id:"gap-m07",learnerId:"learner-demo",pathwayId:"path-a",moduleId:"m07",capability:"Inverter commissioning",criterion:"TECH-02",severity:"Moderate",priority:"High",diagnosis:"Test record requires assessor confirmation.",gate:"G2",recommendedAction:"Complete guided commissioning review."}]);
  await insert(gapEventsTable, [{id:"gap-event-m07",gapId:"gap-m07",status:"Open"}]);
  await insert(remediationPlansTable, [{id:"rem-m07",gapId:"gap-m07",title:"Commissioning record reinforcement",description:"Review and resubmit a complete commissioning record.",dueLabel:"This week"}]);
  await insert(remediationActivitiesTable, [{id:"rem-act-m07",planId:"rem-m07",title:"Review commissioning checklist",description:"Work through the annotated checklist with trainer.",type:"Coaching"}]);
  await insert(remediationEventsTable, [{id:"rem-event-m07",activityId:"rem-act-m07",status:"Not started"}]);
  await insert(readinessGatesTable, [
    {id:"gate-g1",programId:"solar-pv-tech",sequence:1,code:"G1",name:"Safety foundation",requirement:"Pass critical M03 safety criteria."},
    {id:"gate-g2",programId:"solar-pv-tech",sequence:2,code:"G2",name:"Technical commissioning",requirement:"Valid commissioning evidence and no open critical gaps."},
    {id:"gate-g3",programId:"solar-pv-tech",sequence:3,code:"G3",name:"Work-ready",requirement:"All modules and evidence complete."},
  ]);
  await insert(readinessEventsTable, [{id:"ready-demo-g1",enrollmentId:"enrol-demo",pathwayId:"path-a",gateId:"gate-g1",status:"Passed",score:55,blockers:[],createdAt:now},{id:"ready-demo-g2",enrollmentId:"enrol-demo",pathwayId:"path-a",gateId:"gate-g2",status:"In progress",score:55,blockers:["Commissioning evidence review pending"],createdAt:now}]);
}
seed().then(() => process.stdout.write("TERAS seed complete\n")).catch((error: unknown) => { process.stderr.write(`${error}\n`); process.exitCode = 1; });