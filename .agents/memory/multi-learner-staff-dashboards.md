---
name: Multi-learner staff dashboards
description: Authorization and UI rules for trainer, validator, and readiness-review workspaces spanning multiple assigned learners.
---

Staff workspaces must scope every queue item, detail request, mutation, and history event through the authenticated actor's active learner/program/pathway assignment. Queue contracts must carry learner and pathway identity so shared assessment IDs cannot collide in caches or mutations.

**Why:** A single seeded learner context can make a dashboard appear correct while leaking data, rejecting valid assignments, or mixing two learners who share the same assessment definition. Learner-only condition panels also create unauthorized requests and ambiguous status on multi-learner staff pages.

**How to apply:** Keep generic learner list routes learner-only. Require explicit learner identity for staff detail or decision operations and verify it server-side against the target module's program/pathway. Render aggregate staff metrics and scoped queue/history context instead of mounting a single-learner dashboard component.