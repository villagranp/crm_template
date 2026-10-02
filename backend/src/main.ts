import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AppLogger } from './infrastructure/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  // bufferLogs evita perder eventos de arranque antes de resolver el logger propio.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  const logger = app.get(AppLogger);

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
