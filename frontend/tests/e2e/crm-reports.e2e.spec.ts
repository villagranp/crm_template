import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 5 · Reportes (05 §J: PF-05.39 y PF-05.40, con AC-05.23, AC-05.28,
 * AC-05.30, AC-05.31, AC-05.33, AC-05.35 y AC-05.41).
 *
 * Precondiciones:
 * - Stack aislado con la semilla esencial y la demo (TESTING.md §«E2E de Reportes» y
 *   `backend/scripts/e2e-stack.ts`); nunca la base de desarrollo. El recorrido solo lee y
 *   exporta (cada exportación deja su `crm.report.exported`), así que es repetible.
 * - Los usuarios ya tienen contraseña personal (sin cambio pendiente).
 * - Roles de la semilla: el manager (TEAM) tiene `reportes.ver` y `reportes.exportar`; el
 *   asesor (OWN) solo `reportes.ver` (00 §5.4, DM-11).
 *
 * Todo va contra el backend real: tras cada acción que dispara peticiones se espera la
 * respuesta del servidor y se compara la pantalla con ella (sin subir los timeouts).
 *
 * Variables (nunca se escriben credenciales aquí; `e2e-stack.ts activate` imprime las E2E_* sin contraseñas):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor demo (OWN, sin `reportes.exportar`).
 * - `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD` — su manager (TEAM, con `reportes.exportar`).
 * - `E2E_REPORT_TEAM_PROJECT_CODE` — proyecto de otro asesor del equipo que el manager ve y el asesor no.
 */

const env = (name: string): string => process.env[name] ?? '';

const asesor = { email: env('E2E_ASESOR_EMAIL'), password: env('E2E_ASESOR_PASSWORD') };
const manager = { email: env('E2E_MANAGER_EMAIL'), password: env('E2E_MANAGER_PASSWORD') };
const teamProjectCode = env('E2E_REPORT_TEAM_PROJECT_CODE');

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
/** Argon2id en cada acceso, siete pantallas y una exportación: más margen que el de por defecto. */
const TEST_TIMEOUT_MS = 180_000;
/** PF-05.40: ancho de un teléfono. */
const MOBILE_VIEWPORT = { width: 400, height: 800 };
const EMPTY_REPORT = 'No hay registros para los filtros seleccionados';
const EXPORT_FILE_NAME = /^reporte-oportunidades-\d{8}-\d{4}\.xlsx$/;
/** Primeras columnas de la hoja "Datos" del reporte de oportunidades (`report-columns.ts`, RN-05.59). */
const OPPORTUNITY_EXPORT_HEADERS = ['Código', 'Código de proyecto', 'Proyecto', 'Cliente', 'Asesor', 'Etapa', 'Resultado'];

interface Credentials {
  email: string;
  password: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { totalItems: number };
}

interface OpportunityRow {
  code: string;
  stage: { id: string; label: string };
}

interface OpportunitySummary {
  total: number;
  open: number;
  won: number;
  partial: number;
  lost: number;
  closedWithoutResult: number;
}

interface StageCount {
  stage: { id: string; label: string; isActive?: boolean };
  count: number;
}

interface Dashboard {
  period: { from: string; to: string };
  activeProjects: { count: number };
  opportunitiesByStage: StageCount[];
  byOwner: Array<{ owner: { id: string; displayName: string } | null; openOpportunities: number }>;
}

interface Funnel {
  stages: StageCount[];
  totalInFunnel: number;
}

/** Lo mínimo de `exceljs` que usa la prueba para **leer** el archivo descargado. */
interface XlsxRow {
  values: unknown[] | Record<string, unknown>;
}
interface XlsxSheet {
  name: string;
  actualRowCount: number;
  getRow(index: number): XlsxRow;
}
interface XlsxWorkbook {
  xlsx: { readFile(path: string): Promise<unknown> };
  worksheets: XlsxSheet[];
  getWorksheet(name: string): XlsxSheet | undefined;
}
interface ExcelJsModule {
  Workbook: new () => XlsxWorkbook;
}

/**
 * `exceljs` es dependencia del backend (ADR-022), no del frontend: la prueba la resuelve desde
 * `backend/package.json` para abrir el `.xlsx` con la misma librería que lo escribió, sin
 * añadir dependencias al frontend.
 */
function loadExcelJs(): ExcelJsModule {
  const backendPackage = resolve(test.info().project.testDir, '../../../backend/package.json');
  return createRequire(backendPackage)('exceljs') as ExcelJsModule;
}

function rowValues(row: XlsxRow): unknown[] {
  // `exceljs` devuelve los valores con base 1 (la posición 0 está vacía).
  return Array.isArray(row.values) ? row.values.slice(1) : [];
}

function waitForApi(page: Page, method: string, path: RegExp, query: Record<string, string> = {}): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) {
      return false;
    }
    const url = new URL(response.url());
    if (!url.pathname.startsWith(API_PREFIX) || !path.test(url.pathname.slice(API_PREFIX.length))) {
      return false;
    }
    return Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value);
  });
}

async function okJson<T>(response: Promise<Response>): Promise<T> {
  const settled = await response;
  expect(settled.status(), `${settled.request().method()} ${settled.url()}`).toBe(HTTP_OK);
  return (await settled.json()) as T;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Conteo como lo pinta la pantalla (`Intl.NumberFormat('es-GT')`). */
function count(value: number): string {
  return new Intl.NumberFormat('es-GT').format(value);
}

/** Pie de la tabla del `DataTable` ("Mostrando 1–20 de N"). */
function totalFooter(page: Page, total: number): Locator {
  return page.getByText(new RegExp(`^Mostrando .* de ${escapeRegExp(total.toLocaleString('es-MX'))}$`));
}

/**
 * Una sesión por usuario para toda la serie: el login admite 10 intentos por minuto por IP y
 * esta serie convive con los demás E2E. Las recargas (`page.goto`) reutilizan la sesión con la
 * cookie de refresco.
 */
const sessions = new Map<string, { context: BrowserContext; page: Page }>();

async function sessionFor(browser: Browser, user: Credentials): Promise<Page> {
  const existing = sessions.get(user.email);
  if (existing) {
    return existing.page;
  }
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(user.email);
  await page.getByLabel(/^contraseña/i).fill(user.password);
  const login = waitForApi(page, 'POST', /^\/auth\/login$/);
  const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  // Argon2id y varias escrituras: con los demás workers arrancando, el login puede pasar de
  // los 5 s de `expect`. Se esperan las respuestas reales.
  expect((await login).status()).toBe(HTTP_OK);
  expect((await menu).status()).toBe(HTTP_OK);
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
  sessions.set(user.email, { context, page });
  return page;
}

/** El grupo "Reportes" del menú lateral (sale de `GET /me/menu`, ADR-018), desplegado. */
async function reportsMenu(page: Page): Promise<Locator> {
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
  const group = navigation.getByRole('button', { name: 'Reportes', exact: true });
  await expect(group).toBeVisible();
  if ((await group.getAttribute('aria-expanded')) !== 'true') {
    await group.click();
  }
  return navigation;
}

/** Enlace del menú a una pantalla de Reportes (por su ruta: "Oportunidades" o "Visitas" también existen en otros módulos). */
function menuLink(navigation: Locator, path: string, label: string): Locator {
  return navigation.locator(`a[href="${path}"]`).filter({ hasText: label });
}

/** Abre el formulario de filtros de la pantalla (botón "Filtros" o "Filtros (n)"). */
async function openFilters(page: Page, formLabel: string): Promise<Locator> {
  const form = page.getByRole('search', { name: formLabel });
  if (!(await form.isVisible())) {
    await page.getByRole('button', { name: /^Filtros( \(\d+\))?$/ }).click();
  }
  await expect(form).toBeVisible();
  return form;
}

const REPORT_SCREENS = [
  { path: '/reportes/proyectos', menu: 'Proyectos', title: 'Reporte de proyectos', api: /^\/reports\/projects$/ },
  { path: '/reportes/oportunidades', menu: 'Oportunidades', title: 'Reporte de oportunidades', api: /^\/reports\/opportunities$/ },
  { path: '/reportes/forecast', menu: 'Forecast', title: 'Reporte de forecast', api: /^\/reports\/forecast$/ },
  { path: '/reportes/visitas', menu: 'Visitas', title: 'Reporte de visitas', api: /^\/reports\/visits$/ },
  { path: '/reportes/actividades', menu: 'Actividades', title: 'Reporte de actividades', api: /^\/reports\/activities$/ },
  { path: '/reportes/dashboard', menu: 'Dashboard comercial', title: 'Dashboard comercial', api: /^\/reports\/dashboard$/ },
  { path: '/reportes/embudo', menu: 'Embudo comercial', title: 'Embudo comercial', api: /^\/reports\/funnel$/ },
] as const;

test.describe.serial('CRM · Reportes', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test.afterAll(async () => {
    for (const { context } of sessions.values()) {
      await context.close();
    }
    sessions.clear();
  });

  test('PF-05.39 · manager: filtra el reporte de oportunidades, el resumen cuadra con la tabla y exporta un .xlsx con las mismas filas', async ({
    browser,
  }, testInfo) => {
    test.skip(!manager.email || !manager.password, 'Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.');
    const page = await sessionFor(browser, manager);

    // Desde el menú (GET /me/menu): Reportes › Oportunidades.
    const navigation = await reportsMenu(page);
    const firstList = waitForApi(page, 'GET', /^\/reports\/opportunities$/);
    const firstSummary = waitForApi(page, 'GET', /^\/reports\/opportunities\/summary$/);
    await menuLink(navigation, '/reportes/oportunidades', 'Oportunidades').click();
    await expect(page).toHaveURL(/\/reportes\/oportunidades$/);
    const all = await okJson<Paginated<OpportunityRow>>(firstList);
    const summary = await okJson<OpportunitySummary>(firstSummary);
    await expect(page.getByRole('heading', { name: 'Reporte de oportunidades', level: 1 })).toBeVisible();

    // Resumen (AC-05.5): las categorías suman el total y el total es el de la tabla.
    expect(summary.open + summary.won + summary.lost + summary.closedWithoutResult).toBe(summary.total);
    expect(summary.partial).toBeLessThanOrEqual(summary.won);
    expect(all.pagination.totalItems).toBe(summary.total);
    expect(summary.open, 'la demo tiene oportunidades abiertas en el equipo del manager').toBeGreaterThan(0);
    const cards = page.getByRole('region', { name: 'Resumen de oportunidades' });
    await expect(cards.getByText(count(summary.total), { exact: true }).first()).toBeVisible();
    await expect(totalFooter(page, summary.total)).toBeVisible();

    // Una tarjeta de estado filtra la tabla (E.1): la lista trae exactamente ese conteo.
    const wonList = waitForApi(page, 'GET', /^\/reports\/opportunities$/, { status: 'WON' });
    await cards.getByRole('button', { name: `Ganadas: ${count(summary.won)}. Filtrar la tabla` }).click();
    expect((await okJson<Paginated<OpportunityRow>>(wonList)).pagination.totalItems).toBe(summary.won);
    await expect(page).toHaveURL(/[?&]status=WON(&|$)/);
    await expect(page.getByLabel('Filtros activos')).toContainText('Estado: Ganadas (incluye parciales)');

    // Filtros del formulario: Estado = Abiertas (sustituye al de la tarjeta).
    const form = await openFilters(page, 'Filtros del reporte de oportunidades');
    await form.getByRole('combobox', { name: 'Estado' }).click();
    await page.getByRole('option', { name: 'Abiertas', exact: true }).click();
    const openList = waitForApi(page, 'GET', /^\/reports\/opportunities$/, { status: 'OPEN' });
    const openSummary = waitForApi(page, 'GET', /^\/reports\/opportunities\/summary$/, { status: 'OPEN' });
    await form.getByRole('button', { name: 'Aplicar filtros' }).click();
    const open = await okJson<Paginated<OpportunityRow>>(openList);
    const filteredSummary = await okJson<OpportunitySummary>(openSummary);
    await expect(page).toHaveURL(/[?&]status=OPEN(&|$)/);
    await expect(page.getByLabel('Filtros activos')).toContainText('Estado: Abiertas');
    // Lista y resumen usan el mismo conjunto (AC-05.22): todo abierto y del mismo tamaño.
    expect(open.pagination.totalItems).toBe(summary.open);
    expect(filteredSummary.total).toBe(summary.open);
    expect(filteredSummary.open).toBe(summary.open);
    expect(filteredSummary.won + filteredSummary.lost + filteredSummary.closedWithoutResult).toBe(0);
    await expect(cards.getByRole('button', { name: `Abiertas: ${count(summary.open)}. Quitar el filtro` })).toBeVisible();
    await expect(totalFooter(page, summary.open)).toBeVisible();
    const table = page.getByRole('table', { name: 'Reporte de oportunidades' });
    const firstCode = open.data[0]?.code ?? '';
    await expect(table.getByRole('link', { name: `Abrir la oportunidad ${firstCode}`, exact: true })).toBeVisible();

    // Exportar a Excel (AC-05.23): mismo filtro y orden, sin paginar; se descarga un .xlsx real.
    const exportButton = page.getByRole('button', { name: 'Exportar a Excel' });
    await expect(exportButton).toBeVisible();
    const exported = waitForApi(page, 'GET', /^\/reports\/opportunities\/export$/, { status: 'OPEN', format: 'xlsx' });
    const download = page.waitForEvent('download');
    await exportButton.click();
    const exportResponse = await exported;
    expect(exportResponse.status()).toBe(HTTP_OK);
    expect(exportResponse.headers()['x-export-rows']).toBe(String(summary.open));
    const file = await download;
    expect(file.suggestedFilename()).toMatch(EXPORT_FILE_NAME);
    const rowsText = summary.open === 1 ? '1 fila' : `${count(summary.open)} filas`;
    await expect(page.getByRole('status').filter({ hasText: `Se descargó ${file.suggestedFilename()} con ${rowsText}.` })).toBeVisible();

    // El archivo, abierto con `exceljs`: hojas, encabezados y las mismas filas en el mismo orden.
    const path = testInfo.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const { Workbook } = loadExcelJs();
    const workbook = new Workbook();
    await workbook.xlsx.readFile(path);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining(['Datos', 'Resumen', 'Filtros']));
    const data = workbook.getWorksheet('Datos');
    expect(data, 'hoja "Datos"').toBeDefined();
    expect(rowValues(data!.getRow(1)).slice(0, OPPORTUNITY_EXPORT_HEADERS.length)).toEqual(OPPORTUNITY_EXPORT_HEADERS);
    expect(data!.actualRowCount - 1).toBe(summary.open);
    const exportedCodes = open.data.map((_, index) => rowValues(data!.getRow(index + 2))[0]);
    expect(exportedCodes).toEqual(open.data.map((row) => row.code));
  });

  test('PF-05.39 · manager: dashboard con «Ver como tabla» y filtro de asesor, etapa → reporte filtrado y embudo desde el menú', async ({ browser }) => {
    test.skip(!manager.email || !manager.password, 'Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.');
    const page = await sessionFor(browser, manager);

    // Dashboard comercial desde el menú (AC-05.30): siete paneles, sin accesos del Inicio.
    let navigation = await reportsMenu(page);
    const firstDashboard = waitForApi(page, 'GET', /^\/reports\/dashboard$/);
    const firstTrends = waitForApi(page, 'GET', /^\/reports\/dashboard\/trends$/);
    await menuLink(navigation, '/reportes/dashboard', 'Dashboard comercial').click();
    const dashboard = await okJson<Dashboard>(firstDashboard);
    expect((await firstTrends).status()).toBe(HTTP_OK);
    await expect(page.getByRole('heading', { name: 'Dashboard comercial', level: 1 })).toBeVisible();
    for (const panel of ['Proyectos activos', 'Oportunidades por etapa', 'Ganadas vs. perdidas', 'Forecast por mes', 'Distribución por asesor', 'Actividades y visitas', 'Tendencias']) {
      await expect(page.getByRole('region', { name: panel, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId('active-projects-count')).toHaveText(count(dashboard.activeProjects.count));

    // Filtro de asesor (AC-05.31): un asesor del equipo con oportunidades abiertas en el período.
    const owner = dashboard.byOwner.find((row) => row.owner !== null && row.openOpportunities > 0)?.owner;
    expect(owner, 'la demo tiene un asesor con oportunidades abiertas en el período por defecto').toBeTruthy();
    const form = await openFilters(page, 'Filtros del dashboard comercial');
    await form.getByRole('combobox', { name: 'Asesor' }).click();
    await page.getByRole('option', { name: owner!.displayName, exact: true }).click();
    const ownerDashboard = waitForApi(page, 'GET', /^\/reports\/dashboard$/, { ownerId: owner!.id });
    const ownerTrends = waitForApi(page, 'GET', /^\/reports\/dashboard\/trends$/, { ownerId: owner!.id });
    await form.getByRole('button', { name: 'Aplicar filtros' }).click();
    const filtered = await okJson<Dashboard>(ownerDashboard);
    expect((await ownerTrends).status()).toBe(HTTP_OK);
    await expect(page.getByLabel('Filtros activos')).toContainText(`Asesor: ${owner!.displayName}`);
    expect(filtered.byOwner.filter((row) => row.owner !== null).map((row) => row.owner?.id)).toEqual([owner!.id]);

    // "Ver como tabla" (AC-05.33): mismos valores que la respuesta, en el orden de etapa.
    const stagesPanel = page.getByRole('region', { name: 'Oportunidades por etapa', exact: true });
    await expect(stagesPanel.getByRole('figure')).toBeVisible();
    await stagesPanel.getByRole('button', { name: 'Ver como tabla' }).click();
    const stagesTable = stagesPanel.getByRole('table', { name: 'Oportunidades por etapa' });
    await expect(stagesTable.getByRole('row')).toHaveCount(filtered.opportunitiesByStage.length + 1);
    for (const [index, item] of filtered.opportunitiesByStage.entries()) {
      await expect(stagesTable.getByRole('row').nth(index + 1).getByRole('cell')).toHaveText(count(item.count));
    }
    await expect(stagesPanel.getByRole('figure')).toHaveCount(0);

    // Etapa → reporte de oportunidades con etapa, asesor y período IDENTIFIED: mismo conteo.
    const stage = filtered.opportunitiesByStage.find((item) => item.count > 0);
    expect(stage, 'el asesor elegido tiene oportunidades identificadas en el período').toBeTruthy();
    const stageList = waitForApi(page, 'GET', /^\/reports\/opportunities$/, {
      stageId: stage!.stage.id,
      ownerId: owner!.id,
      from: filtered.period.from,
      to: filtered.period.to,
      dateBasis: 'IDENTIFIED',
    });
    await stagesTable.getByRole('link', { name: `Ver las oportunidades en ${stage!.stage.label}` }).click();
    const stageRows = await okJson<Paginated<OpportunityRow>>(stageList);
    await expect(page).toHaveURL(/\/reportes\/oportunidades\?/);
    expect(stageRows.pagination.totalItems).toBe(stage!.count);
    expect(stageRows.data.every((row) => row.stage.id === stage!.stage.id)).toBe(true);
    const chips = page.getByLabel('Filtros activos');
    await expect(chips).toContainText(`Etapa: ${stage!.stage.label}`);
    await expect(chips).toContainText(`Asesor: ${owner!.displayName}`);
    await expect(totalFooter(page, stage!.count)).toBeVisible();

    // Embudo desde el menú (AC-05.35): etapas del embudo en orden, con su cantidad.
    navigation = await reportsMenu(page);
    const funnelResponse = waitForApi(page, 'GET', /^\/reports\/funnel$/);
    await menuLink(navigation, '/reportes/embudo', 'Embudo comercial').click();
    const funnel = await okJson<Funnel>(funnelResponse);
    await expect(page.getByRole('heading', { name: 'Embudo comercial', level: 1 })).toBeVisible();
    await expect(page.getByTestId('funnel-total')).toHaveText(`Oportunidades en el embudo: ${count(funnel.totalInFunnel)}`);
    const funnelPanel = page.getByRole('region', { name: 'Oportunidades por etapa del embudo' });
    await expect(funnelPanel.getByRole('figure')).toBeVisible();
    await funnelPanel.getByRole('button', { name: 'Ver como tabla' }).click();
    const funnelTable = funnelPanel.getByRole('table', { name: 'Embudo comercial' });
    await expect(funnelTable.getByRole('row')).toHaveCount(funnel.stages.length + 1);
    for (const [index, item] of funnel.stages.entries()) {
      const row = funnelTable.getByRole('row').nth(index + 1);
      await expect(row.getByRole('rowheader')).toHaveText(item.stage.label);
      await expect(row.getByRole('cell').first()).toHaveText(count(item.count));
    }

    // Etapa del embudo → reporte de oportunidades de esa etapa (sin período): mismo conteo.
    const funnelStage = funnel.stages.find((item) => item.count > 0);
    expect(funnelStage, 'la demo tiene oportunidades en el embudo del manager').toBeTruthy();
    const funnelList = waitForApi(page, 'GET', /^\/reports\/opportunities$/, { stageId: funnelStage!.stage.id });
    await funnelTable.getByRole('link', { name: `Ver las oportunidades en ${funnelStage!.stage.label}` }).click();
    const funnelRows = await okJson<Paginated<OpportunityRow>>(funnelList);
    expect(funnelRows.pagination.totalItems).toBe(funnelStage!.count);
    await expect(page.getByLabel('Filtros activos')).toContainText(`Etapa: ${funnelStage!.stage.label}`);
    await expect(totalFooter(page, funnelStage!.count)).toBeVisible();
  });

  test('PF-05.40 · asesor: Reportes en el menú sin «Exportar a Excel», solo su alcance y sin scroll horizontal a 400 px', async ({ browser }) => {
    test.skip(
      !asesor.email || !asesor.password || !manager.email || !manager.password || !teamProjectCode,
      'Define E2E_ASESOR_*, E2E_MANAGER_* y E2E_REPORT_TEAM_PROJECT_CODE.',
    );
    const page = await sessionFor(browser, asesor);

    // El menú (GET /me/menu) trae las siete opciones de Reportes (H.3).
    const navigation = await reportsMenu(page);
    for (const screen of REPORT_SCREENS) {
      await expect(menuLink(navigation, screen.path, screen.menu)).toBeVisible();
    }

    // Sin reportes.exportar no hay botón (AC-05.28); el backend devuelve 403 (PF-05.21).
    const list = waitForApi(page, 'GET', /^\/reports\/opportunities$/);
    await menuLink(navigation, '/reportes/oportunidades', 'Oportunidades').click();
    await okJson<Paginated<OpportunityRow>>(list);
    await expect(page.getByRole('heading', { name: 'Reporte de oportunidades', level: 1 })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Reporte de oportunidades' }).or(page.getByText(EMPTY_REPORT))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar a Excel' })).toHaveCount(0);

    // Visibilidad por alcance (AC-05.41): el proyecto de otro asesor del equipo lo ve el manager, no el asesor.
    const searchProject = async (target: Page): Promise<Paginated<{ code: string }>> => {
      const loaded = waitForApi(target, 'GET', /^\/reports\/projects$/);
      await target.goto('/reportes/proyectos');
      await okJson(loaded);
      const searched = waitForApi(target, 'GET', /^\/reports\/projects$/, { search: teamProjectCode });
      await target.getByRole('searchbox', { name: 'Buscar por código, nombre del proyecto o cliente' }).fill(teamProjectCode);
      return okJson<Paginated<{ code: string }>>(searched);
    };
    const own = await searchProject(page);
    expect(own.pagination.totalItems).toBe(0);
    await expect(page.getByText(EMPTY_REPORT)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar a Excel' })).toHaveCount(0);
    const managerPage = await sessionFor(browser, manager);
    const team = await searchProject(managerPage);
    expect(team.data.map((row) => row.code)).toContain(teamProjectCode);
    await expect(managerPage.getByRole('link', { name: `Abrir el proyecto ${teamProjectCode}`, exact: true })).toBeVisible();

    // Móvil (400 px): las siete pantallas sin desplazamiento horizontal de la página.
    await page.setViewportSize(MOBILE_VIEWPORT);
    for (const screen of REPORT_SCREENS) {
      const loaded = waitForApi(page, 'GET', screen.api);
      await page.goto(screen.path);
      await okJson(loaded);
      await expect(page.getByRole('heading', { name: screen.title, level: 1 })).toBeVisible();
      if (screen.path === '/reportes/dashboard' || screen.path === '/reportes/embudo') {
        // Gráficas en su chunk diferido: se mide con ellas ya pintadas.
        await expect(page.getByRole('figure').first()).toBeVisible();
      } else {
        // Por debajo de `sm` la tabla es una lista de tarjetas (o el estado vacío).
        await expect(page.getByRole('list', { name: screen.title }).or(page.getByText(EMPTY_REPORT))).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${screen.path} sin scroll horizontal a ${MOBILE_VIEWPORT.width} px`).toBeLessThanOrEqual(0);
    }
  });
});
