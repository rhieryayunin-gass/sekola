# Phase 51–54 verification and staging gate

## Delivered scope

| Phase | Changes | Evidence |
| --- | --- | --- |
| 51 Integration | Source-keyed calendar events; Academic/Learning/Attendance/Exam/Finance/Team notifications; atomic Operations approval effects | `0057`, `0058`, SQL workflow regression |
| 52 Hardening | Same-tenant database references; booking exclusion constraint; locked sequential approvals and payments; transaction-scoped record audit | `0056`, `0058`, `0059`, SQL rollback/replay/concurrency regression |
| 53 Security | Learning guards and student ownership/enrollment; field allowlists; protected IDs; project membership; recipient-only integrated calendars; permission response/logout isolation | API validation/guard tests, web permission tests, SQL RLS regression |
| 54 Performance | Common resource and Team board pagination (default 50, maximum 100); stable page ordering; relevant indexes; coalesced 15-second analytics cache bounded to 128 account-scoped entries | Pagination/cache tests, schema indexes, local build |

`pnpm check` passed locally: lint, typecheck, 101 API tests, 25 web tests, and
production build. PostgreSQL regression runs on a disposable PostgreSQL 17 CI
service, never on staging. The harness explicitly supplies the legacy ADMIN
prerequisite expected by migration `0010`, replays the existing migrations,
inserts two-tenant Phase 50 fixtures, then applies `0056`–`0059`. It exercises
approval rollback/order/replay/cancellation, room collisions, actual authenticated
RLS reads, integration event deduplication/removal, privacy, payment/refund
balances, and two simultaneous final decisions.

Implementation checkpoint `d6ff5204109dc34986c513bf28a217d1556f97d9` passed
[both CI jobs in run 114](https://github.com/rhieryayunin-gass/sekola/actions/runs/34473527416).
The PR head must pass CI again after documentation/runner changes before merge.

## New migration preflight

1. Take a recoverable staging database backup and review the migration dry run.
2. Confirm staging history is applied through `0055` and only `0056`–`0059` are pending.
3. Review existing cross-tenant references, attendance records with both student
   and teacher, AI drafts approved without reviewer evidence, overlapping active
   room bookings, and duplicate operational approval resource links.
4. `0056`/`0058` intentionally fail on invalid existing data. Investigate and
   approve specific data corrections; do not disable integrity constraints or
   silently delete/repair records to force the migration through.
5. Schedule the apply during a quiet window: constraint checks/index creation
   may lock busy tables. Deploy the matching API/web checkpoint after migration;
   the new API requires the new RPCs.

## Trusted staging runner

Use **Trusted Integration Phase 51-54 Staging** on `main`: run `inspect`, review
the pending migration list, then run `apply` with `APPLY_0056_0059` only after
the preflight. The runner checks out an immutable implementation SHA. It does
not execute the CI database fixture scripts against staging.

Staging inspect and apply succeeded on 2026-09-10, confirmed by the user and
successful trusted runner executions: [inspect](https://github.com/rhieryayunin-gass/sekola/actions/runs/34474310165)
and [apply](https://github.com/rhieryayunin-gass/sekola/actions/runs/34474416688).
Migrations `0056`–`0059` are applied. This completes the migration gate only;
the live acceptance checks below remain pending.

## Live acceptance still required

- With two real tenant accounts, verify API denials and integrated-calendar privacy.
- Exercise Academic/Learning/Exam date creation, rescheduling, unpublishing and
  deletion; confirm recipient-specific events and notifications, without duplicates.
- Exercise Attendance and partial/refunded Finance payments and confirm dashboard
  agreement. Verify Team+ membership, Kanban transitions, task deadlines, project
  invoices/payments, and notification preferences.
- Complete multi-step room/leave/schedule approvals, rejection, cancellation,
  and competing decisions; confirm linked calendar, notification, and audit state.
- Switch accounts and revoke permissions while pages are open; check no prior
  account data or stale permission state remains visible.
- Test multiple pages and measure API latency/query plans with representative
  staging data. Index presence and bounded queries are not a load-test result.
- Analytics can be up to 15 seconds stale. Permission checks precede cache use;
  permissions themselves are not cached by this change.

Historical records are not automatically backfilled into integration calendars;
new/changed source records are synchronized. No production security certification,
representative load-test completion, Phase 43–50 live verification, or Phase 55
completion is claimed.
