import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { FeedsModule } from './feeds/feeds.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [DbModule, AuthModule, QueueModule, FeedsModule, WorkersModule],
})
export class AppModule {}
