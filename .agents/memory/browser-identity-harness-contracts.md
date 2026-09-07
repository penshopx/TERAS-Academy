---
name: Browser identity harness contracts
description: Why test identity installation and injected roles must remain authoritative and isolated from persisted identities.
---

Require browser tests that model authenticated state to create each page through one shared operation that installs the identity harness before returning the page.

**Why:** File-wide checks for an install call or source-order checks can pass when a second page is uninstrumented or when an earlier install is deferred and never executes. An atomic construction boundary makes those bypasses structurally unavailable.

**How to apply:** When adding browser-test infrastructure, route every page creation path through the identity-aware factory and make lightweight CI contract checks reject direct page creation and page fixtures that bypass it.

For in-process API tests, reject an injected role mismatch before looking up persisted assignments. When the injected role matches, an explicit persisted assignment may still select the intended fixture identity before falling back to the default context.

**Why:** Development databases can retain an identity subject reused by another test. Looking up assignments before checking the injected role can let a Learner test identity inherit an Assessor assignment and falsely authorize a mutation.

**How to apply:** Treat the injected test role as the authorization ceiling. Use database lookup only to resolve the concrete person for that same role, never to upgrade the role declared by the harness.