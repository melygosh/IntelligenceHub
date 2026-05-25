import { pgTable, uuid, text, boolean, timestamp, primaryKey, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailConfirmed: boolean('email_confirmed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const feeds = pgTable('feeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title'),
  status: text('status').notNull().default('active'),
  lastPullAt: timestamp('last_pull_at', { withTimezone: true }),
  lastPullError: text('last_pull_error'),
  pullIntervalSeconds: integer('pull_interval_seconds').notNull().default(900),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  feedId: uuid('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  importance: text('importance'),
  contentHash: text('content_hash'),
  status: text('status').notNull().default('ready'),
  filterReason: text('filter_reason'),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  configHash: text('config_hash'),
});

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    canonicalName: text('canonical_name').notNull(),
    type: text('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCanonicalUnique: uniqueIndex('entities_user_canonical_unique').on(t.userId, t.canonicalName),
  }),
);

export const articleEntity = pgTable(
  'article_entity',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.entityId] }),
  }),
);

export const entityAlias = pgTable(
  'entity_alias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
    aliasNormalized: text('alias_normalized').notNull(),
    aliasOriginal: text('alias_original').notNull(),
    source: text('source').notNull(), // 'llm' | 'normalization' | 'user'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAliasNormalizedUnique: uniqueIndex('entity_alias_user_normalized_unique').on(
      t.userId,
      t.aliasNormalized,
    ),
  }),
);

export type EntityAlias = typeof entityAlias.$inferSelect;
export type NewEntityAlias = typeof entityAlias.$inferInsert;

export const emailConfirmationToken = pgTable(
  'email_confirmation_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('email_confirmation_token_hash_unique').on(t.tokenHash),
  }),
);

export type EmailConfirmationToken = typeof emailConfirmationToken.$inferSelect;
export type NewEmailConfirmationToken = typeof emailConfirmationToken.$inferInsert;

export const category = pgTable(
  'category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userNameUnique: uniqueIndex('category_user_name_unique').on(t.userId, t.name),
  }),
);

export const axis = pgTable(
  'axis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userNameUnique: uniqueIndex('axis_user_name_unique').on(t.userId, t.name),
  }),
);

export const axisValue = pgTable(
  'axis_value',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    axisId: uuid('axis_id').notNull().references(() => axis.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    axisValueUnique: uniqueIndex('axis_value_axis_value_unique').on(t.axisId, t.value),
  }),
);

export const articleCategory = pgTable(
  'article_category',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => category.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.categoryId] }),
  }),
);

export const articleAxisValue = pgTable(
  'article_axis_value',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    axisId: uuid('axis_id').notNull().references(() => axis.id, { onDelete: 'cascade' }),
    axisValueId: uuid('axis_value_id').notNull().references(() => axisValue.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.axisId] }),
  }),
);

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type Axis = typeof axis.$inferSelect;
export type NewAxis = typeof axis.$inferInsert;
export type AxisValue = typeof axisValue.$inferSelect;
export type NewAxisValue = typeof axisValue.$inferInsert;

export const llmCalls = pgTable('llm_calls', {
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    pk: primaryKey({ columns: [t.contentHash, t.configHash] }),
  }),
);

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
