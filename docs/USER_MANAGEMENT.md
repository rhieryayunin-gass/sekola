# User Management

Phase 05 provides the tenant-scoped user master without introducing the Role,
Permission, Access Scope, or Profile features scheduled for later phases.

## Data relationship

`public.users.id` is the one-to-one relationship to `auth.users.id`. The Core
record stores tenant membership, active status, and the existing user-level
relationship. Contact information, avatar, and account settings remain in the
separate Profile phase.

```text
auth.users (authentication)
        │ id
        ▼
public.users (Core user master)
        │ tenant_id
        ├──────────► public.tenants
        │ user_level_id
        └──────────► public.user_levels
```

The backend uses the service-role client, so every query that addresses a user
record also includes the authenticated administrator's `tenant_id`. Direct
browser access is narrower: the `users_select_self` RLS policy exposes only the
authenticated user's own Core profile.

## API

All endpoints use the `/api/v1` prefix.

| Method | Path | Permission | Behavior |
| --- | --- | --- | --- |
| `GET` | `/users/me` | Authenticated | Read the current Core profile |
| `GET` | `/users` | `users.read` | Paginated tenant user master |
| `GET` | `/users/meta/user-levels` | `users.read` | Active existing user levels |
| `GET` | `/users/:id` | `users.read` | Read a user in the current tenant |
| `POST` | `/users` | `users.create` | Create Auth and Core records |
| `PATCH` | `/users/:id` | `users.update` | Synchronize Core and Auth identity fields |
| `PATCH` | `/users/:id/status` | `users.status` | Activate or deactivate Auth and Core |
| `DELETE` | `/users/:id` | `users.status` | Backward-compatible deactivation |

The list endpoint accepts `page`, `page_size`, `email`, and `status` (`active`
or `inactive`). Responses contain `items` plus pagination metadata.

## Lifecycle guarantees

- Emails are normalized to lowercase and protected by a case-insensitive unique
  index.
- New users always receive the current administrator's trusted tenant metadata.
- A failed Core profile creation rolls back the new Auth user.
- Email and full-name changes are synchronized to Supabase Auth. If Auth
  synchronization fails, the Core profile is restored.
- Deactivation sets `public.users.is_active = false` and bans the Supabase Auth
  account. Activation reverses both changes.
- Administrators cannot deactivate their own account.
- Administrators cannot change their own user level, and legacy platform-level
  assignments are available only to an existing platform administrator.
- Cross-tenant detail, update, and status requests return `404` and do not reveal
  whether the target exists.

## Database migration

Migration `0011_user_management.sql`:

- establishes the normalized unique email index;
- documents the Auth-to-Core profile relationship;
- adds the reversible `users.status` permission;
- preserves legacy `users.deactivate` access;
- maps existing owner/administrator identities without creating or renaming
  roles;
- creates the self-profile RLS policy; and
- removes anonymous and direct authenticated mutation access.

Role definitions and the final role-permission matrix remain controlled by
Phases 06 and 07.

## Verification

Local verification:

```bash
pnpm check
```

Live staging verification uses `verify-users-staging.mjs`. It creates a
temporary tenant, administrator, and target user; validates CRUD, filters,
cross-tenant isolation, Auth synchronization, reversible status, self-profile
RLS, and cleanup. No fixture remains after a successful run.
