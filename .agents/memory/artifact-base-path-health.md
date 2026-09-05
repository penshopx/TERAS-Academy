---
name: Artifact base-path health
description: Deployment sidecar behavior for runnable API artifacts with a routed base path.
---

Keep the API artifact base path healthy in addition to its explicit startup health endpoint.

**Why:** The deployment sidecar probes the artifact's routed base path during promotion even when a separate startup health path is configured. A missing base handler can produce repeated healthcheck failures and leave the Publishing UI appearing stuck.

**How to apply:** When changing API routing, ensure both the artifact base path and the configured startup health path return a minimal HTTP 200 response without authentication or infrastructure dependencies.