# XBFS Operations Hub

Corporate operations platform for restaurant reconciliations, document control, prepaid amortization, approvals, exceptions, closing activities, audit records, and integrations.

## Stack

- Astro frontend
- Node.js and Express backend
- MySQL
- ExcelJS and SheetJS
- JWT sessions with Microsoft Authenticator-compatible TOTP

## Local installation

```bash
npm install
npm --prefix backend install
cp backend/.env.example backend/.env
npm run dev
```

Run the backend in a second terminal:

```bash
npm run backend:dev
```

Frontend: `http://localhost:4321`
Backend: `http://localhost:3001/api`

## Corporate modules

- Document lifecycle and immutable versions
- Approval matrix
- Operational audit center
- Integration center
- Scheduled report registry
- Saved user views
- Security request IDs, rate limiting, session controls, and HTTP security headers

## Database migration

Apply:

```text
backend/database/migrations/2026-07-17_corporate_platform.sql
backend/database/migrations/2026-07-17_entra_sso.sql
```

The API also creates the corporate tables lazily when an authorized corporate route is first used. The migration remains the recommended production deployment path.

## Verification

```bash
npm run check
```

See `docs/DEPLOYMENT.md`, `docs/CORPORATE_FEATURES.md`, and `SECURITY.md` before production deployment.

## Clean release archives

After a successful build, create source and deployment packages without secrets, dependencies, uploads, or generated reports:

```bash
./scripts/create-release.sh
```
