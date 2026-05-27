import { Controller, type MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

/**
 * GET /api/events — Server-Sent Events stream for the authenticated user.
 * Cookie auth (existing JwtAuthGuard reads the ih_auth httpOnly cookie).
 * The connection stays open; each published event is sent as a single SSE
 * message with JSON data.
 */
@Controller('events')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse()
  stream(@CurrentUser() user: AuthUserContext): Observable<MessageEvent> {
    return this.events
      .subscribe(user.userId)
      .pipe(map((event) => ({ data: event })));
  }
}
