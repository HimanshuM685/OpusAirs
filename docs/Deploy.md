# Deploy

One Next.js app on Vercel + Neon Postgres.

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
BACKEND_API_KEY=choose-a-long-secret
DATA_DIR=../data
```

```bash
cd frontend && npm install && npm run dev
```

http://localhost:3000 — dashboard and `/v1` API.
