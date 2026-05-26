import { Controller, Get, UseGuards } from '@nestjs/common';
import type { TelemetrySummary } from '@intelligencehub/shared';
import { TelemetryService } from './telemetry.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthUserContext,
  ): Promise<TelemetrySummary> {
    return await this.telemetry.summary(user.userId);
  }
}
