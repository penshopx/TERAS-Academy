---
name: Legacy Clerk identity shape
description: Historical identity shape that must be handled during secure Clerk-to-Supabase administrator cutover.
---

Some historical administrator records may have a valid legacy Clerk user ID while both the normalized authentication provider and subject fields are null. Treat this as a recognizable legacy state only when the Clerk ID exists and the remaining owner, email, MFA, and uniqueness checks all pass.

**Why:** Production data predating normalized external-identity columns used this shape, so requiring explicit provider and subject values blocked the legitimate owner even after a safe narrow cutover was implemented.

**How to apply:** Identity migrations and recovery checks should explicitly distinguish this null-normalized legacy shape from partially populated or conflicting identity data. Never infer ownership from email alone.