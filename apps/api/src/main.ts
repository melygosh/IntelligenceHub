import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './common/config/env';
import { basicAuth } from './common/middleware/basic-auth.middleware';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  // Security headers (nosniff, frameguard, referrer-policy, etc.). CSP is left
  // off here: the API serves JSON + the Bull Board HTML (whose own assets a
  // strict CSP would break); the SPA's CSP belongs to the web server.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: [env.WEB_BASE_URL],
    credentials: true,
  });

  // Bull Board basic auth — must be applied BEFORE the route is reached.
  app.use(
    '/admin/queues',
    basicAuth(
      env.BULL_BOARD_USER,
      env.BULL_BOARD_PASS,
      'IntelligenceHub Queues',
    ),
  );

  // path-to-regexp 8.x (NestJS 11) uses named splats: '*path' replaces the old '(.*)?'.
  app.setGlobalPrefix('api', {
    exclude: ['/admin/queues', '/admin/queues/*path'],
  });

  await app.listen(env.API_PORT);
  console.warn(`[bootstrap] API listening on ${env.API_PORT}`);
}

void bootstrap();
