import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

/**
 * Generic SSE events infrastructure. Producers (DigestBuilderWorker today,
 * future RegenerationWorker / AlertsService / etc.) inject EventsService
 * and call publish(userId, event). Consumers connect to GET /api/events.
 */
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
