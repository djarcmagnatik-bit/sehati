# Performance report (Phase 15)

Date: 2026-09-18 · Machine: the development workstation (Windows, local PostgreSQL 16, production
build via `next start`). Numbers are from a single local machine, not a production host; they show
how the code scales with data, not absolute production latency.

## How to reproduce

```bash
pnpm test:perf                                   # services against the PRD dataset (test database)
pnpm exec playwright test tests/e2e/performance.spec.ts   # browser: LCP, 10,000-guest list, page timings
```

`pnpm test:perf` seeds one wedding with the PRD target dataset — **10,000 guests, 500 vendors,
500 research entries, 2,000 tasks, 1,000 expenses with 5,000 payments, 5,000 payment transactions,
5,000 activity entries** — then measures every operation warm (one warm-up, median of 5), counts SQL
statements, compares statement counts with a small wedding, and checks query plans. Results land in
`test-results/perf/results.json`.

## Results after this phase

Budgets: 500 ms for common operations (PRD §60), 3 s for whole-dataset work.

| Operation | Median | SQL |
| --- | ---: | ---: |
| Every signed-in request: session, wedding, access, unread count | 4.9 ms | 10 |
| Dashboard, all nine widgets | 36.8 ms | 40 |
| Guests: page 1 / last page (of 200) | 5.9 / 55.2 ms | 7 |
| Guests: search by name / by phone digits | 67.7 / 58.3 ms | 7 |
| Guests: RSVP filter + seat sort / group sort | 7.0 / 13.4 ms | 7 |
| Guest summary, groups, RSVP overview | ≤ 5.3 ms | 4–6 |
| Checklist: open / overdue / search (2,000 tasks) | 4.8 / 3.4 / 9.8 ms | 6 |
| Vendors / research lists | 7.1 / 4.5 ms | 8 |
| Expenses: all / outstanding | 7.2 / 7.2 ms | 5 |
| Calendar month | 10.9 ms | 12 |
| Activity page 1 / page 100 | 2.7 / 5.2 ms | 4 |
| Billing overview | 6.0 ms | 10 |
| Admin: transactions page 1 / search by email | 2.9 / 39.4 ms | 6 |
| Admin: users / weddings / dashboard stats (uncached) | 3.1 / 6.6 / 3.2 ms | 2–5 |
| Public invitation + wishes / personal RSVP link | 9.6 / 2.3 ms | 13 / 6 |
| Guest report with all 10,000 rows | 180 ms | 6 |
| Export 10,000 guests CSV / XLSX | 201 / 624 ms | 6 |
| Export 5,000 payments XLSX | 260 ms | 8 |
| Hourly reminder scan | 97 ms | 6 |

**No N+1 queries**: twelve operations (dashboard, all lists, reports, export, public invitation)
issue exactly the same number of SQL statements for a small wedding as for the PRD dataset.

**Browser** (`tests/e2e/performance.spec.ts`, both viewports):

| Check | Result |
| --- | --- |
| Public invitation LCP, slow 4G (150 ms RTT, 1.6 Mbps) + 4× CPU, 2.1 MB cover photo | 2,320–2,376 ms (7 runs, target 2,500) — LCP element is the cover image, served as a 165 KB WebP copy |
| `/guests` with 10,000 guests: open / search | 231–262 ms / 238–272 ms, 50 rows in the DOM, "Halaman 1 dari 200" |
| `/`, `/login`, `/register` rendered per request (CSP nonce) | median 11–19 ms |

## Changes

| Area | Before | After |
| --- | --- | --- |
| Image optimization | Every image served as uploaded (a phone photo is 2–5 MB) | WebP copies at 480/960/1280/1920 px (never wider than the original, EXIF orientation applied) made at upload; `/media/{id}?w=` picks the closest; invitation cover and gallery use `srcset`/`sizes`, the cover is preloaded with high priority; app previews use small copies. `pnpm media:variants` backfills older images |
| Upload size | Server Actions refused bodies over 1 MB, so any photo above 1 MB failed despite the 3 MB promise (found by the LCP test) | `serverActions.bodySizeLimit` 7 MB; the services keep enforcing 3 MB images / 6 MB music |
| Reminder scan | 105 SQL statements, one insert per notification (grows with data) | 6 statements: members and access of all weddings in two queries, notifications inserted in batches |
| Per-request lookups | Membership re-queried by every widget; active wedding queried by layout and page | Memoized per request (`react.cache`), same authorization result |
| Indexes | Admin lists and the cross-wedding scan could only sort or scan whole tables | `payment_transactions(created_at)`, `payment_transactions(user_id)`, `users(created_at)`, `weddings(created_at)`, partial `tasks(due_date)` for open tasks, partial `expenses(due_date)` — each confirmed in `EXPLAIN` |
| Pagination | Already paginated: guests, vendors, research, expenses, checklist, activity, notifications, admin users/weddings/transactions/audit | Verified; only the print report and exports return the full list by design |

## Not done / notes

- **Before/after LCP**: the original 2.1 MB photo was not measured through the browser; at the
  same 1.6 Mbps it takes about 10 s just to download (arithmetic, not a measurement).
- **AVIF** would make the cover about 45% smaller than WebP, but encoding takes ~1 s per size.
  WebP q64 was chosen; AVIF is the next step if LCP needs more room.
- Guest search uses `ILIKE '%…%'` (67 ms at 10,000 guests). A `pg_trgm` index would help at much
  larger lists; not needed for the PRD target.
- Numbers are single-machine and single-user. Concurrency/load testing (many users at once) and
  measurements on the production host remain for Phase 16.
