import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  BuildDigestRequest,
  type DigestDetail,
  type DigestSummary,
} from '@intelligencehub/shared';
import { DigestService } from './digest.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('digests')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class DigestController {
  constructor(private readonly digests: DigestService) {}

  // Each call enqueues a real LLM digest build — cap to prevent a single account
  // running up cost/queue depth.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @CurrentUser() user: AuthUserContext,
    @Body(new ZodValidationPipe(BuildDigestRequest))
    body: BuildDigestRequest,
  ): Promise<DigestSummary> {
    return this.digests.start(user.userId, body);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUserContext,
  ): Promise<{ items: DigestSummary[] }> {
    return { items: await this.digests.list(user.userId) };
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DigestDetail> {
    const result = await this.digests.getById(id, user.userId);
    if (!result) throw new NotFoundException('Digest not found');
    return result;
  }
}
