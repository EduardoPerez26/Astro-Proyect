# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

XBFS Operations Hub — a corporate operations platform for restaurant reconciliations, document control, prepaid amortization, approvals, exceptions, closing activities, audit records, and integrations (Sage Intacct, Microsoft Entra SSO, CDTFA tax API).

Stack: Astro frontend (server-rendered pages + vanilla JS, no frontend framework) + Node.js/Express backend + MySQL, with ExcelJS/SheetJS for spreadsheet workflows and JWT sessions with TOTP MFA.

## Commands

Frontend and backend are separate npm projects (root `package.json` and `backend/package.json`) and must be installed/run independently.

```bash
npm install                    # frontend deps
npm --prefix backend install   # backend deps
cp backend/.env.example backend/.env

npm run dev                    # astro dev server, http://localhost:4321
npm run backend:dev            # nodemon backend, http://localhost:3001/api (run in a second terminal)
```

Build/verify:
```bash
npm run build                  # astro build
npm run check                  # build + backend check + backend tests (this is the CI gate)
npm --prefix backend run check # node --check syntax pass over key backend entry files (see backend/package.json "check" script for the exact file list — update it when adding a new critical route/service)
```

Backend tests (Node's built-in test runner, not Jest):
```bash
npm --prefix backend test                          # all tests: node --test tests/*.test.js
node --prefix backend --test tests/permissions.test.js   # single file
```
Test files live in `backend/tests/*.test.js` and are plain `node:test` + `node:assert` — no test framework config to worry about.

Other backend scripts:
```bash
npm --prefix backend run reports:run       # runs the scheduled report worker once (cron calls this every 15 min in prod)
npm --prefix backend run diagnose:cdtfa    # scripts/diagnose-cdtfa.js — troubleshoot the CDTFA tax rate integration
```

Release packaging (excludes `.env`, `.git`, deps, uploads, generated reports, logs, internal zips):
```bash
./scripts/create-release.sh
```

## Architecture

### Department model

The app is organized around **departments** (`ar`, `ap`, `operations`, `property-management`, `hr`, `it`, plus a `corporate` cross-department layer), defined centrally in [backend/config/departments.js](backend/config/departments.js). A user's department comes from the `departamentos` table and is attached to `req.departamento` by auth middleware on every request. Route/service/frontend-JS code under `departments/ar/`, `departments/corporate/`, `departments/property-management/` mirrors this split — new department features go in the matching `departments/<code>/` subfolder in `backend/routes`, `backend/services`, and `public/js/departments`, not at the top level.

`backend/config/permissions.js` defines the permission model separately from departments: modules (`tiendas`, `documentos`, `chat`, `approvalCenter`, etc.) each have an action set (`ver`/`crear`/`editar`/`eliminar`/`exportar`), roles (`usuario`/`supervisor`/`admin`/`superadmin`) get default module access, and a user's stored `permisos` JSON overrides those defaults per-module/action. `superadmin` always gets full permissions regardless of stored data. When adding a new protected route, add its permission mapping to `PERMISSION_MAPPING` in [backend/middleware/auth.middleware.js](backend/middleware/auth.middleware.js) and gate the route with `checkPermission(...)` and/or `requireDepartment([...])`.

### Request pipeline (backend/server.js)

Middleware order matters and is commented in `server.js` for a reason — notably **CORS runs before rate limiting** so a 429 response still carries `Access-Control-Allow-Origin` (otherwise the browser reports a CORS failure instead of the real error). Order: `requestContext` (assigns/propagates `X-Request-ID`) → `securityHeaders` (CSP, HSTS, etc.) → CORS → global rate limiter (`API_RATE_LIMIT_MAX`, default 600 req/15min, keyed by JWT user id when a Bearer token is present, else IP) → a stricter `/api/auth` rate limiter → error-notification capture → `csrfOriginGuard` (only enforced for cookie-authenticated state-changing requests; Bearer-token API clients are exempt) → body parsing → `sanitizeRequest` (strips `__proto__`/`prototype`/`constructor` keys from body/query/params) → static `/uploads` → routes.

Rate limiting is in-memory per-process (`backend/middleware/security.middleware.js`, `createRateLimiter`), not Redis-backed — it resets on restart and does not share state across multiple backend instances. Frontend polling loops (chat messages/conversations every 20s, typing indicator every 1.5s, notifications every 90s — see `public/js/chat.js`, `public/js/notificaciones.js`) count against the same per-user global bucket as every other API call that user makes; the typing poll alone is ~40 req/min. If you see spurious 429s in dev, check `RateLimit-*` response headers and `API_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_MAX` in `backend/.env` before assuming a code bug.

Auth: JWT in `Authorization: Bearer` header or `auth_token` cookie, validated against a live `sesiones` table row (not just JWT signature) — sessions can be revoked server-side via `POST /api/auth/sessions/revoke-all`. `verificarTokenStream` is a variant for `EventSource`/SSE connections, which can't set custom headers, so it accepts `?token=` as a query param instead.

### Frontend structure

Astro is used for page shells and routing only (`src/pages/`, `src/layouts/BaseLayout.astro`, `src/components/`) — actual page behavior is vanilla JS loaded via `<script>` tags in `BaseLayout.astro`, one file per feature area under `public/js/` (and `public/js/departments/<code>/` for department-specific pages, `public/js/admin/` for admin pages). There is no client-side framework or bundler-driven component tree; state lives in module-scope JS objects and `localStorage`.

`public/js/corporate-ux.js` monkey-patches `window.fetch` (as `corporateFetch`) to attach an `X-Request-ID` header to every API call and to watch JWT expiry — this happens transparently for all fetches to `window.API_URL`, so don't reintroduce a second manual fetch wrapper elsewhere.

CSS lives in `public/styles/main/NN-*.css`, split into numbered, ordered files (see the comment block at the top of [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro)). **The `<link>` order in `BaseLayout.astro` must match the numeric filename order** — some equal-specificity rules across files depend on cascade order. Add new rules to the most relevant existing part; don't insert new files between the existing ones or reorder the `<link>` tags.

### Database

MySQL via `mysql2/promise` connection pool (`backend/config/database.js`), raw parameterized SQL throughout — no ORM. Schema evolves via sequential, dated migration files in `backend/database/migrations/` (applied manually/in deployment, see `docs/DEPLOYMENT.md`); `sql/schema.sql` is the baseline. The corporate module and Entra SSO tables come from `backend/database/migrations/2026-07-17_corporate_platform.sql` and `2026-07-17_entra_sso.sql` specifically — the API also creates the corporate tables lazily on first authorized corporate route use, but the migration is the recommended production path. Several places in the codebase (e.g. `auth.middleware.js`'s `cargarIdentidadActual`) explicitly catch `ER_NO_SUCH_TABLE`/`ER_BAD_FIELD_ERROR` and fall back to a pre-migration query shape — preserve that pattern when touching auth/session/department code, since not every deployment is guaranteed to be on the latest migration.

Environment variables are validated at startup by `backend/config/env.validation.js`: required vars (`DB_HOST`, `DB_USER`, `DB_NAME`, `JWT_SECRET`) throw in production if missing but only warn in development; optional integrations (Sage Intacct, Microsoft Entra, AI assistant provider) are detected by their presence and warned about only if partially configured.

### Integrations

- **Sage Intacct** (`backend/services/intacct/`) — read-only audited queries against a restricted object whitelist; credentials/session tokens never returned to the browser.
- **Microsoft Entra ID SSO** (`backend/services/entraOidc.service.js`) — optional, gated by `ENTRA_CLIENT_ID`.
- **AI assistant / chatbot** (`backend/services/chatbotTools.service.js`, `public/js/floating-chatbot.js`) — provider selected by `AI_PROVIDER` (Gemini/Anthropic/OpenAI keys).
- **CDTFA tax rate API** (`backend/services/departments/ar/cdtfaTaxrate.service.js`) — troubleshoot with `npm --prefix backend run diagnose:cdtfa`.
- All of the above are surfaced live in **System Center** (`corporate_integration_latency_history` table), refreshed both on page view and by a 5-minute server `setInterval` heartbeat in `server.js`.

### Document lifecycle (corporate module)

Documents move through `draft → uploaded → under_review → changes_requested → approved → posted → archived` (or `rejected`). Every upload gets a SHA-256 fingerprint and a new immutable version rather than overwriting history; comments are mandatory for change-request/rejection transitions; `approved`/`posted`/`archived` versions are locked. See `docs/CORPORATE_FEATURES.md` for the full corporate-module reference (Audit Center, System Center, Reports Center).

## Security notes

Never commit `.env`, DB dumps, uploaded files, or generated spreadsheets (see `SECURITY.md`). If a secret is ever committed, rotate it — deleting the file from a later commit is not sufficient. `docs/DEPLOYMENT.md` and `docs/SECURITY_RUNBOOK.md` cover production rotation/checklist details.
