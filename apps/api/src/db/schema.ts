import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  primaryKey,
  integer,
  jsonb,
  uniqueIndex,
  index,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Postgres tsvector — Drizzle has no built-in helper; used by articles.searchVector
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// pgvector vector(1536) — semantic similarity embeddings (ADR-7).
// JS side is number[]; driver wire format is '[0.123,0.456,...]' text.
const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return '[' + value.join(',') + ']';
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value) as number[];
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailConfirmed: boolean('email_confirmed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const feeds = pgTable(
  'feeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    iconUrl: text('icon_url'),
    status: text('status').notNull().default('active'),
    // Consecutive failed pulls; reset to 0 on any success or manual re-activate.
    // When it crosses the give-up threshold the sweep auto-disables the feed.
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    lastPullAt: timestamp('last_pull_at', { withTimezone: true }),
    lastPullError: text('last_pull_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('feeds_user_idx').on(t.userId),
  }),
);

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable + ON DELETE SET NULL: deleting a feed source detaches its
    // articles (US-3) rather than destroying the pulled+analyzed history.
    // Orphaned rows survive; the read path falls back to an "unknown source"
    // label. Feed-pull always sets this on insert.
    feedId: uuid('feed_id').references(() => feeds.id, {
      onDelete: 'set null',
    }),
    url: text('url').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    importance: text('importance'),
    contentHash: text('content_hash'),
    status: text('status').notNull().default('ready'),
    filterReason: text('filter_reason'),
    ts: timestamp('ts', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    configHash: text('config_hash'),
    body: text('body'),
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))`,
    ),
    // Semantic-similarity embedding (ADR-7). Null when the feature is
    // disabled (no OpenAI key) or when the article hasn't been backfilled
    // yet — kNN queries skip null rows; UI section hides on null.
    embedding: vector1536('embedding'),
    duplicateOf: uuid('duplicate_of').references(
      (): AnyPgColumn => articles.id,
      {
        onDelete: 'set null',
      },
    ),
  },
  (t) => ({
    userTsIdx: index('articles_user_ts_idx').on(t.userId, t.ts.desc()),
    // The default list (status='ready' + ts DESC), its COUNT(*), and the
    // dashboard topFeeds/totalArticles all filter user_id + status and sort by
    // ts. Without status in the index they seq-scan the whole table (the
    // 'filtered' rows vastly outnumber 'ready'); this composite turns those into
    // index scans. Superset of userTsIdx for those access paths.
    userStatusTsIdx: index('articles_user_status_ts_idx').on(
      t.userId,
      t.status,
      t.ts.desc(),
    ),
    feedIdx: index('articles_feed_idx').on(t.feedId),
    userContentHashIdx: index('articles_user_contenthash_idx').on(
      t.userId,
      t.contentHash,
    ),
    userUrlIdx: index('articles_user_url_idx').on(t.userId, t.url),
    // duplicate_of is an FK with ON DELETE SET NULL. Postgres does NOT auto-index
    // FK columns, so the SET-NULL action seq-scanned the whole table on every
    // article/feed delete. Partial: only the handful of duplicate rows are
    // non-null, so the index stays tiny.
    duplicateOfIdx: index('articles_duplicate_of_idx')
      .on(t.duplicateOf)
      .where(sql`${t.duplicateOf} is not null`),
    searchVectorIdx: index('articles_search_vector_idx').using(
      'gin',
      t.searchVector,
    ),
  }),
);

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    canonicalName: text('canonical_name').notNull(),
    type: text('type').notNull(),
    // FR-6 / US-10: short LLM-generated description, set on first-seen.
    // Nullable — most rows pre-dating this column stay null until a
    // regeneration cache-misses and re-runs the LLM.
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userCanonicalUnique: uniqueIndex('entities_user_canonical_unique').on(
      t.userId,
      t.canonicalName,
    ),
    userTypeIdx: index('entities_user_type_idx').on(t.userId, t.type),
  }),
);

export const articleEntity = pgTable(
  'article_entity',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.entityId] }),
    entityIdx: index('article_entity_entity_idx').on(t.entityId),
  }),
);

export const entityAlias = pgTable(
  'entity_alias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    aliasNormalized: text('alias_normalized').notNull(),
    aliasOriginal: text('alias_original').notNull(),
    source: text('source').notNull(), // 'llm' | 'normalization' | 'user'
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userAliasNormalizedUnique: uniqueIndex(
      'entity_alias_user_normalized_unique',
    ).on(t.userId, t.aliasNormalized),
  }),
);

export type EntityAlias = typeof entityAlias.$inferSelect;
export type NewEntityAlias = typeof entityAlias.$inferInsert;

export const emailConfirmationToken = pgTable(
  'email_confirmation_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('email_confirmation_token_hash_unique').on(
      t.tokenHash,
    ),
  }),
);

export type EmailConfirmationToken = typeof emailConfirmationToken.$inferSelect;
export type NewEmailConfirmationToken =
  typeof emailConfirmationToken.$inferInsert;

export const category = pgTable(
  'category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userNameUnique: uniqueIndex('category_user_name_unique').on(
      t.userId,
      t.name,
    ),
  }),
);

export const axis = pgTable(
  'axis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userNameUnique: uniqueIndex('axis_user_name_unique').on(t.userId, t.name),
  }),
);

export const axisValue = pgTable(
  'axis_value',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    axisId: uuid('axis_id')
      .notNull()
      .references(() => axis.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    axisValueUnique: uniqueIndex('axis_value_axis_value_unique').on(
      t.axisId,
      t.value,
    ),
    axisIdx: index('axis_value_axis_idx').on(t.axisId),
  }),
);

export const articleCategory = pgTable(
  'article_category',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.categoryId] }),
    categoryIdx: index('article_category_category_idx').on(t.categoryId),
  }),
);

export const articleAxisValue = pgTable(
  'article_axis_value',
  {
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    axisId: uuid('axis_id')
      .notNull()
      .references(() => axis.id, { onDelete: 'cascade' }),
    axisValueId: uuid('axis_value_id')
      .notNull()
      .references(() => axisValue.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.axisId] }),
    axisIdx: index('article_axis_value_axis_idx').on(t.axisId),
    // axis_value_id is an FK with ON DELETE CASCADE but was unindexed, so
    // deleting an axis value seq-scanned this join table. (article_id/axis_id
    // are covered by the PK; axis_id by axisIdx — this was the one FK gap.)
    axisValueIdx: index('article_axis_value_value_idx').on(t.axisValueId),
  }),
);

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Axis = typeof axis.$inferSelect;
export type NewAxis = typeof axis.$inferInsert;
export type AxisValue = typeof axisValue.$inferSelect;
export type NewAxisValue = typeof axisValue.$inferInsert;

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    articleId: uuid('article_id').references(() => articles.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    status: text('status').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    errorMessage: text('error_message'),
    failoverReason: text('failover_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    articleStatusIdx: index('llm_calls_article_status_idx').on(
      t.articleId,
      t.status,
    ),
    // Telemetry dashboard aggregates per user over a time window; this is the
    // highest-volume table (one row per LLM call), so support those scans.
    userCreatedIdx: index('llm_calls_user_created_idx').on(
      t.userId,
      t.createdAt,
    ),
  }),
);

export const llmResponseCache = pgTable(
  'llm_response_cache',
  {
    contentHash: text('content_hash').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    responseJson: jsonb('response_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    configHash: text('config_hash').notNull().default(''),
  },
  (t) => ({
    // PK must match the full read/write key — read() filters all five columns.
    // The narrower (contentHash, configHash) PK let onConflictDoNothing silently
    // drop a write whose provider/model/operation differed from an existing row
    // for the same content+config: a cache-miss-forever cost leak after a
    // provider or model switch. Widen so each distinct tuple caches its own row.
    pk: primaryKey({
      columns: [t.contentHash, t.provider, t.model, t.operation, t.configHash],
    }),
  }),
);

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;

export const regenerationRun = pgTable('regeneration_run', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'running' | 'completed' | 'failed'
  configHash: text('config_hash').notNull(),
  articlesTotal: integer('articles_total').notNull().default(0),
  articlesProcessed: integer('articles_processed').notNull().default(0),
  articlesCacheHit: integer('articles_cache_hit').notNull().default(0),
  articlesLlmCalled: integer('articles_llm_called').notNull().default(0),
  articlesErrored: integer('articles_errored').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  errorMessage: text('error_message'),
});

export type RegenerationRun = typeof regenerationRun.$inferSelect;
export type NewRegenerationRun = typeof regenerationRun.$inferInsert;

export const digestRun = pgTable(
  'digest_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // 'day' | 'week' | 'month'
    scopeKind: text('scope_kind').notNull(), // 'category' | 'entity'
    scopeFilterIds: jsonb('scope_filter_ids')
      .notNull()
      .default([] as string[]),
    windowFrom: timestamp('window_from', { withTimezone: true }).notNull(),
    windowTo: timestamp('window_to', { withTimezone: true }).notNull(),
    status: text('status').notNull(), // 'building' | 'ready' | 'failed'
    title: text('title'), // short LLM-generated headline (5-9 words); null until ready
    summary: text('summary'), // JSON.stringify(paragraph[]); null until ready
    topEntitiesJson: jsonb('top_entities_json'),
    topCategoriesJson: jsonb('top_categories_json'),
    keyArticlesJson: jsonb('key_articles_json'),
    articleCount: integer('article_count').notNull().default(0),
    entityCount: integer('entity_count').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    model: text('model'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    userCreatedIdx: index('digest_run_user_created_idx').on(
      t.userId,
      t.createdAt.desc(),
    ),
  }),
);

export type DigestRun = typeof digestRun.$inferSelect;
export type NewDigestRun = typeof digestRun.$inferInsert;

// Content-hash-keyed embedding cache (ADR-7). A repeated article body
// short-circuits the OpenAI embedding call — same pattern as
// llm_response_cache, separate table because the value type is vector,
// not text. Not user-scoped: same content hash → same embedding.
export const embeddingCache = pgTable('embedding_cache', {
  contentHash: text('content_hash').primaryKey(),
  embedding: vector1536('embedding').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type EmbeddingCache = typeof embeddingCache.$inferSelect;
