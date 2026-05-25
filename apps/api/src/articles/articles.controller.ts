import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ArticleListResponse } from '@intelligencehub/shared';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequireConfirmedEmailGuard } from '../common/guards/require-confirmed-email.guard';
import { CurrentUser, type AuthUserContext } from '../common/decorators/current-user.decorator';

@Controller('articles')
@UseGuards(JwtAuthGuard, RequireConfirmedEmailGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  async list(@CurrentUser() user: AuthUserContext): Promise<ArticleListResponse> {
    const articles = await this.articlesService.listMine(user.userId);
    return { articles };
  }
}
