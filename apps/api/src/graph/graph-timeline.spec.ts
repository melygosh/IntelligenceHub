import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { GraphService } from './graph.service';

/**
 * Real-Postgres integration test for the bucketed co-mention query
 * (FR-7 timeline mode). Validates empirically that the timeline branch of
 * GraphService.buildCoMentionEdges:
 *   - sums per-bucket counts back to the edge weight, and
 *   - emits buckets ONLY when timeline mode is requested.
 *
 * Two 'ready' articles on different days in the same month each link BOTH
 * entities, so Alpha–Beta is co-mentioned twice (weight 2). With period='all'
 * the window is open-ended → monthly buckets (pickGranularity(null)='month'),
 * so both January articles fall in a single bucket.
 *
 * Mirrors entity-dedup.spec.ts: isolates in a throwaway user that is
 * cascade-deleted in afterAll, and skips gracefully when DATABASE_URL is unset
 * so a DB-less unit run doesn't fail. The GraphService constructor only needs a
 * Db, so we `new` it directly with the drizzle instance (NestJS DI bypassed).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('graph timeline buckets (integration)', () => {
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let svc: GraphService;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
    // GraphService only consumes a Db; constructing directly bypasses DI.
    svc = new GraphService(db as unknown as never);

    // Throwaway, isolated user. Every other table the test touches references
    // users.id ON DELETE CASCADE, so deleting this user in afterAll cleans up.
    const [u] = await db
      .insert(schema.users)
      .values({
        email: `gtl+${randomUUID()}@example.com`,
        passwordHash: 'x',
        emailConfirmed: true,
      })
      .returning({ id: schema.users.id });
    userId = u.id;

    const [e1] = await db
      .insert(schema.entities)
      .values({ userId, canonicalName: 'Alpha', type: 'company' })
      .returning({ id: schema.entities.id });
    const [e2] = await db
      .insert(schema.entities)
      .values({ userId, canonicalName: 'Beta', type: 'company' })
      .returning({ id: schema.entities.id });

    const mk = async (tsIso: string) => {
      const [a] = await db
        .insert(schema.articles)
        .values({
          userId,
          title: 't',
          url: `https://x/${randomUUID()}`,
          contentHash: randomUUID(),
          status: 'ready',
          ts: new Date(tsIso),
        })
        .returning({ id: schema.articles.id });
      await db.insert(schema.articleEntity).values([
        { articleId: a.id, entityId: e1.id },
        { articleId: a.id, entityId: e2.id },
      ]);
    };
    await mk('2026-01-01T00:00:00Z');
    await mk('2026-01-03T00:00:00Z');
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    await pool.end();
  });

  it('returns co-mention buckets whose counts sum to the edge weight', async () => {
    const res = await svc.buildMine(userId, {
      period: 'all',
      top: 20,
      categoryIds: [],
      timeline: true,
    });
    const co = res.edges.filter((e) => e.kind === 'co_mention');
    expect(co.length).toBe(1);
    const edge = co[0];
    expect(edge.weight).toBe(2);
    expect(edge.buckets).toBeDefined();
    const sum = edge.buckets!.reduce((s, b) => s + b.count, 0);
    expect(sum).toBe(edge.weight);
    // period='all' → monthly buckets; both Jan articles land in one bucket.
    expect(edge.buckets!.length).toBe(1);
  });

  it('omits buckets when timeline is not requested', async () => {
    const res = await svc.buildMine(userId, {
      period: 'all',
      top: 20,
      categoryIds: [],
    });
    const co = res.edges.find((e) => e.kind === 'co_mention');
    expect(co?.buckets).toBeUndefined();
  });
});
