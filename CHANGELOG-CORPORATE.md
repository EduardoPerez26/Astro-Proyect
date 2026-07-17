# Corporate platform release — 2026-07-17

## Implemented

- Corporate design tokens, reusable page components, standardized controls, status badges, empty states, responsive panels, and graphite visual identity.
- Executive dashboard indicators for close progress, document review, exceptions, financial exposure, reports, and integrations.
- Close Center with periods, tasks, ownership, deadlines, completion progress, and status control.
- Exception Center with materiality severity, owners, due dates, root-cause and resolution workflow.
- Document lifecycle with immutable version history, SHA-256 file hashes, review/approval/post/archive states, and transition events.
- Approval matrix with levels, SLA, mandatory rejection comments, and separation-of-duties configuration.
- Operational Audit Center with request IDs, actor, department, resource, before/after values, and CSV export.
- Integration Center for Microsoft Entra ID, Sage Intacct, and AI provider readiness.
- Live Sage Intacct credential testing and audited read-only queries against an explicit object whitelist.
- Scheduled reports in CSV, XLSX, and PDF with private output storage, optional SMTP delivery, manual execution, and cron worker.
- Saved views, global UX notifications, unsaved-change protection, session expiration warnings, and keyboard shortcuts.
- Microsoft Entra ID OAuth/OIDC with PKCE, nonce/state validation, JWKS signature verification, and one-time exchange tickets.
- Hardened uploads, controlled file types, protected downloads, audit events, and lifecycle deletion restrictions.
- Request IDs, security headers, rate limiting, input sanitization, cookie-origin protection, graceful shutdown, and session revocation.
- Automated backend tests, CI workflow, source checks, deployment documentation, environment template, and security runbook.

## External activation required

The code is complete, but these services require organization-owned credentials or infrastructure before they can become active:

- Microsoft Entra application registration and redirect URI.
- Sage Intacct Web Services sender/user credentials and permissions.
- SMTP server for emailed reports.
- Production MySQL migration and backup.
- HTTPS reverse proxy and scheduled report cron job.

## Compatibility decision

The existing reconciliation and property-management calculation engines were preserved rather than rewritten wholesale. New corporate functionality is isolated in modules and routes to reduce regression risk in financial calculations.
