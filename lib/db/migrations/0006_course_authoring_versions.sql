BEGIN;

-- Additive authoring lifecycle. Existing learner transition/completion events are
-- deliberately untouched so active learner progress continues to reference stable IDs.
ALTER TABLE teras_courses ADD COLUMN IF NOT EXISTS published_version_id text;
ALTER TABLE teras_content_resources ADD COLUMN IF NOT EXISTS object_path text;
ALTER TABLE teras_content_resources ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE teras_course_modules ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE teras_learning_outcomes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE teras_learning_outcomes ADD COLUMN IF NOT EXISTS sequence integer;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY activity_id ORDER BY created_at, id) AS sequence
  FROM teras_learning_outcomes
) UPDATE teras_learning_outcomes o SET sequence = ranked.sequence FROM ranked WHERE o.id = ranked.id AND o.sequence IS NULL;
ALTER TABLE teras_learning_outcomes ALTER COLUMN sequence SET DEFAULT 1;
ALTER TABLE teras_learning_outcomes ALTER COLUMN sequence SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teras_learning_outcomes_activity_sequence_unique
  ON teras_learning_outcomes(activity_id, sequence);
ALTER TABLE teras_content_resources ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS teras_course_versions (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES teras_courses(id),
  version integer NOT NULL,
  lifecycle text NOT NULL DEFAULT 'PUBLISHED',
  snapshot jsonb NOT NULL,
  validation_report jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS teras_course_versions_course_version_unique
  ON teras_course_versions(course_id, version);
CREATE INDEX IF NOT EXISTS teras_course_versions_course_published_idx
  ON teras_course_versions(course_id, published_at);

CREATE TABLE IF NOT EXISTS teras_course_authoring_audit (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES teras_courses(id),
  version_id text REFERENCES teras_course_versions(id),
  action text NOT NULL,
  actor_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_course_authoring_audit_course_created_idx
  ON teras_course_authoring_audit(course_id, created_at);

CREATE TABLE IF NOT EXISTS teras_managed_resource_uploads (
  object_path text PRIMARY KEY,
  trainer_id text NOT NULL REFERENCES teras_people(id),
  name text NOT NULL,
  size integer NOT NULL,
  mime_type text NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS teras_managed_resource_uploads_expiry_idx
  ON teras_managed_resource_uploads(expires_at);

-- Data-preserving legacy publish backfill. Stable source IDs are retained so
-- existing learner progress events continue to resolve against version 1.
INSERT INTO teras_course_versions (id, course_id, version, lifecycle, snapshot, validation_report, published_by)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM teras_course_versions occupied WHERE occupied.id = 'course-version-legacy-' || md5(c.id))
      THEN 'course-version-legacy-' || md5(c.id || ':version-1')
    ELSE 'course-version-legacy-' || md5(c.id)
  END, c.id, 1, 'PUBLISHED',
  jsonb_build_object(
    'id', c.id, 'programId', c.program_id, 'pathwayId', c.pathway_id, 'title', c.title,
    'description', c.description, 'status', 'PUBLISHED', 'sequence', c.sequence,
    'modules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cm.id, 'moduleId', m.id, 'moduleCode', m.code, 'moduleName', m.name, 'sequence', cm.sequence,
        'lessons', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', l.id, 'moduleId', m.id, 'title', l.title, 'description', l.description,
            'sequence', l.sequence, 'status', l.status, 'estimatedDurationMinutes', l.estimated_duration_minutes,
            'activities', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'lessonId', a.lesson_id, 'pathwayId', a.pathway_id, 'type', a.type,
                'title', a.title, 'description', a.description, 'sequence', a.sequence, 'required', a.required,
                'estimatedDurationMinutes', a.estimated_duration_minutes, 'status', a.status,
                'currentState', 'NOT_STARTED',
                'nextAction', jsonb_build_object('action','START_ACTIVITY','title','Start activity','description','Begin this learning activity.','href',NULL),
                'resources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', r.id, 'type', r.type, 'title', r.title, 'uri', r.uri, 'objectPath', r.object_path,
                  'mimeType', r.mime_type, 'content', r.content, 'sequence', r.sequence
                ) ORDER BY r.sequence) FROM teras_content_resources r WHERE r.activity_id = a.id AND r.status <> 'ARCHIVED'), '[]'::jsonb),
                'outcomes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', o.id, 'activityId', o.activity_id, 'capabilityModuleId', o.capability_module_id,
                  'description', o.description, 'verificationMethod', o.verification_method,
                  'required', o.required, 'sequence', o.sequence
                ) ORDER BY o.sequence) FROM teras_learning_outcomes o WHERE o.activity_id = a.id AND o.status <> 'ARCHIVED'), '[]'::jsonb)
              ) ORDER BY a.sequence) FROM teras_learning_activities a WHERE a.lesson_id = l.id AND a.status <> 'ARCHIVED'
            ), '[]'::jsonb)
          ) ORDER BY l.sequence) FROM teras_lessons l WHERE l.course_module_id = cm.id AND l.status <> 'ARCHIVED'
        ), '[]'::jsonb)
      ) ORDER BY cm.sequence)
      FROM teras_course_modules cm JOIN teras_modules m ON m.id = cm.module_id
      WHERE cm.course_id = c.id AND cm.status <> 'ARCHIVED'
    ), '[]'::jsonb)
  ),
  jsonb_build_object('valid', true, 'legacyBackfill', true, 'errors', '[]'::jsonb, 'warnings', jsonb_build_array(
    jsonb_build_object('code','LEGACY_PUBLISHED_BACKFILL','message','Version created during data-preserving upgrade.','entityId',c.id)
  ), 'courseId', c.id),
  COALESCE(c.created_by, 'system')
FROM teras_courses c
WHERE c.status = 'PUBLISHED' AND c.published_version_id IS NULL
ON CONFLICT (course_id, version) DO NOTHING;

UPDATE teras_courses c SET published_version_id = v.id
FROM teras_course_versions v
WHERE v.course_id = c.id AND v.version = 1 AND c.status = 'PUBLISHED' AND c.published_version_id IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM teras_courses WHERE status = 'PUBLISHED' AND published_version_id IS NULL) THEN
    RAISE EXCEPTION 'LMS upgrade invariant failed: published course without immutable version pointer';
  END IF;
END $$;

COMMIT;