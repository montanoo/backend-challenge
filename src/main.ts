import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  if (process.env.NODE_ENV !== 'production') {
    app.useStaticAssets(join(process.cwd(), 'demo'), { prefix: '/demo' });
  }
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
