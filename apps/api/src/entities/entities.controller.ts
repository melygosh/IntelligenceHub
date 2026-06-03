import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { EntityDetail, EntityListResponse } from '@intelligencehub/shared';
import {
  DEFAULT_PAGE_SIZE,
  EntityKind,
  EntitySort,
  MAX_PAGE_SIZE,
  UpdateEntityRequest,
} from '@intelligencehub/shared';
import { EntitiesService } from './entities.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
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
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ): Promise<EntityListResponse> {
    const parsedType = EntityKind.safeParse(type);
    const parsedSort = EntitySort.safeParse(sort);
    const parsedPage = pageRaw ? Number.parseInt(pageRaw, 10) : NaN;
    const parsedPageSize = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : NaN;
    const page = Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1);
    const pageSize = Math.min(
      Math.max(
        Number.isFinite(parsedPageSize) ? parsedPageSize : DEFAULT_PAGE_SIZE,
        1,
      ),
      MAX_PAGE_SIZE,
    );
    const { items, total } = await this.entitiesService.list(user.userId, {
      type: parsedType.success ? parsedType.data : undefined,
      q: q || undefined,
      sort: parsedSort.success ? parsedSort.data : undefined,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return { entities: items, total, page, pageSize };
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

  @Patch(':id')
  async updateType(
    @CurrentUser() user: AuthUserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEntityRequest))
    body: UpdateEntityRequest,
  ): Promise<EntityDetail> {
    const result = await this.entitiesService.updateType(
      id,
      user.userId,
      body.type,
    );
    if (!result) throw new NotFoundException();
    return result;
  }
}
