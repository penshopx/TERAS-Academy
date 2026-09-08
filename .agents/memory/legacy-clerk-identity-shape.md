---
name: Legacy Clerk identity shape
description: Historical identity shape that must be handled during secure Clerk-to-Supabase administrator cutover.
---

Some historical administrator records may have a valid legacy Clerk user ID while normalized authentication fields and even the local email are null. Treat this as a recognizable legacy state only when the Clerk ID exists and the remaining owner, MFA, and uniqueness checks all pass. When local email is absent, require the verified identity email to match an explicit Production owner allowlist before filling it during cutover.

**Why:** Production data predating normalized external-identity columns used this shape, so requiring explicit provider and subject values blocked the legitimate owner even after a safe narrow cutover was implemented.

**How to apply:** Identity migrations and recovery checks should explicitly distinguish this null-normalized legacy shape from partially populated or conflicting identity data. Never infer ownership from email alone; combine the allowlist with AAL2, locked enrollment, and unique legacy-owner checks.