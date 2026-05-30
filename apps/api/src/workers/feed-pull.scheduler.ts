import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { loadEnv } from '../common/config/env';
import type { FeedPullJobData } from '../feeds/feeds.service';
import { FEED_PULL_SWEEP_JOB } from './feed-pull.worker';

const SCHEDULER_ID = 'feed-pull-sweep';

/**
 * Registers a single repeatable "sweep" job on the feed-pull queue at boot.
 * The sweep fans out a per-feed pull for every active feed across all users
 * (Principle 3: ingestion runs on a schedule, off the request path). The cron
 * pattern comes from FEED_PULL_CRON; an empty value disables the schedule,
 * leaving manual "Pull now" / "Pull all" as the only trigger.
 *
 * upsertJobScheduler is idempotent on SCHEDULER_ID, so restarts re-assert the
 * same schedule instead of accumulating duplicate repeatables. When the cron
 * is unset we remove any previously-registered scheduler so toggling the env
 * off actually stops the sweep.
 */
@Injectable()
export class FeedPullScheduler implements OnApplicationBootstrap {
  private readonly log = new Logger(FeedPullScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.FEED_PULL)
    private readonly feedPullQueue: Queue<FeedPullJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const cron = loadEnv().FEED_PULL_CRON;
    if (!cron) {
      await this.feedPullQueue.removeJobScheduler(SCHEDULER_ID).catch(() => {
        // No scheduler registered yet — nothing to remove.
      });
      this.log.log(JSON.stringify({ event: 'feed.pull.schedule_disabled' }));
      return;
    }

    await this.feedPullQueue.upsertJobScheduler(
      SCHEDULER_ID,
      { pattern: cron },
      {
        name: FEED_PULL_SWEEP_JOB,
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
    this.log.log(
      JSON.stringify({ event: 'feed.pull.schedule_registered', cron }),
    );
  }
}
