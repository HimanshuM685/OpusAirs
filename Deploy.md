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
# Admin Authentication (Hidden Operator Suite at /admin)
# ------------------------------------------------------------------------------
ADMIN_USER=admin
ADMIN_PASSWORD=change_this_to_a_secure_password

# ------------------------------------------------------------------------------
# Data & Index Settings
# ------------------------------------------------------------------------------
APIX_BASE_DATE=2026-08-01
SCRAPE_ENABLED=false

# ------------------------------------------------------------------------------
# Scraper Politeness & Rate Limits
# ------------------------------------------------------------------------------
USER_AGENT=OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in)
LIVE_RATE_LIMIT_SECONDS=8

# ------------------------------------------------------------------------------
# Web Server Port
# ------------------------------------------------------------------------------
PORT=3000
```

---

## 2. Local Node.js Deployment

```bash
# Install dependencies
npm install

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

---

## 3. Docker Deployment

OpusAirs includes a multi-stage `Dockerfile` and `docker-compose.yml`.

### Using Docker Compose:
```bash
# Ensure DATABASE_URL is defined in .env.local or shell
docker compose up --build -d
```

### Manual Docker Build:
```bash
docker build -t opusairs .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." opusairs
```

---

## 4. Vercel + Neon Cloud Deployment

1. **Push repository** to GitHub / GitLab / Bitbucket.
2. **Import project** in [Vercel](https://vercel.com).
3. **Configure Environment Variables** in Vercel Project Settings:
   - `DATABASE_URL`: Your Neon connection string (ensure `?sslmode=require` is appended).
   - `ADMIN_USER`: Operator username (e.g. `admin`).
   - `ADMIN_PASSWORD`: Secure operator password.
   - `APIX_BASE_DATE`: `2026-08-01`.
4. **Deploy**:
   - Vercel automatically runs Next.js build.
   - Database tables are automatically provisioned on the first API call via `lib/bootstrap.ts`.
