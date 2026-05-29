import { Controller, Get } from '@nestjs/common';
import type { PublicConfig } from '@intelligencehub/shared';
import { loadEnv } from './env';

/**
 * Public, non-sensitive runtime config exposed to the frontend so it can
 * mirror server-side limits (e.g. selection caps) without duplicating env
 * vars on the client. Add only values that the SPA legitimately needs and
 * that are safe to leak to anonymous traffic.
 */
@Controller('config')
export class ConfigController {
  @Get()
  get(): PublicConfig {
    const env = loadEnv();
    return {
      graphSelectionCap: env.GRAPH_SELECTION_CAP,
    };
  }
}
