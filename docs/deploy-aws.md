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
2. On the server, log in once with a token that has only `read:packages`:
   ```bash
   echo "<token>" | sudo docker login ghcr.io -u <github-user> --password-stdin
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
cp env.production.example .env && chmod 600 .env
openssl rand -hex 32   # run twice: one value for POSTGRES_PASSWORD, one for JOBS_CRON_SECRET
nano .env              # fill both secrets and SMTP_PASSWORD yourself
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
- **Backups:** set them up as follows.
  1. Make the script executable: `chmod +x /opt/sehati/backup.sh`.
  2. Add the job with `sudo crontab -e`:
     `30 2 * * * /opt/sehati/backup.sh >> /opt/sehati/backups/backup.log 2>&1`
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

## Updating

```bash
cd /opt/sehati
sudo docker compose pull                               # or: build again (option B)
sudo docker compose run --rm tools pnpm db:deploy      # new migrations, if any
sudo docker compose up -d app cron
sudo docker image prune -f
```

## Notes

- **Server Actions key:** instances started from the same image share one Server Actions encryption
  key, so `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is optional here. A new image invalidates forms left
  open from the previous release, which is normal after a deploy.
- **Next copies `.env` files into its standalone output.**
  - The image never contains one: `.dockerignore` excludes `.env` and the Dockerfile deletes any copy.
  - Never ship a locally built `.next/standalone` folder.
- **Verified locally (2026-09-18):** the standalone server started with `node server.js` passed all
  **66 E2E tests** (mobile and desktop).
- **NOT VERIFIED:** no Docker was available on the development machine. The images themselves,
  compose, Caddy and the backup script have not run yet. They are checked on the first deployment
  with the commands above.
