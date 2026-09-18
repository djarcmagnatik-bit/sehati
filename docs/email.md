# Email (SMTP)

The app sends two kinds of email: **password-reset links** and **partner invitations**. In production
they go through an authenticated SMTP server. The provider chosen for launch is the cPanel mailbox
`sehati@wuzzgate.my.id` on `mail.wuzzgate.my.id`.

## Configuration

```dotenv
MAIL_DRIVER="smtp"
SMTP_HOST="mail.wuzzgate.my.id"
SMTP_PORT="465"                 # implicit TLS (SMTP_SECURE defaults to true on 465)
SMTP_USER="sehati@wuzzgate.my.id"
SMTP_PASSWORD="…"               # the mailbox password — set it yourself, never commit or share it
MAIL_FROM="Sehati <sehati@wuzzgate.my.id>"
APP_URL="https://<production domain>"   # links in the emails are built from this
```

Alternative: port 587 with `SMTP_SECURE="false"`. The driver then **requires** STARTTLS (`requireTLS`),
so the password is never sent unencrypted. IMAP/POP3 settings are not used by the app.

Check the settings (connects and authenticates; the password is never printed):

```bash
pnpm mail:test
pnpm mail:test -- --to your-own-address@example.com
```

Then `pnpm verify:env` (or `-- --file <env file>`) must report no errors for the mail variables.

## Behaviour

| | |
| --- | --- |
| Driver | `SmtpMailer` in `src/server/mail/mailer.ts` (nodemailer 10), one transport per process |
| TLS | TLS ≥ 1.2, certificate checked against `SMTP_HOST`; plaintext is refused |
| Timeouts | 30 s connect, 30 s greeting, 60 s socket |
| Password reset | Sent **after** the response (`after()` from `next/server`). The form always shows the same message, and since the SMTP round trip no longer happens inside the request, response time does not reveal whether an email is registered. Failures are logged (`auth.forgot_password_failed`). |
| Partner invitation | Sent during the request so the page can say whether the email went out; on failure the owner is told to share the copyable link instead. |
| Headers | `Auto-Submitted: auto-generated` (suppresses auto-replies); subject/recipient cannot inject headers (tested) |
| Validation | `MAIL_DRIVER=smtp` without `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` or `MAIL_FROM` stops the app at startup, naming the variables only |

## Findings about `mail.wuzzgate.my.id` (read-only checks, 2026-09-18)

These were made without logging in: DNS lookups and an SMTP `EHLO` without `AUTH`.

| Check | Result |
| --- | --- |
| TLS on 465 | TLS 1.3, certificate valid (`*.wuzzgate.my.id`, expires 26 Oct 2026) |
| Server | Exim 4.100, `AUTH PLAIN LOGIN`, max message 50 MB |
| Time to greeting | **7.6–12.5 s on 465**, 2.3 s on 587 (from a workstation in Indonesia) |
| SPF | `v=spf1 +a +mx +ip4:195.88.211.243 ~all` (includes the mail server) |
| DKIM | `default._domainkey` published (RSA) |
| DMARC | `v=DMARC1; p=none;` (monitoring only) |
| Port 25 | not reachable from the workstation (normal for residential networks; not used) |

Consequences:

- The slow greeting is why the timeouts are 30 s. A partner invitation can take ~10 s to submit on
  port 465; if that is too slow in production, switch to 587 + STARTTLS.
- The TLS certificate expires on **26 Oct 2026**; the hosting provider must renew it, or sending fails
  certificate verification.
- SPF, DKIM and DMARC all pass (see below), yet Gmail files the mail as spam: see
  [Deliverability](#deliverability-open-decision-deferred).
- Shared hosting limits outgoing mail per hour. That is fine for resets and invitations, but not for
  bulk sending.

## Verified with the real mailbox (2026-09-18, run by the owner)

```text
$ pnpm mail:test -- --to <gmail address>
SMTP mail.wuzzgate.my.id:465 (implicit TLS), sender Sehati <sehati@wuzzgate.my.id>
OK   connected and authenticated
OK   test email accepted by the server for <gmail address> (check the inbox and the spam folder)
```

TLS, authentication and acceptance by the server work with the production settings.

## Deliverability (open, decision deferred)

**Status on 2026-09-18: the test email reached Gmail but landed in the Spam folder.** The owner
decided to leave it for now and fix it later. Until then, expect password-reset and
partner-invitation emails to land in spam for many users. Partner invitations still work through the
copyable link.

Gmail "Show original" for the test email:

```text
SPF:   PASS with IP 195.88.211.243
DKIM:  'PASS' with domain wuzzgate.my.id
DMARC: 'PASS'
```

So authentication and the app's configuration are correct; the problem is **sender reputation**:

1. The shared hosting IP `195.88.211.243` (`maleo.kencang.com`) was listed on **Spamhaus ZEN**
   (`127.0.0.3` = CSS, `127.0.0.4` = XBL) in a DNS query on 2026-09-18. SpamCop and Barracuda: not
   listed. Other customers on the same server affect this IP; the owner cannot delist it. Confirm at
   <https://check.spamhaus.org>.
2. The domain is new and has almost no sending history.
3. The test email was short and generic (minor).

Options when this is picked up again:

| Option | Work | Effect |
| --- | --- | --- |
| A. Ask the host (kencang.com) to delist the IP or send from a clean IP | support ticket | depends on the host; can recur on a shared IP |
| B. **Transactional email service over SMTP** (e.g. Brevo, Amazon SES, Postmark, Mailgun) — recommended before launch | owner creates the account and adds its DKIM/SPF DNS records; the app only needs new `SMTP_*` values in `.env` (no code change) | reliable inbox placement for resets |
| C. Tighten DMARC from `p=none` to `p=quarantine` in cPanel | one DNS edit | protects the domain from spoofing; small effect on inbox placement |

After any change: `pnpm mail:test -- --to <address>`, then check inbox vs spam and Gmail "Show original".

## Not verified

- Inbox placement at Outlook/Yahoo (only Gmail was checked: spam).
- Latency from the production host (only measured from the development workstation).
