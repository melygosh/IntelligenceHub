import { Module, type DynamicModule } from '@nestjs/common';
import { BullBoardModule as NestBullBoard } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';

@Module({})
export class BullBoardModule {
  static register(): DynamicModule {
    return {
      module: BullBoardModule,
      imports: [
        BullModule.registerQueue(
          { name: QUEUE_NAMES.FEED_PULL },
          { name: QUEUE_NAMES.REGENERATION },
          { name: QUEUE_NAMES.DEMO_SEED },
          { name: QUEUE_NAMES.DIGEST_BUILD },
        ),
        NestBullBoard.forRoot({
          route: '/admin/queues',
          adapter: ExpressAdapter,
        }),
        NestBullBoard.forFeature(
          { name: QUEUE_NAMES.FEED_PULL, adapter: BullMQAdapter },
          { name: QUEUE_NAMES.REGENERATION, adapter: BullMQAdapter },
          { name: QUEUE_NAMES.DEMO_SEED, adapter: BullMQAdapter },
          { name: QUEUE_NAMES.DIGEST_BUILD, adapter: BullMQAdapter },
        ),
      ],
    };
  }
}
