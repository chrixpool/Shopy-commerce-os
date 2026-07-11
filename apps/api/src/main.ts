import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // CORS — only allow from Next.js frontend
  app.enableCors({
    origin: process.env.CORS_ORIGIN || process.env.AUTH_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > 1500) {
        console.warn(
          JSON.stringify({
            event: 'slow_request',
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
          }),
        );
      }
    });
    next();
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API versioning prefix
  app.setGlobalPrefix('api/v1');

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Shopy API')
      .setDescription('Shopy commerce operations cockpit API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT ?? process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀 Shopy API running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
