import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { FeedsModule } from '../feeds/feeds.module';
import { ArticlesModule } from '../articles/articles.module';
import { SeedModule } from '../seed/seed.module';
import { FeedPullWorker } from './feed-pull.worker';
import { RegenerationWorker } from './regeneration.worker';
import { RegenerationStartupCleanup } from './regeneration-startup.cleanup';
import { DemoSeederWorker } from './demo-seeder.worker';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL }),
    BullModule.registerQueue({ name: QUEUE_NAMES.REGENERATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DEMO_SEED }),
    FeedsModule,
    ArticlesModule,
    SeedModule,
  ],
  providers: [
    FeedPullWorker,
    RegenerationWorker,
    RegenerationStartupCleanup,
    DemoSeederWorker,
  ],
})
export class WorkersModule {}
