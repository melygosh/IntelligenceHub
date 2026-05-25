import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { FeedPullWorker } from './feed-pull.worker';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL })],
  providers: [FeedPullWorker],
})
export class WorkersModule {}
