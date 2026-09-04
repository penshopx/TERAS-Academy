BEGIN;

DROP INDEX IF EXISTS "teras_activity_completion_lookup_idx";
CREATE INDEX "teras_activity_completion_lookup_idx"
  ON "teras_activity_completion_events" USING btree ("activity_id","learner_id","pathway_id","created_at");

DROP INDEX IF EXISTS "teras_outcome_verification_lookup_idx";
CREATE INDEX "teras_outcome_verification_lookup_idx"
  ON "teras_outcome_verification_events" USING btree ("outcome_id","learner_id","pathway_id","created_at");

DROP INDEX IF EXISTS "teras_learning_record_links_pathway_activity_created_idx";
CREATE INDEX "teras_learning_record_links_pathway_activity_created_idx"
  ON "teras_learning_record_links" USING btree ("pathway_id","activity_id","created_at");

DROP INDEX IF EXISTS "teras_readiness_transfer_lookup_idx";
CREATE INDEX "teras_readiness_transfer_lookup_idx"
  ON "teras_readiness_transfer_events" USING btree ("learner_id","pathway_id","created_at");

DROP INDEX IF EXISTS "teras_learning_transition_state_lookup_idx";
CREATE INDEX "teras_learning_transition_state_lookup_idx"
  ON "teras_learning_transition_events" USING btree ("activity_id","learner_id","pathway_id","created_at");

COMMIT;