import type { Prisma } from '@prisma/client';

import { SequenceNotFoundError } from '@/infrastructure/database/ports/sequence-generator.port';

import { PrismaSequenceGenerator } from './prisma-sequence-generator';
import type { PrismaService } from './prisma.service';
import { wrapPrismaTransaction } from './prisma-transaction';

interface Row {
  id: string;
  prefix: string;
  pattern: string;
  padding: number;
  current_value: number;
  reset_policy: string;
  period_key: string | null;
}

function fakeTx(row: Row | undefined) {
  const queryRaw = jest.fn(async () => (row ? [row] : []));
  const executeRaw = jest.fn(async () => 1);
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;
  return { tx, queryRaw, executeRaw };
}

/** Texto SQL de una llamada a `$queryRaw`/`$executeRaw` con plantilla. */
function sqlOf(call: unknown[]): string {
  return (call[0] as TemplateStringsArray).join('?');
}

const CLIENTE: Row = {
  id: 'seq-1',
  prefix: 'CLI',
  pattern: '{prefix}-{seq}',
  padding: 6,
  current_value: 122,
  reset_policy: 'NONE',
  period_key: null,
};

describe('PrismaSequenceGenerator', () => {
  it('bloquea la fila con FOR UPDATE, incrementa y formatea dentro de la transacción del llamador', async () => {
    const { tx, queryRaw, executeRaw } = fakeTx(CLIENTE);
    const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
    const generator = new PrismaSequenceGenerator(prisma);

    const code = await generator.next('crm.cliente', wrapPrismaTransaction(tx));

    expect(code).toBe('CLI-000123');
    expect(sqlOf(queryRaw.mock.calls[0] as unknown[])).toContain('FOR UPDATE');
    expect(queryRaw.mock.calls[0]).toContain('crm.cliente');
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0]).toEqual(expect.arrayContaining([123, null, 'seq-1']));
    // Con transacción del llamador no abre otra.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin transacción abre una propia', async () => {
    const { tx } = fakeTx(CLIENTE);
    const prisma = {
      $transaction: jest.fn(async (work: (client: Prisma.TransactionClient) => Promise<string>) => work(tx)),
    } as unknown as PrismaService;

    await expect(new PrismaSequenceGenerator(prisma).next('crm.cliente')).resolves.toBe('CLI-000123');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reinicia a 1 al cambiar de año en la zona horaria indicada', async () => {
    const { tx, executeRaw } = fakeTx({
      ...CLIENTE,
      prefix: 'PRY',
      pattern: '{prefix}-{year}-{seq}',
      padding: 5,
      current_value: 87,
      reset_policy: 'YEAR',
      period_key: '2026',
    });
    const generator = new PrismaSequenceGenerator({} as PrismaService);

    const code = await generator.next('crm.proyecto', wrapPrismaTransaction(tx), {
      at: new Date('2027-01-01T07:00:00.000Z'),
      timeZone: 'America/Guatemala',
    });

    expect(code).toBe('PRY-2027-00001');
    expect(executeRaw.mock.calls[0]).toEqual(expect.arrayContaining([1, '2027']));
  });

  it('una clave inexistente es un fallo de configuración y no escribe nada', async () => {
    const { tx, executeRaw } = fakeTx(undefined);
    const generator = new PrismaSequenceGenerator({} as PrismaService);

    await expect(generator.next('no.existe', wrapPrismaTransaction(tx))).rejects.toBeInstanceOf(SequenceNotFoundError);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('rechaza una política de reinicio desconocida', async () => {
    const { tx } = fakeTx({ ...CLIENTE, reset_policy: 'WEEK' });
    const generator = new PrismaSequenceGenerator({} as PrismaService);

    await expect(generator.next('crm.cliente', wrapPrismaTransaction(tx))).rejects.toThrow('unknown reset policy');
  });
});
