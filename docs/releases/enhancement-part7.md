# Enhancement Part 7

Implements the approved Product Development discussion for O-Core, O-Academic,
O-Learning and O-Exam: https://chatgpt.com/share/6aa9579c-4600-83ec-bd15-a547e6afac21

## Resulting workflow

- Core and Academic share a school setup journey: identity, facilities, years and
  terms, curriculum, class architecture, people migration, allocation and readiness.
  Readiness measures canonical saved records. Validated CSV/XLSX imports support
  column mapping and corrections; academic batches commit atomically after preview.
  Account imports use existing Owner account permissions and support retry after
  partial account creation. Olla produces saved, reviewable setup suggestions.
- Academic teacher assignments provision draft Class Studio spaces. Teachers compose
  units, mapped goals, targeted activities, reusable material blocks and tasks;
  learners see published assigned content. Templates copy content into an empty
  space without old students, dates, submissions or grades. Reviews remain private
  until explicitly released; revisions retain submission and material history.
- Assessment Studio walks through purpose, weighted blueprint, approved questions,
  session and review. Practice banks are distinct from restricted banks. Publication
  snapshots questions and participants. The readiness check starts no timer; start
  resumes the same server-timed attempt with autosave, receipts and private extra
  time. Teacher grading precedes explicit release. Discussion waits for the exam
  window and all attempts to finish. Targeted remedial units and linked retakes keep
  the original result intact.
- Existing role/module permissions remain authoritative: Owner manages accounts and
  school identity, Staff academic setup, Teacher assigned learning/assessments,
  Student assigned work, and Parent their own child's released reports. Audience
  rules also apply to legacy catalogs, REST learning, calendars and notifications.

## Deployment

Apply the following migrations in order to the existing OSEKOLA Supabase project
`xrqjutbwnlkogpfhtuwr`, then release the web application to the existing Vercel
project `osekola`. This change uses existing API endpoints and needs no API binary
or VPS service replacement.

1. `20260915144049_school_onboarding_part7.sql`
2. `20260915144054_class_studio_part7.sql`
3. `20260915144057_assessment_studio_part7.sql`

Migrations preserve existing records and previously published assessment results.
Do not undo them with destructive table drops. If a rollout problem occurs, pause
new studio publishing and apply a forward fix after checking the failing workflow.

## Verification

Local checks: TypeScript, ESLint, production Next.js build, existing web tests,
new import/Olla/workflow tests, and all SQL regression suites passed using PGlite
PostgreSQL with the repository's migration/fixture sequence. GitHub CI additionally
runs native PostgreSQL 17 migration replay, concurrency/load checks, backup/restore,
production containers, API packaging and Vercel build checks.

`verify-part7-live.yml` runs on the merged release. It waits for the exact web SHA,
creates two owned disposable schools, verifies setup/import/role gates, a real saved
Olla suggestion, browser task submission/review/release, browser exam readiness,
autosave/resume/receipt, private grades and accommodations, discussion release,
remedial/retake and parent isolation. Desktop/mobile screenshots and a JSON report
are retained as Actions artifacts. Cleanup is scoped to this run's generated UUIDs
and must leave zero fixture accounts and schools. Production success must be read
from that workflow; this document is not a claim that a pending run has passed.
