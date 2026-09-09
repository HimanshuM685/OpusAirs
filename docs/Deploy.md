# OpusAirs — Deployment Guide

OpusAirs is a full-stack Next.js application designed to run on Vercel, Docker, or Node.js, backed by Neon PostgreSQL.

---

## 1. Environment Configuration

```bash
# Database (PostgreSQL / Neon) - REQUIRED
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require

# Admin Authentication (Hidden Operator Suite at /admin)
ADMIN_EMAIL=admin@local
ADMIN_PASSWORD=change_this_to_a_secure_password
SESSION_SECRET=change_this_long_random_string

# Reference Parameters
APIX_BASE_DATE=2026-08-01
SCRAPE_ENABLED=false

# Collector Settings
USER_AGENT=OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in)
LIVE_RATE_LIMIT_SECONDS=8

# Port
PORT=3000
```

---

## 2. Local Run

```bash
npm install
npm run build
npm run start
```

- Public User App: `http://localhost:3000`
- Flight Search: `http://localhost:3000/search`
- Hidden Admin Suite: `http://localhost:3000/admin` (unlock with `ADMIN_EMAIL` & `ADMIN_PASSWORD`)
- REST API: `http://localhost:3000/v1/index`

---

## 3. Docker Deployment

```bash
docker compose up --build -d
```

---

## 4. Vercel Cloud Deployment

1. Connect repository to Vercel.
2. In Project Settings > Environment Variables, define `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `APIX_BASE_DATE=2026-08-01`.
3. Deploy. Schema migration and initial data seeding into DB run automatically on the first `/v1` request.
