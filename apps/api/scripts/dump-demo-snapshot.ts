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

// Hand-curated demo set sourced from FULL-TEXT feeds (The Intercept, The Verge,
// Ars Technica) so every article carries a realistic multi-paragraph body — not
// the 100-400 char RSS teasers the major-wire feeds ship. A coherent recent news
// window: investigative US politics / elections / economy (dense co-mention hub
// around Trump, ICE, Israel, the Democrats) bridging into a technology cluster
// (AI, chips, surveillance) via shared entities. English-only (readable by
// anyone). Ordered high-importance first. Re-run after re-curating this list.
const CURATED_URLS = [
  // High — investigative politics / elections / economy (The Intercept, full text)
  'https://theintercept.com/2026/05/28/israeli-government-money-brad-parsc',
  'https://theintercept.com/2026/06/02/new-jersey-primary-results-adam-hamawy',
  'https://theintercept.com/2026/05/28/graham-platner-jake-auchincloss-democrats-maine-senate',
  'https://theintercept.com/2026/05/27/trump-donroe-doctrine-violence-western-hemisphere-cartels',
  'https://theintercept.com/2026/06/03/california-house-results-chakrabarti-wiener-gomez-gonzales-torres',
  'https://theintercept.com/2026/05/26/us-iran-war-casualties-ceasefire',
  'https://theintercept.com/2026/06/02/la-tilde-propaganda-latin-america-pentagon',
  'https://theintercept.com/2026/06/01/dinapoli-new-york-comptroller-israel-trip-primary',
  'https://theintercept.com/2026/05/28/garden-grove-california-chemical-leak-f-35-israel',
  // High — technology (The Verge / Ars Technica, full text)
  'https://www.theverge.com/tech/942588/nvidia-rtx-spark-n2x-n3x-r2-d2-star-trek-star-wars-plan',
  'https://arstechnica.com/tech-policy/2026/06/google-ordered-to-put-clearer-links-in-ai-search-and-let-uk-publishers-opt-out',
  'https://arstechnica.com/science/2026/06/judge-blocks-part-of-trump-admins-effort-to-hurt-colorado-research-center',
  'https://arstechnica.com/tech-policy/2026/06/amazon-owned-ring-should-pay-americans-for-scanning-their-faces-lawsuit-says',
  // Normal — politics / technology
  'https://theintercept.com/2026/05/27/sunrise-movement-endorses-saikat-chakrabarti-congress-california',
  'https://arstechnica.com/gadgets/2026/06/microsoft-plans-linux-tools-and-an-rtx-spark-desktop-for-windows-developers',
  'https://arstechnica.com/tech-policy/2026/06/trumps-ai-executive-order-may-not-prevent-dangerous-deployments',
  'https://arstechnica.com/ai/2026/06/inside-metas-attempts-to-play-catch-up-with-ai',
  'https://www.theverge.com/ai-artificial-intelligence/942629/as-ai-gets-better-it-reveals-an-empty-promise',
];

// Synthetic source feeds (one per real outlet) + a newswire that carries the
// syndicated duplicates so the "N similar in other feeds" counter is populated.
const FEED_INTERCEPT = 'demo://intercept-snapshot';
const FEED_VERGE = 'demo://theverge-snapshot';
const FEED_ARS = 'demo://arstechnica-snapshot';
const FEED_WIRE = 'demo://newswire-snapshot';

// Map each curated article to the synthetic source feed it anchors to, by host.
function sourceFeedFor(url: string): string {
  if (url.includes('theintercept.com')) return FEED_INTERCEPT;
  if (url.includes('theverge.com')) return FEED_VERGE;
  if (url.includes('arstechnica.com')) return FEED_ARS;
  throw new Error(`No source-feed mapping for ${url}`);
}

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

  // Build the demo-data JSON. Each original anchors to its real source feed
  // (Intercept / Verge / Ars); the first few are syndicated to a generic
  // newswire feed as exact duplicates to populate the "N similar in other
  // feeds" counter (wire services routinely re-run outlet stories).
  const seed = {
    feeds: [
      {
        url: FEED_INTERCEPT,
        title: 'The Intercept (demo snapshot)',
        iconUrl: 'https://theintercept.com/favicon.ico',
      },
      {
        url: FEED_VERGE,
        title: 'The Verge (demo snapshot)',
        iconUrl: 'https://www.theverge.com/favicon.ico',
      },
      {
        url: FEED_ARS,
        title: 'Ars Technica (demo snapshot)',
        iconUrl: 'https://arstechnica.com/favicon.ico',
      },
      {
        url: FEED_WIRE,
        title: 'Global Newswire (demo snapshot)',
      },
    ],
    categories: ['Politics', 'Elections', 'Economy', 'Technology'],
    articles: [
      // Pass 1: each original anchored to its real source feed.
      ...articleRows.map((a) => ({
        feedUrl: sourceFeedFor(a.url),
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
      // Pass 2: duplicates — syndicate the first 6 articles to the newswire
      // feed with a URL variant so they're distinguishable while still
      // sharing content_hash (which is what triggers the similar match).
      ...articleRows.slice(0, 6).map((a) => ({
        feedUrl: FEED_WIRE,
        url: a.url + (a.url.includes('?') ? '&' : '?') + 'utm_source=newswire',
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
      })),
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
