# Production verification (Phase 16)

Commit verified: `3cdb584` · Run: 2026-09-18 12:22–12:31 (UTC+7) · Node v24.19.0 · pnpm 10.34.5 ·
PostgreSQL 16 (local) · Windows workstation. Every command below ran in sequence in one session; the
excerpts are copied from that log without editing (long passing lists shortened with `…`).

## Results

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `pnpm lint` | 0 | no findings |
| 2 | `pnpm typecheck` (`prisma generate && tsc --noEmit`) | 0 | no errors |
| 3 | `pnpm test:unit` | 0 | 26 files, **310 passed** |
| 4 | `pnpm test:integration` (PostgreSQL) | 0 | 17 files, **223 passed** |
| 5 | `pnpm test:perf` (PRD dataset) | 0 | **3 passed** — timings, equal SQL counts, index use |
| 6 | `pnpm verify:migrations` | 0 | 13 migrations applied to an empty schema, **no drift**, seed idempotent |
| 7 | `pnpm db:status` (development) | 0 | Database schema is up to date |
| 8 | `prisma migrate status` (test) | 0 | Database schema is up to date |
| 9 | `pnpm build` | 0 | Compiled successfully |
| 10 | `pnpm test:e2e` (mobile-chrome + desktop-chrome) | 0 | **64 passed** (6.1 min), including the PRD §73 acceptance journey |
| 11 | `pnpm audit --prod` | 1 | 1 high: `deepmerge-ts` via the Prisma CLI — accepted risk, see [security audit](security-audit.md) |
| 12 | `pnpm verify:env -- --file .env.example` | 1 | expected: the example file holds development values (`APP_URL` is http) |

### Raw output excerpts

```text
$ pnpm lint
> wedding-planner@0.1.0 lint C:\xampp\htdocs\WEDDING_PLANNER
> eslint .
exit code: 0

$ pnpm typecheck
> prisma generate && tsc --noEmit
✔ Generated Prisma Client (7.10.0) to .\src\generated\prisma in 704ms
exit code: 0

$ pnpm test:unit
 Test Files  26 passed (26)
      Tests  310 passed (310)
exit code: 0

$ pnpm test:integration
 Test Files  17 passed (17)
      Tests  223 passed (223)
exit code: 0

$ pnpm test:perf
 Test Files  1 passed (1)
      Tests  3 passed (3)
exit code: 0

$ pnpm verify:migrations
$ prisma migrate deploy   # apply every migration to an empty schema
13 migrations found in prisma/migrations
Applying migration `20260915000000_init`
…
Applying migration `20260920000000_performance`
All migrations have been successfully applied.
$ prisma migrate status   # migration history matches the folder
Database schema is up to date!
$ prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code   # no drift between migrations and schema.prisma
No difference detected.
Seed run 1: {"eventTypes":6,"marriageProcesses":4,"taskCategories":19,"taskTemplates":108,"budgetTemplates":16,"vendorCategories":15,"guestGroupTemplates":9,"giftCategories":9,"plans":1,"addons":1}
Seed run 2: {"eventTypes":6,"marriageProcesses":4,"taskCategories":19,"taskTemplates":108,"budgetTemplates":16,"vendorCategories":15,"guestGroupTemplates":9,"giftCategories":9,"plans":1,"addons":1}
CHECK constraints: 63, partial indexes: 4
Dropped migration_verify_mu6ikma9. MIGRATIONS VERIFIED
exit code: 0

$ pnpm db:status
Database schema is up to date!
exit code: 0

$ pnpm build
✓ Compiled successfully in 5.9s
exit code: 0

$ pnpm test:e2e
  ok  1 [mobile-chrome] › tests\e2e\acceptance.spec.ts:10:1 › PRD §73: the MVP acceptance journey works end to end (16.1s)
  …
  ok 33 [desktop-chrome] › tests\e2e\acceptance.spec.ts:10:1 › PRD §73: the MVP acceptance journey works end to end (11.2s)
  …
  64 passed (6.1m)
exit code: 0

$ pnpm audit --prod
│ high                │ DeepmergeTS has stack exhaustion when merging          │
│ Paths               │ .>@prisma/client>prisma>@prisma/config>deepmerge-ts    │
1 vulnerabilities found
Severity: 1 high
exit code: 1

$ pnpm verify:env -- --file .env.example
ERROR   APP_URL: must use https (secure cookies, HSTS, payment callbacks)
WARNING PAYMENT_PROVIDER: is sandbox: checkout is refused in production until a real provider is configured
WARNING MAIL_DRIVER: is the development file driver: password-reset and partner-invite emails are written to disk, not sent
WARNING NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: not set; required when more than one app instance runs behind a load balancer
WARNING JOBS_CRON_SECRET: not set; run `pnpm worker` as a separate process for notifications and reminders
1 error(s), 4 warning(s).
exit code: 1
```

The E2E log also contains Node `DEP0190` deprecation warnings from the helper that starts the worker
in tests (`spawnSync` with a shell); they do not affect results.

## Finding fixed in this phase

`pnpm verify:migrations` failed on its first run: migration `20260919000000_notifications_jobs`
(Phase 12) contained a stray `);` and duplicated statements, left by a faulty text replacement while
correcting a constraint in that phase. The development and test databases had been migrated before
the file was damaged, so `migrate status` looked healthy there — but **`migrate deploy` on a new
(production) database would have failed**. The file was repaired, its checksum resynced in both
databases (their objects were already correct), and the empty-schema check now passes.

## MVP checklist (PRD §70)

| MVP item | Evidence (E2E unless noted) |
| --- | --- |
| Authentication | `foundation.spec` (register, logout, login), `security.spec` (lockout, redirects, cookie flags); `auth` integration tests |
| Wedding onboarding | `foundation.spec`, `acceptance.spec` (Akad + Resepsi, KUA, 20 Desember 2027, Rp100.000.000) |
| Couple workspace | `collaboration.spec`, `acceptance.spec` (partner sees the same data) |
| Dashboard | `acceptance.spec` (paid 10 jt / outstanding 20 jt, seats 5 / attending 4, task progress) |
| Checklist | `checklist.spec` (generated tasks, CRUD, date recalculation), `acceptance.spec` |
| Budget | `budget.spec`, `acceptance.spec` |
| Expenses | `budget.spec`, `acceptance.spec` (vendor contract → expense) |
| Payments | `budget.spec`, `vendors.spec`, `acceptance.spec` (DP Rp10.000.000) |
| Vendor research | `vendors.spec` (research, compare, select) |
| Booked vendors | `vendors.spec`, `acceptance.spec` |
| Guests | `guests.spec` (add, groups, bulk status, CSV import), `performance.spec` (10,000 guests) |
| RSVP | `rsvp.spec`, `acceptance.spec` (personal link, attending 4) |
| Digital invitation | `invitation.spec` (build, publish, public page, personal link) |
| Wedding events | `invitation.spec`, `acceptance.spec` |
| Maps | `invitation.spec` ("Buka peta" link to Google Maps) |
| Digital gift | `invitation.spec` (gift account on the public page) |
| Rundown | `planning.spec` (rundown with print view), `reports.spec` export |
| Partner collaboration | `collaboration.spec`, `acceptance.spec` |
| Responsive mobile UI | every E2E test runs on `mobile-chrome` (Pixel 7) and desktop; horizontal-overflow checks on invitation, reports, admin |
| Admin basics | `admin.spec` (hidden from couples, users, access grants, promo, audit log) |

**PRD §73 acceptance scenario:** `tests/e2e/acceptance.spec.ts` passes on both viewports. Deviations
from the text: the partner is named "Putri" (the PRD says "Partner"); paid features are bought
through the sandbox checkout within the journey, since vendors, guests and the invitation are part
of Full Access.

## Deployment checklist

1. PostgreSQL 16 database and a least-privilege application user; automated backups.
2. `pnpm install --frozen-lockfile`, `pnpm build`.
3. `pnpm db:deploy` then `pnpm db:seed` (idempotent).
4. Environment: run `NODE_ENV=production pnpm verify:env` (or `-- --file <env file>`) until it
   reports no errors. Decide on every warning.
5. HTTPS only (HSTS is sent). Reverse proxy: set `TRUSTED_PROXY_COUNT`, a request-size limit and
   rate limits (Server Actions accept up to 7 MB).
6. More than one app instance: set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on all of them.
7. Background work: run `pnpm worker` as its own process (or a scheduler calling `/api/jobs/run`
   with `JOBS_CRON_SECRET`).
8. Media: `MEDIA_FILE_DIR` on persistent, backed-up storage (or add an object-storage driver).
9. Health check: `GET /api/health` → `{"status":"ok"}`.
10. First admin: `pnpm admin:set -- --email <email>`; images from before Phase 15:
    `pnpm media:variants`.

## Not verified / open before going live

- **Email delivery:** added after this report. An `smtp` driver now exists (see [email.md](email.md)).
  It is tested against a local fake SMTP server, and `pnpm mail:test` with the real mailbox
  authenticated and was accepted by `mail.wuzzgate.my.id`. **Open:** Gmail puts the mail in spam
  (SPF/DKIM/DMARC pass; the shared hosting IP has a poor reputation). Deferred by the owner; options
  are in [email.md](email.md#deliverability-open-decision-deferred).
- **Payments:** added after this report: webhooks are confirmed with the Midtrans Status API, and the
  return page and a worker job reconcile pending orders ([payments-midtrans.md](payments-midtrans.md)).
  A full payment against the live Midtrans sandbox is still NOT VERIFIED (needs the owner's sandbox key).
- **Hosting:** no deployment to a real host, domain or TLS certificate was performed; every number
  here comes from one local machine.
- **Load:** no concurrent-user load test was run.
- **Accepted risks** (see [security-audit.md](security-audit.md)): `deepmerge-ts` in the Prisma CLI,
  account enumeration on the registration form, `style-src 'unsafe-inline'`.
