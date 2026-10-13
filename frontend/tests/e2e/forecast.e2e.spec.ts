import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Forecast M+6 (03 §L.5): carga y guardado de la matriz en `/proyectos/forecast`.
 *
 * Precondiciones (TESTING.md §«E2E de Clientes» y `backend/scripts/e2e-stack.ts`): stack
 * aislado con la semilla esencial y la demo; nunca la base de desarrollo compartida. El
 * recorrido crea su propio proyecto con un producto asociado (repetible) y no necesita
 * variables nuevas.
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor (OWN) con `forecast.editar`.
 * - `E2E_ASESOR_CUSTOMER` — razón social de un cliente activo del asesor (la imprime `activate`).
 * - `E2E_PRODUCT_SKU` — SKU de un producto activo del catálogo (ídem).
 */

const env = (name: string) => process.env[name] ?? '';
const asesorEmail = env('E2E_ASESOR_EMAIL');
const asesorPassword = env('E2E_ASESOR_PASSWORD');
const asesorCustomer = env('E2E_ASESOR_CUSTOMER');
const productSku = env('E2E_PRODUCT_SKU');

const API_PREFIX = '/api/v1';
const HTTP_CREATED = 201;
const TEST_TIMEOUT_MS = 120_000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
}

/** Crea un proyecto con un producto asociado y devuelve su id y su código. */
async function createProjectWithProduct(page: Page, suffix: string): Promise<{ id: string; code: string }> {
  await page.goto('/proyectos/nuevo');
  await page.getByLabel(/Nombre del proyecto/).fill(`E2E Forecast ${suffix}`);
  await page.getByRole('combobox', { name: /Cliente/ }).fill(asesorCustomer);
  await page.getByRole('option', { name: new RegExp(escapeRegExp(asesorCustomer)) }).first().click();
  const created = waitForApi(page, 'POST', /^\/projects$/);
  await page.getByRole('button', { name: 'Crear proyecto' }).click();
  const response = await created;
  expect(response.status()).toBe(HTTP_CREATED);
  const project = (await response.json()) as { id: string; code: string };

  await page.getByRole('tablist', { name: 'Secciones del proyecto' }).getByRole('tab', { name: 'Productos' }).click();
  await page.getByRole('button', { name: 'Asociar producto' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Asociar producto' });
  await dialog.getByRole('combobox', { name: /Producto/ }).fill(productSku);
  await page.getByRole('option', { name: new RegExp(`^${escapeRegExp(productSku)} ·`) }).first().click();
  await dialog.getByLabel(/Cantidad/).fill('100');
  const associated = waitForApi(page, 'POST', /^\/projects\/[^/]+\/products$/);
  await dialog.getByRole('button', { name: 'Asociar producto' }).click();
  expect((await associated).status()).toBe(HTTP_CREATED);
  return project;
}

function cellOf(page: Page, offset: number) {
  return page.getByRole('textbox', { name: new RegExp(`^Cantidad de ${escapeRegExp(productSku)} .*en M\\+${offset} `) });
}

test.describe.serial('CRM · Forecast M+6', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test('carga la matriz de la ventana vigente, guarda celdas y una segunda edición actualiza la misma línea (AC-03.69, AC-03.70)', async ({ page }) => {
    test.skip(
      !asesorEmail || !asesorPassword || !asesorCustomer || !productSku,
      'Define E2E_ASESOR_EMAIL, E2E_ASESOR_PASSWORD, E2E_ASESOR_CUSTOMER y E2E_PRODUCT_SKU.',
    );
    const suffix = Date.now().toString(36).toUpperCase();

    await signIn(page, asesorEmail, asesorPassword);
    const project = await createProjectWithProduct(page, suffix);

    // Carga: la ventana vigente en la cabecera y la fila del proyecto filtrado.
    const rowsLoaded = waitForApi(page, 'GET', /^\/forecast\/rows$/);
    await page.goto(`/proyectos/forecast?projectId=${project.id}`);
    expect((await rowsLoaded).ok()).toBe(true);
    await expect(page.getByText(/^Ventana vigente: M\+1 \(.+\) – M\+\d+ \(.+\)\./)).toBeVisible();
    const matrix = page.getByRole('table', { name: 'Matriz del forecast' });
    await expect(matrix.getByText(new RegExp(`^${escapeRegExp(project.code)} · `))).toBeVisible();

    // Guardado: dos celdas nuevas.
    await cellOf(page, 1).fill('25');
    await cellOf(page, 2).fill('0');
    const saved = waitForApi(page, 'PUT', /^\/forecast\/lines$/);
    await page.getByRole('button', { name: 'Guardar cambios (2)' }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText('Cambios guardados: 2 nuevas, 0 actualizadas.')).toBeVisible();

    // Recarga: los valores siguen ahí y una segunda edición actualiza la misma línea (upsert).
    await page.reload();
    await expect(cellOf(page, 1)).toHaveValue('25');
    await cellOf(page, 1).fill('30');
    const updated = waitForApi(page, 'PUT', /^\/forecast\/lines$/);
    await page.getByRole('button', { name: 'Guardar cambios (1)' }).click();
    const response = await updated;
    expect(response.ok()).toBe(true);
    expect(((await response.json()) as { created: number; updated: number }).updated).toBe(1);
    await expect(page.getByText('Cambios guardados: 0 nuevas, 1 actualizada.')).toBeVisible();
    await expect(page.getByLabel('Totales del forecast')).toBeVisible();
  });
});
