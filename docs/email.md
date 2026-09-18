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
- Deliverability looks reasonable for a shared host (SPF + DKIM). Consider tightening DMARC to
  `p=quarantine` once reports look clean. Large providers may still file mail from shared hosting as
  spam, so check the spam folder in the first tests.
- Shared hosting limits outgoing mail per hour. That is fine for resets and invitations, but not for
  bulk sending.

## Not verified

- Actual delivery with the real password: run `pnpm mail:test -- --to <address>` yourself.
- Inbox placement at Gmail/Outlook (spam or not).
- Latency from the production host (only measured from the development workstation).
