# syntax=docker/dockerfile:1
#
# Two images from one build:
#   app    — the standalone Next.js server (small; runs all the time)
#   tools  — full dependencies and sources for one-off commands: migrations, seed, admin scripts
#
#   docker build --target app   -t sehati-app .
#   docker build --target tools -t sehati-tools .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN NEXT_OUTPUT=standalone pnpm build \
 # Next copies .env files into standalone/; none may ship in the image.
 && rm -f .next/standalone/.env*

# ─── One-off commands ────────────────────────────────────────────────────────
FROM build AS tools
ENV NODE_ENV=production
# e.g. `pnpm db:deploy`, `pnpm db:seed`, `pnpm admin:set -- --email …`
CMD ["pnpm", "db:status"]

# ─── Web server ──────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    MEDIA_FILE_DIR=/app/.data/media MAIL_FILE_DIR=/app/.data/mail
WORKDIR /app
RUN groupadd --system --gid 1001 sehati && useradd --system --uid 1001 --gid sehati sehati \
 && mkdir -p /app/.data/media /app/.data/mail && chown -R sehati:sehati /app/.data
COPY --from=build --chown=sehati:sehati /app/.next/standalone ./
COPY --from=build --chown=sehati:sehati /app/.next/static ./.next/static
COPY --from=build --chown=sehati:sehati /app/public ./public
# Fail the build, not the first upload or login, if file tracing missed a native library.
RUN node -e "require('sharp')({create:{width:2,height:2,channels:3,background:'#fff'}}).webp().toBuffer().then(b=>console.log('sharp ok',b.length))" \
 && node -e "require('@node-rs/argon2').hash('x').then(h=>console.log('argon2 ok',h.slice(0,9)))"
USER sehati
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
