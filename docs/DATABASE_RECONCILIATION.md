# Staging Database Reconciliation

Last audited: 2026-09-02

## Verified state

The staging project is reachable with the configured GitHub Environment. The
remote migration history is empty, while the objects represented by migrations
`0001` through `0005` already exist. The supplied staging audit also found:

- 2 Auth users and 2 matching Core profiles, with no orphaned records;
- 1 tenant, 6 user levels, 6 roles, and 14 permissions;
- legacy `tenants`, `user_level_roles`, `calendars`, and `calendar_events`
  objects that were created before repository migration tracking;
- RLS disabled on `tenants` and `user_level_roles`;
- no `updated_at` column or update trigger on `tenants`;
- an Auth insert trigger that cannot create a profile because it omits the
  required `users.tenant_id` value.

## Repository remediation

Migration `0006_legacy_schema_reconciliation.sql` records the legacy objects,
adds the missing safe constraints/indexes/triggers, and enables RLS on the two
exposed tables. It is idempotent so it can run against the existing staging
schema or a new database after migrations `0001` through `0005`.

Migration `0007_auth_user_sync.sql` replaces the broken Auth trigger with a
tenant-aware function. The tenant identifier must come from protected Auth app
metadata and must resolve to an active tenant. Existing matching profiles keep
their tenant during backfill. The migration stops instead of guessing a tenant
if an Auth user has no valid Core profile or tenant metadata.

The first live verification showed that Supabase Admin `createUser` inserts the
Auth row before applying custom app metadata inside the same transaction.
Migration `0008_auth_user_metadata_sequence.sql` accounts for that sequence: it
allows only the initial metadata-free insert, then validates the protected
tenant metadata and creates the Core profile when `raw_app_meta_data` is
updated. Invalid tenants and attempts to move an existing profile across
tenants still abort the transaction.

The API now derives tenant context from the authenticated operator. User read,
create, update, and deactivate operations are scoped to that tenant; clients
cannot choose a tenant identifier in the request body.

## Approved staging sequence

1. Mark existing remote migrations `0001` through `0005` as applied without
   rerunning their non-idempotent table creation statements.
2. Apply `0006` and `0007`; confirm both versions are recorded remotely.
3. Apply the sequencing correction in migration `0008`.
4. Run the repository quality gate and live Auth verification.
5. Merge Phase 03 only after the staging run and GitHub CI both pass.

No legacy data or schema object is deleted by this sequence.
