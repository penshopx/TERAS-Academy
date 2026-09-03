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

ALTER TABLE teras_modules ADD COLUMN IF NOT EXISTS pathway_id text;
UPDATE teras_modules SET pathway_id = 'path-a' WHERE pathway_id IS NULL;
ALTER TABLE teras_modules ALTER COLUMN pathway_id SET NOT NULL;

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
ALTER TABLE teras_readiness_gates ALTER COLUMN pathway_id SET NOT NULL;
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

COMMIT;