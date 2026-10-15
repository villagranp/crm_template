import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 7 · Administración del CRM (07 §J: PF-07.45, PF-07.46)
 * y un recorrido corto de tipos de cambio (07 E.5, RN-07.44).
 *
 * Precondiciones (TESTING.md §«E2E del Módulo 7» y `backend/scripts/e2e-stack.ts`):
 * - Stack aislado con la semilla esencial y la demo, en un esquema propio
 *   (nunca la base de desarrollo): el recorrido crea un equipo, un usuario, un
 *   valor de catálogo y un tipo de cambio, todos con sufijo único (repetible).
 * - El administrador ya tiene contraseña personal (`activate` la deja así).
 * - El backend tiene configurada `AUTH_DEFAULT_PASSWORD`.
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — administrador sin cambio pendiente.
 * - `E2E_DEFAULT_PASSWORD` — la contraseña inicial del backend (`AUTH_DEFAULT_PASSWORD`).
 * - `E2E_NEW_USER_PASSWORD` — la que fija el asesor nuevo (≥ 12 caracteres).
 * - `E2E_COUNTRY_LABEL` — país del asesor tal como lo muestra el selector; por defecto «Guatemala (GT)».
 */

const env = (name: string) => process.env[name] ?? '';
const adminEmail = env('E2E_ADMIN_EMAIL');
const adminPassword = env('E2E_ADMIN_PASSWORD');
const defaultPassword = env('E2E_DEFAULT_PASSWORD');
const newUserPassword = env('E2E_NEW_USER_PASSWORD');
const countryLabel = env('E2E_COUNTRY_LABEL') || 'Guatemala (GT)';

const hasAdmin = Boolean(adminEmail && adminPassword);
const hasUserPasswords = Boolean(defaultPassword && newUserPassword);

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
/** Argon2id en cada acceso y cuatro inicios de sesión en PF-07.45. */
const TEST_TIMEOUT_MS = 150_000;

/** Módulos del menú que nunca puede ver un asesor (07 RN-07.14, 00 §5.4). */
const NON_COMMERCIAL_MODULES = ['administracion', 'integraciones'];
/** Recursos de permiso comerciales (00 §5.2) más `null` (opciones sin permiso, como Inicio). */
const COMMERCIAL_RESOURCES = new Set([
  'clientes',
  'contactos',
  'proyectos',
  'oportunidades',
  'productos',
  'forecast',
  'visitas',
  'actividades',
  'reportes',
  'metas',
]);

interface MenuOption {
  key: string;
  label: string;
  requiredPermission: string | null;
  children: MenuOption[];
}
interface MenuModule {
  key: string;
  label: string;
  options: MenuOption[];
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

/** Fecha de vigencia única por ejecución, en el pasado lejano para no afectar a la tasa vigente. */
function uniqueEffectiveDate(): string {
  const days = Math.floor(Date.now() / 1000) % (365 * 40);
  const date = new Date(Date.UTC(1960, 0, 1) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`, como la tabla y el nombre accesible de «Corregir». */
function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/** Opciones del selector «Tipo de empresa» del alta de cliente (`GET /customers/form-options`). */
async function companyTypeOptions(page: Page): Promise<string[]> {
  const formOptions = waitForApi(page, 'GET', /^\/customers\/form-options$/);
  await page.goto('/clientes/nuevo');
  expect((await formOptions).status()).toBe(HTTP_OK);
  await expect(page.getByRole('heading', { name: 'Nuevo cliente' })).toBeVisible();
  await page.getByRole('combobox', { name: /^Tipo de empresa/ }).click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const labels = await listbox.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  return labels.map((label) => label.trim());
}

test.describe('CRM · Administración', () => {
  // En orden y en un solo worker (límite de login por IP), pero independientes:
  // un fallo de un recorrido no salta los demás.
  test.describe.configure({ mode: 'default' });
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-07.45 · alta de un asesor con equipo y rol; menú solo comercial; suspendido no entra', async ({
    page,
  }) => {
    test.skip(
      !hasAdmin || !hasUserPasswords,
      'Define E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_DEFAULT_PASSWORD y E2E_NEW_USER_PASSWORD.',
    );

    const suffix = Date.now().toString(36).toUpperCase();
    const teamName = `E2E Equipo M7 ${suffix}`;
    const teamCode = `E2E-M7-${suffix}`;
    const userEmail = `e2e-asesor-${suffix.toLowerCase()}@example.com`;
    const firstName = 'E2E';
    const lastName = `Asesor ${suffix}`;
    const displayName = `${firstName} ${lastName}`;
    // Se escribe en minúsculas: RN-07.1 lo guarda recortado y en mayúsculas.
    const employeeCodeInput = ` e2e-${suffix.toLowerCase()} `;
    const employeeCode = `E2E-${suffix}`;

    await test.step('el administrador inicia sesión y crea un equipo propio', async () => {
      await signIn(page, adminEmail, adminPassword);
      await page.goto('/administracion/equipos');
      await expect(page.getByRole('heading', { name: 'Equipos', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nuevo equipo' }).click();

      const form = page.getByRole('dialog', { name: 'Nuevo equipo' });
      await form.getByLabel(/^nombre/i).fill(teamName);
      await form.getByLabel(/^código/i).fill(teamCode);
      const created = waitForApi(page, 'POST', /^\/teams$/);
      await form.getByRole('button', { name: 'Crear equipo' }).click();
      expect((await created).status()).toBe(HTTP_CREATED);
      await expect(form).toBeHidden();
    });

    await test.step('da de alta al asesor con código de colaborador, país y rol Asesor', async () => {
      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();

      const form = page.getByRole('dialog', { name: 'Nuevo usuario' });
      await form.getByLabel(/^correo/i).fill(userEmail);
      await form.getByLabel(/^nombre/i).fill(firstName);
      await form.getByLabel(/^apellidos/i).fill(lastName);
      await form.getByLabel('Código de colaborador').fill(employeeCodeInput);

      await form.getByRole('combobox', { name: 'País' }).click();
      await page.getByRole('option', { name: countryLabel, exact: true }).click();
      await expect(form.getByRole('combobox', { name: 'País' })).toHaveText(countryLabel);

      const roles = form.getByRole('group', { name: 'Roles iniciales' });
      await roles.getByRole('checkbox', { name: 'Asesor', exact: true }).check();
      await expect(roles.getByRole('checkbox', { checked: true })).toHaveCount(1);
      // Con código y país, el aviso de perfil comercial incompleto no aparece.
      await expect(form.getByText(/necesita código de colaborador y país/)).toHaveCount(0);

      const created = waitForApi(page, 'POST', /^\/users$/);
      await form.getByRole('button', { name: 'Crear usuario' }).click();
      const response = await created;
      expect(response.status()).toBe(HTTP_CREATED);
      const body = (await response.json()) as { employeeCode: string | null; country: { isoCode: string } | null };
      // Contrato de `POST /users` (`UserResponseDto`, 07 F.1). Blando: si falla,
      // la prueba queda en rojo pero el recorrido sigue y se ven el resto de fallos.
      expect.soft(body.employeeCode, 'POST /users debe devolver employeeCode').toBe(employeeCode);
      expect
        .soft(body.country?.isoCode, 'POST /users debe devolver country')
        .toBe(countryLabel.match(/\(([A-Z]{2})\)$/)?.[1]);
      await expect(form).toBeHidden();
    });

    // La pantalla abre el detalle del usuario recién creado.
    const detail = page.getByRole('dialog', { name: displayName });

    await test.step('el detalle muestra código y país, y le asigna el equipo', async () => {
      await expect(detail.getByText('Invitado', { exact: true })).toBeVisible();
      await expect(detail.getByText(employeeCode, { exact: true })).toBeVisible();
      await expect(detail.getByText(countryLabel, { exact: true })).toBeVisible();

      await detail.getByRole('combobox', { name: 'Añadir equipo' }).fill(teamCode);
      await page.getByRole('option', { name: `${teamName} (${teamCode})`, exact: true }).click();
      const teams = detail.getByRole('list', { name: 'Equipos del usuario' });
      await expect(teams.getByRole('radio', { name: `${teamName} (principal)` })).toBeChecked();

      const saved = waitForApi(page, 'PUT', /^\/users\/[^/]+\/teams$/);
      await detail.getByRole('button', { name: 'Guardar equipos' }).click();
      expect((await saved).status()).toBe(HTTP_OK);
      await expect(detail.getByText('Equipos actualizados.')).toBeVisible();

      // El rol quedó asignado (pestaña Roles, solo lectura de la selección).
      await detail.getByRole('tab', { name: 'Roles' }).click();
      await expect(detail.getByRole('checkbox', { checked: true })).toHaveCount(1);
      await expect(detail.getByRole('checkbox', { name: 'Asesor (sistema)', exact: true })).toBeChecked();

      await detail.getByRole('button', { name: 'Cerrar' }).click();
      await expect(detail).toBeHidden();
      await signOut(page);
    });

    await test.step('el asesor entra con la contraseña inicial y fija la suya', async () => {
      const login = await submitLogin(page, userEmail, defaultPassword);
      expect(login.status()).toBe(HTTP_OK);
      await expect(page).toHaveURL(/\/cambiar-contrasena$/);

      await page.getByLabel(/^contraseña actual/i).fill(defaultPassword);
      await page.getByLabel(/^nueva contraseña/i).fill(newUserPassword);
      await page.getByLabel(/^repite la nueva contraseña/i).fill(newUserPassword);

      const changed = waitForApi(page, 'POST', /^\/auth\/password\/change$/);
      const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
      await page.getByRole('button', { name: /guardar contraseña/i }).click();
      expect((await changed).ok()).toBe(true);
      const menuResponse = await menu;
      expect(menuResponse.status()).toBe(HTTP_OK);
      await expect(page).not.toHaveURL(/\/cambiar-contrasena$/);

      // El menú sale de la base (ADR-018): solo módulos y opciones comerciales.
      const modules = (await menuResponse.json()) as MenuModule[];
      const moduleKeys = modules.map((module) => module.key);
      expect(moduleKeys).toEqual(expect.arrayContaining(['clientes', 'proyectos']));
      for (const forbidden of NON_COMMERCIAL_MODULES) {
        expect(moduleKeys).not.toContain(forbidden);
      }
      const options = modules.flatMap((module) =>
        module.options.flatMap((option) => [option, ...option.children]),
      );
      for (const option of options) {
        const resource = option.requiredPermission?.split('.')[0];
        expect(resource === undefined || COMMERCIAL_RESOURCES.has(resource), option.key).toBe(true);
      }
    });

    await test.step('la navegación no ofrece Administración ni Integraciones', async () => {
      const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
      await expect(navigation.getByRole('button', { name: 'Clientes', exact: true }).or(
        navigation.getByRole('link', { name: 'Clientes', exact: true }),
      ).first()).toBeVisible();
      await expect(navigation.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
      await expect(navigation.getByRole('button', { name: 'Integraciones', exact: true })).toHaveCount(0);
      await expect(navigation.getByRole('link', { name: 'Usuarios', exact: true })).toHaveCount(0);

      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Sin acceso', level: 1 })).toBeVisible();
      await signOut(page);
    });

    await test.step('el administrador suspende al asesor', async () => {
      await signIn(page, adminEmail, adminPassword);
      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();

      // Búsqueda por código de colaborador (07 E.1).
      const search = waitForApi(page, 'GET', /^\/users$/, { search: employeeCode });
      await page.getByLabel('Buscar por nombre, correo o código').fill(employeeCode);
      expect((await search).status()).toBe(HTTP_OK);

      const row = page.getByRole('table', { name: 'Usuarios' }).getByRole('row').filter({ hasText: userEmail });
      await expect(row).toHaveCount(1);
      await expect(row.getByText(employeeCode, { exact: true })).toBeVisible();
      await row.getByRole('button', { name: `Ver ${displayName}` }).click();

      await expect(detail.getByText('Activo', { exact: true })).toBeVisible();
      await expect(detail.getByText(`${teamName} (principal)`)).toBeVisible();
      await detail.getByRole('button', { name: 'Suspender' }).click();

      const confirm = page.getByRole('dialog', { name: 'Suspender usuario' });
      await confirm.getByLabel(/^motivo/i).fill('Prueba E2E del Módulo 7: la suspensión corta el acceso.');
      const suspended = waitForApi(page, 'POST', /^\/users\/[^/]+\/suspend$/);
      await confirm.getByRole('button', { name: 'Suspender' }).click();
      expect((await suspended).status()).toBe(HTTP_OK);
      await expect(confirm).toBeHidden();
      await expect(detail.getByText('Usuario suspendido. Sus sesiones se cerraron.')).toBeVisible();
      // RN-07.6: SUSPENDED se presenta como «Inactivo».
      await expect(detail.getByText('Inactivo', { exact: true })).toBeVisible();

      await detail.getByRole('button', { name: 'Cerrar' }).click();
      await signOut(page);
    });

    await test.step('el asesor suspendido ya no puede entrar', async () => {
      const login = await submitLogin(page, userEmail, newUserPassword);
      expect(login.status()).toBe(HTTP_FORBIDDEN);
      await expect(page).toHaveURL(/\/acceso$/);
      await expect(page.getByRole('alert')).toHaveText(/tu cuenta está deshabilitada/i);
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
    });
  });

  test('PF-07.46 · desactivar un valor de catálogo lo retira del alta de cliente y queda en la auditoría por campo', async ({
    page,
  }) => {
    test.skip(!hasAdmin, 'Define E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD.');

    const suffix = Date.now().toString(36).toUpperCase();
    // Valor propio en un catálogo abierto sin invariantes (RN-07.24): no rompe datos existentes.
    const itemCode = `E2E_M7_${suffix}`;
    const itemLabel = `E2E Tipo M7 ${suffix}`;
    let itemId = '';

    await signIn(page, adminEmail, adminPassword);

    const detail = page.getByRole('dialog', { name: 'Catálogo Tipos de empresa' });

    await test.step('añade un valor propio a crm.tipo_empresa', async () => {
      await page.goto('/administracion/catalogos');
      await expect(page.getByRole('heading', { name: 'Catálogos', level: 1 })).toBeVisible();
      const search = waitForApi(page, 'GET', /^\/catalogs$/, { search: 'crm.tipo_empresa' });
      await page.getByLabel('Buscar por clave o nombre').fill('crm.tipo_empresa');
      expect((await search).status()).toBe(HTTP_OK);
      await page.getByRole('button', { name: 'Elementos de Tipos de empresa' }).click();

      await expect(detail.getByText(/Clave: crm\.tipo_empresa/)).toBeVisible();
      const form = detail.getByRole('form', { name: 'Añadir elemento' });
      await form.getByLabel('Nuevo elemento: código').fill(itemCode);
      await form.getByLabel('Nuevo elemento: etiqueta').fill(itemLabel);
      const created = waitForApi(page, 'POST', /^\/catalogs\/[^/]+\/items$/);
      await form.getByRole('button', { name: 'Añadir' }).click();
      expect((await created).status()).toBe(HTTP_CREATED);
      await expect(detail.getByRole('checkbox', { name: `Desactivar ${itemLabel}` })).toBeChecked();
    });

    await test.step('el alta de cliente lo ofrece mientras está activo', async () => {
      await page.keyboard.press('Escape');
      expect(await companyTypeOptions(page)).toContain(itemLabel);
    });

    await test.step('lo desactiva desde el catálogo', async () => {
      await page.goto('/administracion/catalogos');
      const search = waitForApi(page, 'GET', /^\/catalogs$/, { search: 'crm.tipo_empresa' });
      await page.getByLabel('Buscar por clave o nombre').fill('crm.tipo_empresa');
      expect((await search).status()).toBe(HTTP_OK);
      await page.getByRole('button', { name: 'Elementos de Tipos de empresa' }).click();

      const updated = waitForApi(page, 'PATCH', /^\/catalogs\/[^/]+\/items\/[^/]+$/);
      await detail.getByRole('checkbox', { name: `Desactivar ${itemLabel}` }).click();
      const response = await updated;
      expect(response.status()).toBe(HTTP_OK);
      const body = (await response.json()) as { id: string; isActive: boolean };
      expect(body.isActive).toBe(false);
      itemId = body.id;
      await expect(detail.getByRole('checkbox', { name: `Activar ${itemLabel}` })).not.toBeChecked();
    });

    await test.step('el alta de cliente ya no lo ofrece', async () => {
      const labels = await companyTypeOptions(page);
      expect(labels).not.toContain(itemLabel);
      expect(labels.some((label) => label.includes(itemLabel))).toBe(false);
      // El resto del catálogo se sigue ofreciendo.
      expect(labels).toContain('Constructora');
    });

    await test.step('la auditoría por campo muestra isActive: true → false', async () => {
      await page.goto('/administracion/auditoria');
      await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Vista por campo' }).click();

      const filters = page.getByRole('search', { name: 'Filtros de auditoría' });
      await filters.getByLabel('Campo', { exact: true }).fill('isActive');
      await filters.getByLabel('Registro', { exact: true }).fill(itemId);
      const logs = waitForApi(page, 'GET', /^\/audit-logs$/, { field: 'isActive', resourceId: itemId });
      await filters.getByRole('button', { name: 'Aplicar' }).click();
      expect((await logs).status()).toBe(HTTP_OK);

      const table = page.getByRole('table', { name: 'Cambios por campo' });
      const row = table.getByRole('row').filter({ hasText: 'catalog_item.updated' });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('cell', { name: 'Activo (isActive)', exact: true })).toBeVisible();
      await expect(row.getByRole('cell', { name: 'true', exact: true })).toBeVisible();
      await expect(row.getByRole('cell', { name: 'false', exact: true })).toBeVisible();
      await expect(row.getByText(adminEmail)).toBeVisible();
    });
  });

  test('tipos de cambio · alta con fecha única, duplicado rechazado y corrección con moneda y fecha bloqueadas', async ({
    page,
  }) => {
    test.skip(!hasAdmin, 'Define E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD.');

    const suffix = Date.now().toString(36).toUpperCase();
    const effectiveDate = uniqueEffectiveDate();
    const source = `E2E M7 ${suffix}`;

    await signIn(page, adminEmail, adminPassword);
    await page.goto('/administracion/tipos-cambio');
    await expect(page.getByRole('heading', { name: 'Tipos de cambio', level: 1 })).toBeVisible();

    const register = async (rate: string): Promise<Response> => {
      await page.getByRole('button', { name: 'Nuevo tipo de cambio' }).click();
      const form = page.getByRole('dialog', { name: 'Nuevo tipo de cambio' });
      await form.getByRole('combobox', { name: /^Moneda/ }).click();
      await page.getByRole('option', { name: /^GTQ — / }).click();
      await form.getByLabel(/^Fecha de vigencia/).fill(effectiveDate);
      await form.getByLabel(/^Tasa \(unidades por 1 USD\)/).fill(rate);
      await form.getByLabel(/^Fuente/).fill(source);
      const created = waitForApi(page, 'POST', /^\/exchange-rates$/);
      await form.getByRole('button', { name: 'Registrar' }).click();
      return created;
    };

    await test.step('registra GTQ en una fecha propia', async () => {
      expect((await register('7.1234')).status()).toBe(HTTP_CREATED);
      await expect(page.getByRole('dialog', { name: 'Nuevo tipo de cambio' })).toBeHidden();
    });

    await test.step('la misma moneda y fecha se rechaza con 409', async () => {
      expect((await register('7.5')).status()).toBe(HTTP_CONFLICT);
      const form = page.getByRole('dialog', { name: 'Nuevo tipo de cambio' });
      await expect(form.getByText(/Ya hay un tipo de cambio para esa moneda y fecha de vigencia/)).toBeVisible();
      await form.getByRole('button', { name: 'Cancelar' }).click();
      await expect(form).toBeHidden();
    });

    const rateRow = () =>
      page.getByRole('table', { name: 'Tipos de cambio' }).getByRole('row').filter({ hasText: source });

    await test.step('la encuentra filtrando por moneda y fecha', async () => {
      await page.getByRole('combobox', { name: 'Moneda' }).click();
      await page.getByRole('option', { name: /^GTQ — / }).click();
      const filtered = waitForApi(page, 'GET', /^\/exchange-rates$/, {
        currencyCode: 'GTQ',
        from: effectiveDate,
        to: effectiveDate,
      });
      await page.getByLabel('Desde').fill(effectiveDate);
      await page.getByLabel('Hasta').fill(effectiveDate);
      expect((await filtered).status()).toBe(HTTP_OK);
      await expect(rateRow()).toHaveCount(1);
      await expect(rateRow().getByText('7.1234', { exact: true })).toBeVisible();
    });

    await test.step('corrige la tasa; moneda y fecha no se pueden cambiar', async () => {
      await rateRow()
        .getByRole('button', { name: `Corregir GTQ del ${displayDate(effectiveDate)}` })
        .click();
      const form = page.getByRole('dialog', { name: 'Corregir tipo de cambio GTQ' });
      await expect(form.getByText('Corregir una tasa no recalcula las oportunidades ya guardadas.', { exact: false })).toBeVisible();
      await expect(form.getByRole('combobox', { name: /^Moneda/ })).toHaveAttribute('aria-disabled', 'true');
      await expect(form.getByLabel(/^Fecha de vigencia/)).toBeDisabled();
      await expect(form.getByLabel(/^Fecha de vigencia/)).toHaveValue(effectiveDate);

      await form.getByLabel(/^Tasa \(unidades por 1 USD\)/).fill('7.2');
      const updated = waitForApi(page, 'PATCH', /^\/exchange-rates\/[^/]+$/);
      await form.getByRole('button', { name: 'Guardar corrección' }).click();
      const response = await updated;
      expect(response.status()).toBe(HTTP_OK);
      const body = (await response.json()) as { currencyCode: string; effectiveDate: string };
      expect(body.currencyCode).toBe('GTQ');
      expect(body.effectiveDate).toBe(effectiveDate);
      await expect(form).toBeHidden();
      await expect(rateRow().getByText('7.20', { exact: true })).toBeVisible();
    });
  });
});
