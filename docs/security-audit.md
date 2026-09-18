# Security audit (Phase 14)

Date: 2026-09-17 · Scope: the whole application at commit `ae21b3b` plus the fixes in this phase ·
Method: source review of every route handler, Server Action and service that reads or writes
wedding data, automated guards over the source tree, and tests at three levels (unit, integration
against PostgreSQL, Playwright against a production build).

The PRD checklist (Phase 14) and where each item is covered:

| Area | Result | Evidence |
| --- | --- | --- |
| IDOR | No finding | `tests/integration/security.test.ts` — 65 id/wedding-scoped calls by a member of another wedding (with a positive control), a full row snapshot of the victim wedding before/after, and cross-wedding references inside the attacker's own wedding. Existing per-module tests cover ~60 more functions. `tests/e2e/security.spec.ts` opens another wedding's guest by URL (404) |
| CSRF | No finding | Mutations are Server Actions (POST + Next.js Origin/Host check) with `SameSite=Lax` cookies. E2E replays a captured action with `Origin: https://evil.example` (refused, nothing stored) and from the app's origin (accepted, as a control). The only other POST routes are the signed webhook and the bearer-protected cron endpoint |
| XSS | Hardened (F1) | No `dangerouslySetInnerHTML`, `eval` or raw HTML anywhere (static guard). Nonce-based CSP added. E2E stores `<img onerror>` / `<script>` payloads in a guest name, the couple note, a public invitation section and a public wish: rendered as text, no execution, no CSP violation. E2E proves the browser refuses an injected inline handler |
| SQL injection | No finding | No `$queryRawUnsafe`, `$executeRawUnsafe` or `Prisma.raw` (static guard); raw queries are tagged templates with bound parameters. Search filters tested with `' OR '1'='1`, `%`, `_`, `\`, `; DROP TABLE` |
| Upload validation | Hardened (F2, F3, F4) | Type from magic bytes, declared type must match, size and dimension limits, random storage names (existing). Added: EXIF/GPS/text metadata removal, extension check, XLSX decompression-bomb check |
| Public/private separation | Hardened (F5) | Published invitation, personal RSVP link and wish wall serialized and checked for 17 private markers (emails, phones, notes, budget amounts, tokens, private asset ids, internal ids); exact DTO keys asserted. `/media` serves only assets used by a published invitation, or to members |
| Rate limits | Hardened (F6) | Login (IP + account), register, forgot/reset password, RSVP (guest + IP), wishes (IP), partner invites, imports, uploads, checkout, exports. Client IP now only from trusted proxy hops. E2E: 8 wrong passwords lock the account even for the right one |
| Authorization | No finding | Every Server Action checks the session (static guard, 7 public ones allow-listed); every route handler authenticates or is public by design (static guard); admin role read from the database per call; feature access checked after membership |
| Webhook signatures | Hardened (F7) | Sandbox HMAC-SHA256 and Midtrans SHA-512 verified with constant-time compare; unsigned, wrong-secret, tampered-body, malformed, unknown-provider, replayed and oversized calls tested |

## Findings and fixes

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | Medium | No Content Security Policy: any future escaping bug would run script | Per-request nonce CSP from `src/proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action` self + Midtrans). All pages render dynamically so every script gets the nonce. Also `Cross-Origin-Opener-Policy: same-origin` and HSTS in production |
| F2 | High (privacy) | Uploaded photos were stored and published byte-for-byte, including EXIF GPS position, device and capture time | `src/lib/image-metadata.ts` strips JPEG APP1/COM/XMP, PNG text/`eXIf`/`tIME` chunks and WebP `EXIF`/`XMP ` chunks before storage. JPEG orientation is kept in a minimal EXIF block; colour profiles are kept |
| F3 | Low | File extension was ignored (`shell.php` with JPEG bytes was accepted) | Extension must match the detected type when present (images and audio) |
| F4 | Medium (availability) | A small XLSX could declare gigabytes of uncompressed content and exhaust memory while importing guests | Central directory read first (`src/lib/zip-inspect.ts`): ≤ 200 entries, ≤ 40 MB total, no ZIP64 |
| F5 | Medium (privacy) | Event notes and gift-account notes appear on the public invitation, but the fields were labelled just "Catatan", inviting private notes | Relabelled "Catatan untuk tamu" with a hint that it is public |
| F6 | Medium | Per-IP rate limits used the first `X-Forwarded-For` entry, which the client controls: rotating the header bypassed login/register/RSVP/wish IP limits | `TRUSTED_PROXY_COUNT` (default 1): the IP written by the trusted proxy is used, client-supplied values are ignored |
| F7 | Low | Webhook read the whole body before checking its size | `Content-Length` checked first, byte length checked after reading |
| F8 | Low | Couple Instagram handles were free text rendered into a public link | Validated as real handles; the public page renders a link only for valid handles |
| F9 | High (dependency) | `mysql2` < 3.23.1 (transitive via the Prisma CLI) | `pnpm.overrides` → 3.24.4. The app uses PostgreSQL, so the MySQL driver was never reachable at runtime |

## Accepted risks and recommendations

- **`deepmerge-ts` < 8 (high, transitive via `@prisma/config`)**: only merges this repository's own
  Prisma config at CLI time, never untrusted input. Overriding it would force a major version into
  Prisma; revisit when Prisma updates.
- **Registration reveals whether an email is registered.** Login and password reset do not. The
  register form is rate limited per IP. Removing the hint needs email verification, which waits for a
  production email provider.
- **`style-src 'unsafe-inline'`**: invitation themes set CSS variables through `style` attributes.
  Styles cannot execute script; exfiltration via CSS is limited by `img-src`/`connect-src 'self'`.
- **Dynamic rendering for every page** (required for nonces) removes static HTML caching for the
  landing page. Measure in Phase 15.
- **Deployment**: set `TRUSTED_PROXY_COUNT` to the real number of proxies. With 0, per-IP limits
  share one bucket (per-account limits still apply). Serve over HTTPS only; HSTS is sent in production.
- **Midtrans**: signatures are verified, but the payment status is not re-queried from the Midtrans
  API before granting access. Add that reconciliation before going live (still NOT VERIFIED against the
  live sandbox).
- **Media storage** is the local disk driver; when moving to object storage keep the bucket private and
  keep serving through `/media`.
- **Server Action body limit is 7 MB** (Phase 15, so photo uploads work). The framework parses a
  request body before an action checks the session, so an anonymous client can make the server read
  up to 7 MB per request. Put a request-size and rate limit on the reverse proxy.
- Not in scope yet: 2FA for admins, account deletion/export (privacy requests), dependency audit in CI.
