# Sehati — Couple Wedding Planner

Wedding planning workspace for couples (Indonesia-first). Built phase by phase from the PRD.

**Status:**

- Phase 1 (Foundation): authentication, sessions, wedding workspace, membership, onboarding, base layout.
- Phase 2 (Checklist): admin-configurable task categories & templates (108 defaults), template-driven
  deadline generation, task CRUD with filters/search/sort/pagination, progress on the dashboard, and
  wedding-date change with opt-in deadline recalculation (manual deadlines are never overwritten).

Nothing beyond Phase 2 is implemented yet.

## Stack

| Area | Choice |
| --- | --- |
| App | Next.js 16.3 (App Router, Server Actions), React 19.3, TypeScript 5.9 (strict) |
| UI | Tailwind CSS 4.3 |
| Database | PostgreSQL 16 + Prisma 7.10 (`@prisma/adapter-pg`) |
| Auth | Custom database sessions (httpOnly cookie → SHA-256 token hash), Argon2id passwords |
| Validation | Zod 4 |
| Tests | Vitest 4 (unit + integration), Playwright 1.63 (E2E) |

## Setup

Requirements: Node.js ≥ 24, pnpm 10, PostgreSQL 16.

1. Create two PostgreSQL databases (e.g. `wedding_planner` and `wedding_planner_test`) and a user.
2. `cp .env.example .env` and fill in `DATABASE_URL` and `DATABASE_URL_TEST`.
3. Install and prepare:

   ```bash
   pnpm install
   pnpm db:deploy        # apply migrations (development DB)
   pnpm db:seed          # event types & marriage processes
   pnpm db:test:deploy   # apply migrations (test DB)
   pnpm db:test:seed
   pnpm dev
   ```

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test:unit` | Pure logic tests (no database) |
| `pnpm test:integration` | Services against `DATABASE_URL_TEST` |
| `pnpm test:e2e` | Playwright against a production build (`next start` on port 3100) using `DATABASE_URL_TEST` (`pnpm exec playwright install chromium` first) |
| `pnpm db:migrate` | Create a new migration during development |
| `pnpm db:deploy` / `db:status` / `db:seed` | Apply migrations / status / seed reference data |

## Architecture notes

- `src/lib` — pure, client-safe helpers (money, dates, validation schemas).
- `src/server` — server-only code: `db`, `auth`, `authz`, `wedding` services, `actions` (Server Actions).
- Every private planning record belongs to a **wedding**, never directly to a user. All access goes
  through `requireWeddingMember()` (`src/server/authz/wedding-access.ts`), which returns the same error
  for "not found" and "not a member".
- Money is `BIGINT` whole rupiah (`bigint` in TypeScript). Calendar dates are `DATE` columns
  interpreted in `weddings.time_zone` (default `Asia/Jakarta`).
- `src/proxy.ts` only does an optimistic cookie check and request IDs; real session validation happens
  in each page and action.
- CSRF: mutations use Server Actions (POST + Origin/Host check by Next.js) with `SameSite=Lax` cookies.
- Rate limiting uses an atomic PostgreSQL upsert (`rate_limit_buckets`), so no Redis is needed yet.
- Email: only a development `file` driver exists (writes JSON to `MAIL_FILE_DIR`). A production email
  provider is still to be chosen.
