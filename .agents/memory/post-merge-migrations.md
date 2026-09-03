---
name: Non-interactive post-merge migrations
description: How to keep automatic post-merge schema reconciliation safe when Drizzle detects data-loss risks.
---

Automatic post-merge setup must branch on whether the application's anchor table exists. For an existing schema, preflight additive columns, backfill rows, and establish required constraints before the normal Drizzle push. For an empty database, skip table-specific preflight and let Drizzle create the schema before seeding. Do not rely on `drizzle-kit push --force` to suppress every prompt.

**Why:** With stdin closed, Drizzle 0.31 still attempted an interactive truncation prompt while adding a unique constraint and non-null pathway columns. Running that preflight unconditionally also failed on a clean database because its tables did not exist yet.

**How to apply:** Detect the anchor table with `to_regclass`. Run idempotent, data-preserving preflight SQL only when it exists, then run ordinary schema push and the idempotent seed. Verify the full script with closed stdin against both existing and clean temporary databases.