import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aislamiento entre suites (AGENTS §9.8.2): corren en paralelo sobre el mismo esquema, así
 * que dos suites con el mismo país de prueba se pisan (`testCountry` hace upsert y repone
 * moneda, patrones y nombre). Pasó al integrar los Módulos 3 y 4: `V1` y `R4` compartidos
 * hacían fallar las pruebas de moneda de Oportunidades según el orden de ejecución.
 */
describe('aislamiento de las suites de integración', () => {
  it('cada código de país de prueba (`testCountry`) pertenece a una sola suite', () => {
    const owners = new Map<string, Set<string>>();
    for (const file of readdirSync(__dirname).filter((name) => name.endsWith('.e2e.spec.ts'))) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const match of source.matchAll(/testCountry\(\s*[\w.]+,\s*'([A-Z0-9]{2})'/g)) {
        const code = match[1] as string;
        owners.set(code, (owners.get(code) ?? new Set()).add(file));
      }
    }
    const shared = [...owners].filter(([, files]) => files.size > 1).map(([code, files]) => `${code}: ${[...files].join(', ')}`);
    expect(owners.size).toBeGreaterThan(0);
    expect(shared).toEqual([]);
  });
});
