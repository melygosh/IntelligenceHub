import { Module } from '@nestjs/common';
import { EntityResolverService } from './entity-resolver.service';
import { EntitiesService } from './entities.service';
import { EntitiesController } from './entities.controller';

@Module({
  controllers: [EntitiesController],
  providers: [EntityResolverService, EntitiesService],
  exports: [EntityResolverService, EntitiesService],
})
export class EntitiesModule {}
