---
name: OpenAPI canonical anchors
description: How to avoid placing active contracts inside TERAS schema-like legacy snapshot extensions.
---

When adding API contracts, anchor new operations before the root legacy extension and add schemas under the canonical root `components.schemas` block. Do not target repeated schema names alone.

**Why:** The specification contains a legacy extension with schema-shaped content. Ambiguous patches can produce valid-looking YAML that codegen ignores, or duplicate mapping keys inside the extension.

**How to apply:** After every contract edit, validate the spec and confirm the generated client contains the new operation names—not only the new schema types.