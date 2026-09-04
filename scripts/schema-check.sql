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
      ('teras_readiness_gates', 'evidence_mode', 'NO'),
      ('teras_courses', 'pathway_id', 'NO'),
      ('teras_course_modules', 'module_id', 'NO'),
      ('teras_lessons', 'course_module_id', 'NO'),
      ('teras_learning_activities', 'pathway_id', 'NO'),
      ('teras_learning_outcomes', 'activity_id', 'NO'),
      ('teras_activity_completion_events', 'learner_id', 'NO'),
      ('teras_outcome_verification_events', 'learner_id', 'NO'),
      ('teras_learning_record_links', 'pathway_id', 'NO'),
      ('teras_reassessment_links', 'reassessment_attempt_id', 'NO'),
      ('teras_readiness_transfer_events', 'source_context', 'NO'),
      ('teras_learning_transition_events', 'idempotency_key', 'NO')
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

  IF to_regclass('public.teras_courses') IS NULL
    OR to_regclass('public.teras_course_modules') IS NULL
    OR to_regclass('public.teras_lessons') IS NULL
    OR to_regclass('public.teras_learning_activities') IS NULL
    OR to_regclass('public.teras_content_resources') IS NULL
    OR to_regclass('public.teras_learning_outcomes') IS NULL
    OR to_regclass('public.teras_activity_completion_events') IS NULL
    OR to_regclass('public.teras_outcome_verification_events') IS NULL
    OR to_regclass('public.teras_learning_record_links') IS NULL
    OR to_regclass('public.teras_reassessment_links') IS NULL
    OR to_regclass('public.teras_readiness_transfer_events') IS NULL
    OR to_regclass('public.teras_learning_transition_events') IS NULL THEN
    RAISE EXCEPTION 'Phase 1 LMS foundation tables are missing';
  END IF;

  IF to_regclass('public.teras_learning_transition_idempotency_unique') IS NULL THEN
    RAISE EXCEPTION 'Learning transition idempotency constraint is missing';
  END IF;

  IF (SELECT count(*) FROM teras_modules WHERE pathway_id = 'path-a') <> 10
    OR (SELECT count(*) FROM teras_modules WHERE pathway_id = 'path-b') <> 8 THEN
    RAISE EXCEPTION 'Seeded pathway curriculum is incomplete or duplicated';
  END IF;

  IF (SELECT count(*) FROM teras_readiness_gates WHERE pathway_id = 'path-a') <> 3
    OR (SELECT count(*) FROM teras_readiness_gates WHERE pathway_id = 'path-b') <> 4 THEN
    RAISE EXCEPTION 'Seeded readiness gates are incomplete or duplicated';
  END IF;

  IF (SELECT count(*) FROM teras_courses WHERE program_id = 'solar-pv-tech' AND pathway_id = 'path-a') < 1
    OR (SELECT count(*) FROM teras_courses WHERE program_id = 'solar-pv-tech' AND pathway_id = 'path-b') < 1
    OR (SELECT count(*) FROM teras_learning_activities WHERE pathway_id = 'path-a') < 1
    OR (SELECT count(*) FROM teras_learning_activities WHERE pathway_id = 'path-b') < 1 THEN
    RAISE EXCEPTION 'Seeded Phase 1 LMS hierarchy is missing a pathway';
  END IF;
END $$;

SELECT 'TERAS schema regression checks passed' AS result;