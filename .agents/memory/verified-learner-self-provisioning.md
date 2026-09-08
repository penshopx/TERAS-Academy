---
name: Verified learner self-provisioning
description: Security and enrollment boundaries for ordinary-user onboarding.
---

Verified Supabase users without a local identity are automatically provisioned as active TERAS learners and enrolled into the sole active pathway whose type is Primary. Existing bound learners missing enrollment are repaired through the same flow. A matching provider subject is authoritative; an existing local email with a different subject is a conflict and must never be adopted automatically.

**Why:** Ordinary users should be able to start after email verification without Admin intervention, while email matching alone could let a new external identity take over a pre-existing TERAS person. Requiring exactly one active Primary target prevents arbitrary enrollment.

**How to apply:** Provision person, learner role, and Primary enrollment transactionally and idempotently. If there is not exactly one active Primary pathway, choose nothing and show a temporary safe state. Guard all learner routes, including stale tabs. Administrative elevation remains a separate Super Admin approval flow.