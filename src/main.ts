import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';

import { AppModule } from './app.module';
import { AppLogger } from './common/services/app-logger.service';

async function bootstrap(): Promise<void> {
  const logger = new AppLogger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('RPC Proxy Backend')
    .setDescription('NestJS RPC Proxy Backend for Dynamic Pricing System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Start server
  const port = process.env.PORT || 3000;
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
