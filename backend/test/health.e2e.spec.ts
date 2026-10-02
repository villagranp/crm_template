import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

/**
 * E2E del skeleton: verifica el contrato de las sondas y el correlation ID.
 * La base de datos se sustituye para que la prueba no dependa de infraestructura externa.
 */
describe('Health endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        checkConnection: async () => true,
        onModuleInit: async () => undefined,
        onModuleDestroy: async () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('GET /api/v1/ready returns 200 when dependencies are up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);

    expect(response.body.status).toBe('ready');
  });

  it('returns a correlation id header on every response', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.headers['x-correlation-id']).toBeDefined();
  });

  it('preserves a safe incoming correlation id', async () => {
    const correlationId = 'abc123-correlation';

    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-correlation-id', correlationId)
      .expect(200);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });

  it('returns 404 with the standard error shape for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404, code: expect.any(String) });
    expect(response.body.correlationId).toBeDefined();
  });
});
