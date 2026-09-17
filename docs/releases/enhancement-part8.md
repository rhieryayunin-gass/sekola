# Enhancement Part 8

Implements the supplied **Osekola Enhancement Part 8.pdf** and the saved
**Osekola struktur kurikulum baru** design. Curriculum changes do not extend O-Team.

## Delivered workflows

- School setup has five primary stages with focused substeps. Programme cards show
  version, effective dates, subjects, goals, scales and enrolment rules. Programme
  types distinguish curriculum, qualification, pedagogy and enrichment. IEYC and
  SIT join the existing configurable curriculum starters; Pearson retains the
  existing EDEXCEL identifier for compatibility.
- Class or individual enrolment supports effective dates, elective subjects and
  explicit individual exclusions. Teachers retain one administrative class and one
  learning activity with several goals. Enrolment changes include a review step,
  preserve historical assessment snapshots and record the actor in the audit log.
- Question mappings support multiple goals without duplicating scoring. Rubrics
  retain separate dimension values, require completed dimensions for publication,
  and become immutable once used. Alignment records distinguish equivalent,
  partially related and supporting relationships.
- Official external examination results remain separate from internal marks.
  Specification, linear/modular pathway, unit, session, raw score, UMS, unit grade,
  qualification grade, cash-in state and official reference are recorded explicitly.
  Corrections/resits append a linked record. Students/parents see only their own
  published records; provider values are never inferred from internal marks.
- Olla UI, generation SDKs and setup/question generation capability are removed.
  Retired HTTP routes return 410 and generation RPC execution is revoked. Existing
  question content and historical audit records are preserved.
- Shared header controls, red sign-out, revised curriculum logos and consistent
  partner CTAs replace duplicate navigation. Dashboard shortcut card grids and Chat
  navigation links are removed. The icon-only O-Connect launcher opens a large
  bottom-right dialog; Calendar and Notifications open large centered dialogs.
  Dialogs support focus restoration, Escape, responsive sizing and blurred backdrop.
- Calendar offers month/week/day/agenda views, search, date navigation, calendar
  filters, event CRUD and recurring series. Overlapping appointments use separate
  columns. Notifications provide type/search/unread filters and detail dialogs.
- Owner manages multiple settlement account records per school. An advisory lock
  and partial unique index enforce at most one active account. School roles cannot
  read or modify these records. This records settlement instructions; it does not
  initiate transfers or reconfigure a payment provider automatically.
- `/partners/register` is the public flyer destination. A validated PDF CV up to
  1 MiB and recruitment fields are submitted to a bounded public registration RPC.
  CV photo presence is confirmed by the applicant and reviewed by Owner, not
  inferred automatically. Owner can review/download documents, track selection,
  edit details/referrals/bank information and mark applications active. Existing
  partner portal account provisioning remains in the Owner partner list.
- Leads have independent Not started / In progress / Done follow-up actions.

## Data and access

Apply `20260917003412_enhancement_part8.sql`, followed by
`20260917004146_part8_future_programme_planning.sql`, to the existing Supabase
project before releasing the web application. The second migration allows staff
to prepare future programmes while enforcing effective dates for learners. Existing API endpoints are reused; no API binary or
VPS service replacement is required. No existing learning, question, payment or
published result records are deleted by the migration.

Partner applications and CVs have no direct anonymous/authenticated table grants.
The narrowly scoped public definer function accepts registration only; anonymous
users receive no access to the private schema. Full NIK/CV require Owner checks;
list projections mask NIK and omit CV bytes. CV downloads require a verified user,
force attachment disposition, disallow caching and use `nosniff`.

The public intake has a duplicate-NIK window, daily global limit, payload/file
bounds, explicit consent, a honeypot and same-origin HTTP validation. No service
role secret is shipped to the browser. Fixture records never use real applicants.

## Verification and rollout

- `pnpm check`: API/web lint, TypeScript, unit/component tests and production builds.
- `apps/api/scripts/test-database.sh`: full migration replay and SQL regressions,
  including Part 8 account access, application privacy, enrolment exclusions,
  rubric constraints and external result isolation.
- GitHub CI: native PostgreSQL 17, concurrency and bounded exam load, encrypted
  backup/restore, containers, API packaging and Vercel build checks.
- `verify-part7-live.yml` now runs the Part 8 production verification while retaining
  the previous setup, learning, exam and family isolation checks. The extension in
  `verify-part8-live.mjs` covers recruitment/PDF access, account switching, popup
  navigation, parallel Pearson results and follow-up. It waits for the exact merged
  release SHA and removes only fixtures created by the current run. Screenshots and
  JSON evidence are retained as Actions artifacts.

Deployment success must be established from the live release and verification
run. If a rollout issue occurs, retain user records and apply a forward fix; do not
roll back by dropping the new tables or rewriting published assessment data.
