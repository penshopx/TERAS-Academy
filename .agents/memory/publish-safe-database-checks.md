---
name: Publish-safe database checks
description: Why PostgreSQL table constraints used by TERAS must not depend on project-defined database functions.
---

Schema constraints that must reach production through Replit Publish should use self-contained PostgreSQL expressions rather than project-defined helper functions.

They must also be declared in the canonical Drizzle schema; a standalone SQL
migration can update Development while leaving Publish with no Production diff.

**Why:** Publish derives the Production change from the canonical schema, not
from the historical migration sequence. It can diff tables and constraints
without carrying custom function definitions. A missing declaration silently
leaves Production on the old constraint, while a new CHECK that calls a
Development-only function fails before the application is promoted.

**How to apply:** Keep application validation as the authoritative rich
validator, declare the database safety floor in Drizzle with built-in SQL
operators/functions, and verify the generated Production diff includes the
constraint without unresolved custom-function references.