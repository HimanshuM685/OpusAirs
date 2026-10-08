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

# Reference Parameters
APIX_BASE_DATE=2026-08-01
SCRAPE_ENABLED=false

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

- Public User App: `http://localhost:3000`
- Flight Search: `http://localhost:3000/search`
- Hidden Admin Suite: `http://localhost:3000/admin` (Google sign-in with a verified allowlisted email)
- REST API: `http://localhost:3000/v1/index`

---

## 3. Docker Deployment

```bash
docker compose --env-file .env.local up --build -d
```

---

## 4. Vercel Cloud Deployment

1. Connect repository to Vercel.
2. Select Node.js 22. Define `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `ADMIN_EMAILS`, and `APIX_BASE_DATE=2026-08-01` in Project Settings > Environment Variables.
3. Configure Google/email-password and the deployment's trusted origin in Neon Console.
4. Deploy with a normal install or `npm ci` (no `--legacy-peer-deps`). Schema migration and initial data seeding run automatically on warehouse `/v1` requests; authentication uses Neon Auth independently.

### Auth runtime errors

Set auth variables in Vercel's **Production** scope and redeploy after changes. Local `.env` settings and a passing build do not supply production runtime configuration.

- **503 `AUTH_NOT_CONFIGURED`** identifies the missing/invalid `variable` and `problem`. Set `NEON_AUTH_BASE_URL` to the HTTPS URL from Neon Console and `NEON_AUTH_COOKIE_SECRET` to a dedicated random secret of at least 32 characters (`openssl rand -hex 32`). `SESSION_SECRET` is not used.
- **500 `AUTH_INTERNAL_ERROR`** logs `[auth] Unexpected route failure` in that invocation's Vercel Runtime Logs. Share the exception/stack when diagnosing; configuration values are not returned in errors.
