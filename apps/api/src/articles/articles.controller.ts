import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ArticleDetail, ArticleListResponse } from '@intelligencehub/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

@Controller('articles')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUserContext,
    @Query('category', new ParseUUIDPipe({ optional: true })) category?: string,
  ): Promise<ArticleListResponse> {
    const items = await this.articles.listMine(user.userId, category);
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
