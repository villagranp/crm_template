/**
 * Alias `@/*` → `src/*` (los de `tsconfig.json`) para los scripts de semilla, que
 * corren con `ts-node --transpile-only` sin Nest ni Jest. Hace falta cuando la
 * semilla reutiliza código de `src/` que importa por alias (p. ej. el adaptador
 * `LocalFileSystemStorage`, ADR-021). Se importa ANTES que cualquier módulo de `src/`.
 *
 * Usa `tsconfig-paths` (ya dependencia de desarrollo del backend) con la base
 * fijada a `backend/`, así no depende del directorio de trabajo.
 */
import { resolve } from 'node:path';

import { register } from 'tsconfig-paths';

register({ baseUrl: resolve(__dirname, '..', '..'), paths: { '@/*': ['src/*'] } });
