---
name: Verified learner self-provisioning
description: Security and enrollment boundaries for ordinary-user onboarding.
---

Verified Supabase users without a local identity are automatically provisioned as active TERAS learners. A matching provider subject is authoritative; an existing local email with a different subject is a conflict and must never be adopted automatically.

**Why:** Ordinary users should be able to join after email verification, while email matching alone could let a new external identity take over a pre-existing TERAS person.

**How to apply:** Provision the person and learner role transactionally and idempotently. Do not invent an enrollment; guard every learner workspace route, including direct navigation and stale tabs, with a waiting state until an Admin assigns a program and pathway. Authenticated assistants require a successfully resolved local session.