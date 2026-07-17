# Corporate API summary

All routes require an authenticated session and role/action permission.

- `GET /api/corporate/overview`
- `GET /api/corporate/documents/:id/lifecycle`
- `POST /api/corporate/documents/:id/transition`
- `POST /api/corporate/documents/:id/versions`
- `GET|POST /api/corporate/governance/approval-matrix`
- `GET /api/corporate/audit`
- `GET /api/corporate/integrations/health`
- `POST /api/corporate/integrations/:provider/runs`
- `GET|POST|PATCH /api/corporate/reports...`
- `GET|POST /api/corporate/saved-views/:module`

Every API response includes an `X-Request-ID` response header. Supply an existing request ID using the same header when tracing a browser operation through server logs.

## Sage Intacct integration

- `GET /api/corporate/integrations/health` — real-time status, latency, and last sync for every connector (database, Sage Intacct, SMTP, OpenAI, CDTFA).
- `POST /api/corporate/integrations/sage-intacct/runs` with `{"operation":"connection_test"}` — live credential/API validation.
- `POST /api/corporate/integrations/sage-intacct/query` — audited read-only `readByQuery` request.

The query endpoint accepts `object`, `fields`, `query`, and `page_size`. It only allows the following objects: `GLDETAIL`, `GLACCOUNT`, `LOCATION`, `DEPARTMENT`, `VENDOR`, `APBILL`, and `APBILLITEM`. The maximum page size is 1,000 rows. Credentials and API session identifiers are never returned.
