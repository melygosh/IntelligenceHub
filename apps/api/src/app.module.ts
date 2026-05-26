import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { FeedsModule } from './feeds/feeds.module';
import { WorkersModule } from './workers/workers.module';
import { BullBoardModule } from './admin/bull-board.module';
import { ArticlesModule } from './articles/articles.module';
import { EntitiesModule } from './entities/entities.module';
import { GraphModule } from './graph/graph.module';
import { LlmModule } from './llm/llm.module';
import { CategoriesModule } from './categories/categories.module';
import { AxesModule } from './axes/axes.module';
import { RegenerationModule } from './regeneration/regeneration.module';
import { SeedModule } from './seed/seed.module';
import { EventsModule } from './events/events.module';
import { DigestModule } from './digests/digest.module';

@Module({
  imports: [DbModule, AuthModule, QueueModule, FeedsModule, WorkersModule, BullBoardModule.register(), ArticlesModule, EntitiesModule, GraphModule, LlmModule, CategoriesModule, AxesModule, RegenerationModule, SeedModule, EventsModule, DigestModule],
})
export class AppModule {}
