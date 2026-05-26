import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { FeedsModule } from '../feeds/feeds.module';
import { ArticlesModule } from '../articles/articles.module';
import { FeedPullWorker } from './feed-pull.worker';
import { RegenerationWorker } from './regeneration.worker';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL }),
    BullModule.registerQueue({ name: QUEUE_NAMES.REGENERATION }),
    FeedsModule,
    ArticlesModule,
  ],
  providers: [FeedPullWorker, RegenerationWorker],
})
export class WorkersModule {}
