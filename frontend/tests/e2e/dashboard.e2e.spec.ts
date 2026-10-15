import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';

/**
 * Recorridos del Módulo 1 · Inicio / Panel de control (01 §J: PF-01.48, PF-01.23, PF-01.41).
 *
 * Precondiciones (TESTING.md §«E2E de Inicio» y `backend/scripts/e2e-stack.ts`): stack
 * aislado con la semilla esencial y la demo; nunca la base de desarrollo compartida. Los
 * recorridos sólo leen: se pueden repetir sin volver a `prepare`.
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor demo (OWN) con todos los permisos de fuente.
 * - `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD` — manager demo (TEAM): PF-01.41, porque el
 *   asesor de la demo no tiene actividades vencidas y su equipo sí.
 * - `E2E_NO_COMMERCIAL_EMAIL`, `E2E_NO_COMMERCIAL_PASSWORD` — opcional: usuario con el rol
 *   esencial `usuario` (sin permisos comerciales). La demo no tiene ninguno: lo crea `activate`
 *   si recibe la contraseña; sin ella, ese recorrido se salta.
 *
 * Con el Módulo 4 integrado (01 P-14): K6–K8 enlazan a Actividad comercial; PF-01.41 sigue K8
 * hasta `/actividad/pendientes` (mismo número que la bandeja de alertas) y abre la ficha de
 * una actividad vencida desde «Abrir». «Completar y la alerta desaparece» no se recorre aquí,
 * porque gastaría los datos demo y los recorridos deben poder repetirse sin `prepare`. Lo
 * cubre la prueba de integración de PF-01.41.
 */

const env = (name: string) => process.env[name] ?? '';
const asesorEmail = env('E2E_ASESOR_EMAIL');
const asesorPassword = env('E2E_ASESOR_PASSWORD');
const managerEmail = env('E2E_MANAGER_EMAIL');
const managerPassword = env('E2E_MANAGER_PASSWORD');
const noCommercialEmail = env('E2E_NO_COMMERCIAL_EMAIL');
const noCommercialPassword = env('E2E_NO_COMMERCIAL_PASSWORD');

const API_PREFIX = '/api/v1';
const TEST_TIMEOUT_MS = 90_000;
const NO_INDICATORS_NOTICE = 'Todavía no tienes indicadores comerciales asignados';
const UNAVAILABLE_ROUTE_NOTE = 'Listado disponible cuando se habilite el módulo';
const GREETING = /^(Buenos días|Buenas tardes|Buenas noches), (\S+)\.$/;

/** Tarjetas K1–K8 del asesor (01 §E.3), por su nombre accesible. */
const KPI = {
  projects: 'Proyectos activos',
  open: 'Oportunidades abiertas',
  won: 'Oportunidades ganadas',
  lost: 'Oportunidades perdidas',
  forecast: 'Forecast próximos seis meses',
  visits: 'Visitas pendientes',
  pendingActivities: 'Actividades pendientes',
  overdueActivities: 'Actividades vencidas',
} as const;

interface Profile {
  displayName: string;
}
interface ProjectIndicators {
  activeProjects: number;
}
interface OpportunityIndicators {
  open: { count: number };
  won: { count: number };
  lost: { count: number };
}
interface VisitIndicators {
  pending: { count: number };
}
interface ActivityIndicators {
  pending: { count: number };
  overdue: { count: number };
}
interface AlertsSummary {
  items: { type: string; enabled: boolean; count: number }[];
}
interface AlertsPage {
  data: {
    id: string;
    type: string;
    description: string;
    source: { type: string; id: string; code: string };
  }[];
  pagination: { totalItems: number };
}
interface ListPage {
  pagination: { totalItems: number };
}

function waitForApi(
  page: Page,
  method: string,
  path: RegExp,
  query?: (params: URLSearchParams) => boolean,
): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== method) {
      return false;
    }
    const url = new URL(response.url());
    return (
      url.pathname.startsWith(API_PREFIX) &&
      path.test(url.pathname.slice(API_PREFIX.length)) &&
      (query ? query(url.searchParams) : true)
    );
  });
}

async function json<T>(response: Promise<Response>): Promise<T> {
  const resolved = await response;
  expect(resolved.status(), resolved.url()).toBe(200);
  return (await resolved.json()) as T;
}

/** Inicia sesión con el formulario local y espera el menú de usuario. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/^contraseña/i).fill(password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
}

/**
 * Espera a que no queden peticiones en vuelo: una respuesta de la carga anterior que llegue
 * después de registrar `waitForApi` y antes de `page.goto` perdería su cuerpo al navegar.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

function kpiCard(page: Page, label: string): Locator {
  return page.getByRole('region', { name: label, exact: true });
}

/** Cifra mostrada en una tarjeta («1,234» → 1234). */
async function kpiNumber(card: Locator): Promise<number> {
  const text = (await card.locator('[data-stat-value]').innerText()).trim();
  expect(text, 'valor de la tarjeta').toMatch(/^\d{1,3}(,\d{3})*$/);
  return Number(text.replace(/,/g, ''));
}

async function expectCardWithoutError(card: Locator): Promise<void> {
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('aria-busy', 'true');
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
}

async function newSignedInPage(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await browser.newPage();
  await signIn(page, email, password);
  return page;
}

test.describe.serial('Inicio · Panel de control (asesor)', () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let page: Page;

  // Una sola sesión para los recorridos del asesor (límite de 10 logins/min por IP).
  test.beforeAll(async ({ browser }) => {
    test.skip(!asesorEmail || !asesorPassword, 'Define E2E_ASESOR_EMAIL y E2E_ASESOR_PASSWORD.');
    page = await newSignedInPage(browser, asesorEmail, asesorPassword);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('PF-01.48 · asesor demo: Hero con su nombre, K1–K8 con las cifras de la API, alertas y actividad', async () => {
    await settle(page);
    const me = json<Profile>(waitForApi(page, 'GET', /^\/me$/));
    const projects = json<ProjectIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/projects$/),
    );
    const opportunities = json<OpportunityIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/opportunities$/),
    );
    const forecast = waitForApi(page, 'GET', /^\/dashboard\/indicators\/forecast$/);
    const visits = json<VisitIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/visits$/),
    );
    const activities = json<ActivityIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/activities$/),
    );
    const alerts = json<AlertsPage>(waitForApi(page, 'GET', /^\/dashboard\/alerts$/));
    const recent = waitForApi(page, 'GET', /^\/dashboard\/recent-activity$/);
    const upcoming = waitForApi(page, 'GET', /^\/dashboard\/upcoming-visits$/);
    await page.goto('/');

    // Hero (AC-01.1): saludo con el nombre de pila y el nombre completo de `/me`.
    const { displayName } = await me;
    const hero = page.getByRole('region', { name: GREETING });
    await expect(hero).toBeVisible();
    const greeting = (await hero.getByRole('heading', { level: 2 }).innerText()).trim();
    expect(greeting.match(GREETING)?.[2]).toBe(displayName.split(/\s+/)[0]);
    await expect(hero.getByText(displayName, { exact: true })).toBeVisible();
    await expect(hero.getByText(/^Tienes acceso a /)).toHaveCount(0);

    // K1–K8 (AC-01.16): cada tarjeta, sin error, con la cifra que devolvió la API.
    for (const label of Object.values(KPI)) {
      await expectCardWithoutError(kpiCard(page, label));
    }
    expect((await forecast).status()).toBe(200);
    expect((await recent).status()).toBe(200);
    expect((await upcoming).status()).toBe(200);
    const opportunityData = await opportunities;
    const activityData = await activities;
    expect(await kpiNumber(kpiCard(page, KPI.projects))).toBe((await projects).activeProjects);
    expect(await kpiNumber(kpiCard(page, KPI.open))).toBe(opportunityData.open.count);
    expect(await kpiNumber(kpiCard(page, KPI.won))).toBe(opportunityData.won.count);
    expect(await kpiNumber(kpiCard(page, KPI.lost))).toBe(opportunityData.lost.count);
    expect(await kpiNumber(kpiCard(page, KPI.visits))).toBe((await visits).pending.count);
    expect(await kpiNumber(kpiCard(page, KPI.pendingActivities))).toBe(activityData.pending.count);
    expect(await kpiNumber(kpiCard(page, KPI.overdueActivities))).toBe(activityData.overdue.count);
    await expect(kpiCard(page, KPI.forecast).locator('[data-stat-value]')).toHaveText(
      /^(Sin proyección|[\d,]+\.\d{2} \S+)$/,
    );

    // Alertas: la bandeja muestra la primera página que devolvió la API.
    const alertsPanel = page.getByRole('region', { name: 'Alertas y pendientes' });
    await expect(alertsPanel).toBeVisible();
    const firstAlert = (await alerts).data[0];
    if (firstAlert) {
      await expect(
        alertsPanel.getByRole('table', { name: 'Alertas' }).getByText(firstAlert.description),
      ).toBeVisible();
    } else {
      await expect(alertsPanel.getByText('No tienes alertas pendientes.')).toBeVisible();
    }

    // Actividad: próximas visitas y actividad reciente, sin errores.
    for (const name of ['Próximas visitas', 'Actividad reciente']) {
      const panel = page.getByRole('region', { name, exact: true });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    }
    await expect(page.getByText(NO_INDICATORS_NOTICE)).toHaveCount(0);
  });

  test('PF-01.23 · K2 y K1 llevan a su listado con el filtro y el mismo número; K6–K8 enlazan a Actividad comercial', async () => {
    await settle(page);
    const opportunities = json<OpportunityIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/opportunities$/),
    );
    const projects = json<ProjectIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/projects$/),
    );
    await page.goto('/');

    // K6–K8: enlazan a los listados del Módulo 4 con el filtro de E.3, sin la nota de RN-01.19.
    const activityLinks: [string, string][] = [
      [KPI.visits, '/actividad/visitas?statusGroup=PENDING'],
      [KPI.pendingActivities, '/actividad/pendientes?bucket=DUE_SOON&bucket=PENDING'],
      [KPI.overdueActivities, '/actividad/pendientes?bucket=OVERDUE'],
    ];
    for (const [label, href] of activityLinks) {
      const card = kpiCard(page, label);
      await expectCardWithoutError(card);
      await expect(card.getByRole('link')).toHaveAttribute('href', href);
      await expect(card.getByText(UNAVAILABLE_ROUTE_NOTE)).toHaveCount(0);
    }

    // K2 → `/proyectos/oportunidades?status=OPEN` con el mismo número de registros (AC-01.17).
    const openCount = (await opportunities).open.count;
    expect(openCount, 'la demo debe tener oportunidades abiertas del asesor').toBeGreaterThan(0);
    const openList = json<ListPage>(
      waitForApi(page, 'GET', /^\/opportunities$/, (params) => params.get('status') === 'OPEN'),
    );
    await kpiCard(page, KPI.open).getByRole('link', { name: 'Ver oportunidades abiertas' }).click();
    await expect(page).toHaveURL(/\/proyectos\/oportunidades\?status=OPEN$/);
    expect((await openList).pagination.totalItems).toBe(openCount);
    await expect(
      page.getByText(new RegExp(`^Mostrando 1–\\d+ de ${openCount.toLocaleString('es-MX')}$`)),
    ).toBeVisible();

    // K1 → `/proyectos?active=true` con el mismo número de registros.
    const activeCount = (await projects).activeProjects;
    expect(activeCount, 'la demo debe tener proyectos activos del asesor').toBeGreaterThan(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    const projectList = json<ListPage>(
      waitForApi(page, 'GET', /^\/projects$/, (params) => params.get('active') === 'true'),
    );
    await kpiCard(page, KPI.projects).getByRole('link', { name: 'Ver proyectos activos' }).click();
    await expect(page).toHaveURL(/\/proyectos\?active=true$/);
    expect((await projectList).pagination.totalItems).toBe(activeCount);
    await expect(
      page.getByText(new RegExp(`^Mostrando 1–\\d+ de ${activeCount.toLocaleString('es-MX')}$`)),
    ).toBeVisible();
  });
});

/**
 * PF-01.41 con el manager demo (TEAM): el asesor de los recorridos no tiene actividades
 * vencidas en la demo y el manager ve las de su equipo (asesor2.gt), así que la bandeja
 * tiene alertas `ACTIVIDAD_VENCIDA` reales que comparar con K8.
 */
test.describe.serial('Inicio · Panel de control (manager)', () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.skip(
      !managerEmail || !managerPassword,
      'Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.',
    );
    page = await newSignedInPage(browser, managerEmail, managerPassword);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('PF-01.41 · manager: K8, la bandeja de alertas y /actividad/pendientes cuadran y «Abrir» lleva a la ficha', async () => {
    await settle(page);
    const summary = json<AlertsSummary>(waitForApi(page, 'GET', /^\/dashboard\/alerts\/summary$/));
    const activities = json<ActivityIndicators>(
      waitForApi(page, 'GET', /^\/dashboard\/indicators\/activities$/),
    );
    const overdueAlerts = json<AlertsPage>(
      waitForApi(
        page,
        'GET',
        /^\/dashboard\/alerts$/,
        (params) => params.get('type') === 'ACTIVIDAD_VENCIDA',
      ),
    );
    await page.goto('/?alertType=ACTIVIDAD_VENCIDA');

    // AL-1 y KPI-09 cuentan lo mismo para la misma sesión (base de AC-01.34).
    const overdueCount = (await activities).overdue.count;
    const summaryItems = (await summary).items;
    expect(summaryItems.find((item) => item.type === 'ACTIVIDAD_VENCIDA')?.count).toBe(
      overdueCount,
    );
    const overdue = await overdueAlerts;
    expect(overdue.pagination.totalItems).toBe(overdueCount);

    const panel = page.getByRole('region', { name: 'Alertas y pendientes' });
    const table = panel.getByRole('table', { name: 'Alertas' });
    expect(
      overdue.data.length,
      'la demo debe tener actividades vencidas en el equipo del manager',
    ).toBeGreaterThan(0);
    for (const alert of overdue.data) {
      await expect(table.getByText(alert.description)).toBeVisible();
    }
    // Cada actividad vencida ofrece «Abrir» hacia su ficha del Módulo 4 (AC-01.31).
    await expect(panel.getByRole('link', { name: /^Abrir / })).toHaveCount(overdue.data.length);

    // K8 → `/actividad/pendientes?bucket=OVERDUE`: la bandeja del Módulo 4 aplica la misma
    // visibilidad (directa + herencia por proyecto) y devuelve el mismo número.
    const pendingList = json<ListPage>(
      waitForApi(page, 'GET', /^\/activities\/pending$/, (params) =>
        params.getAll('bucket').includes('OVERDUE'),
      ),
    );
    await kpiCard(page, KPI.overdueActivities).getByRole('link').click();
    await expect(page).toHaveURL(/\/actividad\/pendientes\?bucket=OVERDUE$/);
    expect((await pendingList).pagination.totalItems).toBe(overdueCount);

    // «Abrir» de la primera alerta → ficha de la actividad.
    await settle(page);
    const reopened = json<AlertsPage>(
      waitForApi(
        page,
        'GET',
        /^\/dashboard\/alerts$/,
        (params) => params.get('type') === 'ACTIVIDAD_VENCIDA',
      ),
    );
    await page.goto('/?alertType=ACTIVIDAD_VENCIDA');
    const firstOverdue = (await reopened).data[0];
    if (!firstOverdue) {
      throw new Error('La bandeja no devolvió alertas ACTIVIDAD_VENCIDA pese al resumen.');
    }
    await panel
      .getByRole('link', { name: `Abrir ${firstOverdue.source.code}`, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/actividad/actividades/${firstOverdue.source.id}$`));
    await expect(page.getByText(firstOverdue.source.code).first()).toBeVisible();
    await expect(page.getByText(/no existe o no tienes acceso/i)).toHaveCount(0);

    // Un tipo cuya ficha sí existe (proyecto u oportunidad): «Abrir» lleva a la ficha.
    const linkable = summaryItems.find(
      (item) =>
        item.enabled &&
        item.count > 0 &&
        (item.type === 'PROYECTO_SIN_ACTUALIZAR' ||
          item.type === 'OPORTUNIDAD_SIN_SIGUIENTE_ACCION'),
    );
    expect(
      linkable,
      'la demo debe tener una alerta de proyecto u oportunidad en el equipo del manager',
    ).toBeDefined();
    if (!linkable) {
      return;
    }
    const typed = json<AlertsPage>(
      waitForApi(
        page,
        'GET',
        /^\/dashboard\/alerts$/,
        (params) => params.get('type') === linkable.type,
      ),
    );
    await page.goto(`/?alertType=${linkable.type}`);
    const linkablePage = await typed;
    expect(linkablePage.pagination.totalItems).toBe(linkable.count);
    const first = linkablePage.data[0];
    if (!first) {
      throw new Error(`La bandeja no devolvió alertas ${linkable.type} pese al resumen.`);
    }
    await expect(panel.getByRole('link', { name: /^Abrir / })).toHaveCount(
      linkablePage.data.length,
    );
    await panel
      .getByRole('link', { name: `Abrir ${first.source.code}`, exact: true })
      .first()
      .click();
    const detail =
      first.source.type === 'PROJECT'
        ? `/proyectos/${first.source.id}`
        : `/proyectos/oportunidades/${first.source.id}`;
    await expect(page).toHaveURL(new RegExp(`${detail}$`));
    await expect(page.getByText(first.source.code).first()).toBeVisible();
    await expect(page.getByText(/no existe o no tienes acceso/i)).toHaveCount(0);
  });
});

test.describe('Inicio · Panel de control (sin permisos comerciales)', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-01.48 · rol usuario: sólo Hero, accesos y el aviso, sin peticiones a /dashboard', async ({
    page,
  }) => {
    test.skip(
      !noCommercialEmail || !noCommercialPassword,
      'Define E2E_NO_COMMERCIAL_EMAIL y E2E_NO_COMMERCIAL_PASSWORD (los crea `e2e-stack.ts activate`).',
    );
    const dashboardRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith(`${API_PREFIX}/dashboard`)) {
        dashboardRequests.push(request.url());
      }
    });

    await signIn(page, noCommercialEmail, noCommercialPassword);
    const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
    await page.goto('/');
    expect((await menu).status()).toBe(200);

    // AC-01.5: Hero, «Mi acceso», accesos y el aviso de RN-01.7.
    await expect(page.getByRole('region', { name: GREETING })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Mi acceso' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Accesos rápidos' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: NO_INDICATORS_NOTICE })).toBeVisible();

    // Ningún bloque comercial.
    for (const label of Object.values(KPI)) {
      await expect(kpiCard(page, label)).toHaveCount(0);
    }
    await expect(page.getByRole('region', { name: 'Metas y cumplimiento' })).toHaveCount(0);
    for (const name of ['Alertas y pendientes', 'Próximas visitas', 'Actividad reciente']) {
      await expect(page.getByRole('region', { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('group', { name: 'Período' })).toHaveCount(0);
    expect(dashboardRequests).toEqual([]);
  });
});
