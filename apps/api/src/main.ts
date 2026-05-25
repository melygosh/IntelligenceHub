import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadEnv } from './common/config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.enableCors({
    origin: [env.WEB_BASE_URL],
    credentials: true,
  });
  // path-to-regexp 8.x (NestJS 11) uses named splats: '*path' replaces the old '(.*)?'.
  app.setGlobalPrefix('api', { exclude: ['/admin/queues', '/admin/queues/*path'] });

  await app.listen(env.API_PORT);
  console.warn(`[bootstrap] API listening on ${env.API_PORT}`);
}

void bootstrap();
