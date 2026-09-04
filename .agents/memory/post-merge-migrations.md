---
name: Non-interactive post-merge migrations
description: How to keep automatic post-merge schema reconciliation safe when Drizzle detects data-loss risks.
---

Automatic post-merge setup must branch on whether the application's anchor table exists. For an existing schema, preflight additive columns, backfill rows, and establish required constraints before the normal Drizzle push. For an empty database, skip table-specific preflight and let Drizzle create the schema before seeding. Do not rely on `drizzle-kit push --force` to suppress every prompt.

Post-merge reconciliation and demo fixtures are development-only operations. Catalogue seed and demo seed must remain separate; demo seed must fail closed in a production-like environment. The full seed is one database transaction, and concurrent post-merge runs must not overlap.

**Why:** With stdin closed, Drizzle 0.31 still attempted an interactive truncation prompt while adding a unique constraint and non-null pathway columns. Running that preflight unconditionally also failed on a clean database because its tables did not exist yet. Demo learner/readiness fixtures and mutating integration tests must never run against a production target, and a failed seed must not leave a partial capability record.

**How to apply:** Detect the anchor table with `to_regclass`. Run idempotent, data-preserving preflight SQL only when it exists, then run ordinary schema push and the atomic seed. Require an explicit demo mode, reject production-like execution before any mutation, serialize updates on one transaction client, and verify the full script with closed stdin.