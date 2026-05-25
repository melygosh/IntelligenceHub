# News Intelligence Hub

UA-Skills tournament submission. Multi-user web app that pulls RSS feeds, processes
articles through an LLM pipeline, deduplicates entities, and exposes the result as a
feed + knowledge graph + on-demand digests.

> **Current phase:** Phase 1 Day 2 — feeds + queue + stub worker + Bull Board.
> The `/articles` list and `/graph` page land Day 3; real RSS/LLM lands Phase 2.

## Prerequisites

- Docker + Docker Compose (Docker Desktop on macOS/Windows works)
- Node 22+ and pnpm 9.15+ (only for local development outside Docker)

## Run

```bash
cp .env.example .env

# Fill in three required secrets in .env:
#   POSTGRES_PASSWORD  (your choice; the DATABASE_URL below must use the same value)
#   JWT_SECRET         (generate with: openssl rand -base64 32)
#   BULL_BOARD_PASS    (your choice; not used Day 1, but compose validates it)
# Important: update DATABASE_URL's embedded password to match POSTGRES_PASSWORD.

docker compose up --build
```

Then open **http://localhost:5174** in your browser.

## Ports

The docker-compose maps containers to non-default host ports to avoid clashes with other
local dev servers:

| Service  | Container port | Host port | Reason                                                |
|----------|---------------:|----------:|-------------------------------------------------------|
| web      |           5173 |  **5174** | avoid clashing with a local Vite dev server on 5173   |
| api      |           3000 |  **3010** | avoid clashing with other local servers on 3000/3005  |
| postgres |           5432 |  **5433** | avoid clashing with a local Postgres on 5432          |
| redis    |           6379 |  **6380** | avoid clashing with a local Redis on 6379             |

Inside the docker network, services reach each other on internal ports (e.g. the api
reaches Postgres at `postgres:5432` per `DATABASE_URL`).

## What works (Phase 1 Day 1)

- `docker compose up --build` brings up Postgres, Redis, API, and Web.
- API auto-applies Drizzle migrations on container start.
- Register / log in / log out flow with JWT in an httpOnly cookie (`ih_auth`).
- Session survives page reload.
- Multi-tenant isolation is enforced at the data layer — `users`, `feeds`, `articles`,
  `entities`, `article_entity` all carry `user_id`. Cross-user access returns 404.
- Vite dev server proxies `/api/*` and `/admin/queues/*` to the api container so the
  browser only ever talks to `http://localhost:5174`.
- Add an RSS feed via `/feeds`, click **Pull now** → a `feed.pull` BullMQ job runs in
  the api container and inserts a stubbed article + entity row (cycling through
  Microsoft / Anthropic / OpenAI per pull) scoped to your user.
- Queue dashboard at **http://localhost:3010/admin/queues** (Bull Board) behind HTTP
  Basic auth — credentials via `BULL_BOARD_USER` / `BULL_BOARD_PASS` in `.env`.

## Stack

- **Backend:** NestJS 11, Drizzle ORM, PostgreSQL 16, Redis 7, BullMQ (wired Day 2),
  argon2, JWT via httpOnly cookie. Lint enforces Google TypeScript Style Guide (`gts`).
- **Frontend:** React + Vite, Tailwind CSS v4, React Router v7, Redux Toolkit + RTK
  Query, react-hook-form + Zod.
- **Shared:** Zod schemas in `packages/shared` (compiled to `dist/` so Node can resolve
  at runtime); imported by both api and web for end-to-end type safety.
- **Tooling:** pnpm workspaces, TypeScript strict, ESLint + Prettier.

## Project layout

```
apps/api          NestJS backend + Drizzle schema + auth
apps/web          React + Vite frontend
packages/shared   Zod schemas shared between api and web
```

## Local development outside Docker

Day 1 is designed to run in Docker. If you want a local dev loop:

```bash
pnpm install
pnpm -F @intelligencehub/shared build   # required: api imports the built dist/
# Run Postgres + Redis (e.g. via `docker compose up postgres redis -d`)
pnpm -F @intelligencehub/api dev        # http://localhost:3000
pnpm -F @intelligencehub/web dev        # http://localhost:5173
```
