import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

describe('HealthService', () => {
  const createService = async (isDatabaseUp: boolean): Promise<HealthService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: { checkConnection: async () => isDatabaseUp } }],
    }).compile();

    return moduleRef.get(HealthService);
  };

  it('reports the process as alive without querying dependencies, with only status and timestamp', async () => {
    const service = await createService(false);

    const liveness = service.getLiveness();

    expect(Object.keys(liveness).sort()).toEqual(['status', 'timestamp']);
    expect(liveness.status).toBe('ok');
    expect(Number.isNaN(Date.parse(liveness.timestamp))).toBe(false);
  });

  it('reports readiness when the database responds, without naming the dependency', async () => {
    const service = await createService(true);

    const readiness = await service.getReadiness();

    expect(readiness).toEqual({ status: 'ready', timestamp: expect.any(String) });
  });

  it('reports not ready when the database does not respond', async () => {
    const service = await createService(false);

    const readiness = await service.getReadiness();

    expect(readiness).toEqual({ status: 'not_ready', timestamp: expect.any(String) });
  });
});
