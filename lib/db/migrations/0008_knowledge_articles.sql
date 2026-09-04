CREATE TABLE IF NOT EXISTS teras_knowledge_articles (
  id text PRIMARY KEY,
  parent_article_id text,
  category text NOT NULL CHECK (category IN ('help', 'energy')),
  title text NOT NULL,
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  audience text[] NOT NULL DEFAULT ARRAY['learner', 'trainer', 'assessor', 'admin'],
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'system'
);
ALTER TABLE teras_knowledge_articles
  ADD COLUMN IF NOT EXISTS parent_article_id text,
  ADD COLUMN IF NOT EXISTS audience text[] NOT NULL DEFAULT ARRAY['learner', 'trainer', 'assessor', 'admin'],
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS teras_knowledge_articles_published_idx
  ON teras_knowledge_articles(category, status, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS teras_knowledge_articles_family_version_unique
  ON teras_knowledge_articles((coalesce(parent_article_id, id)), version);