import { Module } from '@nestjs/common';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { AxesSeederService } from './axes-seeder.service';

@Module({
  controllers: [AxesController],
  providers: [AxesService, AxesSeederService],
  exports: [AxesService, AxesSeederService],
})
export class AxesModule {}
