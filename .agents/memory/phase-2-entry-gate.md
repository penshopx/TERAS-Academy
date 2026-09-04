---
name: Phase 2 entry gate
description: Required sequencing and conceptual boundaries before TERAS learner-facing LMS UX work begins.
---

Installation/upgrade hardening and real learner lesson progress have both passed their mandatory gates against the Phase 1 contract. Build subsequent LMS UX from Course → Module → Lesson → Activity, centered on learner location and Next Action rather than a large metrics dashboard.

**Why:** Phase 1 established the learning engine and authority boundaries. UX built before migration safety and progress behavior are proven could silently reshape the contract or confuse completion with capability.

**How to apply:** In every later UX and API, keep Learning Progress, verified Learning Achievement, and Capability Readiness as three separate layers. Progress must never imply verified outcome or readiness. Preserve active-path cache isolation whenever pathway selection changes.