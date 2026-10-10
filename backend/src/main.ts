import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AppLogger } from './infrastructure/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  // bufferLogs evita perder eventos de arranque antes de resolver el logger propio.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

  // Detras de NGINX `req.ip` seria siempre la IP del proxy y el rate limiting
  // trataria a todos los usuarios como uno solo. Se confia en exactamente UN
  // salto: la API solo es alcanzable a traves de NGINX (no publica puerto en
  // Compose) y NGINX sobrescribe X-Forwarded-For con la IP real. Confiar por
  // rango de red no sirve: en una red corporativa los clientes tambien tienen
  // IP privada y podrian falsear la suya enviando la cabecera.
  app.set('trust proxy', 1);

  app.use(helmet());

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', config.get('CORRELATION_ID_HEADER')],
  });

  app.setGlobalPrefix(config.get('API_GLOBAL_PREFIX'));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.get('API_DEFAULT_VERSION'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // En produccion no se devuelve el detalle de validacion generado por defecto:
      // el filtro global construye la respuesta con el formato estandar.
      disableErrorMessages: false,
    }),
  );

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
