import { Controller, Get, UseGuards } from '@nestjs/common';
import type { GraphResponse } from '@intelligencehub/shared';
import { GraphService } from './graph.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

@Controller('graph')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get()
  async get(@CurrentUser() user: AuthUserContext): Promise<GraphResponse> {
    return this.graphService.buildMine(user.userId);
  }
}
