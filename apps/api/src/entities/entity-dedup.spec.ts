import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import type { ExtractedEntity } from '@intelligencehub/shared';
import * as schema from '../db/schema';
import { EntityResolverService } from './entity-resolver.service';

/**
 * FR-6 end-to-end dedup test against a real Postgres.
 *
 * Asserts that the five surface forms the spec calls out — Microsoft / MSFT /
 * Microsoft Corp. / Майкрософт / MS — collapse to a SINGLE entity row through
 * the resolver's 4-step pipeline:
 *   - "Microsoft Corp." → suffix-strip → "microsoft" → step-1 exact match
 *   - "MSFT" / "MS" / "Майкрософт" → don't fuzzy-match "microsoft", so they
 *     arrive as LLM-emitted aliases on the first article and later resolve via
 *     step-2 alias lookup.
 *
 * (Майкрософт is the FR-6 spec's own Cyrillic example — the sole sanctioned use
 * of Cyrillic in this codebase.)
 *
 * Needs a DB; skips gracefully when DATABASE_URL is unset so a DB-less unit run
 * (e.g. CI without Postgres) doesn't fail. With the dev/test Postgres reachable
 * it runs for real, isolating in a throwaway user that is cascade-deleted after.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('FR-6 entity dedup (integration)', () => {
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let resolver: EntityResolverService;
  let userId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
    resolver = new EntityResolverService(db);

    // Throwaway, isolated user. entities.user_id → users.id ON DELETE CASCADE,
    // so deleting this user in afterAll removes every row the test created.
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `dedup-test+${randomUUID()}@example.com`,
        passwordHash: 'x',
        emailConfirmed: true,
      })
      .returning({ id: schema.users.id });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    await pool.end();
  });

  it('collapses Microsoft / MSFT / Microsoft Corp. / Майкрософт / MS to one entity', async () => {
    // Article 1 establishes the canonical entity and seeds the alias forms that
    // cannot be reached by exact/fuzzy matching.
    const forms: ExtractedEntity[] = [
      {
        canonicalName: 'Microsoft',
        type: 'company',
        aliases: ['MSFT', 'MS', 'Майкрософт'],
      },
      { canonicalName: 'Microsoft Corp.', type: 'company', aliases: [] },
      { canonicalName: 'MSFT', type: 'company', aliases: [] },
      { canonicalName: 'MS', type: 'company', aliases: [] },
      { canonicalName: 'Майкрософт', type: 'company', aliases: [] },
    ];

    const ids: string[] = [];
    for (const form of forms) {
      ids.push(await resolver.resolveOrInsertEntity(userId, form));
    }

    // Every form resolved to the same entity id.
    const unique = [...new Set(ids)];
    expect(unique).toHaveLength(1);

    // Exactly one entities row exists for this user, and its canonical name is
    // the first-seen form ("Microsoft"), not a later alias surface form.
    const rows = await db
      .select({
        id: schema.entities.id,
        canonicalName: schema.entities.canonicalName,
      })
      .from(schema.entities)
      .where(eq(schema.entities.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(unique[0]);
    expect(rows[0].canonicalName).toBe('Microsoft');

    // The alias forms were persisted (normalized) against that one entity.
    const aliasRows = await db
      .select({ aliasNormalized: schema.entityAlias.aliasNormalized })
      .from(schema.entityAlias)
      .where(eq(schema.entityAlias.entityId, unique[0]));
    const aliasSet = new Set(aliasRows.map((a) => a.aliasNormalized));
    expect(aliasSet.has('msft')).toBe(true);
    expect(aliasSet.has('ms')).toBe(true);
    expect(aliasSet.has('майкрософт')).toBe(true);
  });
});
