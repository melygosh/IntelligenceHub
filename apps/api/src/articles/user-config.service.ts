import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { axis, axisValue, category } from '../db/schema';
import { configHash } from '../llm/config-hash';

export type UserConfigSnapshot = {
  categories: string[];
  axes: { name: string; values: string[] }[];
  hash: string;
};

/**
 * Loads a user's current category + axes config in one round-trip and computes
 * the config hash. ArticleProcessor calls this once per pull and passes the
 * snapshot into every analyzeArticle call within that pull.
 */
@Injectable()
export class UserConfigService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async snapshotFor(userId: string): Promise<UserConfigSnapshot> {
    const categoryRows = await this.db
      .select({ name: category.name })
      .from(category)
      .where(eq(category.userId, userId))
      .orderBy(asc(category.name));
    const categories = categoryRows.map((r) => r.name);

    const axisRows = await this.db
      .select({ id: axis.id, name: axis.name, position: axis.position })
      .from(axis)
      .where(eq(axis.userId, userId))
      .orderBy(asc(axis.position), asc(axis.name));

    let axes: { name: string; values: string[] }[] = [];
    if (axisRows.length > 0) {
      const axisIds = axisRows.map((a) => a.id);
      const valueRows = await this.db
        .select({
          axisId: axisValue.axisId,
          value: axisValue.value,
          position: axisValue.position,
        })
        .from(axisValue)
        .where(inArray(axisValue.axisId, axisIds))
        .orderBy(asc(axisValue.position), asc(axisValue.value));

      const byAxis = new Map<string, string[]>();
      for (const v of valueRows) {
        const list = byAxis.get(v.axisId) ?? [];
        list.push(v.value);
        byAxis.set(v.axisId, list);
      }
      axes = axisRows.map((a) => ({ name: a.name, values: byAxis.get(a.id) ?? [] }));
    }

    return {
      categories,
      axes,
      hash: configHash(categories, axes),
    };
  }
}
