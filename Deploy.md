# Deploy

One Next.js app + Neon.

## Env (`.env.local`)

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
BACKEND_API_KEY=choose-a-long-secret
DATA_DIR=./data
```

## Local

```bash
npm install
npm run dev
```

Dashboard: http://localhost:3000  
API: http://localhost:3000/v1/index

## Host

Vercel (repo root) + Neon. Set `DATABASE_URL`. `data/` ships with the app.
