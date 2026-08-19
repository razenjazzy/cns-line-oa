# Security Review

Use this skill only when modifying:

- authentication
- authorization
- LINE webhook validation
- multiple LINE channels
- user identity
- service access
- Odoo account access
- credentials or secrets

## Review scope

Inspect only changed code and directly related security code.

Check:

1. Authentication is not weakened.
2. Authorization is enforced server-side.
3. LINE webhook validation uses the correct channel secret.
4. Channel credentials are isolated.
5. User identity is not trusted without verification.
6. Users cannot access unauthorized services.
7. Conversation or user state does not leak across channels.
8. Secrets are not hardcoded or logged.

## Output

Return only concrete findings:

- issue
- affected file
- risk
- minimum recommended fix

Do not perform unrelated refactoring.
