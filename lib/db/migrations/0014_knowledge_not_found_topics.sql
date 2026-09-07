CREATE TABLE IF NOT EXISTS "teras_knowledge_not_found_topics" (
  "category" text NOT NULL,
  "topic_key" text NOT NULL,
  "topic_label" text NOT NULL,
  "occurrence_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "teras_knowledge_not_found_topics_category_topic_key_pk" PRIMARY KEY ("category", "topic_key"),
  CONSTRAINT "teras_knowledge_not_found_topics_category_check" CHECK ("category" IN ('help', 'energy')),
  CONSTRAINT "teras_knowledge_not_found_topics_count_check" CHECK ("occurrence_count" > 0)
);

CREATE INDEX IF NOT EXISTS "teras_knowledge_not_found_topics_expiry_idx"
  ON "teras_knowledge_not_found_topics" ("expires_at");

CREATE INDEX IF NOT EXISTS "teras_knowledge_not_found_topics_rank_idx"
  ON "teras_knowledge_not_found_topics" ("category", "occurrence_count" DESC, "last_seen_at" DESC);