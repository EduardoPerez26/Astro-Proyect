# Corporate platform features

## Document governance

Each newly uploaded file receives a SHA-256 fingerprint and an initial `uploaded` version. Replacing the file creates an additional version rather than silently overwriting the workflow history. Supported states are:

`draft → uploaded → under_review → changes_requested → approved → posted → archived`

Documents can also be rejected. Comments are mandatory for change requests and rejection decisions. Approved, posted, and archived versions are locked.

## Audit Center

Operational changes record user, department, request ID, IP, user agent, resource, previous value, new value, metadata, and timestamp.

## System Center

System Center is the single monitoring surface for the platform: an overall readiness score, environment configuration checklist, open incidents, access load, and recommended actions. It also embeds the real-time integration monitor — live health probes for the database, Sage Intacct, SMTP, the configured AI assistant provider, and the CDTFA tax API reporting status (online/warning/offline), latency, and last successful synchronization. Every health check is also stored in `corporate_integration_latency_history`, populated both by page views and a 5-minute server-side heartbeat, powering per-connector sparklines and a "last 7 days" average latency view. Authorized administrators can perform a live Sage Intacct API connection test and execute audited, read-only queries against a restricted object whitelist. Integration runs are recorded without returning credential values or API session tokens to the browser.

## Reports Center

Administrators can register daily, weekly, or monthly reports, apply quick-start templates, and queue due reports. Actual email delivery requires a mail/worker service configured by the deployment environment.
