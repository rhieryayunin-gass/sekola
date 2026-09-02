# Tenant Management

SEKOLA AI treats each school as a tenant. Tenant identity is resolved from the
authenticated Core user and must never be accepted from a normal client request
as an arbitrary tenant identifier.

## Access model

- Every authenticated user can read their own tenant through `GET /tenants/me`.
- Tenant administrators with `tenants.update_own` can change only their own
  school name through `PATCH /tenants/me`.
- Platform-wide list, detail, create, update, and deactivate endpoints require
  dedicated `tenants.*` permissions granted to the Super Admin role.
- Tenant Admin receives only `tenants.update_own`; it cannot enumerate or
  mutate another school.
- Deactivating a tenant causes the API authentication boundary to reject its
  users, even when their individual profiles remain active.

The backend uses the Supabase service role and therefore always applies tenant
scope explicitly. Permission guards and query filters are both required; one
does not replace the other.

## Direct database access

Migration `0009_tenant_management.sql` adds a security-definer helper that
resolves `auth.uid()` to the active Core user's tenant. RLS permits authenticated
clients to select their active tenant and update only its `name` column. Anonymous
access, tenant creation, code changes, activation changes, and deletion remain
blocked at the database grant layer.

## API endpoints

| Method | Endpoint | Permission |
|---|---|---|
| `GET` | `/tenants/me` | Authenticated user |
| `PATCH` | `/tenants/me` | `tenants.update_own` |
| `GET` | `/tenants` | `tenants.read_all` |
| `GET` | `/tenants/:id` | `tenants.read_all` |
| `POST` | `/tenants` | `tenants.create` |
| `PATCH` | `/tenants/:id` | `tenants.update_all` |
| `DELETE` | `/tenants/:id` | `tenants.deactivate` |

Deletion is logical: the endpoint sets `is_active` to `false` and preserves the
tenant record and its relationships.

## Web experience

`/dashboard/tenant` displays the authenticated user's tenant identity. The code
and tenant ID are read-only; authorized tenant administrators can update the
school name. All writes pass through the NestJS API using the current Supabase
Bearer token.

## Required staging verification

- Apply migration `0009` and confirm the new permissions are mapped correctly.
- Confirm a Tenant Admin can read and rename its own tenant.
- Confirm the same user cannot list or read another tenant.
- Confirm an anonymous client cannot read tenants directly.
- Confirm an authenticated direct Supabase query returns only its own tenant.
- Confirm a deactivated tenant is rejected by the API authentication boundary.
