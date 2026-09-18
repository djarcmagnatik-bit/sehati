# Load test

HTTP load test of the production build with many simultaneous users. It complements the Phase 15
[performance report](performance-report.md), which timed single operations on the PRD dataset.

**Run:** 2026-09-18, commit `a3184b8` build. Load generator, `next start`, and PostgreSQL 16 all ran on
**one Windows workstation**: Intel Core i5-4670 (4 cores, no hyper-threading), 8 GB RAM, Node
v24.19.0. The numbers are therefore a **lower bound for this machine**, not a production capacity.

## How to reproduce

```bash
pnpm build
pnpm load:seed                                   # test DB: 150 couples, 24,900 guests (~75 s)
pnpm load:run -- --spawn --stages 10:60,25:60,50:60,100:60,200:60
pnpm load:run -- --spawn --instances 3 --stages 10:60,25:60,50:60,100:60,200:60
pnpm load:seed -- --clean                        # remove the load-test data afterwards
```

`--spawn` starts `next start` (ports 3200…) against `DATABASE_URL_TEST`. Emails go to a file, payments
use the sandbox, no Midtrans key is used, and `TRUSTED_PROXY_COUNT=1`. With `--instances N`:
- N servers share one `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- Requests alternate between them round-robin, as behind a load balancer.

Raw results are written to `.data/load-test/results-*.json` (not committed).

## Dataset and scenarios

- **Dataset:** 150 couples, each with:
  - Full Access;
  - a published invitation with a 1600×1000 cover photo and RSVP and wishes enabled;
  - 100 guests with personal links;
  - a signed-in session.
- **Largest wedding:** couple #0 has the PRD's 10,000 guests.
- **Virtual users (VUs):** each VU loops: it picks a scenario by weight, sends it, checks the response,
  then waits a random 0–600 ms before the next one. That is far more active than a real person; see
  [Interpretation](#interpretation).

| Scenario | Weight | Request | Counted as success when |
| --- | ---: | --- | --- |
| Guest opens personal invitation | 30 | `GET /i/{token}` | 200 and couple names in the page |
| Public invitation page | 20 | `GET /undangan/{slug}` | 200 and couple names in the page |
| Cover photo | 15 | `GET /media/{id}?w=960` | 200, `image/webp` |
| Guest submits RSVP | 10 | `POST /i/{token}` (Server Action, form without JavaScript) | 200 and the confirmation text |
| Couple dashboard | 10 | `GET /dashboard` with session | 200 |
| Couple guest list | 8 | `GET /guests` with session | 200 |
| Guest list, 10,000 guests | 2 | `GET /guests` as couple #0 | 200 |
| Login | 2 | `POST /login` (Argon2id) | 303 away from `/login` |
| Health check | 3 | `GET /api/health` | 200 |

Guest requests carry a different client IP each (`X-Forwarded-For`, one trusted proxy), as phones on
the internet would. Each couple keeps one IP.

The app's rate limits are unchanged. The test database's rate-limit buckets are emptied at the start
of each stage so that repeated logins by the same 150 accounts across stages stay possible. No
request was rate-limited.

The RSVP scenario uses the no-JavaScript form path, which re-renders the whole page after the
action. It is therefore the most expensive way to submit; browsers with JavaScript get a smaller
answer.

## Results: one server instance

| VUs | Requests | req/s | p50 | p95 | p99 | max | Errors | DB conns (active) | p95 ≤ 500 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 10 | 1659 | 27.4 | 51 | 123 | 173 | 267 | 0% | 10 (3) | yes |
| 25 | 3825 | 63.2 | 77 | 203 | 276 | 359 | 0% | 10 (3) | yes |
| 50 | 4961 | 81.7 | 298 | 620 | 754 | 1065 | 0% | 10 (3) | **no** |
| 100 | 4748 | 77.6 | 942 | 2138 | 2320 | 2546 | 0% | 11 (3) | **no** |
| 200 | 4699 | 76 | 2200 | 5177 | 5366 | 5664 | 0% | 10 (2) | **no** |

p95 per scenario (ms):

| Scenario | 10 VUs | 25 VUs | 50 VUs | 100 VUs | 200 VUs |
| --- | ---: | ---: | ---: | ---: | ---: |
| guest opens personal invitation | 121 | 209 | 495 | 1316 | 2940 |
| public invitation page | 119 | 165 | 341 | 846 | 1815 |
| cover photo (960 px WebP) | 61 | 87 | 214 | 578 | 1291 |
| guest submits RSVP | 139 | 285 | 793 | 2405 | 5518 |
| couple dashboard | 116 | 180 | 441 | 1163 | 2535 |
| couple guest list | 150 | 215 | 427 | 1069 | 2317 |
| couple guest list (10,000 guests) | 178 | 214 | 394 | 1044 | 2273 |
| login (Argon2id) | 100 | 91 | 199 | 502 | 1116 |
| health check | 43 | 60 | 73 | 163 | 337 |

## Results: three server instances (round-robin)

| VUs | Requests | req/s | p50 | p95 | p99 | max | Errors | DB conns (active) | p95 ≤ 500 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 10 | 1744 | 28.9 | 36 | 85 | 127 | 460 | 0% | 30 (2) | yes |
| 25 | 4328 | 71.5 | 34 | 98 | 157 | 252 | 0% | 30 (4) | yes |
| 50 | 7303 | 120.6 | 72 | 344 | 489 | 771 | 0% | 30 (2) | yes |
| 100 | 8163 | 134.4 | 395 | 1034 | 1535 | 2218 | 0% | 31 (2) | **no** |
| 200 | 8133 | 131.6 | 920 | 3428 | 5619 | 7966 | 0% | 31 (2) | **no** |

p95 per scenario (ms):

| Scenario | 10 VUs | 25 VUs | 50 VUs | 100 VUs | 200 VUs |
| --- | ---: | ---: | ---: | ---: | ---: |
| guest opens personal invitation | 76 | 96 | 348 | 994 | 3621 |
| public invitation page | 71 | 90 | 295 | 721 | 2341 |
| cover photo (960 px WebP) | 43 | 58 | 147 | 413 | 1523 |
| guest submits RSVP | 106 | 124 | 511 | 1748 | 7039 |
| couple dashboard | 93 | 100 | 360 | 913 | 3134 |
| couple guest list | 86 | 125 | 350 | 904 | 2823 |
| couple guest list (10,000 guests) | 104 | 106 | 339 | 942 | 2794 |
| login (Argon2id) | 103 | 98 | 149 | 371 | 1267 |
| health check | 27 | 24 | 37 | 110 | 307 |

## Findings

1. **No errors at any load.** Across 32,000 requests there were no timeouts, no 5xx responses, no
   rate-limited requests and no server error log lines. Under overload, requests queue: they get
   slower, but none fail.
2. **The limit is CPU for page rendering, not the database.**
   - Throughput levels off at about **80 req/s with one instance**.
   - PostgreSQL never had more than 4 queries running at once, and the connection pool (10 per
     instance) was never full.
   - The load generator itself used under 20% of one core.
   - Three instances reached **134 req/s** (1.65×) on the same 4 cores, which PostgreSQL and the
     generator also needed.
3. **PRD §60 (< 500 ms for common operations under normal load)** is met up to 25 VUs on one
   instance and up to 50 VUs on three instances.
4. **The 10,000-guest list costs about the same as a small one.** The list is paginated, and the
   Phase 15 indexes hold under load.
5. **Multi-instance deployment works as documented.** With one shared
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, Server Action forms rendered by one instance were accepted by
   another: 0 failed RSVPs out of 2,942 and 0 failed logins out of 620 on three instances.
6. **Login (Argon2id, 19 MiB)** stays cheap enough: p95 ≤ 200 ms up to 50 VUs.

## Interpretation

- A VU here sends roughly 2–3 requests per second. A real guest opening an invitation sends about
  5 requests (page, photo, RSVP, wishes) spread over one or two minutes.
- On that rough assumption, one instance at ~80 req/s serves on the order of **1,500 guests all
  active at the same moment**. For example, dozens of weddings sharing their invitation links at the
  same time.
- This is an estimate from a synthetic mix, not a measurement of real users.

## Recommendations for production

- Run **one app instance per CPU core** behind the reverse proxy, for example several containers or
  `next start` processes on different ports.
  - Set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on all instances.
  - Leave cores free for PostgreSQL if it runs on the same machine.
- **Database connections:** each instance opens up to 10 (the `pg` default).
  - Keep `instances × 10` plus the worker and admin connections under PostgreSQL's `max_connections`
    (default 100), or add PgBouncer.
- **Monitor p95 latency and CPU.** Rising p95 with low database activity means more instances or
  more CPU are needed, not a larger database.
- **Optional optimisations,** if the invitation pages ever dominate:
  - The public and personal invitation pages render per request, because of the CSP nonce and the
    per-guest content.
  - A CDN cache for `/media/*` would take the image traffic (15% of requests) off the app.

## Not verified

- Production hardware, network latency and TLS were not tested; everything ran on one local
  machine.
- No soak test was run, so memory growth over hours is untested.
- Browsers with JavaScript were not simulated. RSVP via the JavaScript path is expected to be cheaper
  than the measured no-JS path.
- The admin pages, CSV/XLSX exports and image uploads were not part of the mix. Their single-request
  timings are in the performance report.
