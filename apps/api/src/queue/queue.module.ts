import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { QUEUE_NAMES } from '@intelligencehub/shared';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://redis:6379';
const url = new URL(REDIS_URL);

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
      },
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.FEED_PULL,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
