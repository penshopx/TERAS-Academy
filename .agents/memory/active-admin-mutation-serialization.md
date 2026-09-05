---
name: Active-admin mutation serialization
description: Concurrency rule for changes that can alter who is an active administrator.
---

All status and role mutations that can affect active-administrator membership must share one transaction-scoped database lock, with the target read, active-admin count, mutation, and audit performed inside that transaction.

**Why:** Independent pre-mutation counts allow concurrent requests to each observe another active administrator and jointly leave the system with none.

**How to apply:** Any future write path outside the existing administration routes that changes person status or administrator roles must participate in the same serialization protocol.