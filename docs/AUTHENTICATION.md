# Authentication

SEKOLA AI uses Supabase Auth with cookie-based SSR sessions. The browser SDK
handles login and logout, while the Next.js proxy refreshes sessions and
protects private routes before rendering.

## Environment

The web application requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for new Supabase projects, or
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` for legacy projects

The NestJS API requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must never be exposed through a `NEXT_PUBLIC_` variable.

## Session flow

1. The user submits email and password on `/login`.
2. Supabase stores the PKCE session in cookies.
3. The Next.js proxy calls `getClaims()` to verify identity and refresh cookies.
4. Anonymous dashboard requests are redirected to `/login`.
5. The dashboard verifies claims again before rendering protected content.
6. The browser auth listener keeps the Zustand UI state synchronized.
7. NestJS endpoints independently validate Bearer tokens with Supabase Auth.
8. The API rejects users whose Core profile is missing or inactive.

Session objects are used for UI state only. Authorization decisions must use
verified claims on Next.js or a verified Bearer token on NestJS.

## Database migration

Migration `0006_legacy_schema_reconciliation.sql` records and safely completes
the legacy tenant, authorization, and calendar schema without deleting data.
Migration `0007_auth_user_sync.sql` then creates the tenant-aware relationship
between `auth.users` and `public.users`. New Auth users must carry a valid active
`tenant_id` in protected app metadata. Apply migrations in numeric order to a
test or staging Supabase project before performing the live verification.

## Required live verification

- Sign in with a valid active user
- Reject invalid credentials
- Redirect an anonymous request away from `/dashboard`
- Preserve a safe internal `next` path after login
- Refresh an expired access token through the proxy
- Reject an inactive Core user at the API
- Sign out and reject the previous session

## Staging workflow

The manually triggered `Staging Authentication Verification` GitHub Actions
workflow has two modes:

- `inspect` links the staging project, lists migration status, and performs a
  migration dry run. It does not apply SQL.
- `apply` repeats the inspection, applies pending migrations, runs the complete
  project quality gate, starts the production API and web builds, and executes
  live authentication checks with a temporary user. The temporary user is
  deleted even when a verification assertion fails.

Configure a protected GitHub Environment named `staging` with these variables:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Configure these environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`

Never place the service-role key, database password, or access token in a
repository variable, workflow input, commit, issue, pull request, or chat.

The workflow only supports an explicit manual trigger. Select `inspect` until
the dry-run output has been reviewed, then select `apply` for the approved
Phase 03 verification run. It never receives staging credentials from an
automatic pull-request event.

See `DATABASE_RECONCILIATION.md` for the audited staging state and the required
migration-history baseline before applying migrations.
