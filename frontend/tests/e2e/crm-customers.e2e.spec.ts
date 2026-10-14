import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 2 · Clientes (02 §J: PF-02.52, PF-02.53, PF-02.54).
 *
 * Precondiciones:
 * - Stack aislado con la semilla esencial y la demo aplicadas (ver TESTING.md
 *   §«E2E de Clientes» y `backend/scripts/e2e-stack.ts`); nunca la base de desarrollo compartida: el
 *   recorrido crea clientes y contactos (con sufijo único, así que es repetible).
 * - Regla de duplicidad por defecto `nit = AVISAR` (02 §C.3).
 * - Los usuarios ya tienen contraseña personal (sin cambio pendiente).
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor (OWN) con `clientes.*` y `contactos.*` de su rol.
 * - `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD` — manager (TEAM) con `clientes.eliminar`.
 * - `E2E_MANAGER_DEPENDENT_CUSTOMER` — texto de búsqueda de un cliente del equipo con proyectos
 *   (p. ej. la razón social de un cliente demo con proyectos).
 * - `E2E_FOREIGN_CUSTOMER_ID` — id de un cliente que el asesor no ve (de otro país o equipo).
 * - `E2E_COUNTRY` — país del alta (por defecto «Guatemala»).
 */

const asesorEmail = process.env.E2E_ASESOR_EMAIL ?? '';
const asesorPassword = process.env.E2E_ASESOR_PASSWORD ?? '';
const managerEmail = process.env.E2E_MANAGER_EMAIL ?? '';
const managerPassword = process.env.E2E_MANAGER_PASSWORD ?? '';
const dependentCustomer = process.env.E2E_MANAGER_DEPENDENT_CUSTOMER ?? '';
const foreignCustomerId = process.env.E2E_FOREIGN_CUSTOMER_ID ?? '';
const country = process.env.E2E_COUNTRY ?? 'Guatemala';

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_CONFLICT = 409;
const TEST_TIMEOUT_MS = 120_000;

function waitForApi(page: Page, method: string, path: RegExp): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) {
      return false;
    }
    const url = new URL(response.url());
    return url.pathname.startsWith(API_PREFIX) && path.test(url.pathname.slice(API_PREFIX.length));
  });
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/^contraseña/i).fill(password);
  const login = waitForApi(page, 'POST', /^\/auth\/login$/);
  const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  // Argon2id y varias escrituras: con los demás workers arrancando, el login
  // puede pasar de los 5 s de `expect`. Se esperan las respuestas reales.
  expect((await login).status()).toBe(HTTP_OK);
  expect((await menu).status()).toBe(HTTP_OK);
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
}

async function chooseCountry(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: /País/ }).click();
  await page.getByRole('option', { name: country }).click();
}

/** Alta desde la búsqueda; si se espera un aviso de NIT, lo confirma y comprueba el 201. */
async function createCustomer(page: Page, legalName: string, taxId: string, expectDuplicate: boolean): Promise<void> {
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nuevo cliente' })).toBeVisible();
  await page.getByLabel(/Razón social/).fill(legalName);
  await chooseCountry(page);
  await page.getByLabel('NIT').fill(taxId);

  const first = waitForApi(page, 'POST', /^\/customers$/);
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  const response = await first;

  if (expectDuplicate) {
    expect(response.status()).toBe(HTTP_CONFLICT);
    const dialog = page.getByRole('dialog', { name: 'Posible cliente duplicado' });
    await expect(dialog.getByText('Mismo NIT')).toBeVisible();
    const confirmed = waitForApi(page, 'POST', /^\/customers$/);
    await dialog.getByRole('button', { name: 'Guardar de todos modos' }).click();
    expect((await confirmed).status()).toBe(HTTP_CREATED);
  } else {
    expect(response.status()).toBe(HTTP_CREATED);
  }
  await expect(page.getByText(/Cliente CLI-\d+ creado\./)).toBeVisible();
}

async function createContact(page: Page, firstName: string, lastName: string, primary: boolean): Promise<void> {
  const contacts = page.getByRole('region', { name: 'Contactos' });
  await contacts.getByRole('button', { name: 'Nuevo contacto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo contacto' });
  await dialog.getByLabel(/^Nombre/).fill(firstName);
  await dialog.getByLabel(/^Apellidos/).fill(lastName);
  if (primary) {
    await dialog.getByLabel('Marcar como principal').check();
  }
  const saved = waitForApi(page, 'POST', /^\/customers\/[^/]+\/contacts$/);
  await dialog.getByRole('button', { name: 'Crear contacto' }).click();
  expect((await saved).status()).toBe(HTTP_CREATED);
  // Exacto: el aviso «Contacto … guardado.» también contiene el nombre.
  await expect(contacts.getByText(`${firstName} ${lastName}`, { exact: true })).toBeVisible();
}

test.describe.serial('CRM · Clientes', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-02.52 · asesor: busca, crea con aviso de NIT, gestiona contactos y edita', async ({ page }) => {
    test.skip(!asesorEmail || !asesorPassword, 'Define E2E_ASESOR_EMAIL y E2E_ASESOR_PASSWORD.');
    const suffix = Date.now().toString(36).toUpperCase();
    const taxId = `E2E${suffix}`;

    await signIn(page, asesorEmail, asesorPassword);
    await page.goto('/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await page.getByRole('searchbox', { name: /Buscar por código/ }).fill(`E2E ${suffix}`);
    await expect(page.getByText(/Ningún cliente coincide|Todavía no hay clientes/)).toBeVisible();

    await createCustomer(page, `E2E Establecimiento Uno ${suffix}`, taxId, false);
    await createCustomer(page, `E2E Establecimiento Dos ${suffix}`, taxId, true);

    await createContact(page, 'Ana', `E2E ${suffix}`, true);
    await createContact(page, 'Bruno', `E2E ${suffix}`, false);

    const contacts = page.getByRole('region', { name: 'Contactos' });
    await contacts.getByRole('button', { name: `Acciones de Bruno E2E ${suffix}` }).click();
    const primary = waitForApi(page, 'PUT', /\/primary-contact$/);
    await page.getByRole('menuitem', { name: /Marcar como principal/ }).click();
    expect((await primary).ok()).toBe(true);
    await expect(page.getByText(`Bruno E2E ${suffix} es ahora el contacto principal.`)).toBeVisible();

    await page.getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: 'Editar cliente' });
    await form.getByLabel('Dirección').fill(`Zona 10, E2E ${suffix}`);
    const patch = waitForApi(page, 'PATCH', /^\/customers\/[^/]+$/);
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await patch).ok()).toBe(true);
    await expect(page.getByText(/Cliente CLI-\d+ actualizado\./)).toBeVisible();
    await expect(page.getByText(`Zona 10, E2E ${suffix}`)).toBeVisible();
  });

  test('PF-02.53 · manager: dependencias visibles, desactiva un cliente y elimina otro', async ({ page }) => {
    test.skip(
      !managerEmail || !managerPassword || !dependentCustomer,
      'Define E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD y E2E_MANAGER_DEPENDENT_CUSTOMER.',
    );
    const suffix = Date.now().toString(36).toUpperCase();

    await signIn(page, managerEmail, managerPassword);

    // Ve clientes de su equipo y no puede eliminar uno con proyectos.
    await page.goto('/clientes');
    await page.getByRole('searchbox', { name: /Buscar por código/ }).fill(dependentCustomer);
    await page.getByRole('link', { name: new RegExp(`Abrir la ficha de ${dependentCustomer}`) }).first().click();
    await page.getByRole('button', { name: 'Eliminar' }).click();
    const blocked = waitForApi(page, 'DELETE', /^\/customers\/[^/]+$/);
    await page.getByRole('dialog', { name: 'Eliminar cliente' }).getByRole('button', { name: 'Eliminar' }).click();
    expect((await blocked).status()).toBe(HTTP_CONFLICT);
    await expect(page.getByText(/No se puede eliminar: el cliente tiene .*proyecto/)).toBeVisible();
    await page.getByRole('dialog', { name: 'Eliminar cliente' }).getByRole('button', { name: 'Cancelar' }).click();

    // Desactiva uno propio recién creado.
    await createCustomer(page, `E2E Desactivar ${suffix}`, `E2EDA${suffix}`, false);
    await page.getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: 'Editar cliente' });
    await form.getByRole('combobox', { name: /Estado/ }).click();
    await page.getByRole('option', { name: /Inactivo/ }).click();
    const patch = waitForApi(page, 'PATCH', /^\/customers\/[^/]+$/);
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await patch).ok()).toBe(true);

    // Elimina otro sin dependencias.
    await createCustomer(page, `E2E Eliminar ${suffix}`, `E2EEL${suffix}`, false);
    await page.getByRole('button', { name: 'Eliminar' }).click();
    const removed = waitForApi(page, 'DELETE', /^\/customers\/[^/]+$/);
    await page.getByRole('dialog', { name: 'Eliminar cliente' }).getByRole('button', { name: 'Eliminar' }).click();
    expect((await removed).status()).toBe(204);
    await expect(page).toHaveURL(/\/clientes$/);
  });

  test('PF-02.54 · asesor: la URL directa de un cliente ajeno dice que no existe o no tiene acceso', async ({ page }) => {
    test.skip(!asesorEmail || !asesorPassword || !foreignCustomerId, 'Define E2E_ASESOR_EMAIL, E2E_ASESOR_PASSWORD y E2E_FOREIGN_CUSTOMER_ID.');

    await signIn(page, asesorEmail, asesorPassword);
    const detail = waitForApi(page, 'GET', new RegExp(`^/customers/${foreignCustomerId}$`));
    await page.goto(`/clientes/${foreignCustomerId}`);
    expect((await detail).status()).toBe(404);
    await expect(page.getByText('Este cliente no existe o no tienes acceso')).toBeVisible();
  });
});
