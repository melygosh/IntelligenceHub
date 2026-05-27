import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { regenerationRun } from '../db/schema';

/**
 * Runs once on app boot. Any regeneration_run rows still marked 'running'
 * are from a previous process that crashed or was killed mid-run — the
 * partial unique index on (user_id) WHERE status='running' would otherwise
 * deadlock those users from starting a new regeneration. Mark them 'failed'
 * with an explanatory error_message so the index releases.
 */
@Injectable()
export class RegenerationStartupCleanup implements OnApplicationBootstrap {
  private readonly log = new Logger(RegenerationStartupCleanup.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.db
      .update(regenerationRun)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: 'api restarted mid-run',
      })
      .where(eq(regenerationRun.status, 'running'))
      .returning({ id: regenerationRun.id });

    if (result.length > 0) {
      this.log.warn(
        JSON.stringify({
          event: 'regen.startup_cleanup',
          markedFailed: result.length,
        }),
      );
    }
  }
}
