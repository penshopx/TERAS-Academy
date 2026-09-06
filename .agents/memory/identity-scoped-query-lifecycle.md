---
name: Identity-scoped query lifecycle
description: Why authenticated query consumers need a lifecycle boundary when the active identity changes.
---

Treat an authenticated identity change as a full query-consumer lifecycle change: clear the shared query client and remount its provider subtree before the new account can render.

**Why:** TanStack Query cache removal alone does not guarantee that mounted observers immediately discard their last result. Resetting every active query is also unsafe for gated dashboards because detail requests can refetch alongside the authorization gate.

**How to apply:** For account switching or sign-out/sign-in transitions, key the query-provider subtree by an identity revision. On a real identity change, clear the client and advance the revision so active screens remount and authorization gates run before dependent queries.