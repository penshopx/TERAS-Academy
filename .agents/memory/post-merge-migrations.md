---
name: Non-interactive post-merge migrations
description: How to keep automatic post-merge schema reconciliation safe when Drizzle detects data-loss risks.
---

Automatic post-merge setup must preflight additive columns, backfill existing rows, and establish required constraints before running the normal Drizzle schema push. Do not rely on `drizzle-kit push --force` to suppress every prompt.

**Why:** With stdin closed, Drizzle 0.31 still attempted an interactive truncation prompt while adding a unique constraint and non-null pathway columns; setup failed and left runtime code ahead of the database schema.

**How to apply:** Put idempotent, data-preserving SQL in the post-merge preflight for schema changes that need backfill, then run ordinary schema push and the idempotent seed. Confirm the post-merge workflow itself succeeds.