# O-Connect

O-Connect is OSEKOLA's communication module. O-Core supplies accounts, tenant
identity, permissions and the notification center. This release implements the
requested WhatsApp-style chat layout and account-specific chat font settings.
The available cross-chat context confirmed this positioning; a complete earlier
feature specification was not retrievable. Commercial packaging/pricing is not
changed by this implementation.

## User workflows

- Open **O-Connect** from the module navigation or dashboard.
- Start a private conversation from the school's contact directory. Teachers and
  staff can contact school members; students and parents can initiate contact
  with teachers/staff. The directory does not expose email addresses.
- Authorized teachers/staff create groups, choose participants, and remove or
  add members. Group creators manage membership; added members can read existing
  group history. Parents participate through explicitly invited groups/private
  messages; there is no inferred parent-child relationship.
- Open a class discussion from **O-Academic → Classrooms → O-Connect discussion**.
  Membership follows active classroom assignments, the homeroom teacher and
  academic administrators. Student reassignment removes class access.
- Open a project discussion from the selected **O-Team** project. Only the
  project owner and current members can access it; archived projects are closed.
- Write messages, reply, attach images/PDF/TXT (10 MB maximum), search history,
  and load previous messages. Enter sends; Shift+Enter adds a line.
- A check indicates saved/sent; blue double checks indicate that another member
  has read through that message. Receipt details remain conversation-scoped.
- **Chat settings → Chat font size** offers 14, 16, 18 and 20 px, applied to
  message text/composer and saved to the account across devices.
- Mute suppresses new notification-center entries. Archive is personal. The
  notification center opens the exact conversation and reading the thread clears
  its unread notification. Notification bodies do not contain chat content.
- Share a calendar event, O-Learning course or O-Team task from the composer.
  Opening the shared source rechecks the recipient's original module permission
  and shows the source title/details, with a link to its module.
- Authors can delete their own messages within 24 hours. Messages are redacted
  with a deletion marker, including the publicly retrievable attachment link.

## Data and authorization

The web application uses Supabase Auth, transactional Postgres RPCs and Realtime
Postgres Changes. The existing VPS API continues to serve the other modules;
O-Connect's server operations are deployed through its database migration and
the Vercel web application. No service-role credential enters browser bundles.

Tables: `oconnect_conversations`, `oconnect_members`, `oconnect_messages`,
`oconnect_preferences`. All enable RLS and authenticated table access is read-only.
Mutations use public **security-invoker** wrappers around a private schema whose
functions validate the active account, current database permissions, active
tenant and conversation eligibility. No mutation accepts a caller-supplied actor
or tenant. Parent/student metadata does not confer staff access.

The `oconnect-attachments` bucket is private. Storage policies check membership,
tenant, uploader path and message visibility. `/api/connect/attachment` authenticates
again and returns `private, no-store`, with safe image types inline only when
requested; other files are forced downloads. Removed members cannot fetch files.
This is application access control; the module does not claim end-to-end message
encryption or an external WhatsApp messaging gateway.

Writes are serialized per actor/conversation. Client-generated message UUIDs
deduplicate retries; limits are 30 messages/minute and 30 new manual conversations
per hour per account. Groups support up to 100 explicit members. Inbox/history
are paginated. Realtime invalidates authorized cached queries, with a 15-second
polling fallback while the page is active. Reassigned/disabled accounts lose
database access immediately; cached UI refreshes on a Realtime event or next poll.

## Verification and release

- `apps/api/database/tests/oconnect.sql` exercises authenticated RPCs/RLS, two
  tenants, staff/student/parent access, messages/retries/history/search, files,
  preferences, notifications, class/project integration and membership revocation.
  It is part of the existing PostgreSQL CI job and rolls back every fixture.
- Web interaction tests exercise font persistence and send retry behavior.
  Attachment route tests cover authentication, membership denial and cache safety.
- `verify-oconnect-live.yml` waits for the exact production frontend commit,
  creates temporary isolated school tenants/accounts, then exercises real Auth,
  RPC, Realtime delivery, replies, preferences, web file download and access denial,
  notifications and removal. It deletes its own fixtures in `finally`. Credentials
  stay in memory and logs contain only test results. The pre-existing GitHub
  `staging` environment holds credentials for the explicitly validated project
  `xrqjutbwnlkogpfhtuwr`; this does not change which database is targeted.
- Apply the additive migration before merging/deploying the new frontend. Verify
  the SQL regression, Supabase advisors, required CI jobs, Vercel Ready state and
  the production integration workflow. A passing build alone is not live proof.
- For frontend rollback, restore the previous Vercel deployment and retain data.
  Do not drop the chat schema or Storage bucket to roll back a UI release.

Phase 43–50 and Phase 51–54 historical live checklists and the wider Phase 55
production acceptance are independent; this module does not mark them complete.
