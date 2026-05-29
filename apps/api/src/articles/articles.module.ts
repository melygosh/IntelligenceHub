import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@intelligencehub/shared';
import { LlmModule } from '../llm/llm.module';
import { EntitiesModule } from '../entities/entities.module';
import { EmbeddingModule } from '../embeddings/embedding.module';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { ArticleProcessor } from './article-processor.service';
import { UserConfigService } from './user-config.service';
import { RelatedSemanticService } from './related-semantic.service';

@Module({
  imports: [
    LlmModule,
    EntitiesModule,
    EmbeddingModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.EMBED_BACKFILL }),
  ],
  controllers: [ArticlesController],
  providers: [
    ArticlesService,
    ArticleProcessor,
    UserConfigService,
    RelatedSemanticService,
  ],
  exports: [ArticleProcessor, UserConfigService],
})
export class ArticlesModule {}
