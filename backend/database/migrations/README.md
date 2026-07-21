# Migrations

Naming convention: `YYYY-MM-DD_description.sql`. Apply files in filename (date) order — there is no separate migration runner, so the date prefix is the only ordering guarantee.

Most migrations run lazily: the API creates missing tables/columns the first time an authorized route that needs them is used. Two are documented as required manual steps for production deployment (see root `README.md` → "Database migration"):

```text
2026-07-17_corporate_platform.sql
2026-07-17_entra_sso.sql
```

When adding a new migration, prefix it with today's date so it sorts after every existing file.
