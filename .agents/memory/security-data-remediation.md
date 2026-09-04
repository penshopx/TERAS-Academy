---
name: Security data remediation
description: Requirements for one-time cleanup of unsafe legacy database values.
---

Security cleanup is incomplete if it only provides a manual audit command. Wire
the remediation into the actual upgrade path, follow it with a failing
verification check, and keep the operation idempotent.

**Why:** A safe standalone quarantine utility still leaves legacy unsafe values
active indefinitely when no release or upgrade process invokes it.

**How to apply:** For legacy-data security tasks, test the full upgrade against
an isolated schema with representative unsafe and safe records. Verify
quarantine, audit preservation, safe-value retention, and repeatability.