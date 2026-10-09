# OpusAirs — Deployment Guide

OpusAirs is a full-stack Next.js application designed to run seamlessly on Vercel, Docker, or traditional Node.js virtual machines, connected to a serverless PostgreSQL database (Neon).

---

## 1. Environment Configuration

Create `.env.local` for local deployment, or configure these environment variables in your hosting provider's dashboard:

```bash
# ------------------------------------------------------------------------------
# PostgreSQL Database (Neon serverless recommended) - REQUIRED
# ------------------------------------------------------------------------------
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require

# ------------------------------------------------------------------------------
# Neon Auth (public Google/email; Google-only operator suite at /admin)
# ------------------------------------------------------------------------------
NEON_AUTH_BASE_URL=https://ep-xxxxx.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=replace_with_a_random_secret_of_at_least_32_characters
ADMIN_EMAILS=operator@example.com
INGEST_API_KEY=
# Optional, required only for worker-side prose ingestion:
GEMINI_API_KEY=

# ------------------------------------------------------------------------------
# Data & Index Settings
# ------------------------------------------------------------------------------
APIX_BASE_DATE=2026-08-01
SCRAPE_ENABLED=false

# ------------------------------------------------------------------------------
# Scraper Politeness & Rate Limits
# ------------------------------------------------------------------------------
BOT_DOMAIN=your-domain.example
BOT_CONTACT=contact@your-domain.example
COLLECT_MAX_RPM_PER_HOST=8

# ------------------------------------------------------------------------------
# Web Server Port
# ------------------------------------------------------------------------------
PORT=3000
```

Use Node.js 22 (minimum 20.9) and the committed dependency lockfile. Neon Auth requires Next.js 16; install normally with `npm ci`, without peer-dependency bypass flags.

Enable Google OAuth and public email/password in Neon Console for the selected branch. Configure Google's authorized redirect URI exactly as shown by Neon (the hosted Neon `/callback/google` endpoint). Add local and HTTPS production app origins to Neon's trusted origins. Application Google login returns through `/auth/callback`, where Neon exchanges the verifier for its session cookies.

Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -hex 32`. Admin access requires a verified allowlisted email **and a completed Google OAuth session**; email/password cannot grant admin, even for allowlisted accounts. No seeded admin password, legacy cookie, or upstream admin role grants access. Empty `ADMIN_EMAILS` denies operators.

---

## 2. Local Node.js Deployment

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Start production server
npm run start
```

Default URLs:
- User Interface: `http://localhost:3000`
- Flight Search & Compare: `http://localhost:3000/search`
- Admin / Operator Suite: `http://localhost:3000/admin`
- REST API: `http://localhost:3000/v1/index`

`/` remains public; analytics and operator pages pass through `/login`. Protected return paths and query strings survive sign-in failures and retries. `/register` opens the registration stage on `/login`. Warehouse APIs, including `/v1/health`, now require authentication; use `/` for public HTTP uptime checks and an authenticated request for warehouse health.

Start a separate worker from the same source checkout with the same `DATABASE_URL`:

```bash
npm run collect:worker
```

The worker runs collection, discovery, **manual ingestion, and index rebuilds**. `202 { job_id }` means persisted, not completed. Without a worker, these jobs remain queued. Production worker installations need `tsx` (currently a dev dependency), so install with `npm ci --include=dev`. `npm run collect:worker -- --once` schedules due work and processes the queue once; run the normal command under a process supervisor for continuous execution.

---

## 3. Docker Deployment

OpusAirs includes a multi-stage `Dockerfile` and `docker-compose.yml`.

Compose starts both the web application and `collection-worker`. The web build includes the root `proxy.ts` so login redirects retain the original destination. Optional `INGEST_API_KEY` and `GEMINI_API_KEY` values are passed through to the services; keep prose-parsing credentials configured on the worker.

### Using Docker Compose:
```bash
# Ensure database and auth variables are defined in .env.local or shell
docker compose --env-file .env.local up --build -d
```

### Manual Docker Build:
```bash
docker build -t opusairs .
docker run -p 3000:3000 --env-file .env.local opusairs

# Separate long-lived worker using the same database:
docker build --target collection-worker -t opusairs-worker .
docker run -d --restart unless-stopped --env-file .env.local opusairs-worker
```

---

## 4. Vercel + Neon Cloud Deployment

1. **Push repository** to GitHub / GitLab / Bitbucket.
2. **Import project** in [Vercel](https://vercel.com).
3. **Configure Environment Variables** in Vercel Project Settings:
    - `DATABASE_URL`: Your Neon connection string (ensure `?sslmode=require` is appended).
    - `NEON_AUTH_BASE_URL`: HTTPS Auth URL from the same Neon branch.
    - `NEON_AUTH_COOKIE_SECRET`: Random secret, at least 32 characters.
    - `ADMIN_EMAILS`: Comma-separated Google operator emails; empty denies access.
    - `APIX_BASE_DATE`: `2026-08-01`.
4. **Deploy**:
    - Select Node.js 22 and use the normal install command or `npm ci`.
    - Enable Auth/Google/email-password in Neon Console and add the deployed origin to trusted origins.
    - Vercel automatically runs Next.js build.
    - Database tables are automatically provisioned on the first authorized warehouse API call via `lib/bootstrap.ts`. Authentication and the public landing page do not initialize the warehouse.
5. **Run a worker separately** on a persistent Node.js/Docker host with the same database and collection configuration. Vercel request handlers persist jobs and return immediately; they no longer detach ingestion/rebuild work into the request process. Deploy matching web/worker revisions.

Do not publicly cache `/v1` responses or protected pages. API responses send `Cache-Control: private, no-store`; user/admin layouts render dynamically. Selected warehouse reads and browser reads each have a short 20-second internal cache. A worker cannot invalidate another process's memory, so freshness can lag across both cache layers.

### Troubleshooting Google sign-in failures

Auth configuration is checked when a request arrives, so a successful build does not confirm that production auth variables are set. Local `.env` values do not configure Vercel. Select the **Production** scope for both `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`, then redeploy after changing them.

- **503 `AUTH_NOT_CONFIGURED`**: The JSON response identifies `variable` and `problem` (`missing`, `invalid`, or `too_short`). Use the HTTPS Auth URL from Neon Console, not a PostgreSQL connection string. Generate the dedicated secret with `openssl rand -hex 32`; `SESSION_SECRET` is not a substitute.
- **500 `AUTH_INTERNAL_ERROR`**: Open this request's Vercel Runtime Logs and look for `[auth] Unexpected route failure`, which includes the exception. Configuration errors log only the variable name/problem, never its value.
- **Signed in but admin denied**: Check verified Google authentication and `ADMIN_EMAILS`. The allowlist is evaluated after login; it does not cause Google sign-in initiation to return 500.
- **Callback failed or cancelled**: The browser returns to `/login` with its protected destination and an actionable error. Inspect `/api/auth` responses and runtime logs for configuration details; callback errors no longer leave a raw JSON screen.
- **Ingestion stays queued**: Confirm the worker is running the current revision against the same database. Check `/v1/jobs/{id}` as an authorized operator or with the configured `x-api-key`. Worker heartbeats are every 30 seconds; stale running jobs become eligible for recovery after five minutes without a heartbeat.

## 5. Release Verification

Run `npm test` and `npm run build`. Follow [the optimization verification guide](docs/OPTIMIZATION.md) for the opt-in PostgreSQL test and fixture-based desktop/mobile browser checks.

After deployment, verify live Google and email login, operator denial/allowlisting, callback cancellation, sign-out/revocation, and one manual ingestion job with the worker running. Confirm anonymous analytics calls return 401 and authorized responses remain private. Local browser fixtures do not validate production Neon settings or Google credentials.

Production Vercel usage/CWV data was unavailable during the local audit. Collect field metrics after release before claiming improvements to latency, invocation costs, transfer costs, or Core Web Vitals.
