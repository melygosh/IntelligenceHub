import { Module } from '@nestjs/common';
import { EntityResolverService } from './entity-resolver.service';

@Module({
  providers: [EntityResolverService],
  exports: [EntityResolverService],
})
export class EntitiesModule {}
