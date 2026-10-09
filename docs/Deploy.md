# OpusAirs — Deployment Guide

OpusAirs is a full-stack Next.js application designed to run on Vercel, Docker, or Node.js, backed by Neon PostgreSQL.

---

## 1. Environment Configuration

```bash
# Database (PostgreSQL / Neon) - REQUIRED
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require

# Neon Auth (public Google/email; Google-only operators)
NEON_AUTH_BASE_URL=https://ep-xxxxx.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=replace_with_a_random_secret_of_at_least_32_characters
ADMIN_EMAILS=operator@example.com
INGEST_API_KEY=
GEMINI_API_KEY=

# Reference Parameters
APIX_BASE_DATE=2026-08-01
# Contributor only; never exposed in the UI:
TINYFISH_API_KEY=

# Collector Settings
BOT_DOMAIN=your-domain.example
BOT_CONTACT=contact@your-domain.example
COLLECT_MAX_RPM_PER_HOST=8

# Port
PORT=3000
```

Use Node.js 22 (minimum 20.9); Neon Auth requires Next.js 16. Generate the cookie secret with `openssl rand -hex 32`. No default URL/secret or legacy admin password is used.

In Neon Console, enable Google OAuth and public email/password for the chosen branch. Add local/production app origins to trusted origins and configure Google's redirect URI using the hosted Neon `/callback/google` URL shown by Neon. The application completes Google sign-in at `/auth/callback`. Operators require a verified email in `ADMIN_EMAILS` and a completed Google OAuth session. Password sessions never grant admin access; an empty allowlist denies everyone.

---

## 2. Local Run

```bash
npm ci
npm run build
npm run start
```

- Public landing page: `http://localhost:3000`
- Staged sign-in: `http://localhost:3000/login` (`/register` redirects to its registration stage)
- Price check: `http://localhost:3000/search` (live Neon session required)
- Admin suite: `http://localhost:3000/admin` (Google sign-in with a verified allowlisted email)
- REST API: `http://localhost:3000/v1/index` (authenticated session required)

Analytics and operator pages redirect anonymous visitors to login with their original path/query. Auth APIs and page gates do not initialize the warehouse. `/v1/health` is private too; use `/` for public HTTP uptime checks.

Start a separate persistent worker using the same database:

```bash
npm run collect:worker
```

Collection, discovery, manual ingestion, and rebuilds all require the worker. Web requests return `202 { job_id }` after persisting inputs; no work runs detached after the HTTP response. Install worker dependencies with `npm ci --include=dev` because `tsx` is currently a dev dependency. `npm run collect:worker -- --once` schedules due work and drains the current queue once.

For Vercel + laptop collection, set the matching `DATABASE_URL` and private `TINYFISH_API_KEY` locally, install dependencies on the laptop, and keep Terminal open/laptop awake. `-- --name "My Mac"`, `-- --json`, and `-- --job <UUID>` provide named presence, structured logs, and a specific queued job. Choose Tinyfish/HTTP/offline, caps, and one-time/daily IST schedules in `/admin/scrape`; no pricing schedule is seeded. On upgrade stop the old contributor, deploy matching web/worker revisions, restart, and recreate old `SNAPSHOT_HOURS` slots in admin. Bootstrap adds the durable control tables automatically.

---

## 3. Docker Deployment

```bash
docker compose --env-file .env.local up --build -d
```

Compose starts both web and worker services, includes the login return-path proxy in the web build, and passes optional machine-ingestion/prose-parsing keys. For manual web/worker image commands, see the [full deployment guide](../Deploy.md#3-docker-deployment).

---

## 4. Vercel Cloud Deployment

1. Connect repository to Vercel.
2. Select Node.js 22. Define `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `ADMIN_EMAILS`, and `APIX_BASE_DATE=2026-08-01` in Project Settings > Environment Variables.
3. Configure Google/email-password and the deployment's trusted origin in Neon Console.
4. Deploy with a normal install or `npm ci` (no `--legacy-peer-deps`). Schema migration and initial data seeding run on the first authorized warehouse request; authentication uses Neon Auth independently.
5. Run the same revision's worker on a persistent Node.js/Docker host with matching database and collection variables. Jobs remain queued until a worker claims them. Prose ingestion needs `GEMINI_API_KEY` on the worker; command-line submissions use configured `INGEST_API_KEY` where documented.

Keep `/v1` responses private (`Cache-Control: private, no-store`) and protected layouts dynamic. Analytics caches can each last 20 seconds. Collection monitor is uncached: 2-second active/15-second idle polling, paused when hidden/offline, without replacing retained content. Mutations are not automatically retried.

### Auth runtime errors

Set auth variables in Vercel's **Production** scope and redeploy after changes. Local `.env` settings and a passing build do not supply production runtime configuration.

- **503 `AUTH_NOT_CONFIGURED`** identifies the missing/invalid `variable` and `problem`. Set `NEON_AUTH_BASE_URL` to the HTTPS URL from Neon Console and `NEON_AUTH_COOKIE_SECRET` to a dedicated random secret of at least 32 characters (`openssl rand -hex 32`). `SESSION_SECRET` is not used.
- **500 `AUTH_INTERNAL_ERROR`** logs `[auth] Unexpected route failure` in that invocation's Vercel Runtime Logs. Share the exception/stack when diagnosing; configuration values are not returned in errors.
- Callback failures return to login with the destination preserved and a recoverable error. Inspect auth API responses/runtime logs for the underlying configuration issue.
- Jobs that remain queued need a live worker on the same database. Running jobs heartbeat every 5 seconds and can be recovered after five minutes without a heartbeat. Presence is stale after 30 seconds. Read `/v1/jobs/{id}` with operator credentials or the ingest API key.
- Google sign-in forces account selection. Successful sign-out clears local Neon token/session-data cookies and Google proofs; it does not sign out of Google globally.
- Tinyfish mode requires the worker's key and provider capability/credits. Failures never silently switch to HTTP; monitor distinguishes real fares, missing/blocked cells, and remote cleanup.

## 5. Verification

See [local optimization evidence and reproducible checks](OPTIMIZATION.md). Build, unit/integration, and fixture browser checks cover local behavior. After release, separately verify live Google/email sign-in, authorized/denied operators, sign-out/revocation, and one worker-processed ingestion job. Vercel field metrics and costs require production measurements; local bundle/request counts do not establish CWV or billing improvements.
