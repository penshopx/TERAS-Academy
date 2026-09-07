---
name: Supabase owner recovery
description: Durable recovery and identity-rebinding rules for Supabase-authenticated privileged owners.
---

Trust Supabase AAL2 for privileged owners only while TOTP enrollment is disabled at the provider. Keep TOTP verification enabled, and make the application fail closed whenever enrollment is reopened for an operator-controlled recovery ceremony.

**Why:** An AAL1 session can enroll and verify a new Supabase TOTP factor, producing a generic AAL2 token that does not identify which factor was used. Provider-level enrollment locking prevents that escalation and also blocks public factor removal, while preserving challenges for established factors.

**How to apply:** Use email OTP only for AAL1 recovery. Require verified email, local role, AAL2, and an exact operator lock flag for privileged access and identity rebinds. Do not expose factor enrollment or removal in the application. During recovery, disable the application lock before enabling provider enrollment; restore provider enrollment lock before re-enabling privileged access. Audit identity rebinds and restrict them to the sole active owner with the same verified email.