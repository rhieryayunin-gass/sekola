# Role Catalog

Phase 06 establishes the fixed atsekola role identities:

| Code | Name | Purpose |
| --- | --- | --- |
| `OWNER` | Owner | School ownership and top-level accountability |
| `PRINCIPAL` | Principal | School leadership and academic operations |
| `STAFF` | Staff | School administration and operational support |
| `TEACHER` | Teacher | Teaching and classroom operations |
| `STUDENT` | Student | Student learning access |
| `PARENT` | Parent | Parent and guardian access |

Migration `0012_role_catalog.sql` inserts the canonical catalog idempotently.
It does not delete or rename legacy role records, so existing authorization
relationships remain intact.

Permission master data, role-permission assignments, user-role assignments,
frontend permission checks, and access scopes are intentionally excluded. They
belong to Phases 07 and 08 of the locked roadmap.
