import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { FeedsModule } from './feeds/feeds.module';
import { WorkersModule } from './workers/workers.module';
import { BullBoardModule } from './admin/bull-board.module';
import { ArticlesModule } from './articles/articles.module';
import { GraphModule } from './graph/graph.module';
import { LlmModule } from './llm/llm.module';

@Module({
  imports: [DbModule, AuthModule, QueueModule, FeedsModule, WorkersModule, BullBoardModule.register(), ArticlesModule, GraphModule, LlmModule],
})
export class AppModule {}
