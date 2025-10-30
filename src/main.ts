import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';

import { AppModule } from './app.module';
import { AppLogger } from './common/services/app-logger.service';
import { SERVER_CONFIG } from './config/constants';

async function bootstrap(): Promise<void> {
  const logger = new AppLogger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: SERVER_CONFIG.CORS_ORIGIN,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api', {
    exclude: [
      '/health',
      '/',
      '/favicon.ico',
      '/dashboard',
      '/init-discord-channel',
      '/payment-status',
      '/regenerate-api-key',
      '/my-api-keys',
      '/debug',
      '/manual-process',
      '/force-complete',
      '/rpc-info',
    ],
  });

  const config = new DocumentBuilder()
    .setTitle('RPC Proxy Backend')
    .setDescription('NestJS RPC Proxy Backend for Dynamic Pricing System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = SERVER_CONFIG.PORT;
  await app.listen(port);

  const configService = app.get(ConfigService);
  const baseUrl = configService.get<string>('urls.baseUrl');
  const swaggerUrl = configService.get<string>('urls.swaggerUrl');

  logger.log(`Application is running on: ${baseUrl}`);
  logger.log(`Swagger docs available at: ${swaggerUrl}`);
}

bootstrap().catch(_error => {
  process.exit(1);
});
