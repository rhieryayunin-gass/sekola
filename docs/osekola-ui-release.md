# osekola interface

This release uses the supplied osekola logo, Inter/Poppins, primary #A6C724 and
secondary #017EFF. Navigation is a sticky glass header, including adjacent
language and theme controls. Dashboards and module links follow the API's
permission context; changing display preferences never changes authorization.

The landing page, login, all existing module routes, profile, monthly calendar,
notification filters, and Learning forms share the new shell. The original
assessment URL redirects to Exams; attendance has its own route. Team project
selection is horizontal.

The Nest API requires /api/v1. All frontend clients use one base-URL resolver,
including support for development configurations that already include the prefix.
Preview builds use versioned public endpoint defaults only when project variables
are absent. Service credentials are never used by the frontend.

## Supabase

The timestamped student-profile migration matches its applied Supabase history.
It provides only the calling user's active student identifier for submissions.
No browser access to the student master table is granted.

Production role permissions remain unchanged. STUDENT and PARENT currently lack
canonical shared-calendar/notification grants; PARENT has no operational modules.
The interface reports unavailable access instead of inventing student relationships.

### Pending permission review — not applied

The proposed changes below were rejected by automatic approval review because
they expand permissions for existing production users. They require explicit
approval before implementation and are not part of an executable migration:

- All six canonical roles: calendar.read and notifications.read.
- OWNER: users.read, users.create, users.update, users.status, tenants.update_own.

No parent access to student records, grades, bills, or attendance is proposed.

## Requested test identities

The provisioning workflow targets xrqjutbwnlkogpfhtuwr only and creates the
OSEKOLA-DEMO-20260910 tenant plus one account per existing canonical role.
It never changes role-permission mappings or resets existing credentials.
The operation uses the existing GitHub staging environment's server credential,
has a bounded date window, and publishes only encrypted credentials. The private
decryption key stays outside the repository. The job honors environment approvals.

The OWNER account uses the real existing OWNER role. Its administration capability
is therefore significant even though operational demo records are in a separate tenant.
