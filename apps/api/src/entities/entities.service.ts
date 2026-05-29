import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { articleEntity, articles, entities, entityAlias } from '../db/schema';
import type {
  EntityDetail,
  EntityKind,
  EntityListItem,
  EntitySort,
  MentioningArticleSummary,
  RelatedEntitySummary,
  TimelineBucket,
} from '@intelligencehub/shared';

@Injectable()
export class EntitiesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Entity directory list. Powers both the /entities page (full, filterable)
   * and the digest form's by-entity picker (no args → `recent`, capped at 40).
   *
   * Filters: `type` (entity kind), `q` (ILIKE on canonical name OR any alias).
   * Sort: `recent` (last mention), `mentions` (count), `name` (alphabetical).
   * `limit` is clamped to [1, 500] so the picker stays small and the directory
   * never returns an unbounded set.
   */
  async list(
    userId: string,
    opts: {
      type?: EntityKind;
      q?: string;
      sort?: EntitySort;
      offset?: number;
      limit?: number;
    } = {},
  ): Promise<{ items: EntityListItem[]; total: number }> {
    const sort: EntitySort = opts.sort ?? 'recent';
    // Limit is the page size when paginating; default 40 preserves the
    // pre-pagination cap for unspecified callers. The hard ceiling of 500
    // mirrors MAX_PAGE_SIZE in @intelligencehub/shared.
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);

    const conds = [
      sql`e.user_id = ${userId}`,
      sql`a.user_id = ${userId}`,
      sql`a.status = 'ready'`,
    ];
    if (opts.type) conds.push(sql`e.type = ${opts.type}`);
    const q = opts.q?.trim();
    if (q) {
      const pattern = `%${q}%`;
      conds.push(sql`(
        e.canonical_name ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM entity_alias ea
          WHERE ea.entity_id = e.id AND ea.alias_original ILIKE ${pattern}
        )
      )`);
    }

    const orderBy =
      sort === 'name'
        ? sql`e.canonical_name ASC`
        : sort === 'mentions'
          ? sql`COUNT(*) DESC, MAX(a.ts) DESC`
          : sql`MAX(a.ts) DESC, COUNT(*) DESC`;

    // Count of distinct entities under the same filter — feeds the pagination
    // envelope. Cheaper than COUNT(DISTINCT e.id) on the joined set because
    // the existing JOIN + WHERE doesn't carry duplicates of e.id past the
    // GROUP BY, so DISTINCT on the join lets the planner skip hashing every
    // mention row.
    const countResult = await this.db.execute<{ total: number }>(sql`
      SELECT COUNT(DISTINCT e.id)::int AS total
      FROM article_entity ae
      JOIN entities e ON e.id = ae.entity_id
      JOIN articles a ON a.id = ae.article_id
      WHERE ${sql.join(conds, sql` AND `)}
    `);
    const total =
      (countResult as unknown as { rows: Array<{ total: number }> }).rows[0]
        ?.total ?? 0;

    const result = await this.db.execute<{
      id: string;
      canonical_name: string;
      type: string;
      mention_count: number;
      first_seen_ts: string;
      last_seen_ts: string;
    }>(sql`
      SELECT e.id,
             e.canonical_name,
             e.type,
             COUNT(*)::int AS mention_count,
             MIN(a.ts)     AS first_seen_ts,
             MAX(a.ts)     AS last_seen_ts
      FROM article_entity ae
      JOIN entities e ON e.id = ae.entity_id
      JOIN articles a ON a.id = ae.article_id
      WHERE ${sql.join(conds, sql` AND `)}
      GROUP BY e.id, e.canonical_name, e.type
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string;
          canonical_name: string;
          type: string;
          mention_count: number;
          first_seen_ts: string;
          last_seen_ts: string;
        }>;
      }
    ).rows;
    const items: EntityListItem[] = rows.map((r) => ({
      id: r.id,
      canonicalName: r.canonical_name,
      type: r.type as EntityKind,
      mentionCount: r.mention_count,
      firstSeenTs: r.first_seen_ts
        ? new Date(r.first_seen_ts).toISOString()
        : null,
      lastSeenTs: r.last_seen_ts
        ? new Date(r.last_seen_ts).toISOString()
        : null,
    }));
    return { items, total };
  }

  async getById(id: string, userId: string): Promise<EntityDetail | null> {
    const [e] = await this.db
      .select({
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(entities)
      .where(and(eq(entities.id, id), eq(entities.userId, userId)))
      .limit(1);
    if (!e) return null;

    const aliasRows = await this.db
      .select({ aliasOriginal: entityAlias.aliasOriginal })
      .from(entityAlias)
      .where(and(eq(entityAlias.userId, userId), eq(entityAlias.entityId, id)));

    // Mentioning articles, ordered most-recent first.
    // Restricted to status='ready' — duplicates don't appear separately here
    // (the user opens the original).
    const mentioningRows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        ts: articles.ts,
        importance: articles.importance,
      })
      .from(articleEntity)
      .innerJoin(articles, eq(articles.id, articleEntity.articleId))
      .where(
        and(
          eq(articleEntity.entityId, id),
          eq(articles.userId, userId),
          eq(articles.status, 'ready'),
        ),
      )
      .orderBy(desc(articles.ts));

    const mentionCount = mentioningRows.length;
    const lastSeenTs = mentioningRows[0]?.ts.toISOString() ?? null;
    const firstSeenTs = mentioningRows.at(-1)?.ts.toISOString() ?? null;

    const relatedEntities = await this.relatedFor(userId, id);
    const timelineBuckets = await this.timelineFor(userId, id);

    return {
      id: e.id,
      canonicalName: e.canonicalName,
      type: e.type as EntityKind,
      aliases: aliasRows.map((a) => a.aliasOriginal),
      mentionCount,
      firstSeenTs,
      lastSeenTs,
      mentioningArticles: mentioningRows.map(
        (m): MentioningArticleSummary => ({
          id: m.id,
          title: m.title,
          ts: m.ts.toISOString(),
          importance: m.importance as MentioningArticleSummary['importance'],
        }),
      ),
      relatedEntities,
      timelineBuckets,
    };
  }

  /**
   * Top-20 entities most often co-mentioned with the target entity. Same
   * self-join shape as Day 9's GraphService.buildCoMentionEdges, but narrowed
   * to one entity. Backed by article_entity_entity_idx from migration 0009.
   */
  private async relatedFor(
    userId: string,
    entityId: string,
  ): Promise<RelatedEntitySummary[]> {
    // Asymmetric self-join: anchor ae1 on the target entity, read other_id
    // from ae2. Each unordered pair {target, other} appears exactly once
    // per shared article — weight here matches the count Day 9's
    // GraphService.buildCoMentionEdges produces for the same pair.
    const pairResult = await this.db.execute<{
      other_id: string;
      weight: number;
    }>(sql`
      SELECT
        ae2.entity_id AS other_id,
        COUNT(*)::int AS weight
      FROM article_entity ae1
      JOIN article_entity ae2 ON ae1.article_id = ae2.article_id
      JOIN articles a ON a.id = ae1.article_id AND a.user_id = ${userId} AND a.status = 'ready'
      WHERE ae1.entity_id = ${entityId}
        AND ae2.entity_id <> ${entityId}
      GROUP BY ae2.entity_id
      ORDER BY weight DESC
      LIMIT 20
    `);
    const pairs = (
      pairResult as unknown as {
        rows: Array<{ other_id: string; weight: number }>;
      }
    ).rows;
    if (pairs.length === 0) return [];

    const otherIds = pairs.map((p) => p.other_id);
    const entityRows = await this.db
      .select({
        id: entities.id,
        canonicalName: entities.canonicalName,
        type: entities.type,
      })
      .from(entities)
      .where(and(eq(entities.userId, userId), inArray(entities.id, otherIds)));

    const byId = new Map(entityRows.map((r) => [r.id, r]));
    return pairs
      .map((p): RelatedEntitySummary | null => {
        const ent = byId.get(p.other_id);
        if (!ent) return null;
        return {
          id: ent.id,
          canonicalName: ent.canonicalName,
          type: ent.type as EntityKind,
          weight: p.weight,
        };
      })
      .filter((r): r is RelatedEntitySummary => r !== null);
  }

  /**
   * Per-day mention bucket counts for the entity. Returns sparse buckets
   * (only days with mentions); frontend fillGaps fills missing days.
   * date_trunc('day', ...)::date is the canonical UTC day boundary.
   */
  private async timelineFor(
    userId: string,
    entityId: string,
  ): Promise<TimelineBucket[]> {
    const result = await this.db.execute<{
      day_utc: string;
      count: number;
    }>(sql`
      SELECT to_char(date_trunc('day', a.ts), 'YYYY-MM-DD') AS day_utc,
             COUNT(*)::int AS count
      FROM article_entity ae
      JOIN articles a ON a.id = ae.article_id
      WHERE ae.entity_id = ${entityId}
        AND a.user_id = ${userId}
        AND a.status = 'ready'
      GROUP BY day_utc
      ORDER BY day_utc ASC
    `);
    const rows = (
      result as unknown as {
        rows: Array<{ day_utc: string; count: number }>;
      }
    ).rows;
    return rows.map(
      (r): TimelineBucket => ({ dayUtc: r.day_utc, count: r.count }),
    );
  }
}
