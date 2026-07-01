# ─── Stage 1: Install dependencies ────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# ─── Stage 2: Build backend + frontend ────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# backend: webpack outputs to apps/backend/dist/
RUN npx nx build backend
# frontend: Angular outputs to dist/apps/frontend/
RUN NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build frontend --configuration=production

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Backend bundle → /app/main.js
COPY --from=build /app/apps/backend/dist ./

# Frontend static files → /app/public  (ServeStaticModule looks for join(__dirname, 'public'))
COPY --from=build /app/dist/apps/frontend/browser ./public

# Production node_modules
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 9000

CMD ["node", "main.js"]
