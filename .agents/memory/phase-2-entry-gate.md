---
name: Phase 2 entry gate
description: Required sequencing and conceptual boundaries before TERAS learner-facing LMS UX work begins.
---

Installation/upgrade hardening, real learner lesson progress, and learner identity integrity have passed their mandatory gates against the Phase 1 contract. Build Phase 2 LMS UX from Course → Module → Lesson → Activity → Learning Progress → Next Action, centered on learner location rather than a large metrics dashboard.

**Why:** Phase 1 established the learning engine and authority boundaries. UX built before migration safety and progress behavior are proven could silently reshape the contract or confuse completion with capability.

**How to apply:** In every later UX and API, keep Learning Progress, verified Learning Achievement, and Capability Readiness as three separate layers. Progress must never imply verified outcome or readiness. Preserve active-path cache isolation whenever pathway selection changes. Keep state machines, causal records, audit events, readiness logic, and identity boundaries inside the engine; learner UX should answer only what they are learning, where they are, and what comes next. Defer Learning Completion → Practice → Evidence to Phase 3, after the Phase 2 learner learning loop is stable.