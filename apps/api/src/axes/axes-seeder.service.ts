import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB } from '../db/db.module';
import type { Db } from '../db/client';
import { axis, axisValue } from '../db/schema';

const DEFAULT_AXES: Array<{ name: string; values: string[] }> = [
  { name: 'content type', values: ['news', 'analysis', 'tutorial', 'opinion'] },
  { name: 'reader level', values: ['beginner', 'intermediate', 'expert'] },
  { name: 'region', values: ['UA', 'EU', 'US', 'global'] },
  { name: 'tonality', values: ['neutral', 'promo', 'critical'] },
];

@Injectable()
export class AxesSeederService {
  private readonly log = new Logger(AxesSeederService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert the 4 default axes (with values) for a newly-registered user.
   * Soft against re-runs: UNIQUE constraint catches duplicates, error is logged
   * and the next axis is attempted. Never throws; registration must not fail
   * because seeding failed.
   */
  async seedDefaultsFor(userId: string): Promise<void> {
    for (let position = 0; position < DEFAULT_AXES.length; position++) {
      const def = DEFAULT_AXES[position];
      try {
        const [axisRow] = await this.db
          .insert(axis)
          .values({ userId, name: def.name, position })
          .returning({ id: axis.id });
        if (!axisRow) continue;
        await this.db.insert(axisValue).values(
          def.values.map((v, i) => ({
            axisId: axisRow.id,
            value: v,
            position: i,
          })),
        );
      } catch (err) {
        this.log.warn(
          JSON.stringify({
            event: 'auth.seed_axes_failed',
            userId,
            axis: def.name,
            error: (err as Error).message,
          }),
        );
      }
    }
  }
}
