# Production deployment

## 1. Clean source

Do not deploy `.git`, `node_modules`, `.astro`, source `.env` files, test uploads, profile photos, database exports, or generated spreadsheets.

## 2. Rotate credentials

The source archive previously contained a backend `.env`. Treat every value from that file as exposed and rotate it before deploying this version.

## 3. Environment

Create `backend/.env` from `backend/.env.example`. At minimum configure database variables, a long random `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and `FRONTEND_ORIGINS`.

## 4. Database

Run all pending SQL migrations, including `2026-07-17_corporate_platform.sql` and `2026-07-17_entra_sso.sql`, using a database account with schema-change privileges. After migration, the application account can use reduced privileges appropriate to runtime operations.

## 5. Build

```bash
npm ci
npm run build
npm --prefix backend ci --omit=dev
```

Copy `dist` to the frontend location used by the Express deployment or web server configuration.

## 6. Runtime

Run Node with `NODE_ENV=production`. Use HTTPS, a reverse proxy, process supervision, daily database backups, centralized logs, and filesystem backups for uploads.

## 7. Health verification

Check `/api/health`, authenticate with a test account, verify MFA, upload a test workbook, inspect the document lifecycle, and test all role boundaries before granting production access.


## 8. Scheduled report worker

Configure a server cron job to run:

```bash
cd /path/to/backend && npm run reports:run
```

Run it at the frequency required by the business, such as every 15 minutes. Configure `SMTP_*` variables to send reports; without SMTP, reports are still generated privately and can be downloaded from Report Center.

## 9. External integrations

- Register a Microsoft Entra application, configure its redirect URI, and populate `ENTRA_*` variables before enabling corporate SSO.
- Configure Sage Intacct Web Services credentials and permissions before using the live connection test or read-only query endpoint.
- Use an application-specific SMTP account and store its credentials only in the production secret manager or environment.

## 10. Release packaging

From the source root, run `./scripts/create-release.sh` after `npm run build`. The generated archives exclude `.env`, `.git`, dependencies, uploads, generated reports, logs, and internal ZIP files.
