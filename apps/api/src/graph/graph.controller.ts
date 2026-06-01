import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GraphRequest } from '@intelligencehub/shared';
import { DEFAULT_TOP, GraphService } from './graph.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';
import { loadEnv } from '../common/config/env';

@Controller('graph')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  // POST (not GET): explicit entity/article selections can be 100+ UUIDs each,
  // too large for a query string, so they ride in the JSON body. It stays a
  // read-only query semantically; HttpCode(200) keeps it from defaulting to 201.
  @Post()
  @HttpCode(200)
  async build(
    @CurrentUser() user: AuthUserContext,
    @Body(new ZodValidationPipe(GraphRequest)) body: GraphRequest,
  ) {
    const period = body.period ?? '7d';
    if (period === 'custom' && !body.from) {
      throw new BadRequestException('period=custom requires `from`');
    }
    const cap = loadEnv().GRAPH_SELECTION_CAP;
    const selectedEntityIds = capList(
      body.selectedEntityIds,
      'selectedEntityIds',
      cap,
    );
    const selectedArticleIds = capList(
      body.selectedArticleIds,
      'selectedArticleIds',
      cap,
    );
    return this.graph.buildMine(user.userId, {
      period,
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
      top: body.top ?? DEFAULT_TOP,
      categoryIds: body.categoryIds ?? [],
      anchorEntityId: body.anchorEntityId,
      selectedEntityIds,
      selectedArticleIds,
      timeline: body.timeline ?? false,
    });
  }
}

// UUID shape is already validated by the Zod schema; here we only enforce the
// environment-driven per-list length cap (GRAPH_SELECTION_CAP), which Zod can't
// express statically.
function capList(
  ids: string[] | undefined,
  paramName: string,
  max: number,
): string[] {
  const list = ids ?? [];
  if (list.length > max) {
    throw new BadRequestException(
      `${paramName} accepts at most ${max} IDs (got ${list.length})`,
    );
  }
  return list;
}
