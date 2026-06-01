# News Intelligence Hub

A multi-user web app that pulls RSS feeds, runs each article through a single
structured LLM call, deduplicates entities, and surfaces the result as a
filterable feed, an interactive knowledge graph, and on-demand period digests.
Submitted for the UA-Skills tournament.

## Stack

- **Backend** — NestJS 11, Drizzle ORM, PostgreSQL 16, Redis 7 + BullMQ, argon2
  passwords, JWT in an httpOnly cookie. LLM access via `@anthropic-ai/sdk` and
  `openai` behind a hand-written service abstraction (no agent framework — see
  ADR-1). Lint enforces the Google TypeScript Style Guide via `gts`.
- **Frontend** — React + Vite, Tailwind CSS v4, React Router v7, Redux Toolkit
  + RTK Query, react-hook-form + Zod.
- **Shared** — Zod schemas in `packages/shared`, compiled to `dist/` and
  imported by both api and web for end-to-end types.
- **Tooling** — pnpm workspaces, TypeScript strict, ESLint + Prettier, Jest.

## Quick start

Prerequisites: Docker + Docker Compose. (For local-host dev outside Docker see
the last section.)

```bash
cp .env.example .env
# Fill in:
#   POSTGRES_PASSWORD              your choice; DATABASE_URL below must match
#   JWT_SECRET                     openssl rand -base64 32
#   BULL_BOARD_USER / _PASS        protects /admin/queues
#   LLM_PROVIDER                   anthropic | openai (default anthropic)
#   LLM_PROVIDER_API_KEY           required, for the active provider
#   LLM_PROVIDER_MODEL             optional, defaults to claude-haiku-4-5 / gpt-4o-mini
#   LLM_FALLBACK_PROVIDER / _API_KEY / _MODEL   optional cross-provider failover

docker compose up --build
```

The api auto-applies Drizzle migrations on first boot, and seeds the four
default categorization axes per user at registration. Once all five services
(`postgres`, `redis`, `api`, `worker`, `web`) are healthy:

1. Open **http://localhost:5174** in a browser.
2. Register with email + password. Tick **Load demo data** if you want a
   pre-built dataset instead of waiting for a live feed pull.
3. The next page shows the email confirmation link (it is also written to
   the api log as `auth.confirmation_link`); follow it to activate the
   account.
4. Log in. Without demo data, go to `/feeds` and add an RSS URL
   (`https://hnrss.org/frontpage` works). Wait ~30 s for the pull + analyse
   workers; the row turns from `pending` to `ready`. With demo data the
   account already has three paused feeds, ~20 ready articles, and a
   populated graph.
5. Explore `/articles`, `/entities`, `/graph`, `/digests`. Change category or
   axis configuration under `/settings`, then click **Regenerate articles**
   to re-tag against the new config; progress streams via SSE without
   blocking the UI.
6. **Bull Board** lives at **http://localhost:3010/admin/queues** behind HTTP
   basic auth (the `BULL_BOARD_USER` / `BULL_BOARD_PASS` you set in `.env`).
   It is not linked from the UI — the credentials are the gate, so opening
   `/admin/queues` directly is the documented entry point. Use it to inspect
   queue state (`active` / `delayed` / `failed`) for any of the five
   pipelines: feed-pull, article-analyze, regeneration, digest, demo-seed.

### Ports

Mapped to non-default host ports to avoid clashes with common local services.
Inside the docker network everything talks on standard ports.

| Service  | Container port | Host port | Reason                                              |
|----------|---------------:|----------:|-----------------------------------------------------|
| web      |             80 |  **5174** | nginx serves the built SPA + proxies /api           |
| api      |           3011 |  **3010** | avoid clashing with other local servers on 3000     |
| worker   |            —   |     —     | BullMQ consumers + scheduler; no HTTP port          |
| postgres |           5432 |  **5433** | avoid clashing with a host-side Postgres            |
| redis    |           6379 |  **6380** | avoid clashing with a host-side Redis               |

## Project layout

```
apps/api          NestJS backend: HTTP routes, BullMQ workers, Drizzle schema
apps/web          React + Vite frontend
packages/shared   Zod schemas shared between api and web
docs/             Spec, design notes, audit checklist (gitignored)
```

## What the app does

### Authentication and tenancy

Email + password registration with argon2 hashing, JWT in an httpOnly cookie,
session survives page reload. Email confirmation is mandatory before access:
unconfirmed users see `403 email_unconfirmed` on every business route and the
frontend redirects them to a resend page (60-second cooldown). In dev mode
(`APP_DEV_MODE=true`) the confirmation link is surfaced both in the api log
and on the post-register screen with a "DEV MODE" pill.

Multi-tenant isolation lives at the data layer: every table that holds
user-owned rows carries a `user_id` column and every read/write is
constrained by the authenticated user's id. Cross-user access returns `404`
end-to-end (not `403`, to avoid leaking existence).

### Feeds and the content pipeline

Add an RSS or Atom feed by URL. `POST /api/feeds/validate` pre-flights it
(returns the channel title + normalised URL + item count, or one of
`unreachable | not_a_feed | malformed_url | empty`). Feeds have an explicit
status (`active | paused | error`); pause/resume/delete and a manual
**Pull now** action are available per row. Deleting a feed detaches its
articles (`articles.feed_id` becomes `NULL`) instead of cascading them away,
so the user's archive is never lost (US-3).

A repeatable BullMQ scheduler (cron from `FEED_PULL_CRON`, default every 15
minutes; empty disables it) sweeps every active feed across all users and
enqueues a per-feed pull; manual **Pull now** (single feed or all) enqueues
the same jobs on demand. Overlapping pulls for the same (user, feed) are
deduplicated while one is still in flight, so a scheduled tick landing on a
feed still pulling from the previous tick is skipped rather than piling up,
and feeds are fetched up to `FEED_PULL_CONCURRENCY` at a time (default 1 —
serial, so cross-source dedup stays exact; network-bound and independent of
the LLM concurrency gate, so it's safe to raise for faster sweeps). The pull
worker
normalises each item's URL (strips tracking params), computes a SHA-256
content hash, deduplicates against existing articles for the same user, runs
a deterministic pre-filter (length / emptiness / spam markers / link
density), and persists the result. Duplicates land with `status='duplicate'` and a
`duplicate_of` pointer; pre-filtered junk lands with `status='filtered'`
and a structured `filter_reason`; everything else lands as `status='pending'`
and a single `article.analyze` job is enqueued. The pull worker never makes
an LLM call directly.

### LLM analysis

The analyse worker takes one pending article and makes exactly one
structured LLM call per article in normal mode (FR-10). The active provider
(`anthropic | openai`) is chosen via `LLM_PROVIDER`; the inactive adapter
stays inert. The Anthropic adapter uses `tool_use` for structured output
with `cache_control: ephemeral` on the system prompt; the OpenAI adapter
uses `response_format.json_schema` with automatic prefix caching. Both
return the same Zod-validated `{summary, importance, entities, aliases,
categoryNames, axisAssignments}` shape; an invalid response is retried once
in-call and otherwise propagates. On success the worker promotes the row to
`status='ready'`; on terminal failure the row lands at `status='failed'`.

### Deduplication

**Articles** (FR-5) are dedup'd deterministically: exact match on the
normalised URL or on the SHA-256 content hash, scoped to the same user. The
decision rule is extracted as a pure function (`decideDedupAction` in
`apps/api/src/articles/dedup-decision.ts`) and unit-tested across all
branches — only a `ready` original from a *different* feed materialises a
duplicate row (the cross-source similar-articles anchor); same-feed
re-pulls and pending/failed siblings are skipped silently to avoid
inflating the "N similar" counter.

*What counts as a duplicate vs. similar* (FR-5 asks this be stated):

- **Duplicate** — an exact re-publication: same normalised URL *or* SHA-256
  content hash as an existing article for that user. Deduplicated so identical
  content is never re-analysed — a same-feed re-pull is dropped, and a
  cross-feed copy is stored `status='duplicate'` with a `duplicate_of` pointer,
  inheriting the original's analysis rather than spending its own LLM call.
- **Similar** ("N in other sources") — the cross-source view of those exact
  matches: how many *other* feeds carry the same URL/hash content
  (`feed_id IS DISTINCT FROM` the article's own feed). Derived at read time and
  surfaced as the badge + list in the feed (US-7) and card (US-8); never stored.
- **Related (semantic)** — optional (ADR-7): pgvector kNN over per-article
  embeddings finds same-event / different-text articles, explicitly excluding
  exact URL/hash matches, under its own "Related (semantic)" section. The
  probabilistic level, kept separate from the two deterministic ones.

**Entities** (FR-6) are dedup'd via LLM-emitted aliases plus a deterministic
resolver. The analysis call returns aliases alongside entities, so dedup
costs zero extra LLM calls. `EntityResolver` normalises the canonical name
(NFKC + lowercase + Latin-suffix strip), then matches by exact name → alias
table → type-scoped likely-match (token-prefix shortcut OR Jaro-Winkler
≥ 0.95). A new row is inserted only when nothing matches. The result
collapses `Microsoft` / `MSFT` / `Microsoft Corp.` / Cyrillic spellings into
one entity per user.

### Article list and cards

`/articles` shows the user's articles ordered by publication time, with an
importance dot, mono timestamp, entity chips (per-type glyphs), category
tags, the processing status, and a "· N similar" badge whenever the same
content appears in other feeds. Filter chips at the top combine category,
feed, importance, time window (24h / 7d / 30d / all / custom) and a
debounced text search. Search uses a Postgres `tsvector` GIN index;
`plainto_tsquery` sanitises input and results re-order by `ts_rank`.

The article detail page (`/articles/:id`, US-8) shows the full LLM summary,
the original body, clickable entity chips, the full set of category and
axis tags, and "Found N similar in other feeds" with per-item links and an
`open source ↗` shortcut to the source URL. The entity detail page
(`/entities/:id`, US-10) shows the canonical name, type, description (when
the LLM produced one), the alias set, a pure-SVG mention timeline, top-20
related entities ranked by co-mention weight, and the full mentioning-
articles list. Entity timestamps serialise as Unix seconds per FR-6.

### Knowledge graph

`/graph` is the analytical view (Case 2). The filter bar carries the
mandatory **category** filter plus two Should-tier extensions: a
**time-window** chip group (default 7d) and an **entity search** that
anchors the canvas on a specific entity and shows it alongside its top-N
co-mentioned neighbours in scope. All filters are URL-backed.

**Node-type filtering** (the other half of FR-7's mandatory minimum) is
driven by *selection* rather than a separate toggle: the canvas shows the
entity layer by default, and adding articles through the Articles panel
brings the `article` nodes (and their `mentions`/`similar` edges) onto the
canvas — removing them takes the graph back to entities only. So the two
node kinds are independently includable/excludable; we fold node-type into
the selection model instead of a redundant control (an earlier explicit
Both/Entities/Articles toggle was removed because it duplicated selection
and could hide newly-added articles). A co-mention **timeline** scrubber
(FR-7 Could-tier) can replay how the entity graph builds up over the
window; it is disabled for the 24h window where a replay isn't meaningful.

A two-cell summary band above the canvas surfaces the top 5 entities
(by mention count, dot-coded by dominant category) and the top 5 articles
(importance-weighted). Both are clickable.

The canvas is react-flow with dagre LR layout. Entity-node size encodes
mention count and fill encodes dominant category via a stable six-colour
palette (Could-tier visual clustering). Article-node left border encodes
importance (FR-7). Clicking any node opens a 360px right rail with the
node's details (US-9 — side panel, not navigation); the clicked node plus
its 1-hop neighbourhood stays at full opacity while the rest dims.

### Period digests

`/digests` lets the user request a digest for a day / week / month,
optionally scoped to chosen categories or entities (US-11). The request
enqueues a single `digest.build` job; the worker collects matching articles
deterministically, makes one LLM call for the editorial summary, and
persists the run with top-20 entities, top-10 categories, top-10 key
articles, model, tokens, and latency. The history list updates live via a
server-sent events channel (`GET /api/events`, single per-user
`EventsService` subject). Identical inputs share the LLM response cache, so
re-requesting an unchanged digest costs zero tokens.

### Dashboard

`/dashboard` is a deterministic, zero-LLM snapshot of what the corpus
looks like right now in the chosen window (`24h / 7d / 30d / all /
custom`). Three cards: **top entities** (top-10 by mention count, with a
dominant-category dot), **top categories** (top-5 with article share %
bars), **top feeds** (top-5 with a status pip). Every row links to the
existing list / detail page with the right filter pre-applied. The
period control is URL-backed via `?period=`. Computation is parallel SQL
aggregations gated by `WHERE user_id`.

### Cost control and telemetry

Every LLM call is recorded in `llm_calls` (provider, model, operation,
status, input/output/cache tokens, latency, error message). `LLM_CONCURRENCY`
caps parallel calls. A content-addressed cache (`llm_response_cache`, keyed
on `content_hash + config_hash + operation`) short-circuits the model when
the same content + config has been seen, including across users — so a
config revert during regeneration completes with zero LLM calls. The
deterministic pre-filter and exact-dedup pipeline gate the queue so junk
and duplicates never reach the model. `/telemetry` aggregates lifetime
calls per `(operation, provider, model)` with token totals (input/output),
average latency, success rate, and failover count. Tokens are the cost proxy —
no USD figure is computed, since the providers don't return per-call pricing.

### Regeneration on configuration change

When the user edits categories or axes and clicks **Regenerate articles**,
a Bull job walks every article whose stored `config_hash` doesn't match the
user's current config and re-runs `ArticleProcessor.retag`. The retag path
re-uses the LLM response cache, so a revert to a previously-used config
completes with zero LLM calls. A partial unique index
(`regeneration_run (user_id) WHERE status='running'`) prevents concurrent
runs per user; a boot-time cleanup marks stale `running` rows from a
previous process crash as `failed`. Progress streams to a banner mounted
in the global layout via SSE.

### Demo data

The registration page has a **Load demo data** checkbox. When ticked, a
`demo.seed` Bull job loads a frozen snapshot (~20 ready articles, ~7
duplicates, three paused demo feeds, the resolved entity set, categories,
axis assignments) into the new account in ~200 ms. The data ships as a
static JSON with pre-generated LLM summaries and entities, so the seed
makes zero LLM calls. Demo feeds stay paused so the puller never tries to
GET `demo://...`. To refresh the snapshot from live HN content:
`cd apps/api && tsx scripts/dump-demo-snapshot.ts <email>`.

## Architectural decisions

Format follows §9.6: Context / Decision / Alternatives / Trade-offs. Each
ADR reflects code that is actually shipping; see file references and
commits for verification.

## ADR-1: Own LLM abstraction, no agent framework (Principle 1, FR-3)

- **Context.** §5.2/§6 require the LLM to be used only for genuinely
  semantic work and forbid a high-level framework (LangChain / LlamaIndex /
  similar) as the architecture unless every component is explainable.
- **Decision.** A provider-agnostic `LlmService` with hand-written
  `AnthropicAdapter` and `OpenAIAdapter`. Deterministic work — URL
  normalisation, content hashing, pre-filter, exact dedup, alias
  normalisation — is plain code; the LLM is invoked only for NER, summary,
  importance, category/axis assignment, and alias proposal. Provider is
  selected via one env var; adapters are interchangeable behind the same
  Zod-validated contract.
- **Alternatives.** LangChain or LlamaIndex (opaque, violates §5.2). A
  single-provider SDK wired directly into services (no switchability, no
  failover, no cache layer).
- **Trade-offs.** More adapter code to maintain; in return, full control
  over request shaping, validation, caching, and provider switching.

## ADR-2: Asynchronous analysis queue with durable pending (Principle 3, FR-2)

- **Context.** P3 keeps expensive work off the request path: HTTP handlers
  must not block on the LLM, and feed pulls must not stall on per-article
  analysis. A Redis flush must not strand work.
- **Decision.** Feed-pull inserts each article as `pending` and enqueues
  one `article.analyze` BullMQ job per article; the worker analyses and
  promotes to `ready`. Postgres `status` is the durable source of truth — a
  boot-time reconcile re-enqueues any pending row that is missing a live
  job. Categories, axes, digests, and regeneration all hand off to BullMQ
  the same way.
- **Alternatives.** Analyse inline inside the pull job (blocks the pull,
  opaque retries, one slow feed delays the rest). A custom `@Interval`
  DB-poller (we had this — invisible in Bull Board, reinvents backoff).
- **Trade-offs.** A Redis-backed queue plus DB status to keep in sync (the
  reconcile absorbs drift); in return, every attempt is visible in Bull
  Board and HTTP handlers stay sub-50ms even under load.

## ADR-3: LLM error handling: per-job retry, cross-provider failover, per-feed isolation (Principle 2)

- **Context.** P2 requires graceful degradation on LLM-provider failure
  (retry with backoff, or switch adapter, or mark `pending`); one dead
  feed must not halt the others; unrecoverable errors must be logged with
  structured context, never swallowed.
- **Decision.** Three layers. *(1)* Per-job retry: every `article.analyze`
  job retries with fixed backoff (`ANALYZE_MAX_ATTEMPTS`,
  `ANALYZE_BACKOFF_SECONDS`); the row lands at `status='failed'` only
  after the budget is spent and the retries are visible in Bull Board's
  `delayed` set. Each adapter's SDK client carries an explicit
  `LLM_TIMEOUT_MS` per-request timeout with `maxRetries: 0`, so a hung
  provider surfaces promptly (it can't hold an `LLM_CONCURRENCY` slot for
  the SDK's ~10-minute default) and this BullMQ layer — not the SDK — is
  the single retry authority. *(2)* Optional cross-provider failover: if
  `LLM_FALLBACK_PROVIDER` is set, the secondary adapter retries the call
  once after the primary's retries exhaust; both attempts persist their
  own `llm_calls` row and the fallback row carries `failover_reason`
  (`auth | rate_limit | network | timeout | invalid_response | unknown`).
  Cache writes use the responding provider, so cache hits work across
  providers. *(3)* Per-feed isolation: the pull worker wraps each item in
  a try/catch; a single feed that 4xx/5xxs marks itself `status='error'`
  with the error in `last_pull_error` and the loop continues to the next
  feed. Every error path emits a structured JSON log with `event`,
  `feedId` / `articleId`, `userId`, and the raw error message.
- **Alternatives.** Hand-rolled retry in the worker (reinvents BullMQ).
  Failover as a separate queue (extra moving part for a one-time
  fallback). Pulling all feeds in a single transaction (one failure
  aborts every feed).
- **Trade-offs.** Failover correctness depends on the fallback API key
  being valid at boot (a Zod check enforces this) and a row's eventual
  consistency between Bull state and DB status during reconcile. In
  return, a provider outage is opt-in survivable, a poisoned feed never
  poisons the rest, and every failure is auditable post hoc.

## ADR-4: Cost control: content-addressed cache + config_hash + pre-filter (FR-10)

- **Context.** FR-10 caps ≤1 LLM call per article in normal mode, mandates
  a content-hash cache, a concurrency cap, and telemetry, and forbids
  pre-filter and dedup from fanning out LLM calls.
- **Decision.** `llm_response_cache` keyed on `content_hash + config_hash +
  operation`, so a repeated body — or a reverted config — short-circuits
  before the model. The deterministic pre-filter and exact-dedup pipeline
  gate the queue so junk and duplicates never reach the LLM at all.
  `LLM_CONCURRENCY` caps parallelism; every call lands in `llm_calls` with
  tokens and latency and aggregates at `/telemetry` (token counts as the cost
  proxy; no USD figure).
- **Alternatives.** No cache (every re-pull or regen re-bills). Per-user
  cache only (identical configs across users wouldn't share). Cache by raw
  URL (would miss content-identical cross-source copies).
- **Trade-offs.** Correctness hinges on the `config_hash` covering every
  input the LLM actually sees; in return, regeneration after a config
  revert is effectively free and cross-source duplicates cost zero tokens.

## ADR-5: Entity dedup: LLM-emitted aliases + deterministic resolver (FR-6)

- **Context.** FR-6 must merge `Microsoft` / `MSFT` / `Microsoft Corp.` /
  Cyrillic spellings / `MS`-in-context into one entity with an alias set,
  without pairwise LLM comparison.
- **Decision.** The analysis call emits aliases alongside entities (no
  extra LLM call). `EntityResolver` normalises (NFKC + lowercase +
  Latin-suffix strip), then resolves in order: exact name → alias table →
  type-scoped likely-match (token-prefix shortcut OR Jaro-Winkler ≥ 0.95).
  A new row is inserted only when nothing matches. Aliases persist to
  `entity_alias` for future lookups.
- **Alternatives.** Pure string similarity (cannot separate `MSFT` ↔
  `Microsoft` from random near-misses without a threshold that also
  collapses unrelated names). Pairwise LLM dedup (O(n²) calls, breaks
  FR-10). Embeddings (extra infra and tokens for MVP scope).
- **Trade-offs.** Depends on the LLM proposing good aliases plus a tuned
  Jaro-Winkler threshold; in return, dedup costs zero extra LLM calls and
  is mostly deterministic and debuggable.

## ADR-6: NestJS over Directus for the backend

- **Context.** The spec offers NestJS or Directus. We need custom BullMQ
  workers, an LLM abstraction, SSE, auth guards, and a typed contract
  shared with the frontend.
- **Decision.** NestJS — DI + modules fit the worker/service/guard split,
  BullMQ integrates first-class, and the same Zod schemas in
  `packages/shared` give end-to-end types on both api and web.
- **Alternatives.** Directus — its headless-CMS / admin model fights the
  custom pipeline + queue + LLM-abstraction work; we would be working
  around it rather than with it.
- **Trade-offs.** More boilerplate than a batteries-included CMS; in
  return, no impedance mismatch with the async pipeline and every layer
  stays explainable on demand (§9.7).

## ADR-7: Semantic similarity via pgvector embeddings (FR-5 Could)

- **Context.** Exact dedup catches verbatim re-publications (URL +
  content-hash). It misses the more common case where two outlets cover
  the same event with different prose. FR-5's Could-tier extension asks
  for that. FR-10 explicitly forbids pairwise LLM dedup ("дедуплікація не
  повинна породжувати потік LLM-звернень"). Embeddings sidestep the
  prohibition: one cheap call per article, then deterministic kNN.
- **Decision.** Self-contained `SEMANTIC_SIMILARITY_*` config namespace
  (PROVIDER / MODEL / API_KEY / THRESHOLD / ENABLED), separate from
  `LLM_PROVIDER`. Off by default — opt-in via two env vars. When on, the
  `article.analyze` worker makes one extra call to OpenAI's
  `text-embedding-3-small` after the structured analysis succeeds; the
  resulting 1536-dim vector is persisted in a pgvector column
  (`articles.embedding`) with an HNSW cosine-distance index. A
  content-hash-keyed `embedding_cache` short-circuits repeat embeddings.
  `/articles/:id/related-semantic` runs `embedding <=> $1` kNN scoped to
  the user, filters by `SEMANTIC_SIMILARITY_THRESHOLD` (default 0.85),
  returns top-5. Lazy backfill: opening a pre-feature article enqueues an
  `embed.backfill` BullMQ job; `POST /articles/embed-backfill-mine`
  is the one-shot admin trigger.
- **Alternatives.** Bag-of-words / TF-IDF (poor recall for paraphrases).
  Pairwise LLM dedup (O(n²) calls, breaks FR-10). In-process
  sentence-BERT (extra ML infra). Reusing the LLM_* key (forced shared
  cost lens — rejected after user feedback in favour of self-contained
  config).
- **Trade-offs.** pgvector extension on Postgres (drop-in
  `pgvector/pgvector:pg16` image), ~10 KB per article of vector data,
  one extra provider dependency, and the FR-10 line drawn carefully —
  embeddings are vectorisation, recorded in the same `llm_calls` token
  telemetry as the semantic-LLM operations. In return, O(log n) semantic
  recall, zero cost when disabled, and a clean separation between
  deterministic exact dedup and probabilistic semantic similarity.

## ADR-8: Split `api` and `worker` into separate compose services sharing one image (Principle 3, FR-1)

- **Context.** §7's component diagram shows Workers as their own component, and
  P3 requires expensive work to stay off the request path. Running the BullMQ
  consumers in the same process as the HTTP server couples their failure domains
  (a fatal worker crash takes the API down) and lets background CPU contend with
  request handling.
- **Decision.** One backend image, two roles selected by the `APP_ROLE` env var
  (`all` | `api` | `worker`). The `api` compose service runs role `api` — HTTP +
  Bull Board + queue *producers*, and registers **no** consumers. The `worker`
  service runs role `worker` — the BullMQ `@Processor` consumers (`FeedPull`,
  `ArticleAnalyze`, `Regeneration`, `RetagArticle`, `DemoSeeder`, `DigestBuilder`,
  `EmbedBackfill`), the cron scheduler, and the startup reconcilers — with no
  HTTP socket. `WorkersModule` is a dynamic module (`forRoot(runWorkers)`) that
  contributes those providers only under `all` | `worker`, so the api can enqueue
  (producers live in the feature modules) without ever consuming → no
  double-processing. `docker compose` runs five services — `postgres`, `redis`,
  `api`, `worker`, `web` — with the api and worker sharing the same image via a
  YAML env anchor. The api owns migrations; the worker waits on an api
  healthcheck (port-open ⇒ migrated) before starting and skips migrate itself.
  Bull Board stays in the api (it only reads queue state from Redis). The
  default `APP_ROLE=all` keeps native `pnpm dev` a single process.
- **Alternatives.** A single in-process backend (the previous design) — simpler
  and one fewer container, but couples the crash domains and doesn't present a
  worker as its own runnable component. A dedicated worker-only Nest entrypoint
  module — more wiring than the role flag for no additional isolation.
- **Trade-offs.** One extra container and a healthcheck-gated startup ordering,
  versus: background load fully decoupled from HTTP (a worker crash no longer
  takes the API with it), workers independently scalable/restartable, and — via
  the role flag rather than a code fork — still one image, one DI graph, one
  config, and shared `packages/shared` types with zero duplication.

## ADR-9: Bull Board access: basic-auth as the gate, no per-user admin role (US-12, NFR-3)

- **Context.** US-12 wants Bull Board behind basic-auth from env, with the app
  showing an "Open queues" link "for admin". The app is flat multi-tenant —
  each user owns only their own data and there is no shared-admin or
  cross-tenant role anywhere in the schema or auth layer.
- **Decision.** Bull Board mounts at `/admin/queues`, gated by a constant-time
  HTTP basic-auth middleware (`BULL_BOARD_USER` / `BULL_BOARD_PASS`, both
  required at boot by the Zod env schema) applied before the route resolves and
  excluded from the global `api` prefix. The frontend surfaces the "Open queues"
  link to every authenticated user; **the credentials are the access boundary** —
  anyone without them hits the browser auth prompt and sees nothing.
- **Alternatives.** A per-user `isAdmin` flag gating the link — adds a role
  column, a migration, and an admin-provisioning story for one observability
  link the flat-tenant model otherwise never needs. Hiding the link entirely —
  worse operator DX and security-by-obscurity, since the route stays reachable.
- **Trade-offs.** The link is visible to users who can't open it (a cosmetic
  mismatch with the "for admin" wording). In return: no speculative role
  infrastructure, the security boundary is a real auth wall rather than a hidden
  UI element, and operators get queue visibility from a single env-configured
  credential pair.

## ADR-10: Heuristic pre-filter at ingest, not in the analyze worker (FR-2, FR-4, FR-10)

- **Context.** The FR-2 diagram draws the heuristic pre-filter *inside* the
  article-processing worker, after `load raw article`. FR-4 requires a
  deterministic pre-filter (length / emptiness / spam, env-tuned thresholds)
  whose rejects are stored `status='filtered'` and never sent to the LLM. FR-10
  names the pre-filter the "перша лінія економії" — junk must never reach the
  model. The diagram fixes the goal; FR-2 explicitly leaves the step *placement*
  to us ("відновити послідовність кроків і спроєктувати їхню реалізацію ваша
  задача").
- **Decision.** `runPreFilter` (`pre-filter.ts`) runs in the **feed-pull worker**
  (`feed-pull.worker.ts:284`), *before* the `article.analyze` job is enqueued. A
  rejected item is written `status='filtered'` with `filterReason` at pull time
  and never enters the analyze queue; only passing items become `pending` and get
  an analyze job. The analyze worker (`analyzePending`) therefore contains no
  pre-filter — by the time it runs, the row is already known-good.
- **Alternatives.** Pre-filter inside the analyze worker exactly as the diagram
  draws it: enqueue every article, load it, then maybe reject. It works, but
  spends a queue slot, a DB load, and a full job lifecycle on guaranteed junk.
- **Trade-offs.** The verdict is fixed at pull time, so changing a threshold
  (env) does not retroactively re-filter already-pulled rows — acceptable, since
  thresholds are set at deploy and a re-pull re-evaluates. The literal step order
  differs from the diagram. In return, junk costs zero queue / worker / LLM
  resources — the strongest reading of FR-10 — while the constraint the diagram
  actually encodes (filtered ⇒ `status='filtered'`, no LLM call) holds
  identically, and filtered rows stay queryable for the US-7 status filter.

## ADR-11: On-read graph projection, no materialized graph deltas (FR-2, FR-7, Principle 1, NFR-1)

- **Context.** The FR-2 diagram shows a "Graph Builder" that persists graph
  deltas (nodes / edges) after each analysis. FR-7 fixes the node/edge *shapes*
  and mandates filter-by-node-type-and-category, but not a storage form.
  Principle 1 lists "побудова графових структур з уже розмічених даних" as
  deterministic code. NFR-1 sizes the graph at ≤10 feeds per user and only
  requires it to render and filter without visible lag at that volume.
- **Decision.** No `graph_nodes` / `graph_edges` tables. The graph is a
  **read-time projection**: `GraphService.buildMine` (`graph.service.ts:55`)
  derives nodes (top-N entities by mention count plus their connected articles)
  and edges (`mentions` from `article_entity`; `co_mention` computed at request
  time via `buildCoMentionEdges`) directly from the already-marked-up `articles`
  + `article_entity` tables, scoped to the user and the active filters. The
  analyze worker persists only articles, entities, and `article_entity` (step 9
  of FR-2) — the graph falls out of those deterministically on demand.
- **Alternatives.** Materialized `graph_nodes` / `graph_edges` updated by a Graph
  Builder step after each analyze job (the literal diagram). It buys nothing at
  MVP scale and adds write-amplification on every analyze, a delta-sync invariant
  to keep correct, and an explicit rebuild path after axis regeneration and
  entity-dedup merges — all to cache a query that is already fast at ≤10 feeds.
- **Trade-offs.** Each `/graph` request recomputes the projection (bounded by a
  node cap + indexed mention joins, well under the NFR-1 bar at test volume), and
  the projection logic lives in the read path rather than a worker. In return:
  no graph state to keep in sync with articles / entities, regeneration and
  entity merges are reflected instantly with no rebuild step, and "the graph is a
  deterministic function of marked-up data" (P1) is enforced structurally rather
  than by a sync routine. If volume ever outgrew on-read, `buildMine` is already
  the materialisation function.

## Should / Could status (§9.5)

Honest snapshot of the optional tiers. The mandatory features are described
under "What the app does" above and verified against §4.1 / §9.4.

**Should (+10):**

- ✅ **LLM provider failover** — opt-in via `LLM_FALLBACK_PROVIDER`; one
  cross-provider retry after the primary's per-job retries exhaust; both
  attempts persist to `llm_calls` with `failover_reason`.
- ✅ **Period digests** — `/digests`; also a Must under §4.1.
- ✅ **LLM-telemetry aggregate view** — `/telemetry`, per
  `(operation, provider, model)` with token totals (cost proxy; no USD).
- ✅ **Extended graph filters** — time-window chip group **and** an
  entity-anchor search that re-roots the graph on a specific entity.
- ✅ **Meaningful unit tests on critical parts** — pure-function tests
  cover article dedup decision (6 branches), entity dedup, pre-filter,
  URL normalisation, and content hashing.

**Could (+10):**

- ✅ **Full-text article search** — Postgres `tsvector` + GIN, `ts_rank`
  ordering.
- ✅ **Visual graph clustering by category** — entity-node fill via a
  stable per-category palette; legend in the canvas footer.
- ✅ **Top entities / top categories for a period** — standalone
  `/dashboard` page with top-10 entities + top-5 categories + top-5
  feeds, scoped to the selected window. Zero LLM calls — pure SQL
  aggregations.
- ✅ **Graph export** — PNG / SVG snapshot (via `html-to-image`) and JSON
  dump (`GraphResponse` plus the active filter context as `meta`) from a
  filter-row Export menu on `/graph`.
- ✅ **Edge animation along timestamps** — opt-in `animate edges` checkbox in
  the `/graph` filter row sets `?animate=1` and turns on flowing dashes on
  `mentions` edges (article → entity, so the dash direction follows the
  article's `ts`). Co-mention edges stay static (symmetric). Auto-disables
  with a hint when more than 80 mentions edges are in view.
- ✅ **Semantic article similarity** — opt-in via
  `SEMANTIC_SIMILARITY_ENABLED=true` + `SEMANTIC_SIMILARITY_API_KEY`
  (OpenAI). `article.analyze` worker embeds each ready article via
  `text-embedding-3-small`; pgvector HNSW kNN powers a "Related
  (semantic)" section on `/articles/:id`. Threshold-gated (default 0.85
  cosine). See ADR-7.
- ❌ Timeline scrubber. Not built.

## Local development outside Docker

```bash
pnpm install
pnpm -F @intelligencehub/shared build   # api imports the built dist/
# Run Postgres + Redis (e.g. `docker compose up postgres redis -d`)
pnpm -F @intelligencehub/api dev        # http://localhost:3011
pnpm -F @intelligencehub/web dev        # http://localhost:5173
```
