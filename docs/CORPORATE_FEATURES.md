# Corporate platform features

## Document governance

Each newly uploaded file receives a SHA-256 fingerprint and an initial `uploaded` version. Replacing the file creates an additional version rather than silently overwriting the workflow history. Supported states are:

`draft → uploaded → under_review → changes_requested → approved → posted → archived`

Documents can also be rejected. Comments are mandatory for change requests and rejection decisions. Approved, posted, and archived versions are locked.

## Close Center

Close periods group operational tasks by month and department. Tasks support assignment, priority, due dates, materiality, review, verification, and period locking.

## Exception Center

Exceptions have references, severity, financial exposure, owner, reviewer, due date, root cause, resolution, and verification. Severity is calculated from materiality when it is not explicitly supplied.

## Governance

The approval matrix defines preparer, reviewer, approver, approval levels, SLA, rejection-comment requirements, and separation-of-duties requirements by workflow.

## Audit Center

Operational changes record user, department, request ID, IP, user agent, resource, previous value, new value, metadata, and timestamp.

## Integration Center

The center validates configuration readiness for Sage Intacct, Microsoft Entra ID, and the selected AI provider. For Sage Intacct, authorized administrators can perform a live API connection test and execute audited, read-only queries against a restricted object whitelist. Integration runs and outcomes are recorded without returning credential values or API session tokens to the browser.

Microsoft Entra ID is configuration-ready but must still be registered in the customer tenant and connected to a verified OpenID Connect implementation before enabling production SSO.

## Scheduled reports

Administrators can register daily, weekly, or monthly reports and queue due reports. Actual email delivery requires a mail/worker service configured by the deployment environment.
