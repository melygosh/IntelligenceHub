import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    // Global rate-limit backstop (per IP). Generous so normal SPA use is never
    // throttled; the tight per-route limit on auth endpoints (see AuthController)
    // is what actually deters brute-force / credential stuffing.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    // Enables @Interval (PendingRetryWorker re-analyzes 'pending' articles).
    ScheduleModule.forRoot(),
    DbModule,
    AuthModule,
    QueueModule,
    FeedsModule,
    WorkersModule,
    BullBoardModule.register(),
    ArticlesModule,
    EntitiesModule,
    GraphModule,
    LlmModule,
    CategoriesModule,
    AxesModule,
    RegenerationModule,
    SeedModule,
    EventsModule,
    DigestModule,
    TelemetryModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
