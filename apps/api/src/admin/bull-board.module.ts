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
        BullModule.registerQueue({ name: QUEUE_NAMES.FEED_PULL }),
        NestBullBoard.forRoot({
          route: '/admin/queues',
          adapter: ExpressAdapter,
        }),
        NestBullBoard.forFeature({
          name: QUEUE_NAMES.FEED_PULL,
          adapter: BullMQAdapter,
        }),
      ],
    };
  }
}
