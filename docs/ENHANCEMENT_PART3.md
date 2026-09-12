# OSEKOLA Enhancement Part 3

The supplied three-page Part 3 brief is the scope for this change. Part 2 remains
the baseline; its AI Gateway 403 issue is not resolved by this release.

## Implemented

- Matching landing CTA styling, unclipped circular icons, and a login-to-home link.
- Owner navigation: Dashboard, Tenant, Finance, Partner, User. Right-aligned,
  consistent controls; avatar menu closes outside/on Escape; red sign-out button.
- Shared owner banner and generated owner illustration on all five pages.
- Four dashboard statistics linking to the corresponding management pages.
- Global tenant profile CRUD, status, plans, school-logo upload, search and
  pagination. Eight independent module switches update one JSON flag atomically.
- Additive platform contracts, invoices, receipts, expenses and financial totals.
  Invoice creation inserts notifications for tenant administration in the same
  transaction. Tenant staff can view their invoices at `/dashboard/subscription`.
  Invoice/receipt retries do not duplicate money; overlap and overpayment checks
  run under row locks. School student-billing ledgers remain separate.
- Partner lists, profile/bank details, lead stages, earned/paid/unpaid fee totals,
  fee registration and payment recording. A configured HTTPS gateway URL opens
  only with unpaid fees. Opening it never transfers money or marks fees paid.
- Global paginated user directory. NestJS supports Auth creation, profile/email
  and role updates, status, override/unban, password reset, archive and restore.
  Archive preserves school records. Self-removal of owner access is rejected.
- New UI copy uses both existing English and Indonesian message catalogs.

## Access changes

The live audit found one active OWNER and zero accounts with platform-owner
permission. Part 3 explicitly makes OWNER the application administrator. The
migration therefore adds `tenants.read_all`, `tenants.create`,
`tenants.update_all`, and `tenants.deactivate` to OWNER only. Other canonical roles
keep tenant scope. New browser RPCs require the authoritative OWNER role, platform
permission, and active account/tenant. Auth admin operations are service-role-only
and use a server-chosen actor. No Auth secret reaches the browser.

Module access is enforced through private RPC checks, restrictive RLS, permission
checks and the NestJS Auth guard. Identity, notifications and subscription notices
remain available as shared infrastructure. Full legacy API read enforcement needs
the new VPS API release; database and UI enforcement alone do not replace it.

Storage access expansion is limited to the fixed `tenant-id/logos/logo` path.
Owner cannot read or modify another tenant's private gallery/avatar/learning file
through the new logo policy. The legacy media test now asserts this distinction.

## Validation and deployment status

- Local production web build passed.
- 139 API tests passed; 61 web tests passed after the dialog fixture correction.
- Full migration replay and Phase 51–54, media, O-Connect, Part 2, Part 3, and exam
  seed SQL suites passed in a disposable database. CI reruns them on PostgreSQL 17.
- The main-only verification workflow checks deployed owner pages and uses one
  generated, disposable Auth account to exercise the new NestJS API on the runner.
  It does not send email, alter real-user passwords, issue invoices, or transfer
  money. Screenshots mask account names and table data before upload.
- Production migrations, CI, merge, web deployment, and live results are pending
  at this implementation checkpoint. Update this section with observed outcomes.
- This session has no VPS deploy credential. CI produces the portable API package
  and stage script for the operator. User mutation buttons check the deployed API
  capability and remain unavailable until it supports Part 3. Do not call the
  paired release complete until the API is installed and publicly verified.
- Partner payment URLs must be supplied from the actual configured provider.
  No provider account or fee transaction was created by this enhancement.

## Owner illustration

`apps/web/public/illustrations/owner.webp` was generated with the built-in imagegen
tool and converted to WebP for delivery (1536 × 1024, 184,088 bytes). Prompt: a
friendly Indonesian digital application owner at a laptop, surrounded by frosted
school, growth and user cards, in the landing hero's rounded 3D style, cobalt blue
and lime palette, transparent background, no text or logo.

Auth implementation follows [Supabase createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
and [updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
