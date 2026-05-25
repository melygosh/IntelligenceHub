# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Cache install: copy workspace manifests first
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @intelligencehub/api... --filter @intelligencehub/shared

# Build stage
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN cd apps/api && pnpm build

# Runtime stage
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/src/db/migrations ./apps/api/src/db/migrations
COPY --from=build /app/apps/api/src/db/migrate.ts ./apps/api/src/db/migrate.ts
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

WORKDIR /app/apps/api
EXPOSE 3000
# Run migrations then start the app
CMD ["sh", "-c", "pnpm db:migrate && node dist/main.js"]
