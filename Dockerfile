# ─── Stage 1: Install dependencies ────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build backend + frontend ────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# backend: webpack outputs a single bundled apps/backend/dist/main.js
RUN npx nx build backend
# frontend: Angular outputs to dist/apps/frontend/
RUN NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build frontend --configuration=production

# ─── Stage 3: Install only the backend's production dependencies ─────────
# main.js is fully bundled — it only needs a handful of packages webpack
# externalizes rather than inlines (kafkajs, express, @nestjs/*, etc.), not
# the whole monorepo's node_modules, which also drags in the entire Angular
# framework (declared as "dependencies", not devDependencies, per Angular CLI
# convention) even though the frontend is pre-built into static files and
# never touches Angular again at runtime.
#
# We tried Nx's generatePackageJson + prune-lockfile targets for this (they
# auto-detect exactly which packages a bundle needs) — don't reintroduce them
# without fixing this first: they silently produced an incomplete dependency
# list (6 of 25 packages, no error) whenever run against a cold .nx cache,
# which is exactly the state every CI/Docker build starts from since
# .dockerignore excludes .nx/cache. Confirmed reproducible outside Docker too
# by clearing the local cache. Filtering the root manifest deterministically
# avoids that failure mode entirely.
FROM node:24-alpine AS prod-deps
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json ./package.full.json
RUN node -e " \
  const fs = require('fs'); \
  const pkg = JSON.parse(fs.readFileSync('package.full.json', 'utf8')); \
  const frontendOnly = new Set([ \
    '@angular/animations','@angular/cdk','@angular/common','@angular/compiler', \
    '@angular/core','@angular/forms','@angular/material','@angular/platform-browser', \
    '@angular/router','ngx-monaco-editor-v2','socket.io-client','zone.js' \
  ]); \
  const deps = {}; \
  for (const [name, version] of Object.entries(pkg.dependencies)) { \
    if (!frontendOnly.has(name)) deps[name] = version; \
  } \
  deps.tslib = pkg.devDependencies.tslib; \
  fs.writeFileSync('package.json', JSON.stringify({ name: 'mockingbird-backend', version: '0.0.0', private: true, dependencies: deps }, null, 2)); \
  fs.unlinkSync('package.full.json'); \
  "
RUN pnpm install --prod

# ─── Stage 4: Runtime ─────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Backend bundle → /app/main.js
COPY --from=build /app/apps/backend/dist ./

# Frontend static files → /app/public  (ServeStaticModule looks for join(__dirname, 'public'))
COPY --from=build /app/dist/apps/frontend/browser ./public

COPY --from=prod-deps /app/node_modules ./node_modules

EXPOSE 9000

CMD ["node", "main.js"]
