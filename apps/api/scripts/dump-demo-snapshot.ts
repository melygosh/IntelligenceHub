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
import { and, eq, inArray } from 'drizzle-orm';
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

// Hand-curated demo set: a coherent "US news week" — Trump-centric politics as a
// dense co-mention hub, plus elections / economy / a sports sidebar, and a couple
// of junk items to show importance grading. English-only (readable by anyone).
// Ordered high-importance first. Re-run after re-curating this list.
const CURATED_URLS = [
  // High
  'https://www.nytimes.com/2026/06/02/business/media/scott-pelley-cbs-bari-weiss.html',
  'https://thehill.com/homenews/campaign/5907672-trump-iowa-primary-loss',
  'https://www.nytimes.com/2026/06/02/us/politics/trump-irs-settlement.html',
  'https://www.nytimes.com/2026/06/03/us/politics/house-vote-trump-iran-war-powers.html',
  'https://www.nytimes.com/2026/06/02/us/politics/todd-blanche-house-hearing.html',
  'https://www.nytimes.com/2026/06/02/us/politics/supreme-court-alabama-congressional-map.html',
  'https://www.nytimes.com/2026/06/02/us/elections/new-mexico-democrat-governor-haaland.html',
  'https://www.nytimes.com/2026/06/03/business/trump-tariffs-force-labor.html',
  // Normal — politics / elections / economy
  'https://thehill.com/homenews/campaign/5907526-adam-hamawy-democratic-primary-new-jersey-house-race',
  'https://thehill.com/video-clips/5907518-watch-live-rubio-house-foreign-relations-committee-state-department-fiscal-2027-budget-iran-war-ebola',
  'https://thehill.com/video-clips/5907520-watch-live-scott-bessent-senate-hearing-treasury-budget-affordability-iran-war-gas-prices',
  'https://www.nytimes.com/2026/06/02/us/politics/platner-senate-democrats-washington-meeting.html',
  'https://thehill.com/homenews/campaign/5902998-scott-wiener-connie-chan-nancy-pelosi-house-seat',
  'https://www.nytimes.com/2026/06/03/business/iran-war-oecd-economy.html',
  'https://www.nytimes.com/2026/06/02/us/politics/trump-iran-strait-of-hormuz.html',
  // Sports sidebar
  'https://www.bbc.com/sport/cricket/articles/cx21wj02zmjo?at_medium=RSS&at_campaign=rss',
  'https://www.nytimes.com/2026/06/03/arts/music/nba-finals-music.html',
  'https://www.bbc.com/sport/tennis/articles/clypeq8ljp6o?at_medium=RSS&at_campaign=rss',
  // Junk (importance grading)
  'https://www.nytimes.com/2026/06/03/arts/television/late-night-trump-iran-war-negotiations.html',
  'https://thehill.com/opinion/campaign/5906021-partisan-divisions-america-250',
];

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

  // Pull the curated ready articles, then re-sort to the CURATED_URLS order
  // (high-importance first) since SQL won't preserve the list order.
  const fetched = await db
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
    .where(
      and(
        eq(articles.userId, user.id),
        eq(articles.status, 'ready'),
        inArray(articles.url, CURATED_URLS),
      ),
    );
  const articleRows = [...fetched].sort(
    (a, b) => CURATED_URLS.indexOf(a.url) - CURATED_URLS.indexOf(b.url),
  );

  if (articleRows.length === 0) {
    console.error('No ready articles found for this user.');
    process.exit(1);
  }
  const missing = CURATED_URLS.filter(
    (u) => !articleRows.some((a) => a.url === u),
  );
  if (missing.length > 0) {
    console.warn(`WARNING: ${missing.length} curated URLs not found:\n  ${missing.join('\n  ')}`);
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

  // Build the demo-data JSON. Originals anchor to the main feed; the first few
  // are syndicated to the two mirror feeds as duplicates to populate the
  // "N similar in other feeds" counter.
  const FEED_MAIN = 'demo://nyt-snapshot';
  const FEED_HILL = 'demo://thehill-snapshot';
  const FEED_BBC = 'demo://bbc-snapshot';

  const seed = {
    feeds: [
      {
        url: FEED_MAIN,
        title: 'The New York Times (demo snapshot)',
        iconUrl: 'https://www.nytimes.com/favicon.ico',
      },
      {
        url: FEED_HILL,
        title: 'The Hill (demo snapshot)',
        iconUrl: 'https://thehill.com/favicon.ico',
      },
      {
        url: FEED_BBC,
        title: 'BBC News (demo snapshot)',
        iconUrl: 'https://www.bbc.com/favicon.ico',
      },
    ],
    categories: ['Politics', 'Elections', 'Economy', 'Sports'],
    articles: [
      // Pass 1: all originals anchored to the main feed.
      ...articleRows.map((a) => ({
        feedUrl: FEED_MAIN,
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
        const mirrorFeed = i % 2 === 0 ? FEED_HILL : FEED_BBC;
        const mirrorTag = mirrorFeed === FEED_HILL ? 'thehill' : 'bbc';
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
