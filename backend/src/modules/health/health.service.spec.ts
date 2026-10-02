import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { AppConfigService } from '@/config/app-config.service';

describe('HealthService', () => {
  const createService = async (isDatabaseUp: boolean): Promise<HealthService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { checkConnection: async () => isDatabaseUp } },
        { provide: AppConfigService, useValue: { get: () => 'test-app' } },
      ],
    }).compile();

    return moduleRef.get(HealthService);
  };

  it('reports the process as alive without querying dependencies', async () => {
    const service = await createService(false);

    const liveness = service.getLiveness();

    expect(liveness.status).toBe('ok');
    expect(liveness.app).toBe('test-app');
  });

  it('reports readiness when the database responds', async () => {
    const service = await createService(true);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('ready');
    expect(readiness.checks).toContainEqual({ name: 'database', status: 'up' });
  });

  it('reports not ready when the database does not respond', async () => {
    const service = await createService(false);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.checks).toContainEqual({ name: 'database', status: 'down' });
  });
});
