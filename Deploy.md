# Deploy

One Next.js app + Neon.

## Env (`frontend/.env.local`)

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
BACKEND_API_KEY=choose-a-long-secret
DATA_DIR=../data
```

## Local

```bash
cd frontend
npm install
npm run dev
```

Dashboard: http://localhost:3000  
API: http://localhost:3000/v1/index

## Host

Vercel (this repo’s `frontend/` as root) + Neon. Set `DATABASE_URL` and `DATA_DIR` (or bundle `data/` in the app).
