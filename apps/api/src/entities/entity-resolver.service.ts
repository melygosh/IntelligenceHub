import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { ExtractedEntity } from '@intelligencehub/shared';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { entities, entityAlias } from '../db/schema';
import { normalize } from './entity-normalize';
import { isLikelyMatch, jaroWinkler } from './entity-fuzzy';

/**
 * Resolves an LLM-emitted entity to an existing `entities` row when possible,
 * otherwise inserts a new one. Always ingests any LLM-provided aliases against
 * the resolved/inserted entity_id.
 *
 * 4-step pipeline (Day 6 design §Resolution algorithm):
 *   1. exact normalized canonical match
 *   2. alias lookup
 *   3. type-scoped likely-match (token-prefix or Jaro-Winkler ≥ 0.95),
 *      against entities.canonical_name only (never against alias rows)
 *   4. insert new
 */
@Injectable()
export class EntityResolverService {
  private readonly log = new Logger(EntityResolverService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async resolveOrInsertEntity(userId: string, llmEntity: ExtractedEntity): Promise<string> {
    const normalizedCanonical = normalize(llmEntity.canonicalName);
    if (normalizedCanonical === '') {
      // Defensive: Zod minLength(1) should already reject this upstream. Throw
      // so an investigation surfaces rather than silently inventing an entity.
      throw new Error(
        `EntityResolver: canonicalName normalized to empty string: "${llmEntity.canonicalName}"`,
      );
    }

    // Step 1 — exact match on normalized canonical.
    // Uses sql template so the query plan can hit entities_user_canonical_normalized_idx
    // (the expression index from migration 0004).
    const exactHit = await this.db
      .select({ id: entities.id, type: entities.type })
      .from(entities)
      .where(
        and(
          eq(entities.userId, userId),
          eq(sql<string>`lower(${entities.canonicalName})`, normalizedCanonical),
        ),
      )
      .limit(1);

    if (exactHit[0]) {
      await this.ingestAliases(userId, exactHit[0].id, llmEntity.aliases);
      this.warnOnTypeMismatch(exactHit[0].id, exactHit[0].type, llmEntity.type);
      return exactHit[0].id;
    }

    // Step 2 — alias lookup (uses entity_alias_user_normalized_unique)
    const aliasHit = await this.db
      .select({ entityId: entityAlias.entityId })
      .from(entityAlias)
      .where(
        and(eq(entityAlias.userId, userId), eq(entityAlias.aliasNormalized, normalizedCanonical)),
      )
      .limit(1);

    if (aliasHit[0]) {
      await this.ingestAliases(userId, aliasHit[0].entityId, llmEntity.aliases);
      return aliasHit[0].entityId;
    }

    // Step 3 — type-scoped likely-match against canonical_name only.
    // isLikelyMatch combines a token-prefix shortcut (catches "pope leo" vs
    // "pope leo xiv") with a strict Jaro-Winkler threshold (catches typos).
    const sameTypeRows = await this.db
      .select({ id: entities.id, canonicalName: entities.canonicalName })
      .from(entities)
      .where(and(eq(entities.userId, userId), eq(entities.type, llmEntity.type)));

    for (const row of sameTypeRows) {
      const normalizedExisting = normalize(row.canonicalName);
      if (isLikelyMatch(normalizedExisting, normalizedCanonical)) {
        // Capture the raw JW score for logging (not used for the decision).
        const score = jaroWinkler(normalizedExisting, normalizedCanonical);
        this.log.log(
          JSON.stringify({
            event: 'entity.fuzzy_merge',
            userId,
            existingId: row.id,
            existingCanonical: row.canonicalName,
            llmCanonical: llmEntity.canonicalName,
            jaroWinkler: Number(score.toFixed(4)),
          }),
        );
        // The LLM's canonical becomes an alias of the existing entity (so future
        // articles that emit the same surface form hit step 2 instead of re-fuzzying).
        await this.ingestAliases(userId, row.id, [llmEntity.canonicalName, ...llmEntity.aliases]);
        return row.id;
      }
    }

    // Step 4 — insert new entity (preserve original casing in canonical_name)
    const [inserted] = await this.db
      .insert(entities)
      .values({
        userId,
        canonicalName: llmEntity.canonicalName,
        type: llmEntity.type,
      })
      .returning({ id: entities.id });

    await this.ingestAliases(userId, inserted.id, llmEntity.aliases);
    return inserted.id;
  }

  private async ingestAliases(userId: string, entityId: string, aliases: string[]): Promise<void> {
    for (const alias of aliases) {
      const n = normalize(alias);
      if (n === '') continue;
      try {
        await this.db
          .insert(entityAlias)
          .values({
            userId,
            entityId,
            aliasNormalized: n,
            aliasOriginal: alias,
            source: 'llm',
          })
          .onConflictDoNothing();
      } catch (err) {
        // ON CONFLICT DO NOTHING handles uniqueness; any other error is logged + swallowed.
        // We never want a stray alias insert to break article processing.
        this.log.debug(
          JSON.stringify({
            event: 'entity.alias_skip',
            entityId,
            alias,
            reason: (err as Error).message,
          }),
        );
      }
    }
  }

  private warnOnTypeMismatch(entityId: string, existingType: string, llmType: string): void {
    if (existingType === llmType) return;
    this.log.warn(
      JSON.stringify({
        event: 'entity.type_mismatch',
        entityId,
        existingType,
        llmType,
        decision: 'keep_existing',
      }),
    );
  }
}
