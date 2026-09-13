# OSEKOLA Enhancement Part 5

This release implements the Part 5 school workspaces and preserves the Part 4 administrative Academic/Learning/Exam and Connect boundaries. Student Academic and Parent Learning/Exam/Finance use explicit child-scoped database projections. AI Readiness remains deferred; Digital Maturity remains available in Indonesian and English.

## Changes

- Exact Principal, Staff, Teacher, Student and Parent navigation; Staff+Teacher combines both responsibilities. Owner gains Product, Leads and Chat in navigation and avatar menu. App language/theme controls lose green borders; public navigation keeps its styling.
- Five generated role illustrations, shared module/role icon treatment, real school metrics and seven-day attendance charts, pending Principal approval indicator, Staff-managed gallery and read-only gallery for other school roles.
- Owner can archive/restore a tenant with exact-name confirmation. Archived school access stops immediately. Existing school records are retained. Staff/Teacher role updates are audited and existing dual roles survive profile edits.
- Three editable product segments, bilingual feature lists, discounts and custom pricing share `school_plans` with landing-page prices. Owner Leads includes assessment score, maturity level and contact details.
- Browser face enrollment, rescan verification and supervised attendance. Only active users in the same school with Principal/Staff/Teacher/Student roles can be enrolled. Owner and Parent targets are excluded. Staff and Teacher are the only operators. Camera images remain in the browser; encrypted, deletable 256-value templates use Supabase Vault. Challenges expire after 90 seconds and cannot be replayed. No face templates or similarity scores are returned to clients. A manual attendance fallback remains available.
- Learning PDF exports for curriculum progress and family assignment reports.
- SPMB intake configuration, public registration, unique private receipt code, payment, draft/published selection, exam card PDF and final result publication. Fees are snapshotted per application. Private receipt codes survive refresh within the browser session and can be saved in a PDF; they are never put in a URL.
- Xendit hosted Payment Sessions as primary; Midtrans Snap as backup. Credentials are encrypted per tenant. Payment amounts come from locked database bills/application fees. Server re-fetches provider status before posting a confirmed receipt. A redirect is not proof of payment. Timeouts remain unresolved and do not cause automatic duplicate checkout creation. A definitive rejected Xendit creation may fall back once. Manual receipts and bill changes are blocked during unresolved online checkout.
- Fixed O-Connect launcher with unread indicator, contextual school access, transparent rendered Connect composition, and curriculum section with linked framework identifiers.
- Full English Digital Maturity questions and options, plus bilingual legacy school forms, finance reports, question bank, exam and attendance workspaces. School-authored content retains its original language.

## Approved navigation

| Role | Navigation |
|---|---|
| Principal | Dashboard, Gallery, Approval, Chat |
| Staff | Dashboard, Academic, Gallery, Team, Finance, Chat |
| Staff + Teacher | Dashboard, Academic, Attendance, Learning, Exam, Gallery, Team, Finance, Chat |
| Teacher | Dashboard, Academic, Attendance, Learning, Exam, Gallery, Team, Chat |
| Student | Dashboard, Academic, Learning, Exam, Team, Chat |
| Parent | Dashboard, Learning, Exam, Team, Finance, Gallery, Chat |

Plain Staff reaches face enrollment from Academic. Student Academic is read-only and Parent learning/exam reports contain linked children only. Administrative school Finance endpoints require Staff; Parent uses the dedicated own-child report and checkout. Owner platform billing remains separate.

## Deployment and activation

1. Run CI: PostgreSQL 17 migrations/regressions, concurrent exam load, encrypted backup/restore, API/web quality checks, Deno check, production containers and web build.
2. Apply the six Part 5 migrations in filename order. Do not run the test bootstrap or test Vault implementation against Supabase. Production already has Supabase Vault.
3. Deploy `apps/api/edge/payment-gateway/index.ts` and `provider.ts` as the `payment-gateway` Supabase Edge Function with custom authentication (`verify_jwt=false`). Authenticated checkout verifies the Supabase user; guest admission checkout verifies the private receipt; webhook callbacks verify Xendit's token and fetch status, or use Midtrans authenticated status lookup. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Edge runtime.
4. Merge the reviewed commit to deploy the existing Vercel production project. No new VPS API binary or reset of school data is needed.
5. Run `verify-part5-live.yml` to verify the deployed release, six role menus, scoped family reports, gallery permissions, admission workflow, Edge authentication, model loading and cleanup using owned disposable fixtures.
6. A school's Staff opens Finance → Payment gateway, configures its ledger account and Xendit server key/webhook token, adds Midtrans backup keys, and registers the displayed callback URLs in each merchant dashboard. Verify provider sandbox transactions before switching to live keys. This release does not create or fund merchant accounts and contains no real merchant secrets.

The browser face workflow requires HTTPS, camera permission, supported WebGL and a supervised operator. Device camera accuracy and provider live-money settlement cannot be claimed from synthetic CI tests; validate those with the actual school devices and merchant accounts.

## Primary integration references

- [Xendit Payment Session API](https://docs.xendit.co/apidocs/create-session)
- [Xendit session notifications](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session)
- [Xendit webhook handling](https://docs.xendit.co/docs/handling-webhooks)
- [Midtrans Snap integration](https://docs.midtrans.com/docs/snap-snap-integration-guide)
- [Official Midtrans SDK notification status lookup](https://github.com/Midtrans/midtrans-nodejs-client/blob/master/lib/transaction.js)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Human model sources](https://github.com/vladmandic/human/wiki/Models)

Bundled model checksums and upstream licenses are under `apps/web/public/vendor/human`. Curriculum logo/identifier sources are under `apps/web/public/curricula`.
