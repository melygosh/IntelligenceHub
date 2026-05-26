# News Intelligence Hub

UA-Skills tournament submission. Multi-user web app that pulls RSS feeds, processes
articles through an LLM pipeline, deduplicates entities, and exposes the result as a
feed + knowledge graph + on-demand digests.

> **Current phase:** Phase 2 Day 12 — digests + generic SSE events.
> New `/digests` page lets users request a digest for a period
> (day/week/month) filtered by categories or entities. Backend
> asynchronously queries in-scope articles, aggregates top entities +
> categories, and runs a single LLM call to produce a 2-3 paragraph
> editorial summary. Results render on a `/digests/:id` magazine-layout
> page with summary + top lists + key articles + per-digest telemetry.
> A generic SSE events channel pushes status updates from worker to
> browser without polling — designed to grow for future event types
> (alerts, regen progress, feed-pull notifications).

## Prerequisites

- Docker + Docker Compose (Docker Desktop on macOS/Windows works)
- Node 22+ and pnpm 9.15+ (only for local development outside Docker)

## Run

```bash
cp .env.example .env

# Fill in the required secrets in .env:
#   POSTGRES_PASSWORD  (your choice; the DATABASE_URL below must use the same value)
#   JWT_SECRET         (generate with: openssl rand -base64 32)
#   BULL_BOARD_PASS    (your choice; protects /admin/queues)
#   ANTHROPIC_API_KEY  (required when LLM_PROVIDER=anthropic — the default)
#   OPENAI_API_KEY     (required when LLM_PROVIDER=openai)
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
| api      |           3011 |  **3010** | avoid clashing with other local servers on 3000/3005  |
| postgres |           5432 |  **5433** | avoid clashing with a local Postgres on 5432          |
| redis    |           6379 |  **6380** | avoid clashing with a local Redis on 6379             |

Inside the docker network, services reach each other on internal ports (e.g. the api
reaches Postgres at `postgres:5432` per `DATABASE_URL`).

## What works (end of Phase 2 Day 12)

- `docker compose up --build` brings up Postgres, Redis, API, and Web.
- API auto-applies Drizzle migrations on container start.
- Register / log in / log out flow with JWT in an httpOnly cookie (`ih_auth`).
- Session survives page reload. Multi-tenant isolation enforced at the data layer —
  `users`, `feeds`, `articles`, `entities`, `article_entity` all carry `user_id`;
  cross-user access returns 404 throughout.
- Vite dev server proxies `/api/*` and `/admin/queues/*` to the api container so the
  browser only ever talks to `http://localhost:5174`.
- **Feeds (`/feeds`):** add an RSS/Atom feed by URL — the puller worker fetches it
  (10s timeout, custom UA), parses items, normalises URLs (strips tracking params),
  computes content hashes, dedups against existing articles, runs a heuristic
  pre-filter (length / emptiness / spam / link density), and persists each item with
  `status='ready'` or `status='filtered' + filter_reason`. Each row shows status
  (active / paused / error), title, last-pull timestamp; pause/resume + delete +
  manual pull-now actions. Try `https://hnrss.org/frontpage` to see real articles
  flow through.
- **LLM extraction pipeline:** each `ready` article is analysed by a single LLM call
  that returns a structured `{summary, importance, entities[]}`. Our own abstraction
  layer (no third-party agent framework — per spec) ships two adapters:
  Anthropic (via `@anthropic-ai/sdk`, structured output via `tool_use`, system prompt
  marked `cache_control: ephemeral`) and OpenAI (via `openai`, structured output via
  `response_format.json_schema`, automatic prefix caching). Active provider via
  `LLM_PROVIDER` env (`anthropic` or `openai`); the other adapter stays inert.
  Response shape is Zod-validated at the boundary; an invalid response is retried
  once, then the article flips to `status='llm_error'`.
- **Cost controls (FR-10):** content-hash response cache (`llm_response_cache`) — a
  repeated article body short-circuits before reaching the model. Per-call telemetry
  in `llm_calls` records provider, model, status, input/output/cache tokens, latency,
  and error message (ready for the Phase 3 telemetry dashboard).
- **Entity dedup (FR-6):** every LLM-extracted entity passes through `EntityResolver`,
  which normalizes the canonical name (NFKC + lowercase + Latin-suffix strip), looks
  for an existing exact / alias / type-scoped likely-match (token-prefix shortcut OR
  Jaro-Winkler ≥ 0.95), and only inserts a new row when no equivalent exists.
  Aliases are emitted by the LLM in the same call as the rest of the analysis
  (no extra LLM calls — FR-10 compliant) and recorded in the `entity_alias` table
  for future lookups. A smoke test against `https://hnrss.org/frontpage` reliably
  collapses `Microsoft` / `MSFT` / `Microsoft Corp.` into a single entity per user.
- **Email confirmation (US-1):** registration creates an unconfirmed account with
  an `email_confirmation_token` row (sha256-hashed, 24h expiry, one-time use). In
  dev mode (`APP_DEV_MODE=true`) the link is logged as a structured
  `auth.confirmation_link` event AND surfaced in the registration response so the
  `/auth/check-email` page can display it with a "DEV MODE" pill. Unconfirmed users
  get `403 {error: 'email_unconfirmed'}` on every business route via
  `RequireConfirmedEmailGuard`; the frontend api wrapper redirects them to
  `/auth/check-email`. Resend endpoint is rate-limited (60s cooldown — register
  itself starts the window) and invalidates prior tokens on success.
- **Categories + axes (FR-8, US-4, US-5):** per-user category CRUD and axis CRUD
  (with values) via `/categories` and `/settings/axes`. 4 axes seeded on
  registration (content type / reader level / region / tonality). The
  `analyzeArticle` LLM call (now operation `v3`) takes each user's config inline,
  returns `categoryNames[]` and `axisAssignments[]`, and the cache key includes a
  `config_hash` so two users with identical configs still share the cache while
  changes invalidate per-user correctly. Article list and graph are filterable by
  category.
- **Regeneration (US-6, FR-9):** when categories or axes change, the user clicks
  "Regenerate articles" on the Categories or Axes settings page. A Bull job
  re-tags every article whose stored `config_hash` doesn't match the user's
  current config. Each article runs through `ArticleProcessor.retag`, which
  reuses the LLM response cache (keyed on content_hash + config_hash) — so a
  revert to a previously-used config completes with zero LLM calls. Progress
  is visible via a banner mounted in the global Shell layout (polls
  `/api/regeneration/current` every 2s while running). Partial unique index
  on `regeneration_run (user_id) WHERE status='running'` prevents concurrent
  runs per user; boot-time cleanup marks any stale `running` rows from a
  previous process crash as `failed` so users never deadlock.
- **Feed validate (`POST /api/feeds/validate`):** pre-flight a URL before adding it
  — returns the discovered channel title + normalised URL + item count, or a
  structured error (`unreachable` / `not_a_feed` / `malformed_url` / `empty`).
- **Articles (`/articles`):** see your articles ordered by publication time, each row
  showing importance dot, mono timestamp, entity chips with per-type glyphs, and a
  `· N similar` badge when the same article appears in other feeds. Click a row to
  open the detail card; click an entity chip to open that entity's page.
- **Article detail (`/articles/:id`, US-8):** full layout with summary, body (LLM
  body preserved from Day 8b), entity chips (each links to `/entities/:id`),
  category + axis tags, and "Found N similar in other feeds" with per-item links
  to that copy's article page and an `open source ↗` shortcut.
- **Entity detail (`/entities/:id`, US-10):** canonical name, type, aliases (from
  Day 6's `entity_alias`), mention count + first/last seen, a pure-SVG **mention
  timeline** sparkline (per-UTC-day buckets with native `<title>` tooltips), top-20
  **related entities** with co-mention weights, and the full mentioning-articles list.
- **Duplicate detection (FR-5 exact):** when the puller sees the same `content_hash`
  or normalised URL again for the same user, the new row is persisted with
  `status='duplicate'` + `duplicate_of` pointing to the canonical original (not
  silently filtered). Pre-filter + LLM pipeline only run on `status='ready'`, so
  duplicates don't burn tokens. They surface as the `N similar` counter on the
  list + the expandable list on the article card. Semantic similarity (FR-5
  Should) deferred to Day 13.
- **Demo data seed (spec §6):** the registration page has a "Load demo data"
  checkbox (default unchecked). When ticked, `AuthService` enqueues a
  `demo.seed` Bull job that asynchronously loads a frozen HN-snapshot dataset
  (~20 articles + ~7 duplicates spread across 3 paused demo feeds + entities
  + categories + axis assignments) into the user's account in ~200ms. Zero
  runtime LLM calls — the data ships as a static JSON with LLM-pre-generated
  summaries/entities. Reviewer following the spec §9.4 walkthrough step 8 can
  pick this in lieu of waiting for a live HN pull. Demo feeds stay paused so
  the puller worker never tries to GET `demo://...`. To refresh the snapshot
  from new HN content: `cd apps/api && tsx scripts/dump-demo-snapshot.ts <email>`.
- **Digests (`/digests`, US-11 + Case 3):** request a digest for a period
  (day/week/month) optionally filtered by categories or entities. Backend
  asynchronously assembles in-scope articles via Bull queue + single LLM
  call (`'build_digest_v1'`, both Anthropic + OpenAI adapters supported),
  produces a 2-3 paragraph editorial summary + top-20 entities + top-10
  categories + top-10 key articles snapshot. Persisted in `digest_run`
  table; history list on `/digests`; detail page at `/digests/:id` in
  magazine layout (header + summary + lists grid + key articles +
  per-digest telemetry: model + tokens + ms). LLM response cache reuse —
  identical inputs share the cache (FR-10), zero LLM tokens on cache hit.
  Empty-scope failure path: if no articles match the window+filter, the
  build skips the LLM call and marks `status='failed'` with an explicit
  error message.
- **Generic SSE events** (`GET /api/events`): server-sent events channel
  exposing typed `ServerEvent` payloads (discriminated union by `type`).
  First event type: `digest.status_changed` (drives the digest history
  live-update without polling). Per-user `EventsService` subjects with
  refcounted teardown; in-memory only (single api instance; Redis pubsub
  swap documented for horizontal scaling). Frontend `useServerEvents`
  hook opens one EventSource and dispatches to typed consumer hooks
  (e.g. `useDigestStatusEvents`); future event types add new union
  variants + consumers without changing the channel.
- **Graph (`/graph`):** react-flow canvas with two node kinds (articles, entities)
  connected by **mention edges** (article → entity) and **co-mention edges**
  (entity ↔ entity, weighted by shared-article count, rendered with a thicker
  stroke). Pan/zoom/mini-map. **dagre LR auto-layout** lays articles on one rank
  and entities on the other. Three-way **node-type filter** (`both` / `articles
  only` / `entities only`) + the existing **category filter**, both URL-backed
  via `?nodeKind=` and `?category=` so reloads + share links preserve the view.
  **Clicking a node** navigates to its detail page (`/articles/:id` or
  `/entities/:id` based on node kind).
- **Bull Board:** queue dashboard at **http://localhost:3010/admin/queues** behind HTTP
  Basic auth — credentials via `BULL_BOARD_USER` / `BULL_BOARD_PASS` in `.env`.
- **Editorial design system:** cream paper, Instrument Serif headlines, IBM Plex Mono
  metadata, single deep-moss accent. Applied consistently across auth pages, sidebar,
  topbar, feeds, articles, graph.

## Stack

- **Backend:** NestJS 11, Drizzle ORM, PostgreSQL 16, Redis 7, BullMQ, argon2, JWT
  via httpOnly cookie. LLM via `@anthropic-ai/sdk` + `openai` behind our own service
  abstraction (no agent framework). Lint enforces Google TypeScript Style Guide (`gts`).
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
pnpm -F @intelligencehub/api dev        # http://localhost:3011
pnpm -F @intelligencehub/web dev        # http://localhost:5173
```
