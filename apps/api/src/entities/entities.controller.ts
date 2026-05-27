import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { EntityDetail, RecentEntitiesResponse } from '@intelligencehub/shared';
import { EntitiesService } from './entities.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

@Controller('entities')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Get()
  async listRecent(@CurrentUser() user: AuthUserContext): Promise<RecentEntitiesResponse> {
    const entities = await this.entitiesService.listRecent(user.userId);
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
