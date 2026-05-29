import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetGraphQuery, type GraphPeriod } from '@intelligencehub/shared';
import { DEFAULT_TOP, GraphService } from './graph.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';
import { loadEnv } from '../common/config/env';

@Controller('graph')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

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

// Cap on entityIds / articleIds list length (per kind). Each UUID + comma is
// ~37 chars, so the default 100 = ~3.7KB per list — well under Node's default
// 16KB max-http-header-size. Sourced from env (GRAPH_SELECTION_CAP) so it
// matches whatever value the frontend learns via GET /api/config.
function getGraphIdCap(): number {
  return loadEnv().GRAPH_SELECTION_CAP;
}

function csvToUuidList(
  raw: string | undefined,
  paramName: string,
  maxCount?: number,
): string[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (maxCount !== undefined && ids.length > maxCount) {
    throw new BadRequestException(
      `${paramName} accepts at most ${maxCount} IDs (got ${ids.length})`,
    );
  }
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException(`invalid ${paramName} UUID: ${id}`);
    }
  }
  return ids;
}

/**
 * Parse + validate /graph query params. Mirrors ZodValidationPipe's error-body
 * shape ({message: 'Validation failed', errors}). Also enforces the cross-field
 * rule that Zod can't express on its own: period=custom requires `from`.
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
  const cap = getGraphIdCap();
  const selectedEntityIds = csvToUuidList(q.entityIds, 'entityIds', cap);
  const selectedArticleIds = csvToUuidList(q.articleIds, 'articleIds', cap);
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
