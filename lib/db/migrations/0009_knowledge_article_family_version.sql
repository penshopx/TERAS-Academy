-- 0008 may already have been applied in existing TERAS installations.
-- Keep this separate upgrade idempotent while new installations receive the
-- same index from 0008.
CREATE UNIQUE INDEX IF NOT EXISTS teras_knowledge_articles_family_version_unique
  ON teras_knowledge_articles((coalesce(parent_article_id, id)), version);