import { Module, type DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { FeedsModule } from '../feeds/feeds.module';
import { ArticlesModule } from '../articles/articles.module';
import { SeedModule } from '../seed/seed.module';
import { LlmModule } from '../llm/llm.module';
import { EventsModule } from '../events/events.module';
import { FeedPullWorker } from './feed-pull.worker';
import { FeedPullScheduler } from './feed-pull.scheduler';
import { ArticleAnalyzeWorker } from './article-analyze.worker';
import { PendingAnalyzeReconcile } from './pending-analyze.reconcile';
import { RegenerationWorker } from './regeneration.worker';
import { RegenerationStartupCleanup } from './regeneration-startup.cleanup';
import { DemoSeederWorker } from './demo-seeder.worker';
import { DigestBuilderWorker } from './digest-builder.worker';
import { EmbedBackfillWorker } from './embed-backfill.worker';
import { RetagArticleWorker } from './retag-article.worker';

/**
 * The BullMQ consumers (processors), the cron scheduler, and the startup
 * reconcilers/cleanups. Registered ONLY in a worker-running role — queue
 * *producers* live in the feature modules, so the api role can still enqueue
 * without instantiating any of these consumers (which would otherwise make the
 * api process jobs too → double-processing). `forRoot(false)` returns an empty
 * module so the api consumes nothing.
 */
@Module({})
export class WorkersModule {
  static forRoot(runWorkers: boolean): DynamicModule {
    if (!runWorkers) {
      return { module: WorkersModule };
    }
    return {
      module: WorkersModule,
      imports: [
        BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL }),
        BullModule.registerQueue({ name: QUEUE_NAMES.ARTICLE_ANALYZE }),
        BullModule.registerQueue({ name: QUEUE_NAMES.REGENERATION }),
        BullModule.registerQueue({ name: QUEUE_NAMES.RETAG_ARTICLE }),
        BullModule.registerQueue({ name: QUEUE_NAMES.DEMO_SEED }),
        BullModule.registerQueue({ name: QUEUE_NAMES.DIGEST_BUILD }),
        BullModule.registerQueue({ name: QUEUE_NAMES.EMBED_BACKFILL }),
        FeedsModule,
        ArticlesModule,
        SeedModule,
        LlmModule,
        EventsModule,
      ],
      providers: [
        FeedPullWorker,
        FeedPullScheduler,
        ArticleAnalyzeWorker,
        PendingAnalyzeReconcile,
        RegenerationWorker,
        RegenerationStartupCleanup,
        DemoSeederWorker,
        DigestBuilderWorker,
        EmbedBackfillWorker,
        RetagArticleWorker,
      ],
    };
  }
}
