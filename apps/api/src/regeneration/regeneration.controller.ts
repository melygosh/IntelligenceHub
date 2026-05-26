import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  RegenerationRun,
  StartRegenerationResponse,
} from '@intelligencehub/shared';
import { RegenerationService } from './regeneration.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('regeneration')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class RegenerationController {
  constructor(private readonly regen: RegenerationService) {}

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @CurrentUser() user: AuthUserContext,
  ): Promise<StartRegenerationResponse> {
    return this.regen.start(user.userId);
  }

  @Get('current')
  async current(@CurrentUser() user: AuthUserContext): Promise<RegenerationRun> {
    return this.regen.current(user.userId);
  }
}
