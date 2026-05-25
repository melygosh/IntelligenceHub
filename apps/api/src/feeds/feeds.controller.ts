import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateFeedRequest,
  type FeedListResponse,
  type PullFeedResponse,
} from '@intelligencehub/shared';
import { FeedsService } from './feeds.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

@Controller('feeds')
@UseGuards(JwtAuthGuard)
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
    // Pipe applied to @Body() only — method-level @UsePipes would also try to validate
    // @CurrentUser() against the schema and fail.
    @Body(new ZodValidationPipe(CreateFeedRequest)) body: typeof CreateFeedRequest._type,
  ): Promise<{ id: string; url: string; createdAt: string }> {
    return this.feedsService.create(user.userId, body.url);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.feedsService.deleteMine(user.userId, id);
  }

  @Post(':id/pull')
  @HttpCode(HttpStatus.ACCEPTED)
  async pull(
    @CurrentUser() user: AuthUserContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PullFeedResponse> {
    await this.feedsService.enqueuePull(user.userId, id);
    return { enqueued: true, feedId: id };
  }
}
