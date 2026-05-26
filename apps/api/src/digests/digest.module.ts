import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { DigestController } from './digest.controller';
import { DigestService } from './digest.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.DIGEST_BUILD }),
    EventsModule,
    LlmModule,
  ],
  controllers: [DigestController],
  providers: [DigestService],
  exports: [DigestService],
})
export class DigestModule {}
