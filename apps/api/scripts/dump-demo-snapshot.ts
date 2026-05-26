/**
 * Throwaway one-off script. NOT in the runtime path.
 *
 * Usage:
 *   cd apps/api
 *   tsx scripts/dump-demo-snapshot.ts <source-user-email>
 *
 * Reads the source user's articles + entities + categories + axes from
 * the dev DB, projects to the DemoSeedData JSON shape, writes
 * apps/api/src/seed/demo-data.json. Synthesizes 3 demo feeds + cross-feed
 * duplicates to populate the "N similar in other feeds" counter.
 *
 * Re-run this script whenever the static demo-data.json needs a refresh.
 */
import { config as dotenvConfig } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// .env lives at the repo root; tsx may be invoked from apps/api.
dotenvConfig({ path: join(__dirname, '..', '..', '..', '.env') });
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  articleAxisValue,
  articleCategory,
  articleEntity,
  articles,
  axis,
  axisValue,
  category,
  entities,
  entityAlias,
  users,
} from '../src/db/schema';
import { loadEnv } from '../src/common/config/env';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx scripts/dump-demo-snapshot.ts <source-user-email>');
    process.exit(1);
  }

  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  // Pull ready articles with their projected fields.
  const articleRows = await db
    .select({
      id: articles.id,
      url: articles.url,
      title: articles.title,
      body: articles.body,
      contentHash: articles.contentHash,
      ts: articles.ts,
      summary: articles.summary,
      importance: articles.importance,
    })
    .from(articles)
    .where(and(eq(articles.userId, user.id), eq(articles.status, 'ready')))
    .orderBy(desc(articles.ts))
    .limit(20);

  if (articleRows.length === 0) {
    console.error('No ready articles found for this user.');
    process.exit(1);
  }

  const articleIds = articleRows.map((a) => a.id);

  // Pull entities per article (with aliases).
  const entityRows = await db
    .select({
      articleId: articleEntity.articleId,
      entityId: entities.id,
      canonicalName: entities.canonicalName,
      type: entities.type,
    })
    .from(articleEntity)
    .innerJoin(entities, eq(entities.id, articleEntity.entityId))
    .where(inArray(articleEntity.articleId, articleIds));

  const aliasRows = await db
    .select({
      entityId: entityAlias.entityId,
      aliasOriginal: entityAlias.aliasOriginal,
    })
    .from(entityAlias)
    .where(
      and(
        eq(entityAlias.userId, user.id),
        inArray(
          entityAlias.entityId,
          entityRows.map((e) => e.entityId),
        ),
      ),
    );
  const aliasesByEntity = new Map<string, string[]>();
  for (const a of aliasRows) {
    const list = aliasesByEntity.get(a.entityId) ?? [];
    list.push(a.aliasOriginal);
    aliasesByEntity.set(a.entityId, list);
  }

  // Group entities by article.
  const entitiesByArticle = new Map<
    string,
    Array<{ canonicalName: string; type: string; aliases: string[] }>
  >();
  for (const e of entityRows) {
    const list = entitiesByArticle.get(e.articleId) ?? [];
    list.push({
      canonicalName: e.canonicalName,
      type: e.type,
      aliases: aliasesByEntity.get(e.entityId) ?? [],
    });
    entitiesByArticle.set(e.articleId, list);
  }

  // Pull category names per article (these may be empty for a fresh user
  // who hasn't created categories — Step 3 hand-curates them later).
  const catRows = await db
    .select({ articleId: articleCategory.articleId, name: category.name })
    .from(articleCategory)
    .innerJoin(category, eq(category.id, articleCategory.categoryId))
    .where(inArray(articleCategory.articleId, articleIds));
  const categoriesByArticle = new Map<string, string[]>();
  for (const c of catRows) {
    const list = categoriesByArticle.get(c.articleId) ?? [];
    list.push(c.name);
    categoriesByArticle.set(c.articleId, list);
  }

  // Pull axis assignments per article.
  const axisRows = await db
    .select({
      articleId: articleAxisValue.articleId,
      axisName: axis.name,
      value: axisValue.value,
    })
    .from(articleAxisValue)
    .innerJoin(axis, eq(axis.id, articleAxisValue.axisId))
    .innerJoin(axisValue, eq(axisValue.id, articleAxisValue.axisValueId))
    .where(inArray(articleAxisValue.articleId, articleIds));
  const axesByArticle = new Map<
    string,
    Array<{ axisName: string; value: string }>
  >();
  for (const a of axisRows) {
    const list = axesByArticle.get(a.articleId) ?? [];
    list.push({ axisName: a.axisName, value: a.value });
    axesByArticle.set(a.articleId, list);
  }

  // Build the demo-data JSON.
  const HN_FEED = 'demo://hn-snapshot';
  const TECHCRUNCH_FEED = 'demo://techcrunch-mirror';
  const VERGE_FEED = 'demo://verge-mirror';

  const seed = {
    feeds: [
      { url: HN_FEED, title: 'Hacker News (demo snapshot)' },
      { url: TECHCRUNCH_FEED, title: 'TechCrunch (demo snapshot)' },
      { url: VERGE_FEED, title: 'The Verge (demo snapshot)' },
    ],
    // Hand-curated category set (Step 3 below also re-tags articles).
    categories: ['AI infra', 'Web dev', 'Hardware', 'Crypto regulation', 'DevTools'],
    articles: [
      // Pass 1: all 20 originals anchored to the HN feed.
      ...articleRows.map((a) => ({
        feedUrl: HN_FEED,
        url: a.url,
        title: a.title,
        body: a.body,
        contentHash: a.contentHash,
        ts: a.ts.toISOString(),
        summary: a.summary,
        importance: a.importance as 'high' | 'normal' | 'junk' | null,
        entities: entitiesByArticle.get(a.id) ?? [],
        categoryNames: categoriesByArticle.get(a.id) ?? [],
        axisAssignments: axesByArticle.get(a.id) ?? [],
      })),
      // Pass 2: duplicates — pick the first 7 articles, syndicate them
      // to alternating TechCrunch / Verge feeds with URL variants so
      // they're distinguishable while still sharing content_hash.
      ...articleRows.slice(0, 7).flatMap((a, i) => {
        const mirrorFeed = i % 2 === 0 ? TECHCRUNCH_FEED : VERGE_FEED;
        const mirrorTag = mirrorFeed === TECHCRUNCH_FEED ? 'techcrunch' : 'verge';
        return [
          {
            feedUrl: mirrorFeed,
            url: a.url + (a.url.includes('?') ? '&' : '?') + `utm_source=${mirrorTag}`,
            title: a.title,
            body: a.body,
            contentHash: a.contentHash, // same content_hash → triggers similar match
            ts: new Date(a.ts.getTime() + 60_000).toISOString(), // +1 min, sorts after original
            summary: null, // duplicates don't carry LLM output (they're status='duplicate', not 'ready')
            importance: null,
            entities: [], // duplicates not LLM-processed
            categoryNames: [],
            axisAssignments: [],
            duplicateOfUrl: a.url, // resolved during seedFor's pass 2
          },
        ];
      }),
    ],
  };

  const outPath = join(__dirname, '..', 'src', 'seed', 'demo-data.json');
  writeFileSync(outPath, JSON.stringify(seed, null, 2));
  console.log(
    `Wrote ${outPath}: ${seed.feeds.length} feeds, ${seed.articles.length} articles (${articleRows.length} ready + ${seed.articles.length - articleRows.length} duplicate).`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
