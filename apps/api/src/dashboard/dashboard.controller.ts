import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import {
  GetDashboardQuery,
  type DashboardResponse,
} from '@intelligencehub/shared';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(GetDashboardQuery))
  async get(
    @CurrentUser() user: AuthUserContext,
    @Query() query: typeof GetDashboardQuery._type,
  ): Promise<DashboardResponse> {
    return this.dashboard.buildMine(user.userId, {
      period: query.period ?? '7d',
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
