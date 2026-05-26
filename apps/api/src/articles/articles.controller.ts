import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ArticleDetail, ArticleListResponse } from '@intelligencehub/shared';
import { GetArticlesQuery } from '@intelligencehub/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

const DAY_MS = 24 * 60 * 60 * 1000;

function resolvePeriodWindow(
  period: 'all' | '24h' | '7d' | '30d' | 'custom' | undefined,
  fromRaw: string | undefined,
  toRaw: string | undefined,
): { from?: Date; to?: Date } {
  if (!period || period === 'all') return {};
  if (period === 'custom') {
    if (!fromRaw || !toRaw) {
      throw new BadRequestException(
        'period=custom requires both from and to query params',
      );
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('from must be before to');
    }
    return { from, to };
  }
  const now = new Date();
  const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

@Controller('articles')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUserContext,
    @Query() rawQuery: Record<string, string | undefined>,
  ): Promise<ArticleListResponse> {
    const parsed = GetArticlesQuery.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    const { category, period, from, to, q } = parsed.data;
    const window = resolvePeriodWindow(period, from, to);
    const items = await this.articles.listMine(user.userId, {
      categoryId: category,
      windowFrom: window.from,
      windowTo: window.to,
      q,
    });
    return { articles: items };
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthUserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleDetail> {
    const result = await this.articles.getById(id, user.userId);
    if (!result) throw new NotFoundException();
    return result;
  }
}
