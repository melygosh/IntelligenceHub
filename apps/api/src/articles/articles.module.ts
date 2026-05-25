import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { ArticleProcessor } from './article-processor.service';

@Module({
  imports: [LlmModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleProcessor],
  exports: [ArticleProcessor],
})
export class ArticlesModule {}
