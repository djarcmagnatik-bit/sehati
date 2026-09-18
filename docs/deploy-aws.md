# Deploying to the AWS server (Docker)

Target: the existing EC2 instance `keter-server` (t3.micro, 1 GiB RAM, Amazon Linux 2023,
Singapore, Elastic IP `52.74.42.121`). It already runs:
- a **Caddy** container on ports 80/443, config `/opt/caddy/Caddyfile`, Docker network `web`;
- **9router** on that network.

Sehati is added next to them without changing either:

```text
Internet ─443─► caddy (existing) ──network "web"──► sehati-app :3000 (standalone Next.js, ≤450 MB)
                                                      │ network "internal"
                                          sehati-db (PostgreSQL 16, ≤220 MB)
                                          sehati-cron (busybox, calls /api/jobs/run every 5 min)
```

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds two images. `app` is the standalone server, about 47 MB of app files plus Node. `tools` is used for migrations, seed and admin scripts. |
| `deploy/docker-compose.yml` | Defines the `app`, `db` and `cron` services, plus `tools` (profile, one-off only). |
| `deploy/env.production.example` | Template for `/opt/sehati/.env`. |
| `deploy/Caddyfile.sehati` | Block to append to the existing Caddyfile. |
| `deploy/backup.sh` | Nightly `pg_dump` and image archive, kept for 14 days. |
| `.github/workflows/docker-image.yml` | Builds the images on GitHub and pushes them to GHCR. |

Memory budget on the 1 GiB host:
- Available before Sehati: about 386 MB, plus 2 GB swap.
- Sehati is expected to use about 250–330 MB.
- The limits (`mem_limit`) make Sehati, not 9router, hit the ceiling if memory runs out.
- Upgrade to **t3.small** (stop → change instance type → start) when swap use keeps growing or pages slow down.

## 0. Before you start (owner)

1. **DNS:** in cPanel → *Zone Editor* for `wuzzgate.my.id`, add an **A** record
   `sehati` → `52.74.42.121`. Check with `nslookup sehati.wuzzgate.my.id`.
2. **Cost guard:**
   - AWS Budgets alert, for example at USD 20 per month.
   - Instance credit specification set to **standard**.
3. **Docker Compose v2:** Amazon Linux 2023's `docker` package does not include it. Check with
   `docker compose version`. If it is missing:
   ```bash
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   docker compose version
   ```
   Building on the server (option B) also needs buildx. Install it the same way from
   `docker/buildx` releases as `docker-buildx`.

## 1. Build the images (choose one)

`next build` needs about 2 GB of RAM, so it cannot run on the 1 GiB server next to the other apps.

**A. GitHub Actions (recommended, free for private repositories)**
1. Create a **private** GitHub repository and push this code. The workflow builds on every push to
   `main` and publishes `ghcr.io/<owner>/sehati-app` and `ghcr.io/<owner>/sehati-tools`. Both stay
   private.
2. On the server, log in once with a classic token that has only `read:packages`. The token is
   pasted at a hidden prompt, so it never appears on screen or in the shell history. In the browser
   terminal, paste with Ctrl+Shift+V or right-click.
   ```bash
   read -rsp "Tempel token GitHub: " T; echo; echo "panjang token: ${#T}"   # expect 40
   echo "$T" | sudo docker login ghcr.io -u <github-user> --password-stdin; unset T
   ```
3. In `/opt/sehati/.env`, set `SEHATI_APP_IMAGE` and `SEHATI_TOOLS_IMAGE` to those names.

**B. Build on the server:** only after resizing to t3.small, or with swap and patience, and while
stopping other heavy processes during the build. Copy the source to `/opt/sehati/src`, then from
`/opt/sehati/src/deploy`:
```bash
sudo docker compose build app tools
```

## 2. Install

```bash
sudo mkdir -p /opt/sehati && sudo chown ec2-user: /opt/sehati && cd /opt/sehati
# copy deploy/docker-compose.yml, backup.sh, Caddyfile.sehati and env.production.example here
# (SSH closed? see "Copying the files without SSH" below)
cp env.production.example .env && chmod 600 .env
# Write both secrets straight into .env, never on screen:
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/; s/^JOBS_CRON_SECRET=.*/JOBS_CRON_SECRET=$(openssl rand -hex 32)/" .env
nano .env              # SMTP_PASSWORD (in '…' if it has $ # " or spaces) and the two image lines
grep -E '^[A-Z_]+=$' .env | cut -d= -f1   # empty variables; only MIDTRANS_SERVER_KEY may remain
```

```bash
cd /opt/sehati
sudo docker compose pull                                # option A only
sudo docker compose up -d db
sudo docker compose run --rm tools pnpm db:deploy       # all migrations
sudo docker compose run --rm tools pnpm db:seed         # reference data (idempotent)
sudo docker compose run --rm tools pnpm verify:env      # must end with "OK"; read every warning
sudo docker compose up -d app cron
sudo docker compose ps                                  # app "healthy" after ~30 s
```

## 3. Connect Caddy

```bash
sudo cp /opt/caddy/Caddyfile /opt/caddy/Caddyfile.bak-$(date +%Y%m%d)
cat /opt/sehati/Caddyfile.sehati | sudo tee -a /opt/caddy/Caddyfile   # or paste the block
sudo docker exec caddy caddy validate --config /etc/caddy/Caddyfile
sudo docker exec caddy caddy reload --config /etc/caddy/Caddyfile
curl -s https://sehati.wuzzgate.my.id/api/health                     # {"status":"ok"}
```

To undo: restore the `.bak` file and reload. 9router's own blocks are not touched.

## 4. After the first start

- **First admin:** register in the app, then run
  `sudo docker compose run --rm tools pnpm admin:set -- --email <email>`.
- **Backups:** Amazon Linux 2023 has no cron by default. Install it once with
  `sudo dnf install -y cronie && sudo systemctl enable --now crond`, then set them up as follows.
  1. Make the script executable: `chmod +x /opt/sehati/backup.sh`.
  2. Add the job with `sudo crontab -e`:
     `30 19 * * * /opt/sehati/backup.sh >> /opt/sehati/backups/backup.log 2>&1` (the server clock is UTC: 19:30 UTC = 02:30 WIB)
  3. Regularly copy the files off the server.

  To restore:
  - Database: `sudo docker exec -i sehati-db pg_restore -U sehati -d sehati --clean < db-….dump`.
  - Images: `sudo docker run --rm -v sehati_media:/media -v $PWD:/b busybox tar xzf /b/media-….tgz -C /media`.
- **Midtrans:** set the Notification URL to
  `https://sehati.wuzzgate.my.id/api/payments/webhook/midtrans`. See
  [payments-midtrans.md](payments-midtrans.md).
- **Watch the first days:**
  - Run `free -m`, `sudo docker stats --no-stream` and `sudo docker compose logs --tail 100 app`.
  - Rising swap use or a p95 above 500 ms mean it is time for t3.small.

## Demo account

`pnpm demo:seed` creates one couple account with Full Access and every feature filled in:
- the checklist 40 % done;
- budget, vendors and payments;
- 30 guests with RSVPs;
- a published invitation with photos, events, story, gift accounts and wishes;
- rundown, calendar, savings and seserahan.

All names, addresses and account numbers are fictional. The gift accounts are labelled "contoh".

```bash
cd /opt/sehati
sudo docker compose run --rm tools pnpm demo:seed -- --email <demo address>
sudo docker compose run --rm tools pnpm demo:seed -- --email <demo address> --clean   # remove it
```

- **Password:** the command prints a random one **once**, in the server terminal. Do not paste it
  anywhere.
- **Re-running:** it replaces the previous demo.
- **Safety:** the script refuses to touch any account that is not named "Akun Demo Sehati".
- **Public link:** the demo invitation is reachable by anyone who has its link.
- **Photos:** they are written to the app's media volume, which the tools service mounts, and are
  handed to the app's user.

## Updating

```bash
cd /opt/sehati
sudo docker compose pull                               # or: build again (option B)
sudo docker compose run --rm tools pnpm db:deploy      # new migrations, if any
sudo docker compose up -d app cron
# Remove only the previous Sehati images. Not `docker image prune`: it deletes every untagged
# image on the host, including older images of other apps kept for rollback.
sudo docker images --format '{{.ID}} {{.Repository}}:{{.Tag}}' | awk '$2 ~ /sehati-(app|tools):<none>$/ {print $1}' | xargs -r sudo docker rmi
```

## Copying the files without SSH

The Security Group allows SSH only from specific sources. Use **EC2 Instance Connect** (console →
instance → Connect) and paste the four files as one line: a base64 tarball, followed by `sha256sum`
to compare with the repository. Pasting multi-line files into the browser terminal can change tabs
and indentation. The one-liner is produced with:

```bash
cd deploy && echo "cd /opt/sehati && echo '$(tar -czf - docker-compose.yml backup.sh Caddyfile.sehati env.production.example | base64 -w0)' | base64 -d | tar xzf - && chmod +x backup.sh && sha256sum *"
```

## Deployment record: 2026-09-19

First deployment to `keter-server`, run by the owner with these commands. The excerpts are copied
from the server terminal.

```text
$ sudo docker compose run --rm tools pnpm db:deploy
All migrations have been successfully applied.
$ sudo docker compose run --rm tools pnpm db:seed
Seed selesai: 6 event types, 4 marriage processes, 19 task categories, 108 task templates, 16 budget category templates, 15 vendor categories, 9 guest group templates, 9 gift categories, 1 plans, 1 add-ons.
$ sudo docker compose run --rm tools pnpm verify:env
WARNING PAYMENT_PROVIDER: is sandbox: checkout is refused in production until a real provider is configured
WARNING NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: not set; required when more than one app instance runs behind a load balancer
OK — 2 warning(s).
$ sudo docker stats --no-stream
sehati-cron   2.625MiB / 16MiB
sehati-app    142.8MiB / 450MiB
sehati-db     29.02MiB / 220MiB
$ free -m        # available: 240 MB of 913, with 9router and Caddy running
$ curl -s -w "  HTTP %{http_code}\n" https://sehati.wuzzgate.my.id/api/health
{"status":"ok"}  HTTP 200
```

Checked from outside:

| Check | Result |
| --- | --- |
| Certificate | TLS 1.3, Let's Encrypt, valid to 17 Dec 2026 (Caddy renews it) |
| HTTP | redirects to HTTPS (308) |
| `/`, `/login` | 200 in about 180–230 ms |
| `/dashboard` signed out | redirects to login (307) |
| Security headers | HSTS, CSP with nonce, `X-Frame-Options: DENY` and `nosniff` present; no `Server` or `X-Powered-By` |

Sehati used about **175 MiB** in total, below the estimated 250–330 MiB.

After the first start:

```text
$ sudo docker compose run --rm tools pnpm admin:set -- --email <owner>
Akun sekarang admin. Buka /admin setelah masuk.
$ sudo /opt/sehati/backup.sh
2026-09-18T17:33:45+00:00 backup ok: db-20260918-1733.dump media-20260918-1733.tgz
$ sudo ls -lh /opt/sehati/backups
-rw-r--r--. 1 root root 194K Sep 18 17:33 db-20260918-1733.dump
-rw-r--r--. 1 root root   88 Sep 18 17:33 media-20260918-1733.tgz      # no uploads yet
$ SELECT type, state, count(*), max(completed_at), max(locked_by) FROM background_jobs GROUP BY 1,2;
 billing.reconcile   | DONE  |     2 | 2026-09-18 17:36:29.428+00 | cron:1
 maintenance.cleanup | DONE  |     1 | 2026-09-18 17:26:29.309+00 | cron:1
 reminders.scan      | DONE  |     1 | 2026-09-18 17:26:29.301+00 | cron:1
$ sudo crontab -l
30 19 * * * /opt/sehati/backup.sh >> /opt/sehati/backups/backup.log 2>&1   # 02:30 WIB (server clock is UTC)
```

The cron container's first call, 1 s after start, was refused because the app was not listening yet.
The cron service now waits until the app is healthy.

Slimmer `tools` image (no Next.js build output):
- Size went from 1.33 GB to **1.08 GB**. Most of the rest is development dependencies (Prisma CLI,
  tsx).
- A re-pull took 3.1 s.

The clean-up then used `docker image prune -f`, which also deleted an **untagged older 9router
image**: `decolua/9router@sha256:f00fe389…`, about 705 MB. The running 9router was unaffected. That
version can be pulled again by digest if a rollback is ever needed. "Updating" now removes only
Sehati images.

Lessons from this deployment:
- The Compose plugin had to be installed.
- SSH was closed, so the files were copied through EC2 Instance Connect.
- Pulls from GHCR crawled on large layers while GitHub downloads ran at about 44 MB/s. The
  `tools` image was then slimmed down.
- `PAYMENT_PROVIDER=sandbox` is used until the Midtrans key exists.

## Notes

- **Server Actions key:** instances started from the same image share one Server Actions encryption
  key, so `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is optional here. A new image invalidates forms left
  open from the previous release, which is normal after a deploy.
- **Next copies `.env` files into its standalone output.**
  - The image never contains one: `.dockerignore` excludes `.env` and the Dockerfile deletes any copy.
  - Never ship a locally built `.next/standalone` folder.
- **Verified locally (2026-09-18):** the standalone server started with `node server.js` passed all
  **66 E2E tests** (mobile and desktop).
- **Verified on the server (2026-09-19):**
  - images, compose, migrations, seed, `verify:env`, the app, cron and Caddy with HTTPS (see the
    deployment record);
  - backups and background jobs (see the deployment record);
  - a password-reset e-mail sent by the production app (see [email.md](email.md)).
