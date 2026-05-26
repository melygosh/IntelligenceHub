import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { ArticlesModule } from '../articles/articles.module';
import { RegenerationController } from './regeneration.controller';
import { RegenerationService } from './regeneration.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.REGENERATION }),
    ArticlesModule,
  ],
  controllers: [RegenerationController],
  providers: [RegenerationService],
  exports: [RegenerationService],
})
export class RegenerationModule {}
