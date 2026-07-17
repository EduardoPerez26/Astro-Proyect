# Security policy

## Secrets

Never commit `.env`, database dumps, access tokens, API keys, uploaded files, profile photos, or generated spreadsheets. Copy `backend/.env.example` to `backend/.env` only on the target server.

If a secret was previously committed, removing the file is not enough. Rotate the database password, JWT secret, MFA encryption key, AI keys, Sage Intacct credentials, and any other exposed credential.

## Authentication controls

- Normal browser sessions expire after 8 hours by default.
- Remembered sessions expire after 30 days by default.
- MFA secrets are encrypted at rest.
- Active sessions are validated against the `sesiones` table.
- Users can revoke all active sessions through `POST /api/auth/sessions/revoke-all`.
- Authentication and API endpoints are rate-limited.

## Reporting a vulnerability

Report security issues privately to the project administrator. Do not include production credentials, full database exports, or customer documents in an issue tracker.
