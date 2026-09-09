---
name: Assistant runtime grounding
description: Durable grounding rule for TERAS assistants when environment data is incomplete.
---

TERAS assistants must retain a small canonical, curated grounding set at runtime for core Help Desk and Energy questions. Use published, audience-scoped Knowledge first; use canonical context only when it matches the question and no published match is available. Do not turn unmatched questions into ungrounded general chat.

**Why:** Development can contain seeded Knowledge while Production has the table but no rows because schema publishing does not necessarily copy seed data. In that state, returning `not_found` before provider invocation makes a working LLM integration appear absent. The runtime-grounded approach was confirmed working in Production.

**How to apply:** Keep provider invocation downstream of trusted context selection, allow `super_admin` to inherit the `admin` Knowledge audience, normalize boundary punctuation without splitting opaque hyphenated identifiers, and verify both provider connectivity and the final grounded call.