import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreateFeedRequest,
  type Feed,
  type FeedListResponse,
  type PullAllFeedsResponse,
  type PullFeedResponse,
  UpdateFeedRequest,
  ValidateFeedRequest,
  type ValidateFeedResponse,
} from '@intelligencehub/shared';
import { FeedsService } from './feeds.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('feeds')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class FeedsController {
  constructor(private readonly feedsService: FeedsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserContext): Promise<FeedListResponse> {
    const feeds = await this.feedsService.listMine(user.userId);
    return { feeds };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUserContext,
    @Body(new ZodValidationPipe(CreateFeedRequest))
    body: CreateFeedRequest,
  ): Promise<Feed> {
    return this.feedsService.create(
      user.userId,
      body.url,
      body.title,
      body.iconUrl,
    );
  }

  // Tight per-route limit: validate performs an authenticated server-side fetch
  // of a user-supplied URL. The SSRF guard blocks private hosts, but without a
  // cap this is an amplification/recon primitive against arbitrary public hosts.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Body(new ZodValidationPipe(ValidateFeedRequest))
    body: ValidateFeedRequest,
  ): Promise<ValidateFeedResponse> {
    return this.feedsService.validate(body.url);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateFeedRequest))
    body: UpdateFeedRequest,
  ): Promise<Feed> {
    return this.feedsService.updateStatus(user.userId, id, body.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.feedsService.deleteMine(user.userId, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('pull-all')
  @HttpCode(HttpStatus.ACCEPTED)
  async pullAll(
    @CurrentUser() user: AuthUserContext,
  ): Promise<PullAllFeedsResponse> {
    return this.feedsService.enqueuePullAll(user.userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/pull')
  @HttpCode(HttpStatus.ACCEPTED)
  async pull(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PullFeedResponse> {
    const { enqueued } = await this.feedsService.enqueuePull(user.userId, id);
    return { enqueued, feedId: id };
  }
}
