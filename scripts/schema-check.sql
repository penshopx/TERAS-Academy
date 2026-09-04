DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (
    VALUES
      ('teras_people', 'email', 'YES'),
      ('teras_modules', 'pathway_id', 'NO'),
      ('teras_practice_attempts', 'pathway_id', 'NO'),
      ('teras_evidence', 'pathway_id', 'NO'),
      ('teras_assessment_attempts', 'pathway_id', 'NO'),
      ('teras_gaps', 'pathway_id', 'NO'),
      ('teras_assessments', 'gate_code', 'YES'),
      ('teras_readiness_gates', 'pathway_id', 'NO'),
      ('teras_readiness_gates', 'assessment_mode', 'NO'),
      ('teras_readiness_gates', 'evidence_mode', 'NO'),
      ('teras_readiness_events', 'pathway_id', 'NO'),
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
    OR EXISTS (SELECT 1 FROM teras_practice_attempts WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_evidence WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_assessment_attempts WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_gaps WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_readiness_gates WHERE pathway_id IS NULL)
    OR EXISTS (SELECT 1 FROM teras_readiness_events WHERE pathway_id IS NULL) THEN
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = 'teras_learning_transition_idempotency_unique'::regclass
      AND indisunique
  ) THEN
    RAISE EXCEPTION 'Learning transition idempotency index is not unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid IN (
      'teras_activity_completion_lookup_idx'::regclass,
      'teras_outcome_verification_lookup_idx'::regclass,
      'teras_learning_record_links_pathway_activity_created_idx'::regclass,
      'teras_readiness_transfer_lookup_idx'::regclass,
      'teras_learning_transition_state_lookup_idx'::regclass
    )
      AND indisunique
  ) THEN
    RAISE EXCEPTION 'Append-only event lookup indexes must not enforce timestamp uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('m01','path-a'),('m02','path-a'),('m03','path-a'),('m04','path-a'),('m05','path-a'),
      ('m06','path-a'),('m07','path-a'),('m08','path-a'),('m09','path-a'),('m10','path-a'),
      ('b01','path-b'),('b02','path-b'),('b03','path-b'),('b04','path-b'),
      ('b05','path-b'),('b06','path-b'),('b07','path-b'),('b08','path-b')
    ) expected(id, pathway_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM teras_modules actual
      WHERE actual.id = expected.id AND actual.pathway_id = expected.pathway_id
    )
  ) THEN
    RAISE EXCEPTION 'Canonical pathway curriculum is incomplete or assigned to the wrong pathway';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('gate-g1','path-a'),('gate-g2','path-a'),('gate-g3','path-a'),
      ('gate-b1','path-b'),('gate-b2','path-b'),('gate-b3','path-b'),('gate-b4','path-b')
    ) expected(id, pathway_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM teras_readiness_gates actual
      WHERE actual.id = expected.id AND actual.pathway_id = expected.pathway_id
    )
  ) THEN
    RAISE EXCEPTION 'Canonical readiness gates are incomplete or assigned to the wrong pathway';
  END IF;

  IF (SELECT count(*) FROM teras_courses WHERE program_id = 'solar-pv-tech' AND pathway_id = 'path-a') < 1
    OR (SELECT count(*) FROM teras_courses WHERE program_id = 'solar-pv-tech' AND pathway_id = 'path-b') < 1
    OR (SELECT count(*) FROM teras_learning_activities WHERE pathway_id = 'path-a') < 1
    OR (SELECT count(*) FROM teras_learning_activities WHERE pathway_id = 'path-b') < 1 THEN
    RAISE EXCEPTION 'Seeded Phase 1 LMS hierarchy is missing a pathway';
  END IF;
END $$;

SELECT 'TERAS schema regression checks passed' AS result;