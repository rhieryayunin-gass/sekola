# Authentication

SEKOLA AI uses Supabase Auth with cookie-based SSR sessions. The browser SDK
handles login and logout, while the Next.js proxy refreshes sessions and
protects private routes before rendering.

## Environment

The web application requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for new Supabase projects, or
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` for legacy projects

The NestJS API requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must never be exposed through a `NEXT_PUBLIC_` variable.

## Session flow

1. The user submits email and password on `/login`.
2. Supabase stores the PKCE session in cookies.
3. The Next.js proxy calls `getClaims()` to verify identity and refresh cookies.
4. Anonymous dashboard requests are redirected to `/login`.
5. The dashboard verifies claims again before rendering protected content.
6. The browser auth listener keeps the Zustand UI state synchronized.
7. NestJS endpoints independently validate Bearer tokens with Supabase Auth.
8. The API rejects users whose Core profile is missing or inactive.

Session objects are used for UI state only. Authorization decisions must use
verified claims on Next.js or a verified Bearer token on NestJS.

## Database migration

Migration `0006_auth_user_sync.sql` creates and backfills the relationship
between `auth.users` and `public.users`. Apply migrations in numeric order to a
test or staging Supabase project before performing the live verification.

## Required live verification

- Sign in with a valid active user
- Reject invalid credentials
- Redirect an anonymous request away from `/dashboard`
- Preserve a safe internal `next` path after login
- Refresh an expired access token through the proxy
- Reject an inactive Core user at the API
- Sign out and reject the previous session
