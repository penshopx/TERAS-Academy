---
name: Workflow database isolation
description: How to avoid false browser-test conclusions when workflow and shell database environments differ.
---

Do not assume that database queries launched from the agent shell observe the same database used by a managed application workflow.

**Why:** Managed workflows can resolve environment-scoped database configuration independently from agent shell commands, producing contradictory test observations.

**How to apply:** Keep browser test setup and assertions in one isolated service environment; never use shell-side database counts as an oracle until environment equivalence is established.