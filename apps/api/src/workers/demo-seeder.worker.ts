import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
// value import required for Nest DI metadata
import { DemoSeederService } from '../seed/demo-seeder.service';

type JobData = { userId: string };

@Processor(QUEUE_NAMES.DEMO_SEED)
export class DemoSeederWorker extends WorkerHost {
  private readonly log = new Logger(DemoSeederWorker.name);

  constructor(private readonly seeder: DemoSeederService) {
    super();
  }

  async process(job: Job<JobData>): Promise<void> {
    const { userId } = job.data;
    const t0 = Date.now();
    this.log.log(
      JSON.stringify({ event: 'demo.seed.start', userId, jobId: job.id }),
    );
    await job.log(`seeding demo data for user ${userId}…`);
    try {
      const totals = await this.seeder.seedFor(userId);
      this.log.log(
        JSON.stringify({
          event: 'demo.seed.done',
          userId,
          jobId: job.id,
          ...totals,
          durationMs: Date.now() - t0,
        }),
      );
      await job.log(`done: ${JSON.stringify(totals)} in ${Date.now() - t0}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(
        JSON.stringify({ event: 'demo.seed.failed', userId, error: msg }),
      );
      await job.log(`failed: ${msg}`);
      throw err; // Bull marks job failed; visible in Bull Board
    }
  }
}
