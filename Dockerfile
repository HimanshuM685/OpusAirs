FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json next-env.d.ts instrumentation.ts ./
COPY app ./app
COPY lib ./lib
COPY data ./data
ENV DATA_DIR=/app/data
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY data ./data
EXPOSE 3000
CMD ["node", "server.js"]
