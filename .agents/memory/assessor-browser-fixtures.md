---
name: Assessor browser fixtures
description: How to keep assessor decision browser checks deterministic when development assessment state changes.
---

Browser regression checks for assessor safety decisions should use an isolated pending assessment containing at least one critical criterion. Do not depend on whichever item happens to be first in the shared development decision queue.

**Why:** Assessment submissions persist and can remove the only critical rubric from the actionable queue, blocking later keyboard and payload checks even though the UI itself is healthy.

**How to apply:** Seed or mock a uniquely identified pending critical assessment for the browser test, exercise it by accessible control names, and clean up only test-owned records afterward.