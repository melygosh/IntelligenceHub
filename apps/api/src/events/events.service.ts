import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { ServerEvent } from '@intelligencehub/shared';

/**
 * In-memory per-user pub/sub for server-sent events. Generic: workers and
 * services publish typed events; the SSE controller subscribes per
 * authenticated user. Single-instance only — horizontal scaling would need
 * Redis pubsub here (documented in Day-13 ADR).
 *
 * Subjects are created lazily on first subscribe and torn down when their
 * last subscriber unsubscribes (refcount). Events published while no one
 * is subscribed are dropped — no replay history. Frontend updates from
 * the mutation response on the initial action; SSE only catches subsequent
 * state changes.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly log = new Logger(EventsService.name);
  private readonly subjects = new Map<string, Subject<ServerEvent>>();
  private readonly subscriberCounts = new Map<string, number>();

  publish(userId: string, event: ServerEvent): void {
    const subject = this.subjects.get(userId);
    if (!subject) return;
    subject.next(event);
  }

  subscribe(userId: string): Observable<ServerEvent> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<ServerEvent>();
      this.subjects.set(userId, subject);
      this.subscriberCounts.set(userId, 0);
    }
    const target = subject;
    return new Observable<ServerEvent>((observer) => {
      const sub = target.subscribe(observer);
      this.subscriberCounts.set(userId, (this.subscriberCounts.get(userId) ?? 0) + 1);
      return () => {
        sub.unsubscribe();
        const remaining = (this.subscriberCounts.get(userId) ?? 1) - 1;
        if (remaining <= 0) {
          target.complete();
          this.subjects.delete(userId);
          this.subscriberCounts.delete(userId);
        } else {
          this.subscriberCounts.set(userId, remaining);
        }
      };
    });
  }

  onModuleDestroy(): void {
    for (const subject of this.subjects.values()) subject.complete();
    this.subjects.clear();
    this.subscriberCounts.clear();
  }
}
