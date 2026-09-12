# Part 3 release handoff

Status: production migrations applied following explicit user approval;
frontend activation and VPS upgrade remain pending at this checkpoint.
Review the code in [PR 69](https://github.com/rhieryayunin-gass/sekola/pull/69).
Automatic approval review initially rejected the live access expansion. The user
subsequently explicitly approved all three migrations and OWNER cross-tenant
administration. The approved migrations were then applied successfully through
the normal migration tool on 2026-09-12.

## Exact production approval scope

The target is the existing OSEKOLA Supabase project `xrqjutbwnlkogpfhtuwr`.
These reviewed migrations are now applied, in order:

| Migration | Persistent change |
| --- | --- |
| `20260912174636_owner_workspace_part3.sql` | Give the OWNER role `tenants.read_all`, `tenants.create`, `tenants.update_all`, and `tenants.deactivate`; add global owner tenant/profile/module/plan, contract, invoice, receipt, expense and partner operations; add transactional invoice notifications; permit cross-tenant access to the fixed school-logo path only. |
| `20260912174656_owner_users_part3.sql` | Add service-role-only owner user administration with audit logging, role changes, archive/restore and self-removal protection. Passwords never enter the SQL payload or audit log. |
| `20260912174715_module_access_part3.sql` | Enforce eight per-tenant module flags in database access and permission functions, reject archived/inactive identities, and expose the check used by the new API guard. |

All current and future accounts assigned OWNER receive platform access. Other
roles retain tenant scope. The preflight found one active OWNER. This gives that
role authority to view and administer other schools and their user directory;
it also permits changing module availability and tenant status. Those are the
specific access expansion and operational impact that the user approved.

The migrations do not fabricate historical balances, invoices, payments or
contracts. Partner payment links require the actual provider URL. Opening a link
does not transfer money. No real-user password reset is part of deployment.

Migration and role/RLS/RPC verification are complete. Next: merge the verified PR,
await the new Vercel release, install the matching API release, then complete the
Part 3 live verification workflow and production API access checks.

## Build artifacts

CI builds and tests the portable Linux Node 22 API archive and validates its
checksum, archive paths, relative dependency links, metadata and staging.
Successful PR runs retain `osekola-api-review-<test-merge-sha>` for review.
The embedded source SHA is GitHub's tested merge commit, not the PR branch SHA.
These are review artifacts, not an instruction to install before approval.

After the approved merge, use `osekola-api-<main-sha>` from that successful main
CI run. It contains `osekola-api.tar.gz`, its `.sha256`, `-release.txt`, and the
first-install `-stage.sh`. Retention is 14 days. Use the checksum printed by the
packaging job as the independent reference; ensure `-release.txt` matches the
reviewed main commit.

## Existing VPS upgrade

The session has no VPS deployment credential. An operator must carry out the
existing deployment procedure in `OSEKOLA_DEPLOYMENT.md`, section 4. The bundled
stage script is only for a first installation and refuses an active API.

1. Confirm the existing `osekola-api` unit, isolated Node 22 runtime, current
   symlink target and loopback port 3020. Record the previous release for rollback.
2. Verify the downloaded archive against the CI checksum and reviewed main SHA.
   Extract with Python `tarfile`'s `data` filter into a new, empty, root-owned
   `/opt/osekola/releases/<main-sha>` directory. Validate `package-meta.json`
   (source SHA, Linux, matching architecture and Node 22), `release.env`,
   `dist/main.js`, and the contained production dependencies, using the same
   checks as `ops/stage-osekola-api.sh` before publishing the directory.
3. Switch `/opt/osekola/current` with a temporary symlink and atomic rename.
   Restart only `osekola-api`. Preserve `/etc/osekola/api.env`, the existing unit,
   Node runtime, Nginx configuration, and the sibling applications.
4. Check local and public health/readiness return the reviewed release SHA,
   readiness succeeds, and the listener remains loopback-only. With an OWNER
   session, `/api/v1/owner/users/capabilities` must return version 3. Confirm
   unauthorized accounts cannot use the owner API and disabled modules reject
   reads as well as writes. Use a disposable account for user mutation checks.
5. If service start, readiness or release checks fail, atomically restore the
   previous symlink and restart only `osekola-api`; verify the previous health.
   Keep both release directories for investigation. Database migrations are
   additive but require separate review before any reversal.

Until step 4 succeeds, user mutation controls remain unavailable and full legacy
API read enforcement is pending. Passing isolated API tests does not establish
that the VPS was upgraded.

## Verification remaining after activation

`verify-part3-live.yml` checks all five deployed owner pages and mobile overflow,
then uses a disposable Auth account with the new API on its runner to check
create/edit/status/override/password/archive/restore. It masks names/table rows
in screenshots and deletes the generated account. It neither resets a real
user password nor creates live invoices or transfers money. The workflow also
reports the separately deployed production API capability; an API-pending
report must remain an open release item even if isolated checks pass.
