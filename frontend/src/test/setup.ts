import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Las consultas `findBy*`/`waitFor` esperan 1 s por defecto. Con la máquina
// cargada (CI, suites en paralelo) las consultas por rol en jsdom tardan más y
// daban falsos rojos; un elemento que nunca aparece sigue fallando, a los 5 s.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
