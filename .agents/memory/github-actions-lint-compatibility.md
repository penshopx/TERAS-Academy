---
name: GitHub Actions lint compatibility
description: How to handle valid GitHub Actions features that lag behind the pinned WASM actionlint rules.
---

The pinned WASM actionlint build does not recognize the valid `attestations` permission scope. Suppress only that exact diagnostic rather than disabling permission checks broadly.

**Why:** GitHub Actions evolves faster than this portable linter build, but repository validation still needs deterministic, network-free syntax and structural checks.

**How to apply:** When adding newer GitHub Actions syntax, verify it against current GitHub documentation. If the linter lags, use the narrowest possible finding match and retain all other diagnostics.