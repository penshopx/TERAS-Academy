---
name: App Storage private directory normalization
description: Environment-specific path formatting to account for when matching App Storage signed URLs.
---

Treat `PRIVATE_OBJECT_DIR` as a slash-tolerant bucket/path value when comparing it with a signed URL pathname; a provisioned value may begin with `/`.

**Why:** The in-process adapter did not expose the leading-slash form used by the real App Storage environment, causing valid signed URLs to miss the configured prefix during normalization.

**How to apply:** Any code that converts between App Storage URLs, bucket-relative names, and application object paths should remove redundant boundary slashes before comparison while preserving interior path segments.