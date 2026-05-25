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
  app.setGlobalPrefix('api', { exclude: ['/admin/queues(.*)?'] });

  await app.listen(env.API_PORT);
  console.warn(`[bootstrap] API listening on ${env.API_PORT}`);
}

void bootstrap();
