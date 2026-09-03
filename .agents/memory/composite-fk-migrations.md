---
name: Composite FK migrations
description: Safe ordering for Drizzle schema changes that add composite foreign keys to existing PostgreSQL tables.
---

Define referenced column pairs as named `unique` constraints, not standalone `uniqueIndex` declarations, when a composite foreign key depends on them. For existing tables, establish those unique constraints before adding the composite foreign keys, then let Drizzle reconcile the final schema.

**Why:** PostgreSQL rejected the foreign key when the referenced uniqueness had not yet been created, while a manually created index with the schema's expected name caused a later `drizzle-kit push` duplicate-relation failure.

**How to apply:** Stage live migrations as columns → backfill → referenced unique constraints → composite foreign keys → non-null enforcement, preserving rows throughout and confirming a final clean schema push.