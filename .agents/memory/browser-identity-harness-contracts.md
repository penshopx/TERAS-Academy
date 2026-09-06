---
name: Browser identity harness contracts
description: Why static account-isolation guards must make browser page creation and identity installation indivisible.
---

Require browser tests that model authenticated state to create each page through one shared operation that installs the identity harness before returning the page.

**Why:** File-wide checks for an install call or source-order checks can pass when a second page is uninstrumented or when an earlier install is deferred and never executes. An atomic construction boundary makes those bypasses structurally unavailable.

**How to apply:** When adding browser-test infrastructure, route every page creation path through the identity-aware factory and make lightweight CI contract checks reject direct page creation and page fixtures that bypass it.