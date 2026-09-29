# Security and operation

## Controls in the implementation

- Passwords use Django's Argon2id hasher with unique salts. Password-reset changes invalidate previous authenticated sessions; logout deletes the current session. Verification/reset tokens are random, hashed in their token records, expiring, and one-use.
- Database-backed cookies are HttpOnly and SameSite=Lax. Production uses secure cookies, HTTPS redirects, HSTS, explicit allowed hosts, a same-origin CSRF policy, content-type protections, and frame denial. Unsafe anonymous auth endpoints are CSRF protected too.
- DRF serializers bound strings, choices, dates, numeric values, and collection sizes. ORM queries use parameters. React escapes text; PDF text is escaped; CSV fields are protected against spreadsheet-formula injection. There is no raw HTML answer rendering or code execution.
- Every resource access checks role and ownership. Published drives snapshot their policy and question pool, so later recruiter edits do not silently change an ongoing drive's criteria.
- Persistent API, login, email, invite, and submission limits survive process restarts. Account-specific auth throttles supplement client-address throttles. Generic auth responses reduce account enumeration.
- Rate-limit buckets are indexed and pruned by the worker; retention cleanup also removes stale buckets and old audit events. The question-bank API is bounded to 100 rows by default (200 maximum) with offset pagination, preventing the governed catalog from becoming a single large response.
- Audit events contain actor UUID, event name, object UUID, timestamp, and HMAC network identifier. Exception logs expose safe codes/types rather than request bodies, passwords, provider keys, answer text, or email addresses.
- Invitation URLs carry the secret in the fragment. The browser submits it via POST, so it does not appear in normal request URLs or referrers. Invites are account-bound and expire; redemption creates only one interview. One active browser tab can write at a time, with an explicit takeover flow.
- Candidate answer submissions are idempotent. Deadlines use server time. The last timely draft is preserved at timeout. Changing tabs records an integrity signal but is not treated as proof of cheating or used as an automatic score penalty.
- The long-lived Gemini key stays server-side. A live candidate session receives only a one-use constrained token, valid for 90 seconds to connect and 20 minutes in-session. The browser streams microphone PCM directly to Gemini to obtain a transcript; HireLens does not record or upload camera or audio media, and stores only the final answer transcript. Candidate identity fields are excluded from evaluation payloads. Free mode requires a demonstration acknowledgement.
- Recruiter MFA uses a server-side TOTP seed with recovery codes; sign-in accepts a six-digit authenticator code when MFA is enabled. Workspace membership changes, profile/privacy actions, password changes, and MFA events are audited without answer text or PII in logs. Run `python manage.py enforce_retention` on a scheduled job to redact answer text after each candidate's configured retention period.

## Operational boundaries

This is a locally verified application, not an independently audited hiring instrument. Model-based grading, similarity thresholds, question difficulty, and recommendation cutoffs require validation on representative, consented benchmark data before real hiring use. The product does not claim to remove bias or prove equivalent difficulty across candidates. Review low-confidence results, accommodations, and cited evidence before making decisions.

The free Gemini data policy permits fictional demonstrations by default. It does not anonymize arbitrary answer text. Do not interpret changing an environment flag as establishing legal permission to process real candidate data.

Use PostgreSQL behind the hosting provider's TLS controls. The application does not implement field-level PII encryption or a managed key vault; disk/database encryption and backups depend on the host. `.mail/`, `.runtime/`, test artifacts, and the local SQLite database contain private development material and must remain uncommitted. Email jobs temporarily contain delivery addresses and link bodies; completed job payloads are cleared.

The free single-instance deployment is intentionally modest. List endpoints are suitable for demo-sized organizations, and analytics run directly against the relational database. Large-scale pagination, calibrated question exposure control, and distributed workload isolation would be follow-on scaling work. Free services have no guaranteed availability; a sleeping host can delay jobs until the next request.

## Start, stop, and inspect

- Run `python scripts/run.py` using the virtual environment. Ctrl+C stops both supervised child processes.
- `GET /api/health/` checks database reachability without exposing provider secrets. The invitation preview checks worker freshness and key configuration before starting an interview.
- Run `python manage.py worker --once` to process one due job for diagnosis.
- Run `python manage.py check_gemini` to test live provider credentials with a fictional answer. It consumes free quota and reports safe errors.
- Run `python manage.py check --deploy` under the real production environment. Subdomain HSTS and preload are intentionally not enabled automatically for domains the operator may not own; decide them with domain ownership in mind.
- Database records expose job state, retry count, availability time, lease expiry, and a safe error code. Do not log the job payload to investigate a failure.

| Error code | Meaning / action |
| --- | --- |
| `ai_not_configured` | Set the server's Gemini key and restart. |
| `ai_configuration_error` | Key, project access, region, or model is rejected. Check AI Studio and the configured model names. |
| `ai_rate_limited` / `ai_quota_wait` | Provider or application quota reached. Let the durable queue wait; don't enable billing to make a demo pass. |
| `ai_connection_failed` / `ai_provider_unavailable` | Temporary connection/provider failure; work is retried. |
| `ai_output_validation_failed` / `ai_evidence_validation_failed` | The response did not satisfy the schema or quote requirements. Retry or inspect the underlying evidence as an authorized reviewer. |
| `ai_report_evidence_invalid` | Generated report cited a nonexistent answer or quote; narrative was rejected. Stored numeric scores remain available. |
| `email_delivery_failed` | Verify Resend sender, key, delivery quota, and provider status. |
| `email_not_configured` / `email_configuration_error` | In production, set a Resend key and verified `EMAIL_FROM`; local development writes messages to `.mail/`. |

## Backups and retention

Choose a retention period before inviting real users. Back up PostgreSQL using its provider export or `pg_dump` to a private location; test restore separately. A backup contains candidate data and must never be committed. The app does not silently delete evidence or promise a retention schedule on the operator's behalf.

For routine cleanup, Django's `clearsessions` removes expired auth sessions. Expired rate buckets and completed jobs can be pruned under an operator-approved retention policy. Avoid deleting report or attempt rows while related exports or reviews must be retained. Deleting an organization cascades its data and is intentionally not exposed as a casual UI action.

Dependency updates should preserve the exact lock files, rerun backend tests and the browser flow, and recheck provider compatibility. No keys are bundled with this repository.
