---
name: Drizzle push isolation
description: Reliable integration testing rules for Drizzle schema pushes against PostgreSQL.
---

Run Drizzle push integration tests against a separate temporary database, not an alternate `search_path` in the application database. Treat output beginning with `error:` as failure even when the process exit status is zero.

**Why:** Drizzle can target the `public` schema despite a session `search_path`, and some push failures have been printed as errors while the command still exited successfully. Either behavior can produce a false-positive test or touch the wrong schema.

**How to apply:** For migration-order or reconciliation tests, create an isolated database, restore only the schema needed for the scenario, capture both push output and status, and drop the database in a cleanup trap.