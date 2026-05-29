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
import type {
  ArticleDetail,
  ArticleListResponse,
  ArticleStatus,
} from '@intelligencehub/shared';
import {
  DEFAULT_PAGE_SIZE,
  GetArticlesQuery,
  MAX_PAGE_SIZE,
} from '@intelligencehub/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_VALUES = new Set<ArticleStatus>([
  'ready',
  'pending',
  'filtered',
  'failed',
  'duplicate',
]);

/** Parse a CSV query-string value into a deduped, non-empty array of trimmed
 * tokens. Returns [] for undefined / empty / whitespace-only input. */
function csvToList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const tok of raw.split(',')) {
    const t = tok.trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

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
    const {
      category,
      feed,
      importance,
      axisValue,
      status,
      period,
      from,
      to,
      q,
      page,
      pageSize,
      sort,
    } = parsed.data;

    const categoryIds = csvToList(category);
    for (const id of categoryIds) {
      if (!UUID_RE.test(id)) {
        throw new BadRequestException(`invalid category UUID: ${id}`);
      }
    }
    const feedIds = csvToList(feed);
    for (const id of feedIds) {
      if (!UUID_RE.test(id)) {
        throw new BadRequestException(`invalid feed UUID: ${id}`);
      }
    }
    const importances: ('high' | 'normal' | 'junk')[] = [];
    for (const v of csvToList(importance)) {
      if (v !== 'high' && v !== 'normal' && v !== 'junk') {
        throw new BadRequestException(`invalid importance: ${v}`);
      }
      importances.push(v);
    }

    const axisValueIds = csvToList(axisValue);
    for (const id of axisValueIds) {
      if (!UUID_RE.test(id)) {
        throw new BadRequestException(`invalid axisValue UUID: ${id}`);
      }
    }

    const statuses: ArticleStatus[] = [];
    for (const v of csvToList(status)) {
      if (!STATUS_VALUES.has(v as ArticleStatus)) {
        throw new BadRequestException(`invalid status: ${v}`);
      }
      statuses.push(v as ArticleStatus);
    }

    // Pagination. Clamp pageSize to [1, MAX_PAGE_SIZE]; default page=1 so
    // callers don't have to send it. The shared DEFAULT_PAGE_SIZE keeps web
    // + api consistent on what "one page" means without coordinating envs.
    const effectivePage = Math.max(page ?? 1, 1);
    const effectivePageSize = Math.min(
      Math.max(pageSize ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );

    const window = resolvePeriodWindow(period, from, to);
    const { items, total } = await this.articles.listMine(user.userId, {
      categoryIds,
      feedIds,
      importances,
      axisValueIds,
      statuses,
      windowFrom: window.from,
      windowTo: window.to,
      q,
      offset: (effectivePage - 1) * effectivePageSize,
      limit: effectivePageSize,
      sort: sort,
    });
    return {
      articles: items,
      total,
      page: effectivePage,
      pageSize: effectivePageSize,
    };
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
