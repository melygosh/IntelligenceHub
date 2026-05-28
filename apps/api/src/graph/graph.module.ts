import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { GraphSummaryService } from './graph-summary.service';

@Module({
  controllers: [GraphController],
  providers: [GraphService, GraphSummaryService],
})
export class GraphModule {}
