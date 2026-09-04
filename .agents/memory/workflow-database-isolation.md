---
name: Workflow database isolation
description: How to avoid false browser-test conclusions when workflow and shell database environments differ.
---

Do not assume that database queries launched from the agent shell observe the same database used by a managed application workflow. Browser idempotency tests should hold a response after commit, wait for the commit signal, then reload before retrying.

**Why:** Managed workflows can resolve environment-scoped database configuration independently from agent shell commands, producing contradictory test observations. Destroying a socket is also nondeterministic because a browser may transparently retry a POST before application code observes the failure.

**How to apply:** Keep browser test setup and assertions in one isolated service environment; never use shell-side database counts as an oracle until environment equivalence is established. For post-commit response-loss scenarios, prefer a test-only hold signal followed by browser reload over raw socket destruction.