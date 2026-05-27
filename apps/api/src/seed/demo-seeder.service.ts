import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import {
  articleAxisValue,
  articleCategory,
  articleEntity,
  articles,
  axis,
  axisValue,
  category,
  feeds,
} from '../db/schema';
import { EntityResolverService } from '../entities/entity-resolver.service';
import { DemoSeedData } from './demo-data.schema';

type SeedTotals = {
  feedsInserted: number;
  articlesInserted: number;
  duplicatesInserted: number;
  entitiesResolved: number;
};

@Injectable()
export class DemoSeederService {
  private readonly log = new Logger(DemoSeederService.name);
  private readonly demoData: DemoSeedData;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly resolver: EntityResolverService,
  ) {
    // Load + Zod-validate the static JSON at module construction. Bad JSON
    // fails app boot loudly — preferable to a silent runtime failure later.
    const path = join(__dirname, 'demo-data.json');
    const raw = readFileSync(path, 'utf8');
    this.demoData = DemoSeedData.parse(JSON.parse(raw));
  }

  async seedFor(userId: string): Promise<SeedTotals> {
    // 1. Insert demo feeds (all status='paused' so the puller never tries
    //    to GET demo:// URLs). Map<url, feedId> for article lookups.
    const feedIdByUrl = new Map<string, string>();
    for (const f of this.demoData.feeds) {
      const [row] = await this.db
        .insert(feeds)
        .values({
          userId,
          url: f.url,
          title: f.title,
          iconUrl: f.iconUrl ?? null,
          status: 'paused',
        })
        .returning({ id: feeds.id });
      feedIdByUrl.set(f.url, row.id);
    }

    // 2. Insert categories. Per-user; existing (user_id, name) unique
    //    index from CategoriesService catches accidental duplicates.
    const categoryIdByName = new Map<string, string>();
    for (const name of this.demoData.categories) {
      const [row] = await this.db
        .insert(category)
        .values({ userId, name })
        .returning({ id: category.id });
      categoryIdByName.set(name, row.id);
    }

    // 3. Resolve the user's seeded default axes by name.
    //    AxesSeederService.seedDefaultsFor (Day 8a) already ran inside
    //    register() before we got here. We need:
    //      Map<axisName, { axisId, valueByName: Map<value, valueId> }>
    const axisLookup = new Map<
      string,
      { axisId: string; valueByName: Map<string, string> }
    >();
    const axisRows = await this.db
      .select({ id: axis.id, name: axis.name })
      .from(axis)
      .where(eq(axis.userId, userId));
    for (const a of axisRows) {
      const values = await this.db
        .select({ id: axisValue.id, value: axisValue.value })
        .from(axisValue)
        .where(eq(axisValue.axisId, a.id));
      const valueByName = new Map(values.map((v) => [v.value, v.id]));
      axisLookup.set(a.name, { axisId: a.id, valueByName });
    }

    // 4. Pass 1 — insert all 'ready' articles (originals before duplicates
    //    so duplicate_of can resolve via the originalUrl→id map).
    const articleIdByUrl = new Map<string, string>();
    let entitiesResolved = 0;
    let articlesInserted = 0;
    let duplicatesInserted = 0;

    const originals = this.demoData.articles.filter(
      (a) => a.duplicateOfUrl === undefined,
    );
    const duplicates = this.demoData.articles.filter(
      (a) => a.duplicateOfUrl !== undefined,
    );

    for (const a of originals) {
      const feedId = feedIdByUrl.get(a.feedUrl);
      if (!feedId) {
        this.log.warn(
          JSON.stringify({
            event: 'demo.seed.skip_article',
            reason: 'unknown_feed_url',
            url: a.url,
            feedUrl: a.feedUrl,
          }),
        );
        continue;
      }
      const [row] = await this.db
        .insert(articles)
        .values({
          userId,
          feedId,
          url: a.url,
          title: a.title,
          body: a.body,
          contentHash: a.contentHash,
          summary: a.summary,
          importance: a.importance,
          status: 'ready',
          ts: new Date(a.ts),
        })
        .returning({ id: articles.id });
      articleIdByUrl.set(a.url, row.id);
      articlesInserted += 1;

      // Resolve entities (Day 6 dedup pipeline) and link article_entity.
      for (const e of a.entities) {
        const entityId = await this.resolver.resolveOrInsertEntity(userId, {
          canonicalName: e.canonicalName,
          type: e.type,
          aliases: e.aliases,
        });
        await this.db
          .insert(articleEntity)
          .values({ articleId: row.id, entityId })
          .onConflictDoNothing();
        entitiesResolved += 1;
      }

      // Category tags.
      for (const catName of a.categoryNames) {
        const catId = categoryIdByName.get(catName);
        if (!catId) {
          this.log.debug(
            JSON.stringify({
              event: 'demo.seed.tag_drift',
              kind: 'category',
              name: catName,
            }),
          );
          continue;
        }
        await this.db
          .insert(articleCategory)
          .values({ articleId: row.id, categoryId: catId })
          .onConflictDoNothing();
      }

      // Axis assignments — drift-defense if axis or value name not seeded.
      for (const aa of a.axisAssignments) {
        const ax = axisLookup.get(aa.axisName);
        if (!ax) {
          this.log.debug(
            JSON.stringify({
              event: 'demo.seed.tag_drift',
              kind: 'axis',
              axisName: aa.axisName,
            }),
          );
          continue;
        }
        const valueId = ax.valueByName.get(aa.value);
        if (!valueId) {
          this.log.debug(
            JSON.stringify({
              event: 'demo.seed.tag_drift',
              kind: 'axis_value',
              axisName: aa.axisName,
              value: aa.value,
            }),
          );
          continue;
        }
        await this.db
          .insert(articleAxisValue)
          .values({
            articleId: row.id,
            axisId: ax.axisId,
            axisValueId: valueId,
          })
          .onConflictDoNothing();
      }
    }

    // 5. Pass 2 — insert 'duplicate' articles. duplicate_of resolves via
    //    the articleIdByUrl map populated in pass 1.
    for (const d of duplicates) {
      const feedId = feedIdByUrl.get(d.feedUrl);
      const originalId = d.duplicateOfUrl
        ? articleIdByUrl.get(d.duplicateOfUrl)
        : undefined;
      if (!feedId || !originalId) {
        this.log.warn(
          JSON.stringify({
            event: 'demo.seed.skip_article',
            reason: !feedId ? 'unknown_feed_url' : 'unknown_original_url',
            url: d.url,
          }),
        );
        continue;
      }
      await this.db.insert(articles).values({
        userId,
        feedId,
        url: d.url,
        title: d.title,
        body: d.body,
        contentHash: d.contentHash,
        status: 'duplicate',
        duplicateOf: originalId,
        ts: new Date(d.ts),
      });
      duplicatesInserted += 1;
    }

    return {
      feedsInserted: feedIdByUrl.size,
      articlesInserted,
      duplicatesInserted,
      entitiesResolved,
    };
  }
}
