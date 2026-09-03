DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (
    VALUES
      ('teras_people', 'email', 'YES'),
      ('teras_modules', 'pathway_id', 'NO'),
      ('teras_assessments', 'gate_code', 'YES'),
      ('teras_readiness_gates', 'pathway_id', 'NO'),
      ('teras_readiness_gates', 'assessment_mode', 'NO'),
      ('teras_readiness_gates', 'evidence_mode', 'NO')
  ) AS expected(table_name, column_name, is_nullable)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = expected.table_name
      AND actual.column_name = expected.column_name
      AND actual.is_nullable = expected.is_nullable
  );

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Critical TERAS runtime schema fields are missing or have incorrect nullability';
  END IF;

  IF EXISTS (SELECT 1 FROM teras_modules WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_readiness_gates WHERE pathway_id IS NULL) THEN
    RAISE EXCEPTION 'Pathway backfill is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teras_people_email_unique' AND contype = 'u'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teras_modules_pathway_id_teras_pathways_id_fk' AND contype = 'f'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teras_readiness_gates_pathway_id_teras_pathways_id_fk' AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'Critical TERAS runtime constraints are missing';
  END IF;

  IF (SELECT count(*) FROM teras_modules WHERE pathway_id = 'path-a') <> 10
    OR (SELECT count(*) FROM teras_modules WHERE pathway_id = 'path-b') <> 8 THEN
    RAISE EXCEPTION 'Seeded pathway curriculum is incomplete or duplicated';
  END IF;

  IF (SELECT count(*) FROM teras_readiness_gates WHERE pathway_id = 'path-a') <> 3
    OR (SELECT count(*) FROM teras_readiness_gates WHERE pathway_id = 'path-b') <> 4 THEN
    RAISE EXCEPTION 'Seeded readiness gates are incomplete or duplicated';
  END IF;
END $$;

SELECT 'TERAS schema regression checks passed' AS result;