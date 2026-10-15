import { expect, test, type Locator, type Page, type Response } from '@playwright/test';

/**
 * Recorridos de «Ajustes 1» (docs/implementation-plans/AJUSTES-1.md §10: PF-AJ1.24 y
 * PF-AJ1.25, más un recorrido corto de barra superior, acceso y pie de página).
 *
 * Precondiciones (TESTING.md §«E2E de Ajustes 1» y `backend/scripts/e2e-stack.ts`):
 * - Stack aislado con la semilla esencial y la demo, en un esquema propio (nunca la base de
 *   desarrollo). El asesor demo (`E2E_ASESOR_*`) y el administrador ya tienen contraseña personal
 *   (`activate` la deja así).
 * - Valores sembrados de los parámetros `ui.barra_superior.*` y `ui.inicio.tarjetas` (el
 *   recorrido de la barra superior los restaura al terminar).
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — administrador (permisos de minuto de seguridad y parámetros).
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor demo con acceso comercial.
 *
 * Repetibilidad: el minuto de seguridad de HOY es único por fecha y no se puede borrar (D-AJ1.5),
 * así que si ya existe (otra ejecución del mismo día) el recorrido lo EDITA con un mensaje de
 * sufijo único; si no existe, lo crea. El asesor deja su panel y su tema como los encontró: el
 * recorrido empieza normalizándolos (restablece un panel personalizado, vuelve a claro).
 */

const env = (name: string) => process.env[name] ?? '';
const adminEmail = env('E2E_ADMIN_EMAIL');
const adminPassword = env('E2E_ADMIN_PASSWORD');
const asesorEmail = env('E2E_ASESOR_EMAIL');
const asesorPassword = env('E2E_ASESOR_PASSWORD');

const hasAdmin = Boolean(adminEmail && adminPassword);
const hasAsesor = Boolean(asesorEmail && asesorPassword);

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
/** Varios inicios de sesión (Argon2id) y recargas de Inicio con Vite compilando bajo demanda. */
const TEST_TIMEOUT_MS = 150_000;
const SLOW = { timeout: 20_000 } as const;
/** `crm.zona_horaria_negocio` sembrada: define «hoy» para el minuto de seguridad (AC-AJ1.11). */
const BUSINESS_TIME_ZONE = 'America/Guatemala';
const PAIR_ROW_TOLERANCE_PX = 4;

/** Recorrido en escritorio (`lg` o más) y con la zona del negocio: el formulario valida «hoy» con la zona del navegador. */
test.use({
  timezoneId: BUSINESS_TIME_ZONE,
  colorScheme: 'light',
  viewport: { width: 1440, height: 900 },
});

/** «Hoy» como `YYYY-MM-DD` en la zona del negocio (no en UTC: de noche el día UTC ya cambió). */
function todayInBusinessZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`, como el nombre accesible de las acciones de la tabla. */
function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Promesa de la respuesta de la API con ese método y ruta (y esos parámetros de consulta). */
function waitForApi(
  page: Page,
  method: string,
  path: RegExp,
  query: Record<string, string> = {},
): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) {
      return false;
    }
    const url = new URL(response.url());
    return (
      url.pathname.startsWith(API_PREFIX) &&
      path.test(url.pathname.slice(API_PREFIX.length)) &&
      Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
    );
  });
}

/** Inicia sesión y devuelve la respuesta de `POST /auth/login` (sin comprobar su status). */
async function submitLogin(page: Page, email: string, password: string): Promise<Response> {
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/^contraseña/i).fill(password);
  const login = waitForApi(page, 'POST', /^\/auth\/login$/);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  return login;
}

/** Acceso de una cuenta sin cambio pendiente: espera el login y el menú reales (TESTING.md, notas de carga). */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
  const login = await submitLogin(page, email, password);
  expect(login.status()).toBe(HTTP_OK);
  expect((await menu).status()).toBe(HTTP_OK);
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
}

/** `true` si `first` va antes que `second` en la rejilla de Inicio (por fila y, en la misma fila, por columna). */
async function isBefore(first: Locator, second: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!a || !b) {
    throw new Error('Los bloques comparados no están visibles.');
  }
  return Math.abs(a.y - b.y) <= PAIR_ROW_TOLERANCE_PX ? a.x < b.x : a.y < b.y;
}

/** Bloques de Inicio que usan los recorridos (por rol y nombre; el saludo, por el id que enlaza su título). */
function homeBlocks(page: Page) {
  return {
    safetyMinute: page.getByRole('region', { name: 'Minuto de seguridad' }),
    greeting: page.locator('section[aria-labelledby="home-greeting"]'),
    kpiProjects: page.getByRole('region', { name: 'Proyectos activos' }),
    kpiLost: page.getByRole('region', { name: 'Oportunidades perdidas' }),
    kpiForecast: page.getByRole('region', { name: 'Forecast próximos seis meses' }),
  };
}

/** Espera a que Inicio se pinte con la composición ya aplicada (un indicador permitido es la señal). */
async function waitForHome(page: Page): Promise<void> {
  // Tras el login la aplicación vuelve a la última ruta visitada en el navegador (p. ej. la pantalla
  // de administración del usuario anterior): se va a Inicio de forma explícita.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Panel de control', level: 1 })).toBeVisible(SLOW);
  await expect(homeBlocks(page).kpiProjects).toBeVisible(SLOW);
}

function customizeDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /Personalizar panel/ });
}

/** Si el panel está personalizado (queda de una ejecución interrumpida), lo restablece desde la interfaz. */
async function resetPanelIfCustomized(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Personalizar panel' }).click();
  const dialog = customizeDialog(page);
  await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);
  if ((await dialog.getByRole('button', { name: 'Restablecer', exact: true }).count()) === 0) {
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    return;
  }
  await dialog.getByRole('button', { name: 'Restablecer', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Restablecer el panel' });
  const reset = waitForApi(page, 'DELETE', /^\/me\/preferences\/dashboard-cards$/);
  await confirm.getByRole('button', { name: 'Restablecer', exact: true }).click();
  expect((await reset).status()).toBe(HTTP_NO_CONTENT);
  await expect(dialog).toBeHidden();
}

/** Guarda el diálogo «Personalizar panel» y comprueba `PUT /me/preferences/dashboard-cards` → 200. */
async function saveCustomization(page: Page): Promise<void> {
  const dialog = customizeDialog(page);
  const saved = waitForApi(page, 'PUT', /^\/me\/preferences\/dashboard-cards$/);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect((await saved).status()).toBe(HTTP_OK);
  await expect(dialog).toBeHidden();
}

test.describe('Ajustes 1', () => {
  // En orden y en un solo worker (límite de login por IP), pero independientes:
  // un fallo de un recorrido no salta los demás.
  test.describe.configure({ mode: 'default' });
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-AJ1.24 · el minuto de seguridad de hoy se ve en Inicio y el panel personalizado sigue al usuario', async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(
      !hasAdmin || !hasAsesor,
      'Define E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_ASESOR_EMAIL y E2E_ASESOR_PASSWORD.',
    );

    const suffix = Date.now().toString(36).toUpperCase();
    const today = todayInBusinessZone();
    // `<b>` se ve como texto literal (AC-AJ1.12): el bloque nunca interpreta HTML.
    const message = `Minuto E2E ${suffix}: usa <b>casco</b> y chaleco en la zona de carga.`;
    const todayLabel = displayDate(today);

    await test.step('el administrador registra el minuto de hoy (o edita el de hoy si ya existe)', async () => {
      await signIn(page, adminEmail, adminPassword);
      await page.goto('/administracion/minuto-seguridad');
      await expect(
        page.getByRole('heading', { name: 'Minuto de seguridad', level: 1 }),
      ).toBeVisible(SLOW);

      // Filtra por hoy: la fila de hoy no depende de cuántos mensajes futuros haya.
      const filtered = waitForApi(page, 'GET', /^\/safety-minutes$/, { from: today, to: today });
      await page.getByLabel('Desde').fill(today);
      await page.getByLabel('Hasta').fill(today);
      expect((await filtered).status()).toBe(HTTP_OK);

      const editToday = page.getByRole('button', { name: `Editar mensaje del ${todayLabel}` });
      // Espera a que la tabla tenga resultado (fila de hoy o estado vacío) antes de decidir.
      await expect(editToday.or(page.getByText('No hay mensajes'))).toBeVisible(SLOW);

      if ((await editToday.count()) === 0) {
        await page.getByRole('button', { name: 'Nuevo mensaje' }).click();
        const form = page.getByRole('dialog', { name: 'Nuevo mensaje' });
        await form.getByLabel(/^Fecha de visualización/).fill(today);
        await form.getByLabel(/^Mensaje/).fill(message);
        const created = waitForApi(page, 'POST', /^\/safety-minutes$/);
        await form.getByRole('button', { name: 'Registrar' }).click();
        expect((await created).status()).toBe(HTTP_CREATED);
        await expect(form).toBeHidden();
      } else {
        await editToday.click();
        const form = page.getByRole('dialog', { name: `Editar mensaje del ${todayLabel}` });
        await form.getByLabel(/^Mensaje/).fill(message);
        const updated = waitForApi(page, 'PATCH', /^\/safety-minutes\/[^/]+$/);
        await form.getByRole('button', { name: 'Guardar cambios' }).click();
        expect((await updated).status()).toBe(HTTP_OK);
        await expect(form).toBeHidden();
      }

      const row = page
        .getByRole('table', { name: 'Minuto de seguridad' })
        .getByRole('row')
        .filter({ hasText: message });
      await expect(row).toHaveCount(1);
      // El de hoy sólo se edita: no se puede borrar (D-AJ1.5, AC-AJ1.13).
      await expect(
        row.getByRole('button', { name: `Eliminar mensaje del ${todayLabel}` }),
      ).toHaveCount(0);
      await expect(
        row.getByRole('button', { name: `Editar mensaje del ${todayLabel}` }),
      ).toBeVisible();
      await signOut(page);
    });

    await test.step('el asesor ve el bloque «Minuto de seguridad» con el mensaje y parte del panel por defecto', async () => {
      await signIn(page, asesorEmail, asesorPassword);
      await waitForHome(page);
      await resetPanelIfCustomized(page);

      const { safetyMinute, greeting, kpiLost } = homeBlocks(page);
      await expect(safetyMinute).toBeVisible(SLOW);
      await expect(safetyMinute.getByText(message)).toBeVisible();
      await expect(safetyMinute.locator('b')).toHaveCount(0);
      await expect(kpiLost).toBeVisible();
      // Composición por defecto: el minuto va primero (antes que el saludo).
      expect(await isBefore(safetyMinute, greeting)).toBe(true);
    });

    await test.step('personaliza: oculta «Oportunidades perdidas»; el minuto no tiene interruptor y se baja un lugar', async () => {
      await page.getByRole('button', { name: 'Personalizar panel' }).click();
      const dialog = customizeDialog(page);
      await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);

      // El minuto de seguridad es un mensaje institucional: sin interruptor «Visible» (D-AJ1.10).
      await expect(dialog.getByLabel('Visible: Minuto de seguridad')).toHaveCount(0);
      await expect(dialog.getByText('Mensaje institucional: siempre visible')).toBeVisible();
      // Los demás bloques sí lo tienen.
      await expect(dialog.getByLabel('Visible: Saludo')).toBeVisible();
      // «Restablecer» sólo existe con el panel personalizado.
      await expect(dialog.getByRole('button', { name: 'Restablecer', exact: true })).toHaveCount(0);

      await dialog.getByLabel('Visible: Oportunidades perdidas').uncheck();
      // Por defecto el minuto ya es el primero: bajarlo deja el saludo en primer lugar.
      await dialog.getByRole('button', { name: 'Bajar Minuto de seguridad' }).click();
      await saveCustomization(page);

      const { safetyMinute, greeting, kpiLost, kpiProjects } = homeBlocks(page);
      // Inmediato, sin recargar (AC-AJ1.2).
      await expect(kpiLost).toHaveCount(0);
      await expect(kpiProjects).toBeVisible();
      await expect(safetyMinute).toBeVisible();
      expect(await isBefore(greeting, safetyMinute)).toBe(true);
    });

    await test.step('recarga y conserva la personalización', async () => {
      await page.reload();
      await waitForHome(page);
      const { safetyMinute, greeting, kpiLost } = homeBlocks(page);
      await expect(safetyMinute).toBeVisible(SLOW);
      await expect(kpiLost).toHaveCount(0);
      expect(await isBefore(greeting, safetyMinute)).toBe(true);
    });

    await test.step('en un contexto de navegador nuevo, el mismo asesor ve el mismo panel', async () => {
      const fresh = await browser.newContext({
        baseURL,
        timezoneId: BUSINESS_TIME_ZONE,
        colorScheme: 'light',
        viewport: { width: 1440, height: 900 },
      });
      try {
        const other = await fresh.newPage();
        await signIn(other, asesorEmail, asesorPassword);
        await waitForHome(other);
        const { safetyMinute, greeting, kpiLost } = homeBlocks(other);
        await expect(safetyMinute.getByText(message)).toBeVisible(SLOW);
        await expect(kpiLost).toHaveCount(0);
        expect(await isBefore(greeting, safetyMinute)).toBe(true);
      } finally {
        await fresh.close();
      }
    });

    await test.step('sube el minuto al primer lugar y se guarda', async () => {
      await page.getByRole('button', { name: 'Personalizar panel' }).click();
      const dialog = customizeDialog(page);
      await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);
      await dialog.getByRole('button', { name: 'Subir Minuto de seguridad' }).click();
      await saveCustomization(page);

      const { safetyMinute, greeting, kpiLost } = homeBlocks(page);
      await expect(kpiLost).toHaveCount(0);
      expect(await isBefore(safetyMinute, greeting)).toBe(true);
    });

    await test.step('restablece y vuelve a la composición por defecto', async () => {
      await page.getByRole('button', { name: 'Personalizar panel' }).click();
      const dialog = customizeDialog(page);
      await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);
      await dialog.getByRole('button', { name: 'Restablecer', exact: true }).click();

      const confirm = page.getByRole('dialog', { name: 'Restablecer el panel' });
      const reset = waitForApi(page, 'DELETE', /^\/me\/preferences\/dashboard-cards$/);
      await confirm.getByRole('button', { name: 'Restablecer', exact: true }).click();
      expect((await reset).status()).toBe(HTTP_NO_CONTENT);
      await expect(dialog).toBeHidden();

      const { safetyMinute, greeting, kpiLost } = homeBlocks(page);
      await expect(kpiLost).toBeVisible(SLOW);
      expect(await isBefore(safetyMinute, greeting)).toBe(true);

      // Sin personalización ya no se ofrece «Restablecer».
      await page.getByRole('button', { name: 'Personalizar panel' }).click();
      await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);
      await expect(dialog.getByRole('button', { name: 'Restablecer', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
      await signOut(page);
    });

    await test.step('otro usuario (el administrador) conserva el panel por defecto', async () => {
      await signIn(page, adminEmail, adminPassword);
      await waitForHome(page);
      const { safetyMinute, greeting, kpiLost } = homeBlocks(page);
      await expect(safetyMinute.getByText(message)).toBeVisible(SLOW);
      await expect(kpiLost).toBeVisible();
      expect(await isBefore(safetyMinute, greeting)).toBe(true);

      await page.getByRole('button', { name: 'Personalizar panel' }).click();
      const dialog = customizeDialog(page);
      await expect(dialog.getByRole('list', { name: 'Bloques' })).toBeVisible(SLOW);
      await expect(dialog.getByRole('button', { name: 'Restablecer', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();
    });
  });

  test('PF-AJ1.25 · el tema oscuro sigue al usuario a otro navegador', async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(!hasAsesor, 'Define E2E_ASESOR_EMAIL y E2E_ASESOR_PASSWORD.');

    const html = page.locator('html');
    const toggle = (target: Page) =>
      target.getByRole('button', { name: 'Alternar modo claro y oscuro' });

    /** Cambia el tema con el botón y comprueba `PUT /me/preferences/theme` y el atributo de `<html>`. */
    const switchTheme = async (target: Page, to: 'light' | 'dark') => {
      const saved = waitForApi(target, 'PUT', /^\/me\/preferences\/theme$/);
      await toggle(target).click();
      const response = await saved;
      expect(response.status()).toBe(HTTP_OK);
      expect(response.request().postDataJSON()).toEqual({ value: to });
      await expect(target.locator('html')).toHaveAttribute('data-theme', to);
    };

    await test.step('el asesor entra y, si quedó en oscuro, vuelve a claro (punto de partida)', async () => {
      const preferences = waitForApi(page, 'GET', /^\/me\/preferences$/);
      await signIn(page, asesorEmail, asesorPassword);
      const stored = ((await (await preferences).json()) as { theme: 'light' | 'dark' | null })
        .theme;
      if (stored === 'dark') {
        await expect(html).toHaveAttribute('data-theme', 'dark');
        await switchTheme(page, 'light');
      }
      await expect(html).toHaveAttribute('data-theme', 'light');
    });

    await test.step('cambia a tema oscuro con el botón de la barra superior y cierra sesión', async () => {
      await switchTheme(page, 'dark');
      await signOut(page);
    });

    await test.step('en un contexto de navegador nuevo entra y se aplica el tema oscuro guardado', async () => {
      const fresh = await browser.newContext({
        baseURL,
        timezoneId: BUSINESS_TIME_ZONE,
        colorScheme: 'light',
        viewport: { width: 1440, height: 900 },
      });
      try {
        const other = await fresh.newPage();
        await other.goto('/acceso');
        // Sin sesión ni caché local, la pantalla de acceso arranca en claro: el oscuro viene del servidor.
        await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');

        const preferences = waitForApi(other, 'GET', /^\/me\/preferences$/);
        await signIn(other, asesorEmail, asesorPassword);
        expect(((await (await preferences).json()) as { theme: string | null }).theme).toBe('dark');
        await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark', SLOW);

        await test.step('vuelve a claro y queda guardado', async () => {
          await switchTheme(other, 'light');
          await other.reload();
          await expect(other.getByRole('button', { name: 'Menú de usuario' })).toBeVisible(SLOW);
          await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
          await signOut(other);
        });
      } finally {
        await fresh.close();
      }
    });
  });

  test('barra superior parametrizable, acceso sin lista de características y pie «© año Grupo AG»', async ({
    page,
  }) => {
    test.skip(!hasAdmin, 'Define E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD.');

    const year = new Date().getFullYear();
    const footerText = `© ${year} Grupo AG`;
    const searchButton = page.getByRole('button', { name: 'Abrir búsqueda global' });
    const notificationsButton = page.getByRole('button', { name: /^Notificaciones/ });
    const fullscreenButton = page.getByRole('button', { name: 'Pantalla completa', exact: true });
    const SEARCH_PARAMETER = 'Botón de búsqueda en la barra superior';

    /** Edita el parámetro de búsqueda desde Parámetros → Interfaz: `PATCH` correcto y diálogo cerrado. */
    const setSearchParameter = async (enabled: boolean) => {
      await page.goto('/administracion/parametros');
      await expect(page.getByRole('heading', { name: 'Parámetros', level: 1 })).toBeVisible(SLOW);
      const interfaz = page.getByRole('region', { name: 'Interfaz' });
      await expect(interfaz).toBeVisible(SLOW);
      await interfaz.getByRole('button', { name: `Editar ${SEARCH_PARAMETER}` }).click();
      const dialog = page.getByRole('dialog', { name: new RegExp(`Editar «${SEARCH_PARAMETER}»`) });
      const control = dialog.getByRole('switch').or(dialog.getByRole('checkbox'));
      if (enabled) {
        await control.check();
      } else {
        await control.uncheck();
      }
      const saved = waitForApi(page, 'PATCH', /^\/parameters\/ui\.barra_superior\.buscar$/);
      await dialog.getByRole('button', { name: 'Guardar' }).click();
      const response = await saved;
      expect(response.status()).toBe(HTTP_OK);
      expect((await response.json()) as { value: string }).toMatchObject({
        value: String(enabled),
      });
      await expect(dialog).toBeHidden();
    };

    await test.step('la pantalla de acceso no lista características y el pie dice «© año Grupo AG»', async () => {
      await page.goto('/acceso');
      await expect(
        page.getByRole('heading', { level: 1, name: /bienvenido de nuevo/i }),
      ).toBeVisible(SLOW);
      await expect(page.getByText('Acceso por roles y permisos')).toHaveCount(0);
      await expect(page.getByText('Administración centralizada')).toHaveCount(0);
      await expect(page.getByText('Auditoría de cambios')).toHaveCount(0);
      // El panel de marca conserva sólo el nombre de la aplicación (AC-AJ1.16).
      await expect(page.getByText('Mi Cliente AG', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('contentinfo')).toHaveText(footerText);
    });

    await test.step('con los valores sembrados: pantalla completa sí; buscar y notificaciones no', async () => {
      const uiSettings = waitForApi(page, 'GET', /^\/me\/ui-settings$/);
      await signIn(page, adminEmail, adminPassword);
      const settings = (await (await uiSettings).json()) as {
        topbar: { search: boolean; fullscreen: boolean; notifications: boolean };
      };
      expect(settings.topbar).toEqual({ search: false, fullscreen: true, notifications: false });

      await expect(fullscreenButton).toBeVisible(SLOW);
      await expect(searchButton).toHaveCount(0);
      await expect(notificationsButton).toHaveCount(0);
      // El pie del shell autenticado dice lo mismo. Va dentro de `<main>`, así que no es el landmark
      // `contentinfo` (a diferencia del de la pantalla de acceso): se localiza por su texto.
      await expect(page.getByText(footerText, { exact: true })).toBeVisible();
    });

    try {
      await test.step('el administrador activa «buscar» en Parámetros → Interfaz y, tras recargar, el botón aparece', async () => {
        await setSearchParameter(true);
        const reloaded = waitForApi(page, 'GET', /^\/me\/ui-settings$/);
        await page.goto('/');
        expect(
          ((await (await reloaded).json()) as { topbar: { search: boolean } }).topbar.search,
        ).toBe(true);
        await expect(fullscreenButton).toBeVisible(SLOW);
        await expect(searchButton).toBeVisible(SLOW);
        await expect(notificationsButton).toHaveCount(0);
        await page.reload();
        await expect(searchButton).toBeVisible(SLOW);
      });
    } finally {
      // Restaura el valor sembrado aunque falle una comprobación anterior.
      await test.step('restaura «buscar» a false', async () => {
        await setSearchParameter(false);
        const reloaded = waitForApi(page, 'GET', /^\/me\/ui-settings$/);
        await page.goto('/');
        expect(
          ((await (await reloaded).json()) as { topbar: { search: boolean } }).topbar.search,
        ).toBe(false);
        await expect(fullscreenButton).toBeVisible(SLOW);
        await expect(searchButton).toHaveCount(0);
      });
    }
  });
});
