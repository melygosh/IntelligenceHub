import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetGraphQuery, type GraphPeriod } from '@intelligencehub/shared';
import { DEFAULT_TOP, GraphService } from './graph.service';
import { GraphSummaryService } from './graph-summary.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('graph')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class GraphController {
  constructor(
    private readonly graph: GraphService,
    private readonly summary: GraphSummaryService,
  ) {}

  @Get()
  async get(
    @CurrentUser() user: AuthUserContext,
    @Query() raw: Record<string, string | undefined>,
  ) {
    const q = parseGraphQuery(raw);
    return this.graph.buildMine(user.userId, {
      period: q.period,
      from: q.from,
      to: q.to,
      top: q.top ?? DEFAULT_TOP,
      categoryIds: q.categoryIds,
      anchorEntityId: q.anchor,
      selectedEntityIds: q.selectedEntityIds,
      selectedArticleIds: q.selectedArticleIds,
    });
  }

  @Get('summary')
  async getSummary(
    @CurrentUser() user: AuthUserContext,
    @Query() raw: Record<string, string | undefined>,
  ) {
    const q = parseGraphQuery(raw);
    return this.summary.buildMine(user.userId, {
      period: q.period,
      from: q.from,
      to: q.to,
      categoryIds: q.categoryIds,
    });
  }
}

type ParsedGraphQuery = {
  period: GraphPeriod;
  from?: Date;
  to?: Date;
  top?: number;
  categoryIds: string[];
  anchor?: string;
  selectedEntityIds: string[];
  selectedArticleIds: string[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function csvToUuidList(raw: string | undefined, paramName: string): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException(`invalid ${paramName} UUID: ${id}`);
    }
  }
  return ids;
}

/**
 * Shared parse + validate for the two /graph routes. Mirrors ZodValidationPipe's
 * error-body shape ({message: 'Validation failed', errors}) so the frontend
 * handles both endpoints uniformly. Also enforces the cross-field rule that
 * Zod can't express on its own: period=custom requires `from`.
 */
function parseGraphQuery(
  raw: Record<string, string | undefined>,
): ParsedGraphQuery {
  const parsed = GetGraphQuery.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: parsed.error.format(),
    });
  }
  const q = parsed.data;
  const period: GraphPeriod = q.period ?? '7d';
  if (period === 'custom' && !q.from) {
    throw new BadRequestException('period=custom requires `from`');
  }
  // CSV → string[]. Empty string + filter out blanks so trailing commas
  // ('a,b,') don't produce empty UUID values.
  const categoryIds = csvToUuidList(q.category, 'category');
  const selectedEntityIds = csvToUuidList(q.entityIds, 'entityIds');
  const selectedArticleIds = csvToUuidList(q.articleIds, 'articleIds');
  return {
    period,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    top: q.top,
    categoryIds,
    anchor: q.anchor,
    selectedEntityIds,
    selectedArticleIds,
  };
}
