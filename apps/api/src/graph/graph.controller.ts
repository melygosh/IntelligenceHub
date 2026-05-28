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
      categoryId: q.category,
      anchorEntityId: q.anchor,
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
      categoryId: q.category,
    });
  }
}

type ParsedGraphQuery = {
  period: GraphPeriod;
  from?: Date;
  to?: Date;
  top?: number;
  category?: string;
  anchor?: string;
};

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
  return {
    period,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    top: q.top,
    category: q.category,
    anchor: q.anchor,
  };
}
