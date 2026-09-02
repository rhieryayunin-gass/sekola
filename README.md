# SEKOLA AI

SEKOLA AI is a multi-tenant digital school platform built as a pnpm monorepo.
The project follows the locked architecture and sequential development roadmap:

```text
Next.js 16 App Router → NestJS API → Supabase PostgreSQL
```

## Technology

- Next.js 16, React 19, TypeScript, and Tailwind CSS v4
- TanStack Query and Zustand
- NestJS 11 with global validation and response conventions
- Supabase Auth and PostgreSQL
- Vitest and Testing Library
- ESLint flat configuration

## Repository structure

```text
apps/
  api/                    NestJS API and database migrations
  web/                    Next.js web application
docs/                     Architecture and development progress
```

## Prerequisites

- Node.js 22 or newer
- pnpm 11.21.0
- A Supabase project for local integration

## Local setup

1. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill the Supabase values in `.env`. Never expose
   `SUPABASE_SERVICE_ROLE_KEY` to the web application.

4. Start both applications:

   ```bash
   pnpm dev
   ```

The web application runs at `http://localhost:3000`. The API runs at
`http://localhost:3001/api/v1`, with its health endpoint available at
`GET /api/v1/health`.

Authentication setup and verification are documented in
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md).
Tenant isolation and management are documented in
[docs/TENANT_MANAGEMENT.md](docs/TENANT_MANAGEMENT.md).
User master behavior and Auth synchronization are documented in
[docs/USER_MANAGEMENT.md](docs/USER_MANAGEMENT.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run web and API in watch mode |
| `pnpm dev:web` | Run only the web application |
| `pnpm dev:api` | Run only the API |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm test` | Run all unit tests |
| `pnpm build` | Build all applications |
| `pnpm check` | Run the complete local quality gate |

## Locked product constraints

- Roles: `OWNER`, `PRINCIPAL`, `STAFF`, `TEACHER`, `STUDENT`, `PARENT`
- English is the internal language; Bahasa Indonesia is the second language
- Calendar and Notification are shared Core+ infrastructure
- No AI Agent and no marketplace ecosystem
- Existing database fields are not removed before migration verification
- New frontend data access uses native `fetch()` with TanStack Query
- New UI uses design-system tokens, not hardcoded module colors

## Development process

Development proceeds one numbered roadmap phase at a time. Each phase must pass
lint, typecheck, tests, and production build before its checkpoint is marked
complete. See [development progress](docs/PROGRESS.md).

## Security

The service-role Supabase key is server-only. Backend authorization and database
RLS are complementary controls; every tenant-owned resource must enforce tenant
isolation in both layers before production release.
