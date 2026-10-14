import { Prisma } from '@prisma/client';

import { httpStatusOf } from '@/common/filters/all-exceptions.filter';
import { reportTimeoutError } from '@/modules/commercial-metrics/commercial-metrics-errors';

import { isReadTimeout } from './report-read';

describe('report-read', () => {
  it('reconoce el vencimiento de la sentencia (57014) y de la transacción interactiva (P2028)', () => {
    const raw = new Prisma.PrismaClientKnownRequestError('Raw query failed. Code: `57014`. Message: `canceling statement due to statement timeout`', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: '57014', message: 'canceling statement due to statement timeout' },
    });
    const transaction = new Prisma.PrismaClientKnownRequestError('Transaction API error', { code: 'P2028', clientVersion: 'test' });
    expect(isReadTimeout(raw)).toBe(true);
    expect(isReadTimeout(transaction)).toBe(true);
    expect(isReadTimeout(new Error('canceling statement due to statement timeout'))).toBe(true);
    expect(isReadTimeout(new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }))).toBe(false);
    expect(isReadTimeout(new Error('syntax error'))).toBe(false);
    expect(isReadTimeout('57014 en un texto que no es un error')).toBe(false);
  });

  it('REPORT_TIMEOUT se traduce a 503 (API-STANDARDS §3, 05 F.5)', () => {
    const error = reportTimeoutError();
    expect(error).toMatchObject({ code: 'REPORT_TIMEOUT', message: 'The query took too long; narrow the filters', details: [] });
    expect(httpStatusOf(error)).toBe(503);
  });
});
