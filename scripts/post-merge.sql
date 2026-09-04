BEGIN;

ALTER TABLE teras_people ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  IF EXISTS (
    SELECT email
    FROM teras_people
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique learner email constraint: duplicate non-null emails exist';
  END IF;
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

ALTER TABLE teras_modules ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_practice_attempts ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_evidence ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_assessment_attempts ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_gaps ADD COLUMN IF NOT EXISTS pathway_id text;
ALTER TABLE teras_readiness_events ADD COLUMN IF NOT EXISTS pathway_id text;

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
SET pathway_id = m.pathway_id
FROM teras_modules m
WHERE g.module_id = m.id AND g.pathway_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM teras_practice_attempts WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_evidence WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_assessment_attempts WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_gaps WHERE pathway_id IS NULL AND module_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Pathway upgrade is ambiguous: one or more records cannot be derived from their canonical module';
  END IF;
END $$;

UPDATE teras_gaps SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
ALTER TABLE teras_modules ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_practice_attempts ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_evidence ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_assessment_attempts ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_gaps ALTER COLUMN pathway_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teras_modules_pathway_id_teras_pathways_id_fk'
  ) THEN
    ALTER TABLE teras_modules
      ADD CONSTRAINT teras_modules_pathway_id_teras_pathways_id_fk
      FOREIGN KEY (pathway_id) REFERENCES teras_pathways(id);
  END IF;
END $$;

ALTER TABLE teras_assessments ADD COLUMN IF NOT EXISTS gate_code text;

ALTER TABLE teras_readiness_gates ADD COLUMN IF NOT EXISTS pathway_id text;
UPDATE teras_readiness_gates SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
UPDATE teras_readiness_events re
SET pathway_id = rg.pathway_id
FROM teras_readiness_gates rg
WHERE re.gate_id = rg.id AND re.pathway_id IS NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM teras_readiness_events WHERE pathway_id IS NULL) THEN
    RAISE EXCEPTION 'Readiness event pathway upgrade is incomplete';
  END IF;
END $$;
ALTER TABLE teras_readiness_gates ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_readiness_events ALTER COLUMN pathway_id SET NOT NULL;
ALTER TABLE teras_readiness_gates
  ADD COLUMN IF NOT EXISTS assessment_mode text NOT NULL DEFAULT 'Mapped';
ALTER TABLE teras_readiness_gates
  ADD COLUMN IF NOT EXISTS evidence_mode text NOT NULL DEFAULT 'None';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teras_readiness_gates_pathway_id_teras_pathways_id_fk'
  ) THEN
    ALTER TABLE teras_readiness_gates
      ADD CONSTRAINT teras_readiness_gates_pathway_id_teras_pathways_id_fk
      FOREIGN KEY (pathway_id) REFERENCES teras_pathways(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT assessment_id, learner_id, pathway_id, number
    FROM teras_assessment_attempts
    GROUP BY assessment_id, learner_id, pathway_id, number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Assessment attempt upgrade has duplicate pathway-scoped attempt numbers';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS teras_assessment_attempts_assessment_learner_pathway_number_unique
  ON teras_assessment_attempts (assessment_id, learner_id, pathway_id, number);

COMMIT;