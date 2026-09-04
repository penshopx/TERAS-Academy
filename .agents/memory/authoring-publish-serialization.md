---
name: Authoring publish serialization
description: Concurrency rule ensuring published course snapshots identify one stable authoring revision.
---

All authoring mutations and publishes for the same course must acquire the same PostgreSQL transaction-scoped lock before reading or writing the aggregate. Build and validate the publish snapshot only after that lock is held.

**Why:** Serializing publish operations alone does not prevent a descendant edit from committing while a snapshot is being assembled, which can produce a mixed or stale snapshot.

**How to apply:** Any new authoring write path must join the per-course lock protocol. Queries on the transaction connection must run sequentially rather than through parallel query batches.