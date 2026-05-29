import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { RelatedSemanticResponse } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { EmbeddingService } from '../embeddings/embedding.service';
import { loadEnv } from '../common/config/env';

const TOP_N = 5;

@Injectable()
export class RelatedSemanticService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * kNN against the source article's embedding, scoped to the same user and
   * 'ready' status, excluding the source itself and articles whose URL
   * normalises to the source (those already surface in the exact-similar
   * list — semantic should add new neighbours, not echo).
   *
   * Returns:
   *  - { status: 'unavailable' } — no key configured
   *  - { status: 'pending' } — source article's embedding is still NULL
   *  - { status: 'ready', items } — kNN ran; items are filtered by threshold
   */
  async related(
    userId: string,
    articleId: string,
  ): Promise<RelatedSemanticResponse> {
    if (!this.embeddings.isEnabled()) {
      return { status: 'unavailable', items: [] };
    }

    const env = loadEnv();
    const threshold = env.SEMANTIC_SIMILARITY_THRESHOLD;

    // Use raw SQL with the <=> cosine-distance operator. Drizzle has no
    // first-class support for pgvector ops yet (0.45.2). Filter null
    // embeddings to skip backfill-pending neighbours; cast :userId to uuid
    // because the parameter binder may pass it as text.
    const result = await this.db.execute<{
      id: string;
      title: string;
      url: string;
      score: number;
      feed_title: string | null;
      source_has_embedding: boolean;
    }>(sql`
      WITH source AS (
        SELECT id, embedding, url, content_hash
        FROM articles
        WHERE id = ${articleId}::uuid AND user_id = ${userId}::uuid
      )
      SELECT
        a.id,
        a.title,
        a.url,
        1 - (a.embedding <=> (SELECT embedding FROM source)) AS score,
        f.title AS feed_title,
        (SELECT embedding IS NOT NULL FROM source) AS source_has_embedding
      FROM articles a
      LEFT JOIN feeds f ON f.id = a.feed_id
      WHERE a.user_id = ${userId}::uuid
        AND a.status = 'ready'
        AND a.id <> ${articleId}::uuid
        AND a.embedding IS NOT NULL
        AND a.url <> (SELECT url FROM source)
        AND a.content_hash <> (SELECT content_hash FROM source)
        AND (SELECT embedding FROM source) IS NOT NULL
      ORDER BY a.embedding <=> (SELECT embedding FROM source)
      LIMIT ${TOP_N}
    `);
    const rows = (
      result as unknown as {
        rows: Array<{
          id: string;
          title: string;
          url: string;
          score: number;
          feed_title: string | null;
          source_has_embedding: boolean;
        }>;
      }
    ).rows;

    // No rows AND source had no embedding → pending. If source had an
    // embedding, 0 rows simply means no neighbour cleared the threshold.
    if (rows.length === 0) {
      const sourceCheck = await this.db.execute<{ has_embedding: boolean }>(sql`
        SELECT embedding IS NOT NULL AS has_embedding
        FROM articles
        WHERE id = ${articleId}::uuid AND user_id = ${userId}::uuid
      `);
      const has =
        (sourceCheck as unknown as { rows: Array<{ has_embedding: boolean }> })
          .rows[0]?.has_embedding ?? false;
      return { status: has ? 'ready' : 'pending', items: [] };
    }

    const items = rows
      .filter((r) => r.score >= threshold)
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        score: Number(r.score.toFixed(4)),
        feedTitle: r.feed_title,
      }));
    return { status: 'ready', items };
  }
}
