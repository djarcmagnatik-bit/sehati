# Sehati — Couple Wedding Planner

Wedding planning workspace for couples (Indonesia-first). Built phase by phase from the PRD.

**Status:**

- Phase 1 (Foundation): authentication, sessions, wedding workspace, membership, onboarding, base layout.
- Phase 2 (Checklist): admin-configurable task categories & templates (108 defaults), template-driven
  deadline generation, task CRUD with filters/search/sort/pagination, progress on the dashboard, and
  wedding-date change with opt-in deadline recalculation (manual deadlines are never overwritten).

- Phase 3 (Couple collaboration): owner-only partner invitations (emailed + copyable single-use link,
  7-day expiry, must match the invited email), max two members per workspace, remove partner,
  and an activity log (dashboard + `/activity`) written in the same transaction as each change.

- Phase 4 (Budget): per-workspace budget categories (from admin-configurable templates) with
  allocations, target + configurable warning threshold, expenses (obligations) separate from payment
  transactions, totals always computed from rows (`outstanding = total - SUM(payments)`), overpayment
  rejected under a row lock, composite FKs + CHECK constraints for money integrity, dashboard budget
  summary and upcoming payments.

- Phase 5 (Vendors): vendor research (candidates with contacts, estimate, package, rating, pros/cons,
  status), side-by-side comparison (2–4), booking a candidate into a vendor without losing research
  data (row-locked, exactly once), direct vendor creation, contract → linked budget expense, vendor money
  derived from linked expenses/payments, composite FKs keeping vendors/expenses/research in one wedding,
  safe contact links (wa.me, tel:, instagram, http/https only), dashboard vendor summary.

- Phase 6 (Guests): guest groups (from admin-configurable templates, created with each workspace),
  guests where **one invitation can cover several people** — invitations and seats are always counted
  separately, RSVP (`attending_count <= seat_count`, enforced in validation and by CHECK constraints),
  invitation status with bulk updates ("Dibuka" is never set by hand and never downgraded), filters,
  search, sorting and pagination, a two-step CSV/XLSX import (upload → analyzed preview with per-row
  errors and duplicate detection → confirm, row-locked so a batch imports exactly once) with a CSV
  template, per-guest invitation tokens for the upcoming public invitation, dashboard guest summary,
  and a mobile bottom navigation (Beranda/Checklist/Budget/Tamu/Lainnya) with a `/more` page.

- Phase 7 (Invitation): one digital invitation per wedding with 12 modular sections (enable, reorder,
  edit text), wedding events (date, time, venue, coordinates, dress code) reused by the invitation,
  love story, gallery with image upload, gift information (display-only), 9 original themes plus a
  cover layout — presentation is fully separate from content, so switching themes changes nothing —
  and a public page at `/undangan/{slug}` that works without a session and exposes only public data.
  Personalized links live at `/i/{token}`: the guest is greeted by name, the URL carries no name, and
  the first open flips the guest's invitation status to "Dibuka" (never overwriting a manual
  follow-up). Images are validated from their own bytes (JPG/PNG/WebP, ≤ 3 MB), stored through a
  `MEDIA_DRIVER` abstraction (local files for now), and served from `/media/{id}` — public only while
  they belong to a published invitation.

- Phase 8 (RSVP & guestbook): guests answer from their own `/i/{token}` link — attendance, how many
  people (never more than their seats, enforced in validation, in the service against the current
  guest row, and by a CHECK constraint), the names coming, and a message. Every answer is appended to
  `rsvp_submissions` instead of overwriting, so the couple sees the full history while the guest row
  keeps the latest. Answers land immediately in the guest summary, the "Konfirmasi terbaru" card and
  the activity log. The guestbook takes wishes from the public page or a personal link, rate limited
  per IP, with moderation (hide keeps it for the couple, delete is permanent); a hidden wish
  disappears from the public page, and a wish outlives the guest who sent it.

- Phase 9 (Planning extras):
  - **Calendar** (`/calendar`, month / week / agenda) aggregates task deadlines, payment due dates
    (with what is still unpaid), wedding events, vendor meetings (new date/time on vendor research)
    and custom agenda entries. Nothing is stored twice; every entry links back to its source record,
    and each source has a symbol and a legend so colour is never the only cue.
  - **Savings** (`/savings`): deposits per contributor, a wedding-fund target that falls back to the
    budget target, and what still has to be saved per month before the wedding date.
  - **Seserahan** (`/seserahan`): items with admin-configurable categories, quantity, estimated vs
    actual price, who buys it, a private photo, and planned → purchased → packed → ready.
  - **Rundown** (`/rundown`): the wedding-day schedule grouped by day and ordered by time, as a
    timeline or a table, printable (app chrome hides in print).
  - **Background music** for the invitation: MP3/M4A/OGG upload validated from the file header,
    served publicly only while switched on, and a player that falls back to a visible "Putar musik"
    button when the browser blocks autoplay.

There is no image transcoding yet (no `sharp`): uploads are size- and dimension-checked and served
as-is. Audio has no HTTP range support, so seeking inside a long track may not work in every browser.

Nothing beyond Phase 9 is implemented yet.

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
| `pnpm test:e2e` | Playwright against a production build (`next start` on port 3100) using `DATABASE_URL_TEST` (`pnpm exec playwright install chromium` first). Rate-limit buckets in the test database are cleared before each test; app limits are unchanged |
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
- Uploaded images: bytes go to the media store (`MEDIA_FILE_DIR`), metadata to PostgreSQL. `/media/{id}`
  serves them, publicly only while the owning invitation is published. Maps need no API key: a link is
  built from coordinates or the address, and the embedded preview is a lazy OpenStreetMap frame.
