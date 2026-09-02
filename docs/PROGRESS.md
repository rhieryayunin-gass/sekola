# SEKOLA AI Development Progress

Last updated: 2026-09-02

This file records repository-verified progress. A roadmap item is complete only
after its implementation and quality gates pass on the current branch.

## Current phase

**Level 1 — 05 Users**

Branch: `phase/05-users`

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
- [ ] Apply migration `0011` to Supabase staging
- [ ] Run live CRUD, Auth-sync, status, RLS, and isolation verification
- [ ] GitHub CI checkpoint

## Next phase

Level 1 — 06 Roles. This phase starts only after Phase 05 passes live
verification on staging.

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
