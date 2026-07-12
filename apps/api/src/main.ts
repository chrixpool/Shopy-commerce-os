import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.API_INTERNAL_SECRET) {
    throw new Error('API_INTERNAL_SECRET is required in production');
  }
  if (process.env.NODE_ENV !== 'production' && !process.env.API_INTERNAL_SECRET) {
    process.env.API_INTERNAL_SECRET = 'local-development-only-secret';
  }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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

  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const policy = rateLimitPolicy(req.path, req.method);
    if (!policy) return next();
    const now = Date.now();
    const actor = String(req.headers['x-user-id'] ?? req.ip ?? 'anonymous');
    const key = `${actor}:${req.method}:${req.path}`;
    const current = rateBuckets.get(key);
    const bucket =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + policy.windowMs } : current;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > policy.limit) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ message: 'Too many requests. Please retry shortly.' });
    }
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

function rateLimitPolicy(path: string, method: string) {
  if (method === 'POST' && /^\/api\/v1\/auth\/(validate|register)$/.test(path)) {
    return { limit: 10, windowMs: 60_000 };
  }
  if (method === 'POST' && /^\/api\/v1\/webhooks\//.test(path)) {
    return { limit: 180, windowMs: 60_000 };
  }
  if (
    method === 'POST' &&
    /^\/api\/v1\/integrations\/[^/]+\/(connect|test|lookup|sync)$/.test(path)
  ) {
    return { limit: 30, windowMs: 60_000 };
  }
  return null;
}
