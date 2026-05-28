import {
  Controller,
  Get,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { GraphResponse } from '@intelligencehub/shared';
import { DEFAULT_TOP, GraphService } from './graph.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('graph')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  async get(
    @CurrentUser() user: AuthUserContext,
    @Query('category', new ParseUUIDPipe({ optional: true })) category?: string,
  ): Promise<GraphResponse> {
    return this.graph.buildMine(user.userId, {
      period: '7d',
      top: DEFAULT_TOP,
      categoryId: category,
    });
  }
}
