import { db, peopleTable, programsTable, pathwaysTable, modulesTable, practiceTasksTable, evidenceRequirementsTable, assessmentsTable, assessmentCriteriaTable, enrollmentsTable, evidenceTable, evidenceReviewsTable, assessmentAttemptsTable, criterionObservationsTable, gapsTable, gapEventsTable, remediationPlansTable, remediationActivitiesTable, remediationEventsTable, readinessGatesTable, readinessEventsTable, coursesTable, courseModulesTable, lessonsTable, learningActivitiesTable, contentResourcesTable, learningOutcomesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const now = new Date("2025-02-14T10:00:00.000Z");
const includeDemoFixtures = process.argv.includes("--demo") || process.env.TERAS_ENABLE_DEMO_FIXTURES === "1";
const productionLike = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
const modules = [
  ["m01","path-a","M01","PV foundations","System fundamentals"], ["m02","path-a","M02","Site assessment","Survey and shading"],
  ["m03","path-a","M03","Electrical safety","Safe isolation and verification"], ["m04","path-a","M04","Array design","PV array configuration"],
  ["m05","path-a","M05","Mounting systems","Mechanical installation"], ["m06","path-a","M06","DC installation","Cabling and protection"],
  ["m07","path-a","M07","Inverter commissioning","Commissioning and test"], ["m08","path-a","M08","Monitoring","Performance monitoring"],
  ["m09","path-a","M09","Fault finding","Diagnosis and rectification"], ["m10","path-a","M10","Handover","Customer handover"],
];

const pathBModules = [
  ["b01","path-b","B01","Client brief","Translate client needs into design constraints"],
  ["b02","path-b","B02","Site and yield analysis","Model site conditions and expected yield"],
  ["b03","path-b","B03","System sizing","Select and justify system capacity"],
  ["b04","path-b","B04","Electrical design","Specify protection, cable sizing, and schematics"],
  ["b05","path-b","B05","Structural design","Assure mounting and roof interface design"],
  ["b06","path-b","B06","Performance modelling","Forecast performance and financial return"],
  ["b07","path-b","B07","Design assurance","Review risks, standards, and design decisions"],
  ["b08","path-b","B08","Design pack","Produce a traceable client-ready design pack"],
];
async function seed(): Promise<void> {
  if (productionLike && includeDemoFixtures) {
    throw new Error("Refusing to seed TERAS demo learner fixtures in a production environment");
  }
  await db.transaction(async tx => {
  const insert = async (table: any, values: any[]) => tx.insert(table).values(values).onConflictDoNothing();
  if (includeDemoFixtures) {
    await insert(peopleTable, [
    { id:"learner-demo", name:"Demo Learner", initials:"DL", email:"learner@teras.academy", role:"Solar PV Technician", organization:"TERAS Academy" },
    { id:"trainer-aria", name:"Aria Trainer", initials:"AT", role:"Trainer", organization:"TERAS Academy" },
    { id:"assessor-sam", name:"Sam Assessor", initials:"SA", role:"Assessor", organization:"TERAS Academy" },
    ]);
    await tx.update(peopleTable).set({email:"learner@teras.academy"}).where(eq(peopleTable.id,"learner-demo"));
  }
  await insert(programsTable, [{ id:"solar-pv-tech", domain:"Renewable Energy", name:"Solar PV Technician", description:"Capability pathway for safe residential Solar PV installation.", status:"Active" }]);
  await insert(pathwaysTable, [
    {id:"path-a",programId:"solar-pv-tech",name:"Path A — Installation",type:"Primary",outcome:"Install and commission residential PV systems"},
    {id:"path-b",programId:"solar-pv-tech",name:"Path B — Design",type:"Operational",outcome:"Design, model, and assure residential PV systems"},
  ]);
  await tx.update(pathwaysTable).set({type:"Operational",outcome:"Design, model, and assure residential PV systems"}).where(eq(pathwaysTable.id,"path-b"));
  await insert(modulesTable, [...modules, ...pathBModules].map(([id, pathwayId, code, name, capability], i) => ({id, programId:"solar-pv-tech", pathwayId, sequence:i < modules.length ? i+1 : i - modules.length + 1, code, name, capability, evidence:`${code} practical evidence`, learningOutcomes:[`Apply ${name.toLowerCase()} procedures`], theory:[`${name} guide`]})));
  await insert(coursesTable, [
    {id:"course-solar-installation",programId:"solar-pv-tech",pathwayId:"path-a",code:"SPV-INSTALL",title:"Solar PV Installation Learning Core",description:"Learning preparation linked to the existing installation capability pathway.",status:"PUBLISHED",sequence:1},
    {id:"course-solar-design",programId:"solar-pv-tech",pathwayId:"path-b",code:"SPV-DESIGN",title:"Solar PV Design Learning Core",description:"Learning preparation linked to the existing design capability pathway.",status:"PUBLISHED",sequence:1},
  ]);
  await insert(courseModulesTable, [
    {id:"course-module-m03",courseId:"course-solar-installation",moduleId:"m03",programId:"solar-pv-tech",pathwayId:"path-a",sequence:1},
    {id:"course-module-b04",courseId:"course-solar-design",moduleId:"b04",programId:"solar-pv-tech",pathwayId:"path-b",sequence:1},
  ]);
  await insert(lessonsTable, [
    {id:"lesson-m03-isolation",courseModuleId:"course-module-m03",programId:"solar-pv-tech",pathwayId:"path-a",title:"Safe isolation foundations",description:"Prepare for supervised safe isolation practice.",sequence:1,status:"PUBLISHED",estimatedDurationMinutes:25},
    {id:"lesson-b04-protection",courseModuleId:"course-module-b04",programId:"solar-pv-tech",pathwayId:"path-b",title:"Electrical protection design",description:"Prepare a defensible protection design before practice.",sequence:1,status:"PUBLISHED",estimatedDurationMinutes:30},
  ]);
  await insert(learningActivitiesTable, [
    {id:"activity-m03-safe-isolation",lessonId:"lesson-m03-isolation",programId:"solar-pv-tech",pathwayId:"path-a",type:"READING",title:"Safe isolation sequence",description:"Study the safe isolation and proving sequence before supervised practice.",sequence:1,required:true,estimatedDurationMinutes:15,status:"PUBLISHED"},
    {id:"activity-b04-protection",lessonId:"lesson-b04-protection",programId:"solar-pv-tech",pathwayId:"path-b",type:"ASSIGNMENT",title:"Protection selection rationale",description:"Prepare the design rationale for protection selection.",sequence:1,required:true,estimatedDurationMinutes:20,status:"PUBLISHED"},
  ]);
  await insert(contentResourcesTable, [
    {id:"resource-m03-isolation",activityId:"activity-m03-safe-isolation",type:"TEXT",title:"Safe isolation learning note",content:"Learning guidance only. Performance must still be practiced, evidenced, reviewed, and reassessed.",sequence:1},
    {id:"resource-b04-protection",activityId:"activity-b04-protection",type:"TEXT",title:"Protection design learning note",content:"Learning guidance only. Design capability still requires traceable practice and evidence.",sequence:1},
  ]);
  await insert(learningOutcomesTable, [
    {id:"outcome-m03-sequence",activityId:"activity-m03-safe-isolation",capabilityModuleId:"m03",description:"Explain the safe isolation and proving sequence.",verificationMethod:"TRAINER_REVIEW",required:true},
    {id:"outcome-b04-protection",activityId:"activity-b04-protection",capabilityModuleId:"b04",description:"Explain and justify protection selection.",verificationMethod:"TRAINER_REVIEW",required:true},
  ]);
  await insert(practiceTasksTable, [...modules, ...pathBModules].map(([id, pathwayId, code, name], i) => ({id:`task-${id}`,moduleId:id,title:`${name} ${pathwayId === "path-b" ? "design exercise" : "practical"}`,description:`Complete the ${name.toLowerCase()} supervised exercise.`,mode:i===2 || pathwayId === "path-b" ? "Workshop":"Guided practice",durationMinutes:pathwayId === "path-b" ? 60 : 45,output:pathwayId === "path-b" ? "Traceable design work record":"Supervisor-ready work record",safetyNote:id==="m03"?"Safe isolation procedure is mandatory.":null})));
  await insert(evidenceRequirementsTable, [...modules, ...pathBModules].map(([id, pathwayId, code, name]) => ({id:`req-${id}`,moduleId:id,code:`EV-${code}`,name:`${name} evidence`,description:`Traceable evidence for ${name}.`,allowedTypes:pathwayId === "path-b" ? ["Design brief","Calculation","Drawing","Report"] : ["Photo","Checklist","Report"]})));
  const assessmentGates: Record<string, string> = {m03:"G1",m07:"G2",b01:"B1",b02:"B2",b03:"B2",b04:"B2",b05:"B2",b06:"B2",b07:"B3",b08:"B4"};
  await insert(assessmentsTable, [...modules, ...pathBModules].map(([id, pathwayId, code]) => ({id:`assessment-${id}`,moduleId:id,name:`${code} ${pathwayId === "path-b" ? "design assessment" : "practical assessment"}`,gateCode:assessmentGates[id]})));
  for (const [moduleId, gateCode] of Object.entries(assessmentGates)) {
    await tx.update(assessmentsTable).set({ gateCode }).where(eq(assessmentsTable.id, `assessment-${moduleId}`));
  }
  await insert(assessmentCriteriaTable, [
    {id:"crit-m03-isolation",assessmentId:"assessment-m03",code:"SAFE-01",label:"Proves safe isolation",layer:"Safety",critical:true},
    {id:"crit-m03-test",assessmentId:"assessment-m03",code:"SAFE-02",label:"Selects and proves test equipment",layer:"Safety",critical:true},
    {id:"crit-m07-commission",assessmentId:"assessment-m07",code:"TECH-01",label:"Completes commissioning sequence",layer:"Technical",critical:false},
    {id:"crit-m07-results",assessmentId:"assessment-m07",code:"TECH-02",label:"Records test results",layer:"Evidence",critical:false},
    {id:"crit-b02-yield",assessmentId:"assessment-b02",code:"DES-01",label:"Builds a traceable yield model",layer:"Technical",critical:false},
    {id:"crit-b02-assumptions",assessmentId:"assessment-b02",code:"DES-02",label:"Explains design assumptions",layer:"Evidence",critical:false},
    {id:"crit-b01-brief",assessmentId:"assessment-b01",code:"DES-BRIEF-01",label:"Captures client needs and constraints",layer:"Evidence",critical:false},
    {id:"crit-b01-scope",assessmentId:"assessment-b01",code:"DES-BRIEF-02",label:"Defines a viable design scope",layer:"Technical",critical:false},
    {id:"crit-b03-sizing",assessmentId:"assessment-b03",code:"DES-SIZE-01",label:"Justifies system capacity",layer:"Technical",critical:false},
    {id:"crit-b03-components",assessmentId:"assessment-b03",code:"DES-SIZE-02",label:"Selects compatible components",layer:"Technical",critical:false},
    {id:"crit-b04-protection",assessmentId:"assessment-b04",code:"DES-03",label:"Specifies appropriate electrical protection",layer:"Safety",critical:true},
    {id:"crit-b04-schematic",assessmentId:"assessment-b04",code:"DES-04",label:"Produces a coherent electrical schematic",layer:"Technical",critical:false},
    {id:"crit-b05-loads",assessmentId:"assessment-b05",code:"DES-STRUCT-01",label:"Checks structural loads and interfaces",layer:"Safety",critical:false},
    {id:"crit-b05-detail",assessmentId:"assessment-b05",code:"DES-STRUCT-02",label:"Documents mounting details",layer:"Evidence",critical:false},
    {id:"crit-b06-model",assessmentId:"assessment-b06",code:"DES-PERF-01",label:"Builds a defensible performance model",layer:"Technical",critical:false},
    {id:"crit-b06-return",assessmentId:"assessment-b06",code:"DES-PERF-02",label:"Explains forecast return and sensitivity",layer:"Evidence",critical:false},
    {id:"crit-b07-review",assessmentId:"assessment-b07",code:"DES-05",label:"Identifies and resolves design risks",layer:"Assurance",critical:true},
    {id:"crit-b07-standards",assessmentId:"assessment-b07",code:"DES-06",label:"References applicable standards",layer:"Assurance",critical:false},
    {id:"crit-b08-pack",assessmentId:"assessment-b08",code:"DES-PACK-01",label:"Produces a complete design pack",layer:"Evidence",critical:false},
    {id:"crit-b08-trace",assessmentId:"assessment-b08",code:"DES-PACK-02",label:"Maintains traceability from brief to handover",layer:"Assurance",critical:false},
  ]);
  if (includeDemoFixtures) {
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
  }
  await insert(readinessGatesTable, [
    {id:"gate-g1",programId:"solar-pv-tech",pathwayId:"path-a",sequence:1,code:"G1",name:"Safety foundation",requirement:"Pass critical M03 safety criteria.",assessmentMode:"Mapped",evidenceMode:"None"},
    {id:"gate-g2",programId:"solar-pv-tech",pathwayId:"path-a",sequence:2,code:"G2",name:"Technical commissioning",requirement:"Valid commissioning evidence and no open critical gaps.",assessmentMode:"Mapped",evidenceMode:"Mapped"},
    {id:"gate-g3",programId:"solar-pv-tech",pathwayId:"path-a",sequence:3,code:"G3",name:"Work-ready",requirement:"All modules and evidence complete.",assessmentMode:"All",evidenceMode:"All"},
    {id:"gate-b1",programId:"solar-pv-tech",pathwayId:"path-b",sequence:1,code:"B1",name:"Design brief",requirement:"Translate the client brief into traceable design constraints.",assessmentMode:"Mapped",evidenceMode:"None"},
    {id:"gate-b2",programId:"solar-pv-tech",pathwayId:"path-b",sequence:2,code:"B2",name:"System design",requirement:"Complete sizing, yield, electrical, and structural design evidence.",assessmentMode:"Mapped",evidenceMode:"Mapped"},
    {id:"gate-b3",programId:"solar-pv-tech",pathwayId:"path-b",sequence:3,code:"B3",name:"Design assurance",requirement:"Pass the B07 design assurance assessment with no critical failures.",assessmentMode:"Mapped",evidenceMode:"None"},
    {id:"gate-b4",programId:"solar-pv-tech",pathwayId:"path-b",sequence:4,code:"B4",name:"Design-ready",requirement:"All Path B modules, evidence, and the client-ready design pack are complete.",assessmentMode:"All",evidenceMode:"All"},
  ]);
  for (const id of ["gate-g1", "gate-b1", "gate-b3"]) {
    await tx.update(readinessGatesTable).set({ assessmentMode:"Mapped", evidenceMode:"None" }).where(eq(readinessGatesTable.id, id));
  }
  for (const id of ["gate-g2", "gate-b2"]) {
    await tx.update(readinessGatesTable).set({ assessmentMode:"Mapped", evidenceMode:"Mapped" }).where(eq(readinessGatesTable.id, id));
  }
  for (const id of ["gate-g3", "gate-b4"]) {
    await tx.update(readinessGatesTable).set({ assessmentMode:"All", evidenceMode:"All" }).where(eq(readinessGatesTable.id, id));
  }
  if (includeDemoFixtures) {
    await insert(readinessEventsTable, [{id:"ready-demo-g1",enrollmentId:"enrol-demo",pathwayId:"path-a",gateId:"gate-g1",status:"Passed",score:55,blockers:[],createdAt:now},{id:"ready-demo-g2",enrollmentId:"enrol-demo",pathwayId:"path-a",gateId:"gate-g2",status:"In progress",score:55,blockers:["Commissioning evidence review pending"],createdAt:now}]);
  }
  });
}
seed().then(() => process.stdout.write(`TERAS ${includeDemoFixtures ? "catalogue + demo" : "catalogue"} seed complete\n`)).catch((error: unknown) => { process.stderr.write(`${error}\n`); process.exitCode = 1; });
