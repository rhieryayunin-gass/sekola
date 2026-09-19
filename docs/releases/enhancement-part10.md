# Enhancement Part 10

Implements the 24 items in the supplied **Osekola Enhancement Part 10.pdf** on
top of the deployed Parts 8 and 9.

## Changes

- Partners: centered heading, checked introduction, consistent field labels,
  upload/replace control, centered submit and estimated students across referral
  schools. Owner review includes this field and an authenticated inline CV viewer.
- Approvals: blue history control and right-aligned pending counts.
- Owner tenants: cascading Indonesian address references, optional foundation,
  NPSN name lookup, contact details, WIB/WITA/WIT, Monday/Sunday start, avatar
  upload in the same form and a review confirmation before create/update.
  NPSN reference import is ready for the dataset the user will supply; no school
  names are invented. Existing NPSN values can still be entered manually.
- Owner-managed foundations: explicitly assigned Principal accounts can switch
  among the group's active school dashboards. Server-side scope checks and
  immediate revocation protect other schools. These accounts cannot receive or
  decide approvals; normal school Principals retain those duties.
- Leads: action controls have enough width and no longer collide with table text.
- Dashboard illustration PNGs retain alpha transparency, and the five school
  roles share the same hero layout in light/dark mode.
- Calendar: spaced toolbar, readable filters and responsive calendar area; event
  booking uses existing school assets and rejects overlapping calendar, room
  booking and teaching slots. All assigned teaching timetables include their room.
- Academic: Staff-only in navigation, page and database module gates. Retired
  heading/shortcuts, percentage pills and insights sidebar are removed. Readiness
  uses an accessible animated speedometer with reduced-motion support.
- Project: project and activity tables replace Kanban. One `+ Project` button,
  searchable committee assignments, additional members, dates and subactivities.
  Project calendar records follow membership, dates and completion state.
- Attendance, Learning, Exam, Finance, Project and Gallery use the common hero
  pattern and module icons. Request Leave is inside the dashboard hero.

## Deployment

1. Pass repository CI, including native PostgreSQL 17 regression, concurrency,
   exam load, backup/restore, production containers and frontend quality gates.
2. Apply `20260919131543_enhancement_part10.sql` to the existing Supabase project,
   preserving its applied version in the repository.
3. Merge the release PR and deploy the existing Vercel `osekola` project.
4. The trusted production verification imports 91,599 reference rows idempotently,
   then verifies the exact frontend SHA, existing Parts 7–9 and Part 10 workflows.
   Its generated schools/accounts are removed in `finally`, with cleanup evidence.

Reference data includes 38 provinces, 514 cities/regencies, 7,285 districts and
83,762 villages. Source URLs, hashes and the upstream license accompany the
compressed reference. Postal references may require updates as jurisdictions
change; the import preserves unrelated school records.

No NestJS API or VPS service replacement is required. The existing API keeps its
authenticated routes; the new data operations use narrow public invoker RPCs,
private functions, explicit authorization and audited mutations.

## Evidence and scope

Local migration replay including Part 10 and legacy regressions, frontend lint,
types, 94 web tests and production build passed before publication. Final CI,
production deployment and live verification results must be recorded after they
run; a successful build alone is not deployment evidence.

Asset recurrence currently supports daily, weekly and monthly series with a
fixed count, up to 366 occurrences; other event recurrence remains unchanged.
Avatar upload failure retains the saved tenant ID and offers retry without
creating another school. Foundation membership assignment rejects Principals
with pending decisions until those decisions are resolved.

## Rollout checkpoint — 19 September 2026

- PR #84 publishes exactly the reviewed local `1bc9a5b` content tree as
  `fd95fe13696f82e15f5ce3ae4b6b988031b96ea3`.
- GitHub CI run `35445126852` passed all three jobs: PostgreSQL regression,
  2,000 concurrent exam attempts and backup/restore; production containers;
  frontend/API lint, tests, build, packaging and upgrade/rollback checks.
- Public experience verification run `35445126839` passed.
- Supabase production migration applied successfully as `20260919131543`.
  The local migration filename now matches that applied version; SQL is unchanged.
- Existing 5 tenants, 227 users and 0 partner applications were preserved.
  All new Part 10 tables have RLS enabled and restrict direct client grants.
- Security advisors reported no ERROR-level issues. Existing WARN notices cover
  legacy public definer functions, an existing mutable-search-path trigger,
  btree_gist in public, and disabled leaked-password protection. RLS-without-policy
  INFO notices reflect the existing RPC-only access design. See the
  [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter).
- Production promotion and Parts 7–10 live verification are pending this PR's
  final checks and merge. Region reference import runs in the trusted verification
  workflow before the authenticated browser checks.
