import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { FeedsModule } from './feeds/feeds.module';
import { WorkersModule } from './workers/workers.module';
import { BullBoardModule } from './admin/bull-board.module';
import { ArticlesModule } from './articles/articles.module';

@Module({
  imports: [DbModule, AuthModule, QueueModule, FeedsModule, WorkersModule, BullBoardModule.register(), ArticlesModule],
})
export class AppModule {}
