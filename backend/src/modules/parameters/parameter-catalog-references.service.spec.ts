import { ParameterCatalogReferencesService } from './parameter-catalog-references.service';
import type { ParametersRepository, SystemParameterRecord } from './ports/parameters.repository.port';

const STAGE = 'crm.etapa_oportunidad';
const TRANSITIONS = 'crm.oportunidades.transiciones_etapa';

function parameter(key: string, value: string): SystemParameterRecord {
  return { key, value, type: 'JSON' } as SystemParameterRecord;
}

describe('ParameterCatalogReferencesService (RN-07.26)', () => {
  let repository: jest.Mocked<ParametersRepository>;
  let service: ParameterCatalogReferencesService;

  beforeEach(() => {
    repository = { listAll: jest.fn(), findByKey: jest.fn().mockResolvedValue(null), updateValue: jest.fn() };
    service = new ParameterCatalogReferencesService(repository);
  });

  it('devuelve las claves cuyo valor usa el código', async () => {
    repository.findByKey.mockImplementation(async (key: string) =>
      key === TRANSITIONS ? parameter(key, '{"CONTACTADO":["COTIZANDO"]}') : null,
    );

    await expect(service.parameterKeysUsing(STAGE, 'COTIZANDO')).resolves.toEqual([TRANSITIONS]);
    await expect(service.parameterKeysUsing(STAGE, 'CONTACTADO')).resolves.toEqual([TRANSITIONS]);
  });

  it('vacío si ningún parámetro usa el código o si el catálogo no tiene reglas que lo referencien', async () => {
    repository.findByKey.mockImplementation(async (key: string) =>
      key === TRANSITIONS ? parameter(key, '{"CONTACTADO":["COTIZANDO"]}') : null,
    );

    await expect(service.parameterKeysUsing(STAGE, 'PERDIDO')).resolves.toEqual([]);
    await expect(service.parameterKeysUsing('tipos-sin-reglas', 'A')).resolves.toEqual([]);
  });

  it('un valor guardado ilegible no bloquea', async () => {
    repository.findByKey.mockImplementation(async (key: string) => (key === TRANSITIONS ? parameter(key, '{no-json') : null));

    await expect(service.parameterKeysUsing(STAGE, 'COTIZANDO')).resolves.toEqual([]);
  });
});
