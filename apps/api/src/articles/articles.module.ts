import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EntitiesModule } from '../entities/entities.module';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { ArticleProcessor } from './article-processor.service';
import { UserConfigService } from './user-config.service';

@Module({
  imports: [LlmModule, EntitiesModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleProcessor, UserConfigService],
  exports: [ArticleProcessor, UserConfigService],
})
export class ArticlesModule {}
