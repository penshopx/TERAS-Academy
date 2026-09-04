---
name: Learner identity isolation
description: Ownership boundary for authenticated learner records across TERAS domains.
---

Learner-specific reads, projections, and mutations must derive the learner from the authenticated server-side identity. A learner ID in a client payload is only a consistency assertion and must never select ownership.

**Why:** Learning, evidence, gaps, remediation, assessment, readiness, pathway history, and Passport are records belonging to one person. A shared demo context or client-selected learner ID can expose or mutate another person's longitudinal record.

**How to apply:** Resolve the authenticated account to one enrolled person before loading learner state, thread that identity through every domain helper, scope active pathway separately per enrollment, reject cross-identity references before writes, and verify rejection leaves append-only tables unchanged.