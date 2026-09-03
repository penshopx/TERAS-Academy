BEGIN;

ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS email text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teras_people_email_unique' AND contype = 'u'
  ) THEN
    IF to_regclass('public.teras_people_email_unique') IS NOT NULL THEN
      DROP INDEX teras_people_email_unique;
    END IF;
    ALTER TABLE teras_people
      ADD CONSTRAINT teras_people_email_unique UNIQUE (email);
  END IF;
END $$;
UPDATE teras_people
SET email = 'learner@teras.academy'
WHERE id = 'learner-demo' AND email IS NULL;

ALTER TABLE teras_modules ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_practice_attempts ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_evidence ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_assessment_attempts ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_gaps ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_readiness_gates ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_readiness_events ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_assessments ADD COLUMN IF NOT EXISTS gate_code text;
ALTER TABLE teras_readiness_gates ADD COLUMN IF NOT EXISTS assessment_mode text;
ALTER TABLE teras_readiness_gates ADD COLUMN IF NOT EXISTS evidence_mode text;

UPDATE teras_modules SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
UPDATE teras_practice_attempts pa
SET pathway_id = m.pathway_id
FROM teras_practice_tasks pt
JOIN teras_modules m ON m.id = pt.module_id
WHERE pa.task_id = pt.id AND pa.pathway_id IS NULL;
UPDATE teras_evidence e
SET pathway_id = m.pathway_id
FROM teras_modules m
WHERE e.module_id = m.id AND e.pathway_id IS NULL;
UPDATE teras_assessment_attempts aa
SET pathway_id = m.pathway_id
FROM teras_assessments a
JOIN teras_modules m ON m.id = a.module_id
WHERE aa.assessment_id = a.id AND aa.pathway_id IS NULL;
UPDATE teras_gaps g
SET pathway_id = COALESCE(m.pathway_id, 'path-a')
FROM teras_modules m
WHERE g.module_id = m.id AND g.pathway_id IS NULL;
UPDATE teras_gaps SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
UPDATE teras_readiness_gates SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
UPDATE teras_readiness_events re
SET pathway_id = rg.pathway_id
FROM teras_readiness_gates rg
WHERE re.gate_id = rg.id AND re.pathway_id IS NULL;

UPDATE teras_readiness_gates
SET assessment_mode = CASE WHEN code = 'G3' THEN 'All' ELSE 'Mapped' END
WHERE assessment_mode IS NULL;
UPDATE teras_readiness_gates
SET evidence_mode = CASE WHEN code = 'G2' THEN 'Mapped' WHEN code = 'G3' THEN 'All' ELSE 'None' END
WHERE evidence_mode IS NULL;

ALTER TABLE teras_modules ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_practice_attempts ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_evidence ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_assessment_attempts ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_gaps ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_readiness_gates ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_readiness_events ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_readiness_gates ALTER COLUMN assessment_mode SET NOT NULL;
ALTER TABLE teras_readiness_gates ALTER COLUMN evidence_mode SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teras_assessment_attempts_assessment_learner_pathway_number_unique
  ON teras_assessment_attempts (assessment_id, learner_id, pathway_id, number);

CREATE TABLE IF NOT EXISTS teras_enrollment_pathway_events (
  id text PRIMARY KEY,
  enrollment_id text NOT NULL REFERENCES teras_enrollments(id),
  pathway_id text NOT NULL REFERENCES teras_pathways(id),
  program_id text NOT NULL REFERENCES teras_programs(id),
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_enrollment_pathway_events_sequence_unique
  ON teras_enrollment_pathway_events (enrollment_id, sequence);

UPDATE teras_assessments SET gate_code = 'G1' WHERE id = 'assessment-m03';
UPDATE teras_assessments SET gate_code = 'G2' WHERE id = 'assessment-m07';

INSERT INTO teras_pathways (id, program_id, name, type, outcome)
VALUES (
  'path-b',
  'solar-pv-tech',
  'Path B — Design',
  'Operational',
  'Design, model, and assure residential PV systems'
)
ON CONFLICT (id) DO UPDATE SET
  program_id = EXCLUDED.program_id,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  outcome = EXCLUDED.outcome;

INSERT INTO teras_modules (
  id, program_id, pathway_id, sequence, code, name, capability, evidence,
  learning_outcomes, theory
)
VALUES
  ('b01','solar-pv-tech','path-b',1,'B01','Client brief','Translate client needs into design constraints','B01 practical evidence',ARRAY['Apply client brief procedures'],ARRAY['Client brief guide']),
  ('b02','solar-pv-tech','path-b',2,'B02','Site and yield analysis','Model site conditions and expected yield','B02 practical evidence',ARRAY['Apply site and yield analysis procedures'],ARRAY['Site and yield analysis guide']),
  ('b03','solar-pv-tech','path-b',3,'B03','System sizing','Select and justify system capacity','B03 practical evidence',ARRAY['Apply system sizing procedures'],ARRAY['System sizing guide']),
  ('b04','solar-pv-tech','path-b',4,'B04','Electrical design','Specify protection, cable sizing, and schematics','B04 practical evidence',ARRAY['Apply electrical design procedures'],ARRAY['Electrical design guide']),
  ('b05','solar-pv-tech','path-b',5,'B05','Structural design','Assure mounting and roof interface design','B05 practical evidence',ARRAY['Apply structural design procedures'],ARRAY['Structural design guide']),
  ('b06','solar-pv-tech','path-b',6,'B06','Performance modelling','Forecast performance and financial return','B06 practical evidence',ARRAY['Apply performance modelling procedures'],ARRAY['Performance modelling guide']),
  ('b07','solar-pv-tech','path-b',7,'B07','Design assurance','Review risks, standards, and design decisions','B07 practical evidence',ARRAY['Apply design assurance procedures'],ARRAY['Design assurance guide']),
  ('b08','solar-pv-tech','path-b',8,'B08','Design pack','Produce a traceable client-ready design pack','B08 practical evidence',ARRAY['Apply design pack procedures'],ARRAY['Design pack guide'])
ON CONFLICT (id) DO UPDATE SET
  program_id=EXCLUDED.program_id, pathway_id=EXCLUDED.pathway_id,
  sequence=EXCLUDED.sequence, code=EXCLUDED.code, name=EXCLUDED.name,
  capability=EXCLUDED.capability, evidence=EXCLUDED.evidence,
  learning_outcomes=EXCLUDED.learning_outcomes, theory=EXCLUDED.theory;

INSERT INTO teras_practice_tasks (
  id, module_id, title, description, mode, duration_minutes, output, safety_note
)
SELECT
  'task-' || id, id, name || ' design exercise',
  'Complete the ' || lower(name) || ' supervised exercise.',
  'Workshop', 60, 'Traceable design work record', NULL
FROM teras_modules WHERE pathway_id = 'path-b'
ON CONFLICT (id) DO UPDATE SET
  module_id=EXCLUDED.module_id, title=EXCLUDED.title,
  description=EXCLUDED.description, mode=EXCLUDED.mode,
  duration_minutes=EXCLUDED.duration_minutes, output=EXCLUDED.output;

INSERT INTO teras_evidence_requirements (
  id, module_id, code, name, description, allowed_types
)
SELECT
  'req-' || id, id, 'EV-' || code, name || ' evidence',
  'Traceable evidence for ' || name || '.',
  ARRAY['Design brief','Calculation','Drawing','Report']
FROM teras_modules WHERE pathway_id = 'path-b'
ON CONFLICT (id) DO UPDATE SET
  module_id=EXCLUDED.module_id, code=EXCLUDED.code, name=EXCLUDED.name,
  description=EXCLUDED.description, allowed_types=EXCLUDED.allowed_types;

INSERT INTO teras_assessments (id, module_id, name, gate_code)
VALUES
  ('assessment-b01','b01','B01 design assessment','B1'),
  ('assessment-b02','b02','B02 design assessment','B2'),
  ('assessment-b03','b03','B03 design assessment','B2'),
  ('assessment-b04','b04','B04 design assessment','B2'),
  ('assessment-b05','b05','B05 design assessment','B2'),
  ('assessment-b06','b06','B06 design assessment','B2'),
  ('assessment-b07','b07','B07 design assessment','B3'),
  ('assessment-b08','b08','B08 design assessment','B4')
ON CONFLICT (id) DO UPDATE SET
  module_id=EXCLUDED.module_id, name=EXCLUDED.name, gate_code=EXCLUDED.gate_code;

INSERT INTO teras_assessment_criteria (
  id, assessment_id, code, label, layer, critical
)
VALUES
  ('crit-b01-brief','assessment-b01','DES-BRIEF-01','Captures client needs and constraints','Evidence',false),
  ('crit-b01-scope','assessment-b01','DES-BRIEF-02','Defines a viable design scope','Technical',false),
  ('crit-b02-yield','assessment-b02','DES-01','Builds a traceable yield model','Technical',false),
  ('crit-b02-assumptions','assessment-b02','DES-02','Explains design assumptions','Evidence',false),
  ('crit-b03-sizing','assessment-b03','DES-SIZE-01','Justifies system capacity','Technical',false),
  ('crit-b03-components','assessment-b03','DES-SIZE-02','Selects compatible components','Technical',false),
  ('crit-b04-protection','assessment-b04','DES-03','Specifies appropriate electrical protection','Safety',true),
  ('crit-b04-schematic','assessment-b04','DES-04','Produces a coherent electrical schematic','Technical',false),
  ('crit-b05-loads','assessment-b05','DES-STRUCT-01','Checks structural loads and interfaces','Safety',false),
  ('crit-b05-detail','assessment-b05','DES-STRUCT-02','Documents mounting details','Evidence',false),
  ('crit-b06-model','assessment-b06','DES-PERF-01','Builds a defensible performance model','Technical',false),
  ('crit-b06-return','assessment-b06','DES-PERF-02','Explains forecast return and sensitivity','Evidence',false),
  ('crit-b07-review','assessment-b07','DES-05','Identifies and resolves design risks','Assurance',true),
  ('crit-b07-standards','assessment-b07','DES-06','References applicable standards','Assurance',false),
  ('crit-b08-pack','assessment-b08','DES-PACK-01','Produces a complete design pack','Evidence',false),
  ('crit-b08-trace','assessment-b08','DES-PACK-02','Maintains traceability from brief to handover','Assurance',false)
ON CONFLICT (id) DO UPDATE SET
  assessment_id=EXCLUDED.assessment_id, code=EXCLUDED.code,
  label=EXCLUDED.label, layer=EXCLUDED.layer, critical=EXCLUDED.critical;

INSERT INTO teras_readiness_gates (
  id, program_id, pathway_id, sequence, code, name, requirement,
  assessment_mode, evidence_mode
)
VALUES
  ('gate-b1','solar-pv-tech','path-b',1,'B1','Design brief','Translate the client brief into traceable design constraints.','Mapped','None'),
  ('gate-b2','solar-pv-tech','path-b',2,'B2','System design','Complete sizing, yield, electrical, and structural design evidence.','Mapped','Mapped'),
  ('gate-b3','solar-pv-tech','path-b',3,'B3','Design assurance','Pass the B07 design assurance assessment with no critical failures.','Mapped','None'),
  ('gate-b4','solar-pv-tech','path-b',4,'B4','Design-ready','All Path B modules, evidence, and the client-ready design pack are complete.','All','All')
ON CONFLICT (id) DO UPDATE SET
  program_id=EXCLUDED.program_id, pathway_id=EXCLUDED.pathway_id,
  sequence=EXCLUDED.sequence, code=EXCLUDED.code, name=EXCLUDED.name,
  requirement=EXCLUDED.requirement, assessment_mode=EXCLUDED.assessment_mode,
  evidence_mode=EXCLUDED.evidence_mode;

COMMIT;