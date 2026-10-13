import { plainToInstance, Transform } from 'class-transformer';
import { IsOptional, IsUUID, validateSync } from 'class-validator';

import { toLowerCaseUuid } from './uuid-transform';

class Sample {
  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID()
  ownerId?: string | null;

  @IsOptional()
  @Transform(toLowerCaseUuid)
  @IsUUID('all', { each: true })
  ids?: string[];
}

describe('toLowerCaseUuid (03 Revisión E5, m1)', () => {
  it('normaliza a minúsculas un UUID y cada elemento de una lista; la validación sigue aceptándolos', () => {
    const sample = plainToInstance(Sample, {
      ownerId: 'A1B2C3D4-0000-4000-8000-00000000ABCD',
      ids: ['A1B2C3D4-0000-4000-8000-00000000ABCD', 'a1b2c3d4-0000-4000-8000-00000000abce'],
    });
    expect(sample.ownerId).toBe('a1b2c3d4-0000-4000-8000-00000000abcd');
    expect(sample.ids).toEqual(['a1b2c3d4-0000-4000-8000-00000000abcd', 'a1b2c3d4-0000-4000-8000-00000000abce']);
    expect(validateSync(sample)).toEqual([]);
  });

  it('null, números y valores no textuales pasan intactos (los rechaza su validador)', () => {
    expect(plainToInstance(Sample, { ownerId: null }).ownerId).toBeNull();
    const invalid = plainToInstance(Sample, { ownerId: 12 as unknown as string });
    expect(invalid.ownerId).toBe(12);
    expect(validateSync(invalid).map((error) => error.property)).toEqual(['ownerId']);
  });
});
