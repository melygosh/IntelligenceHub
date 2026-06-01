import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { Redis } from 'ioredis';
import type { ServerEvent } from '@intelligencehub/shared';

/**
 * Per-user pub/sub for server-sent events, fanned out over Redis so it works
 * across processes. Producers (the api request handlers AND the separate worker
 * process) call `publish`; the SSE controller — which lives only in the api
 * process — calls `subscribe`.
 *
 * Why Redis and not just an in-memory Subject: the api and worker run as
 * SEPARATE processes (see ADR-8). A worker-emitted event (e.g. digest ready,
 * regeneration progress) must reach the SSE stream served by the api process,
 * so every `publish` round-trips through a Redis channel; each process's
 * subscriber forwards messages into its local Subjects. Only the api has SSE
 * subscribers, so the worker's local forward is a harmless no-op.
 *
 * Local Subjects are created lazily on first subscribe and torn down when their
 * last subscriber unsubscribes (refcount). Events published while no one is
 * subscribed are dropped — no replay history.
 */
const EVENTS_CHANNEL = 'ih:events';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EventsService.name);
  private readonly subjects = new Map<string, Subject<ServerEvent>>();
  private readonly subscriberCounts = new Map<string, number>();
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor() {
    const url = new URL(process.env.REDIS_URL ?? 'redis://redis:6379');
    const opts = { host: url.hostname, port: Number(url.port || 6379) };
    // A Redis connection in subscriber mode can't issue other commands, so the
    // publisher and subscriber are separate clients.
    this.pub = new Redis(opts);
    this.sub = new Redis(opts);
    this.pub.on('error', (e) =>
      this.log.error(`events pub redis: ${e.message}`),
    );
    this.sub.on('error', (e) =>
      this.log.error(`events sub redis: ${e.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.sub.subscribe(EVENTS_CHANNEL);
    this.sub.on('message', (_channel, message) => {
      let parsed: { userId: string; event: ServerEvent };
      try {
        parsed = JSON.parse(message) as { userId: string; event: ServerEvent };
      } catch {
        return; // ignore malformed payloads
      }
      const subject = this.subjects.get(parsed.userId);
      if (subject) subject.next(parsed.event);
    });
  }

  publish(userId: string, event: ServerEvent): void {
    void this.pub
      .publish(EVENTS_CHANNEL, JSON.stringify({ userId, event }))
      .catch((e: Error) => this.log.error(`events publish: ${e.message}`));
  }

  subscribe(userId: string): Observable<ServerEvent> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<ServerEvent>();
      this.subjects.set(userId, subject);
    }
    const target = subject;
    return new Observable<ServerEvent>((observer) => {
      const sub = target.subscribe(observer);
      this.subscriberCounts.set(
        userId,
        (this.subscriberCounts.get(userId) ?? 0) + 1,
      );
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

  async onModuleDestroy(): Promise<void> {
    for (const subject of this.subjects.values()) subject.complete();
    this.subjects.clear();
    this.subscriberCounts.clear();
    await this.pub.quit().catch(() => undefined);
    await this.sub.quit().catch(() => undefined);
  }
}
