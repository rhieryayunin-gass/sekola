# Phase 55 — Production readiness

Status: implementation checkpoint; **production release is not complete**.
This phase adds executable deployment and operational tooling. A successful
build or migration is not evidence of a deployed, recoverable production system.

## Evidence carried forward

- Migrations `0056`–`0059`: staging inspect and apply succeeded on 2026-09-10;
  [PR #48](https://github.com/rhieryayunin-gass/sekola/pull/48) records the result.
- [Issue #49](https://github.com/rhieryayunin-gass/sekola/issues/49) tracks the
  seven Phase 51–54 live checks; they remain unchecked.
- Phase 43–50 live Operations/Analytics workflow verification remains pending.
- Phase 55 has no new database migration. No production host, domain, Supabase
  credentials, deployed release, backup destination or operational owner has
  been verified as part of this implementation.

## Production environment and deployment

The reference deployment is one Linux Docker host with Docker Compose v2,
separate web/API domains and a production Supabase project. It is a single-host
baseline, not high availability. An existing hosting provider can run the same
two images behind its managed TLS ingress instead.

1. Choose the production host/region, domain names and operational owner. Set
   DNS to the ingress, permit ports 80/443 and restrict administrative access.
   API port 3001 and web port 3000 are internal only. Configure edge request
   limits for the expected school workload and verify Supabase Auth rate limits.
2. Configure production Supabase Auth Site URL, explicit redirect allowlist and
   email delivery. Use a project separate from development/staging. Review
   migration history through `0059` using the production migration process and
   a pre-change backup. The existing trusted staging runner targets staging;
   do not repurpose it by swapping secrets or infer production migration success.
3. Check out the exact reviewed commit with green CI. Copy the templates:

   ```bash
   cp deploy/production.env.example deploy/production.env.local
   cp deploy/api.env.example deploy/api.env.local
   chmod 600 deploy/production.env.local deploy/api.env.local
   ```

   Fill public values in `production.env.local`; `RELEASE_SHA` must be the full
   source commit SHA from `git rev-parse HEAD`. Keep server Supabase credentials
   only in `api.env.local`; set `CORS_ORIGINS` to the exact HTTPS web origin.
   Service-role/secret keys never belong in web configuration or Docker build
   arguments. The web build accepts a publishable key or legacy anon JWT and
   rejects privileged keys. Public values are compiled into the frontend:
   rebuild when switching environment. Store private configuration through the
   hosting secret manager or host files accessible only to the deployment owner.
4. Build and record image IDs/base image digests and the source SHA in the
   release record. Dockerfiles use maintained major-version base tags; freeze
   the resulting images/digests for promotion and rollback, not a later rebuild.

   ```bash
   docker compose --env-file deploy/production.env.local -f deploy/compose.production.yml build --pull
   docker compose --env-file deploy/production.env.local -f deploy/compose.production.yml images
   docker compose --env-file deploy/production.env.local -f deploy/compose.production.yml up -d --no-build --wait
   ```

   Caddy obtains TLS certificates and redirects HTTP. Its persistent volumes
   retain certificates/configuration; preserve these volumes on upgrades.
   API/web run as non-root with read-only filesystems, limited resources,
   dropped capabilities, bounded log rotation and a 30-second shutdown window.
   The default resource limits require validation against representative load.
5. Configure GitHub environment **variables** `API_ORIGIN`, `WEB_ORIGIN`, and
   `EXPECTED_RELEASE_SHA` for the selected staging/production environment.
   Run **Read-only deployment verification** from Actions. Missing settings,
   wrong release, failed TLS, failed dependency or unexpected auth response
   fail the job. It uses no credentials and makes no database mutation.
6. Complete the live release checklist below before admitting general traffic.

### Rollback

Retain the previous paired web/API images and their public configuration. On
failed probes or elevated errors, record the incident and restore the previous
`RELEASE_SHA` in the deployment environment, then run Compose `up -d --no-build
--wait`. Re-run deployment probes and representative authenticated workflows.
Only use this when database compatibility with the previous image was verified.
Phase 55 makes no schema changes. Do not automatically reverse applied SQL;
database incidents follow the recovery procedure. Test rollback on staging and
record old/new image IDs, start/end times and outcome before production release.

## Monitoring and logging

| Signal | Contract / initial operational target |
| --- | --- |
| API liveness | `GET /api/v1/health`: 200, service and full release SHA; independent of Supabase |
| API readiness | `GET /api/v1/ready`: 200 only when a bounded Supabase calendar query succeeds, otherwise 503; 2-second timeout |
| Web liveness | `GET /healthz`: 200, service and release; bypasses auth/session refresh |
| Anonymous API access | `GET /api/v1/auth/me`: 401 without a token |
| Availability alerts | External probe every 60 seconds, alert after 3 consecutive failures; route to a tested on-call destination |
| Latency/errors | Aggregate HTTP route-template p95 and 5xx over 5 minutes; initial review thresholds 1 second p95 and 1% 5xx (minimum 100 requests) |
| Capacity | Alert on sustained memory/CPU pressure, disk over 80%, container restarts and Supabase connection saturation |
| Backup age | Alert if latest successful off-host backup exceeds the agreed RPO; initial proposed RPO 24 hours |

Readiness coalesces simultaneous queries and does not cache a successful result.
It checks dependency connectivity/schema availability, not every table, migration,
Auth/Storage service, tenant permission or business workflow. Docker healthchecks
use liveness; Compose health alone does not prove database readiness. A reverse
proxy can still serve a live API while its dependency is down: use the external
probe and the provider's readiness/traffic controls for routing decisions.

`node ops/verify-deployment.mjs` is a read-only probe usable by an external
scheduler with the three variables above. It emits one JSON result per check
and exits nonzero if any check fails. The manual GitHub workflow is an on-demand
check; it does not install continuous monitoring or an alert destination.

API HTTP logs are JSON with `event`, validated/generated `requestId`, HTTP
method, route template, status, duration and release. `X-Request-ID` is exposed
to the browser for correlation. Raw URLs/query strings, headers, bodies,
cookies, tokens and account/tenant identities are not recorded by this logger.
Server errors use a generic public response and sanitized error event. Keep
application audit records in their existing database tables; operational logs
are not an audit replacement. Forward stdout/stderr to restricted centralized
storage, select retention with the school operator (initial proposal 14 days),
and verify search by request ID. Caddy access logging is not enabled by default.
Review provider/ingress logs separately before enabling them, since they may
record raw URLs. Retention and alerts are configuration gates, not yet completed.

## Backup and recovery

Use Supabase managed backups/PITR as the primary hosted recovery path, according
to the actual project plan and agreed RPO/RTO. Database backups do **not** contain
Storage object bytes; separately protect bucket contents, Auth/provider settings,
secrets, custom role credentials and deployment configuration. See the official
[Supabase backup scope and recovery guide](https://supabase.com/docs/guides/platform/backups).
The project plan, retention, object inventory and backup destination must be
confirmed before choosing the production schedule.

The repository also supplies an encrypted logical database snapshot and a local
recovery rehearsal. `pg_dump` exports readable schemas/data, not cluster roles,
server configuration or Storage object bytes. An export failure is a failed
backup, never a partial success. The CI rehearsal uses a plain PostgreSQL 17
fixture; it does not prove managed Supabase recovery or restored logins.

1. Install a PostgreSQL client matching the server major version and `age`
   (the reference tools image is `ops/Dockerfile.backup`, PostgreSQL 17).
   Use a dedicated least-privilege account with sufficient backup read access,
   TLS verification and a protected `PGPASSFILE` (0600). Supply standard libpq
   `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE=verify-full`, and CA
   settings securely. Never put connection passwords in command arguments.
2. Generate an age identity on the recovery system and escrow the private key
   separately from backups. Give only its public recipient to the backup job.
   On the backup worker, run:

   ```bash
   bash ops/backup-database.sh /secure-backups/release-timestamp.dump.age
   ```

   `AGE_RECIPIENT` is required. The script streams dump output into encryption,
   publishes only after both commands succeed, refuses overwrite, and removes
   partial output on failure. Copy encrypted output to access-controlled off-host
   storage, verify the uploaded object/checksum and enforce retention there.
   Schedule backups and alert on failure/staleness through the selected host;
   neither upload nor a production schedule is installed by this code change.
3. Rehearse with a **disposable local** PostgreSQL database ending in `_restore`,
   created from `template0`. Provision required cluster roles first; dumps do not
   contain them. Set `PGHOST=127.0.0.1`, `PGDATABASE`, `PGUSER`,
   `RESTORE_CONFIRM` equal to that target database name, `AGE_IDENTITY_FILE`
   to the protected identity path and `TMPDIR` to an encrypted scratch volume
   or sufficiently sized tmpfs. Then run:

   ```bash
   bash ops/restore-rehearsal.sh /secure-backups/release-timestamp.dump.age
   ```

   The script refuses remote or nonempty targets, never drops objects, verifies
   decryption before mutation, and restores in one transaction. Ownership uses
   the restoring user (`--no-owner`); ACLs still require their referenced roles.
   This is deliberately not an in-place production restore command. Managed
   Supabase extensions/roles may require the provider's documented restore path.
4. For an actual incident, stop writes through the deployment owner, preserve
   incident evidence, select a known-good recovery point, and follow the hosted
   backup/PITR procedure in an isolated recovery project first. Restore object
   storage/configuration too; reconcile Auth accounts, row counts, tenant/RLS
   permissions, calendars/notifications, approvals, payments/refunds and file
   access. Repoint deployment only after acceptance. Rotate credentials if the
   incident involved exposure, re-run live regression, then resume traffic.
5. Record backup timestamp, off-host location/checksum, restored row counts,
   recovery point, elapsed recovery time, evidence and operator sign-off. Initial
   proposed targets are RPO 24 hours and RTO 4 hours; they are not measured
   guarantees. A production-sized restore rehearsal must validate or revise them.

Implementation references: [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[age](https://github.com/FiloSottile/age),
[Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[pnpm deploy](https://pnpm.io/cli/deploy).

## Regression scope and release checklist

Implementation checkpoint [PR #50](https://github.com/rhieryayunin-gass/sekola/pull/50)
passed all three CI jobs in [run 122](https://github.com/rhieryayunin-gass/sekola/actions/runs/34478748444)
on source commit `05d23cea5521a1df52acfb7749ebdb5f1557fe83`.

`pnpm check` covers API/web lint, types, 119 API tests, 25 web tests and builds.
CI additionally replays every migration through `0059`, checks Phase 50 upgrade
fixtures and concurrent transactions, encrypts/restores the fixture and reruns
SQL invariants, and builds/boots both production images. Container checks cover
non-root/read-only execution, release identity, unavailable-database 503,
anonymous denial across 12 API entry points, login page assets and protected-page
redirect. Missing Auth/Authorization module imports uncovered during full API
startup are repaired explicitly in their consuming feature modules. Caddy and
Compose configuration are validated without contacting a production environment.

These are hermetic regression checks. The following live gates remain unchecked:

- [ ] Production host, domains, owner, secret delivery, Supabase/Auth configuration and migration history verified.
- [ ] Deployment uses recorded image digests; TLS, liveness, readiness, auth denial and expected release pass against the actual target.
- [ ] Continuous monitoring, capacity limits, alert delivery and on-call acknowledgement tested.
- [ ] Centralized logs, request correlation, redaction and retention verified on the deployed system.
- [ ] Managed database backup/PITR scope, Storage object backup, key escrow, off-host upload and scheduled backup alerts verified.
- [ ] Production-sized isolated recovery and rollback rehearsal passes within accepted RPO/RTO, with evidence and operator sign-off.
- [ ] Phase 43–50 live operations workflow, calendars, notifications and analytics verified.
- [ ] All seven Phase 51–54 checks in issue #49 pass with representative multi-tenant accounts and recorded performance evidence.
- [ ] Final browser regression passes login/refresh/logout, role navigation, mobile/desktop layouts, Academic/Learning/Exam, Attendance, Finance, Team+ Kanban, Operations and Analytics against the release candidate.
- [ ] Release owner reviews evidence and approves general production traffic; Phase 55 marked complete only afterward.
