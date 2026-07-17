# Security runbook

## Suspected credential exposure

1. Disable or rotate the affected credential immediately.
2. Revoke active sessions.
3. Rotate `JWT_SECRET` to invalidate all JWTs when necessary.
4. Review Audit Center and security event records by request ID, user, IP, and time window.
5. Review uploaded files and administrative changes.
6. Record the incident, scope, remediation, and preventive action.

## User departure

1. Disable the user account.
2. Revoke all sessions.
3. Reassign open exceptions, close tasks, approvals, and documents.
4. Remove integration access in the source system.
5. Preserve audit records.

## Backup validation

Perform a restore test regularly. A backup is not considered valid until database records and uploaded documents can be restored together.
