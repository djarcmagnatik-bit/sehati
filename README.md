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
  separately, an optional seat count per invitation (left empty, the guest may answer for up to 50
  people and planning totals count the invitation as one), RSVP (`attending_count <= seat_count`,
  enforced in validation and by CHECK constraints),
  invitation status with bulk updates ("Dibuka" is never set by hand and never downgraded), filters,
  search, sorting and pagination, a two-step CSV/XLSX import (upload → analyzed preview with per-row
  errors and duplicate detection → confirm, row-locked so a batch imports exactly once) with a CSV
  template, per-guest invitation tokens for the upcoming public invitation, dashboard guest summary,
  and a mobile bottom navigation (Beranda/Checklist/Budget/Tamu/Lainnya) with a `/more` page.

- Phase 7 (Invitation): one digital invitation per wedding with 12 modular sections (enable, reorder,
  edit text), wedding events (date, time, venue, coordinates, dress code) reused by the invitation,
  love story, gallery with image upload, gift information (display-only), 14 original themes plus a
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

- Phase 10 (Monetization):
  - **Free vs Full Access per wedding**, shared by both partners. Free: account, onboarding,
    dashboard preview, checklist, savings and the calendar (showing only sections the wedding may
    open). Full Access unlocks vendors, budget & payments, guests & RSVP, the invitation, rundown,
    seserahan and partner invitations.
  - **Enforced in the services**, not by hiding menus: every paid service checks membership first
    (outsiders still get "not found") and then access (`FeatureLockedError`). Pages redirect to
    `/billing?feature=…`, actions explain the lock, the public invitation, its media, RSVP and
    wishes disappear when access is revoked.
  - **Plans and add-ons live in the database** (seeded once, never overwritten). Add-ons carry a
    quota that is spent atomically; the seeded voice-greeting add-on stays inactive until that
    feature exists.
  - **Checkout → webhook**: a checkout creates a pending order with the price copied at that moment
    and sends the buyer to the provider. Only a verified webhook changes the order
    (pending / paid / failed / expired / refunded): the transaction row is locked, each event is
    stored under a unique key so replays are no-ops, amounts must match, a paid order never moves
    backwards, and a refund revokes what it granted.
  - **Providers**: `sandbox` (a local hosted-page stand-in that sends a real HMAC-signed webhook over
    HTTP; refused in production unless `ALLOW_SANDBOX_PAYMENTS=true`) and `midtrans` (Snap checkout,
    SHA-512 notification signature). Midtrans webhooks are confirmed with Midtrans' Status API
    before anything is applied; the return page and a 10-minute worker job (`billing.reconcile`)
    use the same API to catch delayed or lost webhooks. See [docs/payments-midtrans.md](docs/payments-midtrans.md)
    (a full payment against the live Midtrans sandbox is still NOT VERIFIED).
  - Support tool: `pnpm access:grant -- --email <email>` grants Full Access as an admin grant.

- Phase 11 (Admin, `/admin`):
  - **Admins only**: the role is read from the database on every page, action and service call, so a
    demotion or suspension applies immediately. Everyone else gets a plain 404; the area is noindex
    and disallowed in robots.txt.
  - **Dashboard**: users, weddings, active and paid weddings, conversion, revenue (paid orders),
    published invitations and RSVPs — aggregate counts only, cached for 5 minutes.
  - **Users**: search, suspend (blocks sign-in and ends every session) / unsuspend, promote / demote.
    Nobody acts on their own account, and suspensions and demotions are serialized with a re-check
    of the acting admin, so two admins cannot remove each other at the same moment.
  - **Weddings**: access status, members, recent orders; grant a plan by hand or revoke an access
    (the history is kept).
  - **Transactions**: read-only list and detail with the webhook history (payloads are not shown);
    status still only changes through verified webhooks.
  - **Plans, add-ons and promo codes**: prices and features are editable (codes are fixed; existing
    orders keep their price). Promo codes: percent (1–99) or fixed rupiah, optional plan restriction,
    Jakarta-day validity window, total and per-user limits. They are checked at checkout under a row
    lock; a use counts while its order is paid or still open, and the price never drops below
    Rp1.000. Add-ons are never discounted.
  - **Task templates**: create and edit the checklist templates (category, priority, deadline
    offset, event types, marriage processes). Existing checklists are never changed.
  - **Invitation themes**: themes stay in code; admins set name, order, availability and premium
    status, with a preview built from sample data. Premium themes need the `premium_themes` feature
    (part of Full Access); a wedding may always keep the theme it already uses.
  - **Audit log**: every admin change is written in the same transaction as the change itself.
  - First admin: `pnpm admin:set -- --email <email>` (after that, admins manage roles in the UI).

- Phase 12 (PWA & notifications):
  - **Installable PWA**: web app manifest (`/manifest.webmanifest`, start at `/dashboard`,
    standalone), app icons generated at build time (192, 512, maskable 512, Apple touch), an
    install button on "Lainnya" (Chrome/Android prompt, manual steps for Safari).
  - **Safe caching** (`public/sw.js`, production builds only): hashed `/_next/static` assets
    (cache-first), manifest and icons (stale-while-revalidate) and an `/offline` page. Pages, Server
    Actions, RSC payloads, API routes, invitation media and payments always go to the network and
    are never stored. The offline page's "Coba lagi" works without JavaScript.
  - **In-app notifications** (PRD §37) for: tasks due within 3 days (grouped per due date), tasks
    that became overdue in the last 7 days, payments due within 3 days, partner invitations (only to
    an existing account with that email, never with the secret link), partner joined, RSVP received,
    and budget exceeded (total target or a category allocation; once per limit). Bell with unread
    count in the header, `/notifications` inbox, open marks read, mark all as read. Payment and
    RSVP notifications respect the wedding's access. Links are internal paths only (also a CHECK).
  - **Asynchronous delivery / background jobs**: a durable job queue in PostgreSQL
    (`background_jobs`). The event and its job are written in the same transaction; workers claim
    jobs with `FOR UPDATE SKIP LOCKED`, retry with exponential backoff (30 s … 1 h, then DEAD),
    reclaim jobs from crashed workers after a 5-minute lease, and collapse repeated requests with a
    dedupe key. Every notification has a per-user dedupe key, so replays never notify twice.
    Reminders are scanned hourly; finished jobs and old notifications are purged daily.
    Redis/BullMQ is not used yet: PostgreSQL covers the current volume without another service.
  - Run `pnpm worker` next to the app (several may run at once). Hosts without a long-running
    process can instead call `POST /api/jobs/run` with `Authorization: Bearer $JOBS_CRON_SECRET`.

- Phase 13 (Reports & export):
  - **Reports** (`/reports`, PRD §39): tasks (total, completed, overdue, per category — free),
    budget (target, allocated, committed, paid, unpaid, per category), guests (invitations, seats,
    attending, maybe, declined, pending, per group) and vendors (contract, paid, outstanding, next
    due date). Paid sections show a locked note instead of data when the wedding lacks access.
  - **Print-friendly** (PRD §40): the report pages, the full guest list (`/reports/guests`), the
    budget summary (`/reports/budget`) and the rundown hide the app chrome when printed and carry
    the couple's name and print time.
  - **CSV/XLSX export** of guests, vendors, expenses, payments and rundown at
    `/exports/{dataset}?format=csv|xlsx`. Same access rules as the pages (membership, then the
    feature), `Cache-Control: private, no-store`, 60 downloads per account per hour, and each
    download is written to the activity log. Guest exports never include the personal invitation
    token. CSV is UTF-8 with BOM; text starting with `= + - @` is prefixed with an apostrophe
    (formula injection). XLSX cells are typed: amounts are numbers, dates are dates, text is never a
    formula.
  - **Progress card** (`/reports/share`, PRD §33): a 1080×1350 PNG rendered on the server for the
    signed-in member only. Names, date and countdown always; checklist, next tasks, guest RSVP and
    budget are chosen per share. Budget is off by default and shows percentages; rupiah amounts need
    a separate, explicit choice. Download or share through the system share sheet.

- Phase 14 (Security audit): see [docs/security-audit.md](docs/security-audit.md) for the method,
  evidence per PRD item and residual risks. Hardening added in this phase:
  - Nonce-based Content Security Policy on every page (`src/proxy.ts`), COOP, HSTS in production.
  - Uploaded images lose EXIF/GPS and text metadata before storage (orientation and colour
    profiles kept); file extensions must match the content; XLSX imports are checked for
    decompression bombs before unpacking.
  - Rate limits read the client IP only from trusted proxies (`TRUSTED_PROXY_COUNT`).
  - Webhook size is checked before the body is read; couple Instagram handles are validated.
  - Public note fields are labelled as public; `mysql2` (transitive) pinned to a patched version.
  - Regression guards: every Server Action checks the session, every route handler authenticates or
    is public by design, no raw SQL/HTML/eval in `src` (`tests/unit/security.test.ts`); an IDOR matrix
    and public-DTO leak checks (`tests/integration/security.test.ts`); CSP, XSS, CSRF, IDOR-by-URL,
    login lockout and open-redirect checks in the browser (`tests/e2e/security.spec.ts`).

- Phase 15 (Performance): see [docs/performance-report.md](docs/performance-report.md). Measured
  with the PRD dataset (10,000 guests, 500 vendors/research entries, 2,000 tasks, 5,000 payments and
  transactions): common operations 2–68 ms, no N+1 queries, invitation LCP 2.32–2.38 s on slow 4G with a
  2 MB cover photo.
  - Responsive images: WebP copies (480/960/1280/1920 px) made at upload, `/media/{id}?w=`,
    `srcset`/`sizes` on the invitation, cover preloaded. `pnpm media:variants` backfills old images.
  - Uploads above 1 MB work (Server Action body limit raised to 7 MB; services keep the real limits).
  - Batched reminder scan, per-request memoized membership/wedding lookups, indexes for admin lists
    and the cross-wedding reminder scan.
  - `pnpm test:perf` seeds the dataset in the test database and checks timings, statement counts
    and query plans; `tests/e2e/performance.spec.ts` covers LCP and the 10,000-guest list.

- Phase 16 (Production verification): see [docs/production-verification.md](docs/production-verification.md)
  for the raw outputs of every check, the MVP checklist (PRD §70) and the deployment checklist.
  - `tests/e2e/acceptance.spec.ts` runs the PRD §73 acceptance journey end to end (owner, partner
    and guest in separate browsers).
  - `pnpm verify:migrations` applies every migration to an empty schema, checks for drift against
    `schema.prisma` and runs the seed twice. It found and fixed a corrupted Phase 12 migration that
    would have failed on a fresh database.
  - `pnpm verify:env` checks a production environment (names only, never values); `/api/health`
    is the load-balancer probe.

- **Email delivery (after Phase 16):** `MAIL_DRIVER=smtp` sends through an authenticated SMTP server
  (implicit TLS on 465, or STARTTLS enforced on other ports; 30 s connect/greeting timeouts).
  Password-reset emails are sent after the response (`after()`), so response time does not reveal
  whether an account exists. `pnpm mail:test [-- --to <address>]` checks the settings. See
  [docs/email.md](docs/email.md).

- **2026 invitation themes:** Editorial, Coquette, Retro Pop, Butter Garden, Film Flash, Boho Rustic and Dusty Blue, based on 2026 stationery research (typography-led, coquette bows and lace, bold color play, scribble lines, candid flash film). Themes now carry a style as well as colors: heading weight/italic, label font, card style (soft, ink, pop, lace), photo frame (rounded, arch, polaroid), motif (line, bow, squiggle, sparkle, film strip, sprig) and corner ornaments and film grain. Theme fonts load only on invitation pages and only the chosen theme's files download. The theme picker shows a live mini preview of each theme. Unit tests enforce loaded fonts and WCAG contrast for every theme.
- **Opening cover and gentle motion:** guests first see a full-screen cover with the couple, the date and their own name, and tap "Buka Undangan" to enter; that tap also starts the music (browsers only allow sound after an interaction). The page stays locked behind it, opening it once per tab is enough, and the couple can switch the cover off in the design page. Motion is deliberately small: a slow cover zoom, sections fading up once as they scroll into view, and a light sway on the botanical corners of Boho Rustic and Dusty Blue. Everything stops for `prefers-reduced-motion`, and without JavaScript the cover is not shown at all.
- **Landing page:** `/` explains the product for first-time visitors: what it does, working together, the main features, the digital invitation, how to start, free vs paid plan (price from the database), FAQ. An example-invitation button appears when `DEMO_INVITATION_SLUG` names a published invitation.

Nothing else beyond Phase 16 is implemented yet. WhatsApp and web push delivery are not built.

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
   pnpm worker           # in a second terminal: notifications & reminders
   ```

## Deployment

Docker images (`Dockerfile`: standalone `app` + one-off `tools`) and a compose setup for one small
server behind an existing Caddy (`deploy/`). The steps are in [docs/deploy-aws.md](docs/deploy-aws.md):
DNS, image build (GitHub Actions to GHCR, or on the server), migrations, Caddy, backups and
updates. `NEXT_OUTPUT=standalone pnpm build` produces the standalone server that the image runs.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test:unit` | Pure logic tests (no database) |
| `pnpm test:integration` | Services against `DATABASE_URL_TEST` |
| `pnpm test:perf` | Performance: PRD-size dataset in the test database, timings, SQL counts, query plans |
| `pnpm test:e2e` | Playwright against a production build (`next start` on port 3100) using `DATABASE_URL_TEST` (`pnpm exec playwright install chromium` first). Rate-limit buckets in the test database are cleared before each test; app limits are unchanged |
| `pnpm db:migrate` | Create a new migration during development |
| `pnpm db:deploy` / `db:status` / `db:seed` | Apply migrations / status / seed reference data |
| `pnpm access:grant -- --email <email> [--plan CODE]` | Give an account's weddings a plan without payment (admin grant) |
| `pnpm admin:set -- --email <email> [--revoke]` | Make an existing account an admin (or remove the role); audited |
| `pnpm verify:migrations` | Apply all migrations to an empty schema, check drift, run the seed twice (test DB) |
| `pnpm verify:env [-- --file .env.production]` | Production configuration check (exit 1 on errors) |
| `pnpm load:seed [-- --clean]` / `pnpm load:run -- --spawn [--instances N] [--stages 10:60,50:60]` | HTTP load test of the production build against the test DB (see [docs/load-test.md](docs/load-test.md)) |
| `pnpm demo:seed -- --email <address> [--clean]` | One demo couple (Full Access, every feature filled with fictional data); prints a one-time password. See [docs/deploy-aws.md](docs/deploy-aws.md#demo-account) |
| `pnpm payment:check [-- --order <id>]` | Check `MIDTRANS_SERVER_KEY` against Midtrans (creates nothing), or sync one order with the Midtrans Status API |
| `pnpm mail:test [-- --to <address>]` | Connect and authenticate to SMTP from `.env`; optionally send one test email (password never printed) |
| `pnpm media:variants` | Create resized WebP copies for images uploaded before Phase 15 |
| `pnpm worker [-- --once]` | Background worker: reminders, notifications, housekeeping (`--once` = one cycle) |

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
- Background jobs: `src/server/jobs` (queue + runner). Enqueue with `enqueueJob(tx, …)` inside the
  transaction of the change; handlers re-read the database and must be safe to run twice.
- Email: `src/server/mail/mailer.ts` — `file` driver for development (JSON in `MAIL_FILE_DIR`) and an
  `smtp` driver (nodemailer). Services take a `Mailer`, so tests pass a fake one.
- Uploaded images: bytes go to the media store (`MEDIA_FILE_DIR`), metadata to PostgreSQL. `/media/{id}`
  serves them, publicly only while the owning invitation is published. Maps need no API key: a link is
  built from coordinates or the address, and the embedded preview is a lazy OpenStreetMap frame.
