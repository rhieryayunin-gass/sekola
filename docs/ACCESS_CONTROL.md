# Phase 08 — Access Control

Access control is deliberately generic. A role may receive an explicit grant in
one of four scope types: `GLOBAL`, `TENANT`, `MODULE`, or `RESOURCE`.

`GLOBAL:*` is a platform-wide grant. A matching scope key or `*` is required
for the other scope types. The backend guard remains authoritative; frontend
state may only use the authorization context to hide unavailable navigation.

The existing locked roles (`OWNER`, `PRINCIPAL`, `STAFF`, `TEACHER`, `STUDENT`,
and `PARENT`) are preserved. Migration `0014` grants `OWNER` `GLOBAL:*` and
does not infer operational scopes for any other role.
