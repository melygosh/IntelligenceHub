import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { EntityDetail, EntityListResponse } from '@intelligencehub/shared';
import { EntityKind, EntitySort } from '@intelligencehub/shared';
import { EntitiesService } from './entities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import {
  CurrentUser,
  type AuthUserContext,
} from '../common/decorators/current-user.decorator';

@Controller('entities')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUserContext,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
  ): Promise<EntityListResponse> {
    const parsedType = EntityKind.safeParse(type);
    const parsedSort = EntitySort.safeParse(sort);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const entities = await this.entitiesService.list(user.userId, {
      type: parsedType.success ? parsedType.data : undefined,
      q: q || undefined,
      sort: parsedSort.success ? parsedSort.data : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    return { entities };
  }

  @Get(':id')
  async getById(
    @CurrentUser() user: AuthUserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EntityDetail> {
    const result = await this.entitiesService.getById(id, user.userId);
    if (!result) throw new NotFoundException();
    return result;
  }
}
