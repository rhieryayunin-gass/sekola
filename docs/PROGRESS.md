# SEKOLA AI Development Progress

Last updated: 2026-09-10

This file records repository-verified progress. A roadmap item is complete only
after its implementation and quality gates pass on the current branch.

## Current phase

**Level 10 — Phase 55 production readiness (implementation checkpoint; deployment and live gates pending)**

Branch: `phase/55-production-readiness`

### 00 Project Foundation

- [x] Repository
- [x] Monorepo structure
- [x] `apps/web`
- [x] `apps/api`
- [x] Git
- [x] Environment variable template
- [x] README
- [x] Development and quality scripts

### 01 Frontend Foundation

- [x] Next.js 16 App Router and TypeScript
- [x] Tailwind CSS v4 and global CSS
- [x] Design tokens and standardized font stack
- [x] Root layout and application providers
- [x] Error, not-found, and loading states
- [x] Button, Input, Select, Table, Badge, and Card
- [x] Empty State, Modal, and Toast
- [x] Final lint, typecheck, test, and production build

### 02 Backend Foundation

- [x] NestJS AppModule and environment configuration
- [x] Supabase server connection
- [x] Global validation
- [x] Global error handling
- [x] Success and error response conventions
- [x] Versioned health endpoint
- [x] Final lint, typecheck, test, and production build

### 03 Authentication

- [x] Supabase Auth browser client
- [x] Supabase SSR server client
- [x] Login
- [x] Logout
- [x] Session initialization
- [x] Explicit and automatic session refresh
- [x] Auth state and Zustand Auth Store
- [x] Protected routes and safe post-login redirects
- [x] Backend Bearer token validation
- [x] Inactive-account enforcement
- [x] Auth user → Core user synchronization migration
- [x] Tenant-aware Auth provisioning and user query isolation
- [x] Legacy schema audit and idempotent reconciliation migration
- [x] Unit tests
- [x] Safe staging inspect/apply verification workflow
- [x] Validate staging credentials and database connectivity
- [x] Inspect staging schema and migration history without mutation
- [x] Reconcile migration history for existing migrations `0001`–`0005`
- [x] Apply reconciliation migrations `0006`–`0007` to staging
- [x] Apply Auth metadata sequencing migration `0008` to staging
- [x] Live login, refresh, protected-route, and logout verification
- [x] GitHub CI checkpoint

### 04 Tenant

- [x] Audit existing Tenant schema and API
- [x] Replace reused user permissions with dedicated Tenant permissions
- [x] Prevent ordinary users from enumerating tenants
- [x] Own-tenant read and profile update API
- [x] Platform Tenant list, detail, create, update, and deactivate API
- [x] Tenant code normalization and duplicate handling
- [x] Reject API access for users of inactive tenants
- [x] RLS policy for active own-tenant reads and updates
- [x] Column-level database grant for own-tenant name updates
- [x] Tenant settings page
- [x] Unit and regression tests
- [x] Local lint, typecheck, test, and production build
- [x] Apply migration `0009` to Supabase staging
- [x] Apply legacy administrator mapping migration `0010` to staging
- [x] Run live tenant-isolation verification
- [x] GitHub CI checkpoint

### 05 Users

- [x] Audit existing User schema and API
- [x] Tenant-scoped User master, detail, create, and update API
- [x] Pagination, email filter, and active-status filter
- [x] Active user-level options using the existing relationship
- [x] Auth and Core profile creation with rollback
- [x] Auth and Core email/full-name synchronization with rollback
- [x] Reversible activate/deactivate behavior
- [x] Prevent administrator self-deactivation
- [x] Prevent self-level changes and platform-level privilege escalation
- [x] Tenant-scoped detail, update, and status enforcement
- [x] Case-insensitive unique email constraint
- [x] Self-profile RLS and direct mutation restrictions
- [x] User management page with CRUD and status controls
- [x] Unit and migration tests
- [x] Local lint, typecheck, test, and production build
- [x] Apply migration `0011` to Supabase staging
- [x] Run live CRUD, Auth-sync, status, RLS, and isolation verification
- [x] GitHub CI checkpoint

### 06 Roles

- [x] Audit legacy Role, User Level, and authorization relationships
- [x] Define the fixed canonical role catalog
- [x] Preserve existing legacy role records and relationships
- [x] Keep Permission and Access Control work in their scheduled phases
- [x] Add migration and migration regression tests
- [x] Run local lint, typecheck, test, and production build
- [x] Apply migration `0012` to Supabase staging
- [x] Verify the canonical role catalog on staging
- [x] GitHub CI checkpoint

## Next phase

Phase 51–54 implementation, CI, and staging migrations `0056`–`0059` are complete.
Live verification for Phase 43–50 operations and Phase 51–54 remains pending.

## Remaining roadmap levels

- Level 1 — SEKOLA Core+
- Level 2 — SEKOLA Academic+
- Level 3 — Learning+
- Level 4 — Attendance+
- Level 5 — Exam+
- Level 6 — Finance+
- Level 7 — Team+
- Level 8 — Core Operational Modules
- Level 9 — Analytics+
- Level 10 — Cross-module Ecosystem and Production Readiness
# Phase 07 — Permissions

- Permission catalog, canonical role mappings, and direct tenant-scoped user-role assignment are complete.
- Only `OWNER` receives permission-matrix and direct-role management permissions.
- Access scopes remain deferred to Phase 08.
- Migration `0013` and trusted staging verification passed.

# Phase 08 — User Level / Access Control

- Generic role access grants define `GLOBAL`, `TENANT`, `MODULE`, and `RESOURCE` scope types.
- Authorization context and backend guard evaluate scope grants; `GLOBAL:*` satisfies narrower checks.
- The fixed six-role catalog remains unchanged; no academic or operational module is introduced.
- Migration `0014` and trusted staging verification passed.

# Phase 09 — Profile

- Self-service profile includes display name, avatar URL, contact phone, and emergency contact.
- Profile updates are restricted to the authenticated account and synchronize display name to Auth.
- Tenant, notification, calendar, and localization settings remain in their scheduled phases.
- Migration `0015`, regression coverage, CI, and trusted staging verification passed.

# Phase 10 — Settings

- Tenant-scoped school profile, academic-year preference, notification defaults,
  operational calendar preference, and locale/timezone preference are implemented.
- Calendar events and multilingual message catalogs remain deferred to their
  scheduled roadmap phases.
- Migration `0016`, regression coverage, CI, and trusted staging verification passed.

# Phase 11 — Internationalization

- English and Bahasa Indonesia message catalogs, locale cookie, typed provider,
  and global language switcher are implemented.
- GitHub CI and post-merge verification passed.

# Phase 12 — Calendar Core+

- Shared tenant-scoped calendars and event CRUD are extended with event types,
  all-day events, recurrence rules, invitations, accept/reject responses, and
  approval queues.
- Invitation targets are validated as active users in the calendar tenant;
  direct authenticated mutation remains denied by RLS.
- The Calendar page exposes tenant calendars and event creation without
  introducing Academic+ behavior.
- Migration `0017`, regression coverage, and local quality gates are pending
  the public checkpoint and staging verification.

# Phase 38–42 — Team+

- [x] Tenant-scoped projects, project members, ownership, and settings
- [x] Tasks with priority, assignee, reporter, due date, and sortable board position
- [x] Jira-style Kanban workflow: Backlog, To do, In progress, Review, and Done
- [x] Drag-and-drop task transitions with immutable transition history
- [x] Task comments and project activity feed
- [x] Project invoices, payments, and Finance+ account/category integration
- [x] Role-aware API permissions, RLS read policies, server-mediated mutations, and audit records
- [x] Team+ dashboard entry and responsive project workspace
- [x] Migration and UI/API contract tests
- [x] Local lint, typecheck, test, and production build
- [x] GitHub CI checkpoint
- [x] Apply migrations `0043`–`0047` to Supabase staging
- [x] Run live tenant-isolation, workflow, collaboration, and project-finance verification

## Finance+ and Team+ staging gate

- [x] Confirm latest successful staging apply is Phase 27–33 through migration `0038`
- [x] Confirm Finance+ migrations `0039`–`0042` have not yet been applied
- [x] Add a commit-pinned trusted runner for migrations `0039`–`0047`
- [x] Run `inspect` and review the dry-run migration plan
- [x] Run `apply` with confirmation `APPLY_0039_0047`

# Phase 43–50 — Operations and Analytics+

- [x] Tenant-scoped room directory and conflict-aware booking requests
- [x] Reusable sequential approval engine with assigned decision queue
- [x] Leave and schedule-change requests integrated with approvals
- [x] Approved booking and leave synchronization to operational calendars
- [x] Request and decision notifications plus audit events
- [x] Jira-style operations board with Pending, Approved, Rejected, and Cancelled lanes
- [x] Academic analytics for students, teachers, classrooms, subjects, and performance
- [x] Attendance analytics by student, classroom, and teacher
- [x] Finance analytics for revenue, receivable, payments, and outstanding balances
- [x] Cross-domain executive dashboard covering Academic, Attendance, Finance, Learning, Exam, and Team+
- [x] Role-aware API permissions, tenant isolation, migration tests, and UI/API contracts
- [x] GitHub CI checkpoint
- [x] Inspect and apply migrations `0048`–`0055` to Supabase staging
- [ ] Run live operations workflow, calendar, notification, and analytics verification

## Operations and Analytics+ staging gate

- [x] Merge the reviewed Phase 43–50 implementation
- [x] Add a commit-pinned trusted runner for migrations `0048`–`0055`
- [x] Run `inspect` and review the dry-run migration plan
- [x] Run `apply` with confirmation `APPLY_0048_0055`

# Phase 51–54 — Integration, Hardening, Security, and Performance

- [x] Source-keyed Academic, Learning, Exam, and Team+ calendar synchronization and cross-module notifications
- [x] Transactional sequential operational approvals with calendar, notification, and audit writes
- [x] Database tenant-reference enforcement, immutable record identity, and concurrent room-conflict protection
- [x] Runtime payload validation, Learning permission guards, learner submission ownership, and project membership enforcement
- [x] Serialized invoice payments and partial-payment-aware finance analytics
- [x] Bounded API pagination, supporting indexes, short-lived account-scoped analytics caching, and logout cache isolation
- [x] Local lint, typecheck, unit/component tests, and production build
- [x] PostgreSQL migration replay with legacy prerequisite fixture and Phase 50 upgrade regression CI checkpoint
- [x] GitHub CI implementation checkpoint (run 114)
- [x] Commit-pinned trusted runner for migrations `0056`–`0059`
- [x] Inspect and apply migrations `0056`–`0059` to Supabase staging
- [ ] Live cross-module, concurrent workflow, tenant-isolation, and representative performance verification

Staging inspect and apply succeeded on 2026-09-10, confirmed by the user and
successful trusted runner executions: [inspect](https://github.com/rhieryayunin-gass/sekola/actions/runs/34474310165)
and [apply](https://github.com/rhieryayunin-gass/sekola/actions/runs/34474416688).
Previous Phase 43–50 live workflow verification remains pending. Staging migration
success does not mark live verification, production readiness, or Phase 55 complete.

Validation scope and remaining release gates: [Phase 51–54 verification](PHASE_51_54_VERIFICATION.md).

# Phase 55 — Production Readiness

- [x] User-selected deployment target: Vercel at osekola.com, isolated API on the existing RIRI/RIRI Emerald VPS ([setup](OSEKOLA_DEPLOYMENT.md))
- [x] Vercel build configuration, API loopback binding, systemd/Nginx templates and read-only shared VPS inspection script
- [x] Production environment validation and separate public/server configuration templates
- [x] Non-root API and standalone web container definitions with Compose/TLS ingress configuration
- [x] Independent liveness, bounded database readiness and release identity endpoints
- [x] Explicit Auth/Authorization module imports for full API startup and guarded feature routes
- [x] Structured request logs, request correlation, safe error output, body limits and no-store API responses
- [x] Read-only deployment probe and manual staging/production verification workflow
- [x] Encrypted logical backup and guarded local recovery rehearsal tooling
- [x] Deployment, monitoring, logging, backup, recovery and rollback runbook
- [x] Local lint, typecheck, 121 API tests, 25 web tests and production builds
- [x] GitHub CI container and encrypted PostgreSQL restore checkpoint ([run 122](https://github.com/rhieryayunin-gass/sekola/actions/runs/34478748444))
- [ ] Actual production environment, deployment, monitoring and log retention verified
- [ ] Scheduled off-host backups, Storage coverage and production-sized recovery/rollback verified
- [ ] Final live regression and release sign-off

Phase 55 remains incomplete until the live gates in the
[production readiness runbook](PHASE_55_PRODUCTION_READINESS.md) pass.
Phase 43–50 live verification remains pending; Phase 51–54 is tracked in
[issue #49](https://github.com/rhieryayunin-gass/sekola/issues/49), with all seven
checks still unchecked. Successful staging inspect/apply `0056`–`0059` and
[PR #48](https://github.com/rhieryayunin-gass/sekola/pull/48) remain recorded above.
