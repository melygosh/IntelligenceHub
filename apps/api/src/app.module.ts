import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { FeedsModule } from './feeds/feeds.module';

@Module({
  imports: [DbModule, AuthModule, QueueModule, FeedsModule],
})
export class AppModule {}
