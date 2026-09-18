# Enhancement Part 9

Implements the supplied **Osekola Enhancement Part 9.pdf**, preserving the existing
Next.js/NestJS/Supabase architecture and canonical approval records.

## Delivered behavior

- Landing curricula move left continuously, pause on hover/focus and respect
  reduced motion. The matching hero partner CTA opens the centered partner page.
  PDF item 4 contains only “Sssss”; the existing CV upload remains available.
- Readable sign-out, theme-aware calendar/notification icons, Project naming,
  Gallery-last navigation and the exact Principal menu. Owner and school hero
  layouts share sizes without image vignette.
- Owner tenant create/edit forms include optional eight-digit NPSN and omit the
  legacy academic-year/legal-name inputs without deleting their stored values.
  Save controls are centered/blue, account additions consistent, module columns
  evenly spaced, and plan selection restyled. User lists filter by tenant; leads
  filter by red/orange/green follow-up status on the server.
- Staff dashboard opens eight working tenant directories: students, staff/teachers,
  principals, parents/linked students, assets, classrooms, attendance identities,
  and gallery. School setup is restricted to Staff in UI and database functions.
  Existing Owner school-identity administration remains in tenant settings.
- Staff proposes employee account creation/update/archive/restore. Principal
  decides Staff/Teacher changes; Owner decides Principal changes. Student/Parent
  account work executes immediately under Staff authority. Archive disables access
  while retaining school history; restoration is available in the same directory.
  Multi-role Principal accounts cannot use the Teacher route to bypass Owner.
- Approval columns reuse `approval_requests` and `approval_steps`, with inline
  approve/reject, rejection reasons, requester context, substitutes, audit, and
  notifications. Existing sequential operational decisions remain supported.
  Principal gets a pending-only animated action and navigation red dot.
- Parent leave creates a linked message in the current homeroom conversation.
  Its inline decision updates the child's attendance for the requested dates.
  Staff/Teacher leave goes to Principal without chat; Teachers must select an
  active substitute and duty. Backdated approvals write the historical dates.
  Duplicate overlapping requests, wrong roles, self decisions, repeated decisions
  and cross-school access are rejected. SICK and EXCUSED stay distinct.
- Principal dashboard shows six months of students, combined Staff/Teacher counts,
  stacked asset-category bars; monthly finance and comparison badges; daily
  attendance with absence tables; and seven days of published grade averages.
  Unrecorded attendance and missing grades remain explicit. Each school role has
  its own seven-day attendance; Parent has one record per linked child.
- Staff's cash ledger records non-tuition income, expenses and opening balance;
  confirmed tuition payments are included automatically. Voiding is audited.
  Historical charts reconstruct creation/admission/archive dates, not unavailable
  historical snapshots. Previously removed records cannot be reconstructed.
- Supervised Face enrollment/verification remains available and now includes
  Parents. Staff can issue/revoke QR or RFID credentials for active school roles;
  readers submit them under Staff/Teacher authentication. Only token hashes are
  stored. Student checks feed the classroom attendance records and all checks feed
  individual attendance. Platform Owner is outside school personal attendance.
- Calendar keeps month/week/day/agenda, recurring events and CRUD, with tools above
  a full-width calendar. Dialog backdrops close safely. Notifications use category
  buttons, detail dialogs and independent right-side mark-read actions.

## Provisioning and deployment

Migration `20260918201121_enhancement_part9.sql` was applied to the existing
Supabase project before the frontend release.
`apps/api/edge/school-people/index.ts` is deployed as `school-people` version 1. It authenticates the bearer using Supabase Auth, then claims an approved
change through a service-only RPC. No browser receives an administrative key.

Execution uses an expiring exclusive lease. The `DB_APPLIED` state preserves a
retryable boundary between approved database work and Auth synchronization. New
accounts stay banned until their approved profile/role exists. Temporary generated
passwords are returned only for the completed creation and can be changed in the
user's profile. They are never persisted in request/audit payloads or logs.

No NestJS/VPS binary replacement is needed. Existing API routes retain their
permission checks and use the updated database workflow. No existing school,
learning, payment or published result records are deleted by the migration.

## Required verification

- `pnpm check`: API/web lint, types, unit/component tests and production builds.
- `apps/api/scripts/test-database.sh`: full PostgreSQL migration replay and all
  legacy regressions, plus Part 9 role isolation, homeroom chat approval, substitute
  requirements, backdated attendance, exclusive/resumable provisioning, cross-tenant
  Owner approval, archive/restore availability, and QR/RFID revocation tests.
- GitHub CI: PostgreSQL 17, concurrency, 2,000 exam attempts, encrypted backup and
  restore, production containers, Vercel build, API packaging and Edge type checks.
- Public browser verification checks desktop/mobile, light/dark and reduced motion.
  It excludes the marquee's accessibility-hidden duplicate logos from image checks.
- `verify-part7-live.yml` retains Parts 7/8 production checks and runs
  `verify-part9-live.mjs` for working approved Auth accounts, Owner/Principal routing,
  homeroom chat decisions, past-date attendance, credentials, charts and dialogs.
  It waits for the exact merged release SHA and removes only its generated schools,
  users, messages, approvals and associated records. Evidence is an Actions artifact.

CI and public browser verification passed on implementation commit
`821ba451eeb51fd7484465276c7775b4e381c4d5` (runs 35389700767 and 35389700896).

Deployment is complete only after the actual production release and these live
checks succeed. Use a forward correction if necessary; preserve historical data.
