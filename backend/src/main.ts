import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/filters/validation-exception.factory';
import { AppConfigService } from './config/app-config.service';
import { AppLogger } from './infrastructure/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  // bufferLogs evita perder eventos de arranque antes de resolver el logger propio.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

  // Detras de NGINX `req.ip` seria siempre la IP del proxy y el rate limiting
  // trataria a todos los usuarios como uno solo. Se confia en un numero EXACTO de
  // saltos (TRUST_PROXY_HOPS, 1 por defecto): la API solo es alcanzable a traves
  // de NGINX (no publica puerto en Compose) y NGINX sobrescribe X-Forwarded-For.
  // Con un WAF/Front Door delante de NGINX son 2. Confiar por rango de red no
  // sirve: en una red corporativa los clientes tambien tienen IP privada y
  // podrian falsear la suya enviando la cabecera.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS'));

  app.use(helmet());

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', config.get('CORRELATION_ID_HEADER')],
  });

  app.setGlobalPrefix(config.get('API_GLOBAL_PREFIX'));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.get('API_DEFAULT_VERSION'),
  });

  // Errores de validación: `400 VALIDATION_FAILED` con `details[]` (DC-6). Las mismas
  // opciones se usan en `test/support/test-app.ts`.
  app.useGlobalPipes(createValidationPipe());

  if (config.get('SWAGGER_ENABLED') && !config.isProduction) {
    const documentConfig = new DocumentBuilder()
      .setTitle(`${config.get('APP_NAME')} API`)
      .setDescription('Contrato REST. Ver API-STANDARDS.md para las normas obligatorias.')
      .setVersion(config.get('API_DEFAULT_VERSION'))
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();

    SwaggerModule.setup(
      `${config.get('API_GLOBAL_PREFIX')}/docs`,
      app,
      SwaggerModule.createDocument(app, documentConfig),
      { swaggerOptions: { persistAuthorization: true } },
    );
  }

  app.enableShutdownHooks();

  const port = config.get('API_PORT');
  await app.listen(port);

  logger.info('application_started', {
    port,
    environment: config.get('NODE_ENV'),
    authProvider: config.get('AUTH_PROVIDER'),
    swaggerEnabled: config.get('SWAGGER_ENABLED') && !config.isProduction,
  });
}

void bootstrap();
