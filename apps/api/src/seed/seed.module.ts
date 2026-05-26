import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { EntitiesModule } from '../entities/entities.module';
import { DemoSeederService } from './demo-seeder.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.DEMO_SEED }),
    EntitiesModule, // for EntityResolverService
  ],
  providers: [DemoSeederService],
  exports: [DemoSeederService],
})
export class SeedModule {}
