---
name: Causal journey release gates
description: Rules for trustworthy end-to-end readiness gates across remediation, reassessment, and handoff.
---

An end-to-end release gate must create state through the same authorized production commands and transitions used by real actors. Directly inserting completed remediation, reassessment, or readiness rows is not valid evidence that the journey works.

**Why:** Seeded terminal state allowed a certification-preparation gate to pass while remediation completion was bypassable, assessor decisions were not bound to the correct activity, and readiness handoff lacked a complete causal chain.

**How to apply:** Use one run-scoped identity graph and assert causal references across practice, evidence, review, remediation, reassessment, and readiness transfer. Rejected and duplicate requests must prove no mutation. Automated PASS must remain separate from a human GO/NO-GO decision.