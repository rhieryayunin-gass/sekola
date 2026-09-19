# Enhancement Part 11

Baseline: Part 10 production release `48fe7d35cbe5e8c528d2e0c2b8a593b24ed2ab57`.
Scope: the supplied Osekola Enhancement Part 11.pdf and the retrieved O-Finance upgrade discussion.

## Implemented

- Partner registration retains the already deployed checks, title-case labels, estimated referral students, custom PDF upload and centered submission; Part 11 refines field hierarchy and spacing. Owner CV review stays authenticated and inline.
- Tenant forms use one column. New schools can include an optional settlement bank account in the same database transaction; the existing account editor handles later changes.
- O-Team has To Do / In Progress / Blocked / Done columns, drag/drop and accessible status menus, multiple PICs, task/subtask dates, comments, committee controls and project finance.
- Principal oversight follows current tenant/foundation membership. Parent and Student project access requires membership or assignment. Cross-tenant PICs and unauthorized mutations are rejected server-side. Assignment-only project access is removed when the last task assignment is removed.
- Assignment notices link to the exact project; project calendar synchronization reuses the existing shared calendar infrastructure.
- Completion checks cover the whole task tree. Completed projects support private documentation uploads and PDF preview/download with committee, timeline, finance, evidence and signature placeholders. Reopening a subtask reopens its completed parent/project.
- O-Finance provides Overview, Billing, Collections, Payments, Students, Cash & Expenses, Reconciliation, Reports and Settings according to role. Metrics and aging derive from confirmed receipts and invoice balances. Parent/student projections remain child-scoped; Principals receive scoped read-only oversight.
- A billing composer publishes one-time or finite monthly schedules with a fixed discount/scholarship and idempotent request IDs. Parent selection gathers family bills and opens the existing provider checkout for each bill. Existing payment providers/configuration are preserved.
- Cash uses the existing audited cash ledger. Reconciliation displays actual gateway intent states. Reports export PDF and Excel-compatible CSV. Gallery uses the same module-page wrapper as Project.

## Boundaries

This release does not provision merchant accounts. Payment methods shown at checkout depend on the school's live provider configuration. Family bill selection uses one checkout per invoice; it does not combine invoices into a new gateway charge. Monthly schedules are explicitly published together, not a new unattended billing job. Documentation images in JPEG/PNG embed in reports; WebP and PDF attachments are listed and remain accessible in the private project evidence panel.

## Validation and deployment checkpoint

- Local TypeScript, ESLint and existing 94 frontend tests passed.
- Additive migration replay and Part 11 permission/data regressions passed, followed by existing Part 10 and legacy regression suites.
- Native PostgreSQL CI, production container gates, exact-release deployment and authenticated browser verification must pass before reporting completion.
- Migration created using Supabase CLI: `20260919161648_enhancement_part11.sql`.
- Production verification extends the existing disposable-school fixture harness. It checks drag/drop persistence, multiple PIC/subtasks, audience restrictions, calendar/notifications, private evidence and report download, idempotent billing, child financial isolation, mobile overflow and gallery spacing. Cleanup includes the new billing records and private evidence.

## Published rollout

PR #89 head 75ab876ba0071a1b3474029f2735260307faa9b6 passed GitHub CI 35454253918 (all three jobs) and public experience verification 35454253912. Vercel preview dpl_2X6mhowqpCkJnz5m2jHmR3nU3LZ5 is READY.

Production migration was applied as 20260919161648; the repository filename now matches the applied version, with SQL unchanged. Verification retained 5 tenants and 227 users; both new tables have RLS enabled and the project evidence bucket is private. Security advisors show no new WARN/ERROR findings; the two new INFO entries are the deliberately RPC-only tables with all direct client grants revoked.

Final production merge, exact deployment SHA, authenticated Part11 browser verification and fixture cleanup are pending the final CI gate.

## Production verification follow-up

PR89 deployed as 05a20fe5f5f0c4764185d6b9833aac9976444646, Vercel dpl_98snGJnsV1dnpBt4ZY5cUJmBt5i4 READY. Main CI35454735741 and public verification35454735764 passed. Authenticated run35454735744 passed Parts7–10, then exposed a Kanban drag failure; fixture cleanup left zero users/schools and no errors.

The follow-up retains the dragged task synchronously in a ref and reads the native drop payload, avoiding React render timing during a native drag. The browser regression uses the task search and the card's noninteractive grab area, then verifies the persisted database status.
