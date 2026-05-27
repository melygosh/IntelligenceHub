import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { OpenAiAdapter } from './openai.adapter';
import { LlmResponseCacheService } from './llm-cache.service';
import { LlmService } from './llm.service';

@Module({
  providers: [
    AnthropicAdapter,
    OpenAiAdapter,
    LlmResponseCacheService,
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
