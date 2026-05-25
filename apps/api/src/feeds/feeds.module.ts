import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { FeedsController } from './feeds.controller';
import { FeedsService } from './feeds.service';
import { FeedFetcher } from './feed-fetcher.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL })],
  controllers: [FeedsController],
  providers: [FeedsService, FeedFetcher],
  exports: [FeedFetcher],
})
export class FeedsModule {}
