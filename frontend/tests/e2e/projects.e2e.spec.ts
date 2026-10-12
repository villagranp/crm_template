import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 3 · Proyectos (03 §J: PF-03.114, PF-03.115, PF-03.116).
 *
 * Precondiciones (TESTING.md §«E2E de Clientes» y `backend/scripts/e2e-stack.ts`):
 * stack aislado con la semilla esencial y la demo; nunca la base de desarrollo
 * compartida. Los recorridos crean proyectos con sufijo único (repetibles).
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor (OWN).
 * - `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD` — manager (TEAM) con `proyectos.administrar`.
 * - `E2E_ASESOR_CUSTOMER` — razón social de un cliente activo del asesor (la imprime `activate`).
 * - `E2E_RULE_UNIT` — nombre de una unidad con regla GLOBAL activa a toneladas (ídem).
 * - `E2E_PRODUCT_SKU` — SKU de un producto activo del catálogo (ídem).
 * - `E2E_MANAGER_TEAM_PROJECT` — código de un proyecto de otro asesor del equipo del manager (ídem).
 * - `E2E_FOREIGN_PROJECT_ID` — id de un proyecto que el asesor no ve (ídem).
 * - `E2E_NO_FORECAST_EMAIL`, `E2E_NO_FORECAST_PASSWORD` — opcional: usuario con `proyectos.ver`
 *   y sin `forecast.ver` (ningún rol de la demo lo cumple; se crea con un rol propio, ADR-020).
 *
 * Etapa E3a: PF-03.114 cubre alta → clasificación → fase → producto asociado → historial.
 * Crear oportunidad, cargar forecast M+1…M+3 y cerrar como Parcial 60 % se añaden con las
 * pantallas de la etapa E3b en este mismo recorrido.
 */

const env = (name: string) => process.env[name] ?? '';
const asesorEmail = env('E2E_ASESOR_EMAIL');
const asesorPassword = env('E2E_ASESOR_PASSWORD');
const managerEmail = env('E2E_MANAGER_EMAIL');
const managerPassword = env('E2E_MANAGER_PASSWORD');
const asesorCustomer = env('E2E_ASESOR_CUSTOMER');
const ruleUnit = env('E2E_RULE_UNIT');
const productSku = env('E2E_PRODUCT_SKU');
const teamProject = env('E2E_MANAGER_TEAM_PROJECT');
const foreignProjectId = env('E2E_FOREIGN_PROJECT_ID');
const noForecastEmail = env('E2E_NO_FORECAST_EMAIL');
const noForecastPassword = env('E2E_NO_FORECAST_PASSWORD');

const API_PREFIX = '/api/v1';
const HTTP_CREATED = 201;
const TEST_TIMEOUT_MS = 150_000;

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

async function openSection(page: Page, label: string): Promise<void> {
  await page.getByRole('tablist', { name: 'Secciones del proyecto' }).getByRole('tab', { name: label }).click();
}

test.describe.serial('CRM · Proyectos', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-03.114 · asesor: crea, clasifica, cambia la fase, asocia un producto y ve el historial', async ({ page }) => {
    test.skip(
      !asesorEmail || !asesorPassword || !asesorCustomer || !ruleUnit || !productSku,
      'Define E2E_ASESOR_EMAIL, E2E_ASESOR_PASSWORD, E2E_ASESOR_CUSTOMER, E2E_RULE_UNIT y E2E_PRODUCT_SKU.',
    );
    const suffix = Date.now().toString(36).toUpperCase();
    const name = `E2E Proyecto ${suffix}`;

    await signIn(page, asesorEmail, asesorPassword);

    // Alta (AC-03.1).
    await page.goto('/proyectos');
    await page.getByRole('button', { name: 'Nuevo proyecto' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nuevo proyecto' })).toBeVisible();
    await page.getByLabel(/Nombre del proyecto/).fill(name);
    await page.getByRole('combobox', { name: /Cliente/ }).fill(asesorCustomer);
    await page.getByRole('option', { name: new RegExp(asesorCustomer) }).first().click();
    const created = waitForApi(page, 'POST', /^\/projects$/);
    await page.getByRole('button', { name: 'Crear proyecto' }).click();
    expect((await created).status()).toBe(HTTP_CREATED);
    await expect(page.getByText(/Proyecto PRY-\d{4}-\d{5} creado\./)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();

    // Clasificación por regla (AC-03.31): vista previa del backend y tonelaje guardado.
    await openSection(page, 'Clasificación');
    await page.getByRole('button', { name: 'Clasificar' }).first().click();
    const classification = page.getByRole('dialog', { name: 'Clasificar proyecto' });
    await classification.getByRole('combobox', { name: /Unidad de medida/ }).click();
    await page.getByRole('option', { name: new RegExp(`^${ruleUnit}`) }).click();
    await classification.getByLabel(/Cantidad estimada/).fill('1200');
    await classification.getByLabel('Por regla').check();
    await expect(classification.getByText(/Regla aplicable:/)).toBeVisible();
    const classified = waitForApi(page, 'PUT', /^\/projects\/[^/]+\/classification$/);
    await classification.getByRole('button', { name: 'Guardar clasificación' }).click();
    expect((await classified).ok()).toBe(true);
    await expect(page.getByText('Clasificación guardada.')).toBeVisible();
    await expect(page.getByText('Por regla')).toBeVisible();

    // Fase (AC-03.36).
    await openSection(page, 'Fase');
    await page.getByRole('button', { name: 'Actualizar fase' }).click();
    const phase = page.getByRole('dialog', { name: 'Actualizar fase' });
    await phase.getByRole('combobox', { name: /Fase/ }).click();
    await page.getByRole('option', { name: 'Cotización' }).click();
    await phase.getByLabel(/Porcentaje de avance/).fill('30');
    await phase.getByLabel(/Comentario/).fill(`E2E ${suffix}`);
    const changed = waitForApi(page, 'POST', /^\/projects\/[^/]+\/phase-changes$/);
    await phase.getByRole('button', { name: 'Guardar fase' }).click();
    expect((await changed).status()).toBe(HTTP_CREATED);
    await expect(page.getByText('Fase actual: Cotización')).toBeVisible();

    // Producto asociado (AC-03.60).
    await openSection(page, 'Productos');
    await page.getByRole('button', { name: 'Asociar producto' }).first().click();
    const product = page.getByRole('dialog', { name: 'Asociar producto' });
    await product.getByRole('combobox', { name: /Producto/ }).fill(productSku);
    await page.getByRole('option', { name: new RegExp(`^${productSku} ·`) }).first().click();
    await product.getByLabel(/Cantidad/).fill('120');
    const associated = waitForApi(page, 'POST', /^\/projects\/[^/]+\/products$/);
    await product.getByRole('button', { name: 'Asociar producto' }).click();
    expect((await associated).status()).toBe(HTTP_CREATED);
    await expect(page.getByText(`Producto ${productSku} asociado.`)).toBeVisible();
    await expect(page.getByLabel('Totales de productos')).toBeVisible();

    // Historial (AC-03.13): fase y producto en la línea de tiempo.
    await openSection(page, 'Historial');
    const history = page.getByRole('region', { name: 'Historial de cambios' });
    await expect(history.getByText(/Cotización/).first()).toBeVisible();
    await history.getByRole('button', { name: 'Productos' }).click();
    await expect(history.getByText(productSku).first()).toBeVisible();
  });

  test('PF-03.115 · manager: vista de equipo, reasigna el asesor y duplica con productos', async ({ page }) => {
    test.skip(
      !managerEmail || !managerPassword || !teamProject,
      'Define E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD y E2E_MANAGER_TEAM_PROJECT.',
    );
    const suffix = Date.now().toString(36).toUpperCase();

    await signIn(page, managerEmail, managerPassword);
    await page.goto('/proyectos/equipo');
    await expect(page.getByText(/Ves los proyectos de tus equipos/)).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar por nombre o código' }).fill(teamProject);
    await page.getByRole('link', { name: new RegExp(`\\(${teamProject}\\)`) }).first().click();
    await expect(page.getByRole('tablist', { name: 'Secciones del proyecto' })).toBeVisible();

    // Reasignar asesor (con proyectos.administrar).
    await page.getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: 'Editar proyecto' });
    const owner = form.getByRole('combobox', { name: 'Asesor responsable' });
    const current = await owner.inputValue();
    await owner.click();
    await page.getByRole('option').filter({ hasNotText: current }).first().click();
    const patched = waitForApi(page, 'PATCH', /^\/projects\/[^/]+$/);
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await patched).ok()).toBe(true);
    await expect(page.getByText(new RegExp(`Proyecto ${teamProject} actualizado\\.`))).toBeVisible();

    // Duplicar con productos (AC-03.17, AC-03.19).
    await page.getByRole('button', { name: 'Duplicar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Duplicar proyecto' });
    await dialog.getByLabel(/Nombre del proyecto nuevo/).fill(`E2E Copia ${suffix}`);
    await dialog.getByLabel('Productos asociados (sin oportunidad, estado inicial)').check();
    const duplicated = waitForApi(page, 'POST', /^\/projects\/[^/]+\/duplicate$/);
    await dialog.getByRole('button', { name: 'Duplicar' }).click();
    expect((await duplicated).status()).toBe(HTTP_CREATED);
    await expect(page.getByText(new RegExp(`Proyecto PRY-\\d{4}-\\d{5} creado a partir de ${teamProject}\\.`))).toBeVisible();
    await expect(page.getByRole('link', { name: `Proyecto duplicado de ${teamProject}` })).toBeVisible();
  });

  test('PF-03.116 · asesor: un proyecto ajeno responde «no existe o no tienes acceso»', async ({ page }) => {
    test.skip(!asesorEmail || !asesorPassword || !foreignProjectId, 'Define E2E_ASESOR_EMAIL, E2E_ASESOR_PASSWORD y E2E_FOREIGN_PROJECT_ID.');

    await signIn(page, asesorEmail, asesorPassword);
    await page.goto(`/proyectos/${foreignProjectId}`);
    await expect(page.getByText('Este proyecto no existe o no tienes acceso')).toBeVisible();
  });

  test('PF-03.116 · sin forecast.ver no ve la opción ni la ruta del forecast', async ({ page }) => {
    test.skip(!noForecastEmail || !noForecastPassword, 'Define E2E_NO_FORECAST_EMAIL y E2E_NO_FORECAST_PASSWORD.');

    await signIn(page, noForecastEmail, noForecastPassword);
    await expect(page.getByRole('link', { name: 'Proyectos', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Forecast/ })).toHaveCount(0);
    await page.goto('/proyectos/forecast');
    await expect(page.getByText(/Acceso denegado/i)).toBeVisible();
  });
});
