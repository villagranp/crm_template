/**
 * Regenera las plantillas versionadas de la carga inicial en `docs/templates/`
 * (docs/implementation-plans/CARGA-INICIAL.md).
 *
 *   pnpm --filter @app/backend run load:data:templates [carpeta-de-salida]
 *
 * Los «Valores válidos» son los catálogos que trae la semilla esencial (países, tipos y sectores de
 * proyecto, unidades de medida, fases, etapas, resultados y motivos); las familias no se siembran, así que la lista de familias va
 * vacía. Los ejemplos son ficticios. No usa la base de datos. Hay que volver a ejecutarlo cuando
 * cambie una plantilla (`INITIAL_DATA_TEMPLATE_VERSION`): una prueba compara los encabezados de
 * los archivos versionados con los del código.
 */
import 'reflect-metadata';
import '../prisma/seed/register-path-aliases';

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { CRM_CATALOGS } from '../prisma/seed/crm-catalogs';
import { COUNTRIES, UNITS_OF_MEASURE } from '../prisma/seed/crm-masters';

async function main(): Promise<void> {
  const { buildTemplateFiles } = await import('../src/modules/initial-data-load/initial-data-template-files');
  const { INITIAL_DATA_ENTITIES } = await import('../src/modules/initial-data-load/initial-data-templates');

  const catalogItems = (key: string): { code: string; label: string }[] =>
    (CRM_CATALOGS.find((catalog) => catalog.key === key)?.items ?? []).map((item) => ({ code: item.code, label: item.label }));
  const values = {
    countries: COUNTRIES.map((country) => ({ code: country.isoCode, label: country.name })),
    projectTypes: catalogItems('crm.tipo_proyecto'),
    sectors: catalogItems('crm.sector_proyecto'),
    units: UNITS_OF_MEASURE.map((unit) => ({ code: unit.code, label: unit.name })),
    families: [],
    phases: catalogItems('crm.fase_cliente'),
    stages: catalogItems('crm.etapa_oportunidad'),
    outcomes: catalogItems('crm.resultado_oportunidad'),
    reasons: catalogItems('crm.motivo_resultado'),
  };

  const outDir = resolve(process.argv[2] ?? join(__dirname, '..', '..', 'docs', 'templates'));
  await mkdir(outDir, { recursive: true });
  for (const entity of INITIAL_DATA_ENTITIES) {
    for (const format of ['CSV', 'XLSX'] as const) {
      for (const file of await buildTemplateFiles(entity, format, values)) {
        // Los CSV versionados van con LF (el repositorio normaliza los finales de línea); Excel los abre igual.
        const content = file.fileName.endsWith('.csv') ? Buffer.from(file.content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : file.content;
        await writeFile(join(outDir, file.fileName), content);
        process.stdout.write(`${join(outDir, file.fileName)}\n`);
      }
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`No se pudieron generar las plantillas (${error instanceof Error ? error.name : 'error'}).\n`);
  process.exitCode = 1;
});
