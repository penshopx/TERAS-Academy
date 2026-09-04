---
name: Publish-safe database checks
description: Why PostgreSQL table constraints used by TERAS must not depend on project-defined database functions.
---

Schema constraints that must reach production through Replit Publish should use self-contained PostgreSQL expressions rather than project-defined helper functions.

**Why:** Publish can diff tables and constraints without carrying custom function definitions. A new table whose CHECK calls a function present only in development then fails during production migration before the application is promoted.

**How to apply:** Keep application validation as the authoritative rich validator, express the database safety floor with built-in SQL operators/functions, and verify the generated production diff contains no unresolved custom-function references.