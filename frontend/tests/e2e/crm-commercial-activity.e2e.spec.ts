import { expect, test, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 4 · Actividad comercial (04 §J: PF-04.58, PF-04.59,
 * PF-04.60, PF-04.61).
 *
 * Precondiciones:
 * - Stack aislado con la semilla esencial y la demo (TESTING.md §«E2E de
 *   Actividad comercial» y `backend/scripts/e2e-stack.ts`); nunca la base de
 *   desarrollo: el recorrido crea visitas y actividades (asuntos con sufijo
 *   único y fechas propias, así que es repetible).
 * - Regla de conflicto horario por defecto `AVISAR` (D-04.2).
 * - Los usuarios ya tienen contraseña personal (sin cambio pendiente).
 *
 * Aproximación de PF-04.58 (el Módulo 3 vive en otra rama): no hay ficha de
 * proyecto ni API `/projects`, así que el punto de partida es la URL que el
 * botón «Nueva actividad» de la ficha del proyecto abre (E.11:
 * `/actividad/actividades/nueva?customerId&projectId&typeId`) y, solo en esa
 * prueba, el navegador simula el Módulo 3: añade la opción `proyectos-buscar`
 * a la respuesta real de `GET /me/menu` y responde `GET /projects` con el
 * proyecto demo real (contrato de 03 F.1). El alta, el historial y el
 * seguimiento van contra el backend real, que valida el vínculo con su propio
 * lector sobre la tabla `projects`.
 *
 * Variables (nunca se escriben credenciales aquí; `e2e-stack.ts activate` imprime las E2E_* sin contraseñas):
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor demo (OWN), dueño del proyecto y del cliente.
 * - `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD` — su manager (TEAM, `visitas.administrar`).
 * - `E2E_PROJECT_ID`, `E2E_PROJECT_CODE`, `E2E_PROJECT_NAME` — proyecto demo del asesor.
 * - `E2E_PROJECT_CUSTOMER_ID`, `E2E_PROJECT_CUSTOMER_NAME` — su cliente (activo).
 * - `E2E_CALL_TYPE_ID` — tipo de actividad «Llamada».
 * - `E2E_DONE_VISIT_ID` — una visita demo `REALIZADA`.
 * - `E2E_VISIT_VIEWER_EMAIL`, `E2E_NO_ACTIVITY_EMAIL`, `E2E_RESTRICTED_PASSWORD` —
 *   usuario con solo `visitas.ver` y usuario sin opciones del módulo.
 */

const env = (name: string): string => process.env[name] ?? '';

const asesor = { email: env('E2E_ASESOR_EMAIL'), password: env('E2E_ASESOR_PASSWORD') };
const manager = { email: env('E2E_MANAGER_EMAIL'), password: env('E2E_MANAGER_PASSWORD') };
const visitViewer = { email: env('E2E_VISIT_VIEWER_EMAIL'), password: env('E2E_RESTRICTED_PASSWORD') };
const noActivityUser = { email: env('E2E_NO_ACTIVITY_EMAIL'), password: env('E2E_RESTRICTED_PASSWORD') };
const project = {
  id: env('E2E_PROJECT_ID'),
  code: env('E2E_PROJECT_CODE'),
  name: env('E2E_PROJECT_NAME'),
  customerId: env('E2E_PROJECT_CUSTOMER_ID'),
  customerName: env('E2E_PROJECT_CUSTOMER_NAME'),
};
const callTypeId = env('E2E_CALL_TYPE_ID');
const doneVisitId = env('E2E_DONE_VISIT_ID');

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
/** Argon2id en cada acceso y varios recorridos largos: más margen que el de por defecto. */
const TEST_TIMEOUT_MS = 180_000;
const ACTIVITY_CODE = /ACT-\d{4}-\d+/;
const VISIT_CODE = /VIS-\d{4}-\d+/;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

interface Credentials {
  email: string;
  password: string;
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `YYYY-MM-DD` en la zona del navegador (Playwright usa la del sistema, como este proceso). */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Valor de un `<input type="datetime-local">` en la zona del navegador. */
function dateTimeLocal(date: Date): string {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function uniqueSuffix(): string {
  return Date.now().toString(36).toUpperCase();
}

/** Texto del aviso de éxito con el código del registro (`… ACT-2026-000123 …`). */
async function codeFromNotice(page: Page, pattern: RegExp, code: RegExp): Promise<string> {
  const notice = page.getByRole('status').filter({ hasText: pattern });
  await expect(notice).toBeVisible();
  const match = (await notice.textContent())?.match(code);
  expect(match, 'el aviso incluye el código').not.toBeNull();
  return match?.[0] ?? '';
}

/**
 * Una sesión por usuario para toda la serie: el login admite 10 intentos por
 * minuto por IP y esta serie convive con los demás E2E. Las recargas
 * (`page.goto`) reutilizan la sesión mediante la cookie de refresco.
 */
const sessions = new Map<string, { context: BrowserContext; page: Page }>();

async function sessionFor(browser: Browser, user: Credentials): Promise<Page> {
  const existing = sessions.get(user.email);
  if (existing) {
    return existing.page;
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(user.email);
  await page.getByLabel(/^contraseña/i).fill(user.password);
  const login = waitForApi(page, 'POST', /^\/auth\/login$/);
  const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  // Argon2id y varias escrituras: con los demás workers arrancando, el login
  // puede pasar de los 5 s de `expect`. Se esperan las respuestas reales.
  expect((await login).status()).toBe(HTTP_OK);
  expect((await menu).status()).toBe(HTTP_OK);
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
  sessions.set(user.email, { context, page });
  return page;
}

/** Los eventos de la agenda (vista Día) con ese asunto: botón con nombre accesible completo (E.2). */
function agendaEvents(page: Page, subject: string, status: string): ReturnType<Page['getByRole']> {
  return page.getByRole('button', { name: new RegExp(`: ${escapeRegExp(subject)}; cliente: .*; estado: ${status}$`) });
}

async function openAgendaDay(page: Page, date: Date): Promise<void> {
  const calendar = waitForApi(page, 'GET', /^\/agenda\/calendar$/);
  await page.goto(`/actividad/agenda?mode=day&date=${dayKey(date)}`);
  expect((await calendar).status()).toBe(HTTP_OK);
}

test.describe.serial('CRM · Actividad comercial', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test.afterAll(async () => {
    for (const { context } of sessions.values()) {
      await context.close();
    }
    sessions.clear();
  });

  test('PF-04.58 · asesor: llamada «ya realizada» desde el proyecto → historial y seguimiento del proyecto', async ({ browser }) => {
    test.skip(
      !asesor.email || !asesor.password || !project.id || !project.customerId || !callTypeId,
      'Define E2E_ASESOR_EMAIL, E2E_ASESOR_PASSWORD, E2E_PROJECT_* y E2E_CALL_TYPE_ID.',
    );
    const subject = `E2E llamada ${uniqueSuffix()}`;
    const page = await sessionFor(browser, asesor);

    // Simulación del Módulo 3 (ver cabecera): solo la opción de menú y la búsqueda de proyectos.
    await page.route(`**${API_PREFIX}/me/menu`, async (route) => {
      const response = await route.fetch();
      const modules = (await response.json()) as Array<Record<string, unknown>>;
      modules.push({
        key: 'proyectos',
        label: 'Proyectos',
        icon: 'apartment',
        order: 30,
        isSystem: false,
        options: [
          { id: 'e2e-proyectos-buscar', key: 'proyectos-buscar', label: 'Proyectos', icon: 'apartment', path: '/proyectos', order: 10, requiredPermission: 'proyectos.ver', children: [] },
        ],
      });
      await route.fulfill({ response, json: modules });
    });
    await page.route(`**${API_PREFIX}/projects?**`, (route) =>
      route.fulfill({
        json: {
          data: [{ id: project.id, code: project.code, name: project.name, customer: { id: project.customerId, legalName: project.customerName } }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        },
      }),
    );

    try {
      // La preselección depende de dos consultas tras recargar la sesión: se
      // esperan sus respuestas reales antes de mirar los valores del formulario.
      const customerLookup = waitForApi(page, 'GET', new RegExp(`^/customers/${escapeRegExp(project.customerId)}$`));
      const projectsLookup = waitForApi(page, 'GET', /^\/projects$/);
      await page.goto(`/actividad/actividades/nueva?customerId=${project.customerId}&projectId=${project.id}&typeId=${callTypeId}`);
      expect((await customerLookup).status()).toBe(HTTP_OK);
      expect((await projectsLookup).status()).toBe(HTTP_OK);
      const form = page.getByRole('form', { name: 'Crear actividad' });
      await expect(form.getByRole('combobox', { name: /Cliente/ })).toHaveValue(new RegExp(escapeRegExp(project.customerName)));
      await expect(form.getByRole('combobox', { name: /Proyecto/ })).toHaveValue(new RegExp(escapeRegExp(project.name)));
      await expect(form.getByRole('combobox', { name: /Tipo de actividad/ })).toHaveText(/Llamada/);
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
    }

    const form = page.getByRole('form', { name: 'Crear actividad' });
    await form.getByLabel(/^Asunto/).fill(subject);
    await form.getByLabel('Ya realizada: registrar la gestión como completada').check();
    await form.getByLabel(/^Notas del resultado/).fill('Cliente interesado; enviar cotización.');
    const created = waitForApi(page, 'POST', /^\/activities$/);
    await form.getByRole('button', { name: 'Crear actividad' }).click();
    const response = await created;
    expect(response.status()).toBe(HTTP_CREATED);
    const body = (await response.json()) as { project: { id: string } | null; customer: { id: string }; status: { label: string } };
    expect(body.project?.id).toBe(project.id);
    expect(body.customer.id).toBe(project.customerId);
    const code = await codeFromNotice(page, /registrada como realizada/, ACTIVITY_CODE);

    // Historial del proyecto: la llamada aparece una vez, con enlace a su origen.
    await page.goto(`/actividad/historial?projectId=${project.id}`);
    await expect(page.getByRole('link', { name: `Ver actividad ${code}`, exact: true })).toHaveCount(1);

    // Seguimiento por proyecto: la llamada es la última interacción y aparece en la trazabilidad.
    await page.goto(`/actividad/seguimiento?projectId=${project.id}`);
    const byProject = waitForApi(page, 'GET', /^\/follow-ups$/);
    await page.getByRole('button', { name: 'Por proyecto' }).click();
    expect((await byProject).status()).toBe(HTTP_OK);
    const row = page.getByRole('link', { name: `Ver la trazabilidad de ${project.name} (${project.customerName})` });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('link', { name: `Ver actividad ${code}` })).toBeVisible();
    await row.click();
    // Drawer de trazabilidad (E.4): la línea de tiempo del proyecto enlaza la llamada.
    const timeline = page.getByRole('region', { name: 'Línea de tiempo' });
    await expect(timeline.getByRole('link', { name: `Ver actividad ${code}`, exact: true })).toBeVisible();
  });

  test('PF-04.59 · asesor planifica con aviso de conflicto, reprograma, registra y confirma; su manager no ve «Confirmar»', async ({
    browser,
  }) => {
    test.skip(
      !asesor.email || !asesor.password || !manager.email || !manager.password || !project.customerId,
      'Define E2E_ASESOR_*, E2E_MANAGER_* y E2E_PROJECT_CUSTOMER_ID.',
    );
    const suffix = uniqueSuffix();
    const objective = `E2E visita ${suffix}`;
    // Fechas propias y futuras (distintas en cada ejecución) para no depender de la demo.
    const firstStart = new Date(Date.now() + (30 + (Date.now() % 300)) * DAY_MS);
    firstStart.setHours(9, (Date.now() % 12) * 5, 0, 0);
    const overlapStart = new Date(firstStart.getTime() + 30 * MINUTE_MS);
    const newStart = new Date(firstStart.getTime() + DAY_MS + 2 * 60 * MINUTE_MS);
    const page = await sessionFor(browser, asesor);

    const planVisit = async (start: Date, visitObjective: string, expectConflictWith?: string) => {
      await page.goto(`/actividad/visitas/nueva?customerId=${project.customerId}`);
      const form = page.getByRole('form', { name: 'Guardar visita' });
      await expect(form.getByRole('combobox', { name: /Cliente/ })).toHaveValue(new RegExp(escapeRegExp(project.customerName)));
      await form.getByLabel(/^Objetivo/).fill(visitObjective);
      const conflicts = waitForApi(page, 'GET', /^\/visits\/schedule-conflicts$/);
      await form.getByLabel(/^Fecha y hora de inicio/).fill(dateTimeLocal(start));
      expect((await conflicts).status()).toBe(HTTP_OK);
      if (expectConflictWith) {
        const warning = form.getByRole('status').filter({ hasText: 'Ya tienes otra visita en ese horario' });
        await expect(warning).toBeVisible();
        await expect(warning).toContainText(expectConflictWith);
        await expect(warning).toContainText('Puedes guardar igualmente.');
      }
      const saveButton = form.getByRole('button', { name: 'Guardar visita' });
      await expect(saveButton).toBeEnabled();
      const created = waitForApi(page, 'POST', /^\/visits$/);
      await saveButton.click();
      const response = await created;
      expect(response.status()).toBe(HTTP_CREATED);
      const body = (await response.json()) as { scheduleConflicts?: unknown[] };
      expect((body.scheduleConflicts ?? []).length > 0).toBe(Boolean(expectConflictWith));
      return codeFromNotice(page, /planificada\./, VISIT_CODE);
    };

    // Planificar: una primera visita y otra que se solapa (aviso sin bloquear, AC-04.26).
    const blockingCode = await planVisit(firstStart, `E2E visita previa ${suffix}`);
    const code = await planVisit(overlapStart, objective, blockingCode);
    await expect(page.getByText('La visita se guardó, pero se solapa con otra')).toBeVisible();
    const visitUrl = page.url();
    await openAgendaDay(page, overlapStart);
    await expect(agendaEvents(page, objective, 'Programada')).toHaveCount(1);

    // Reprogramar (AC-04.37): misma visita, fecha nueva, etiqueta «Reprogramada».
    await page.goto(visitUrl);
    await page.getByRole('button', { name: 'Reprogramar' }).click();
    const reschedule = page.getByRole('dialog', { name: 'Reprogramar visita' });
    await reschedule.getByLabel(/^Nueva fecha y hora/).fill(dateTimeLocal(newStart));
    await reschedule.getByLabel(/^Motivo \(texto\)/).fill('El cliente pidió otro día.');
    const rescheduled = waitForApi(page, 'POST', /^\/visits\/[^/]+\/rescheduling$/);
    await reschedule.getByRole('button', { name: 'Reprogramar' }).click();
    expect((await rescheduled).status()).toBe(HTTP_OK);
    await expect(page.getByText(`Visita ${code} reprogramada.`)).toBeVisible();
    await openAgendaDay(page, overlapStart);
    await expect(agendaEvents(page, objective, '.*')).toHaveCount(0);
    await openAgendaDay(page, newStart);
    await expect(agendaEvents(page, objective, 'Reprogramada, Reprogramada')).toHaveCount(1);

    // Registrar realizada (AC-04.29): la fecha real por defecto es «ahora».
    await page.goto(visitUrl);
    await page.getByRole('button', { name: 'Registrar realizada' }).click();
    const completion = page.getByRole('dialog', { name: 'Registrar visita realizada' });
    await expect(completion.getByLabel(/^Fecha y hora real/)).not.toHaveValue('');
    await completion.getByLabel(/^Resumen del resultado/).fill('Se revisó el avance de la obra.');
    const completed = waitForApi(page, 'POST', /^\/visits\/[^/]+\/completion$/);
    await completion.getByRole('button', { name: 'Registrar realizada' }).click();
    expect((await completed).status()).toBe(HTTP_OK);
    await expect(page.getByText(`Visita ${code} registrada como realizada.`)).toBeVisible();
    // Ahora en su fecha real (RN-04.36). `isRescheduled` es «está en estado Reprogramada»
    // (AgendaItemDto, D-04.3): una vez realizada ya no lleva esa etiqueta.
    const today = new Date();
    await openAgendaDay(page, today);
    await expect(agendaEvents(page, objective, 'Realizada')).toHaveCount(1);
    await openAgendaDay(page, newStart);
    await expect(agendaEvents(page, objective, '.*')).toHaveCount(0);

    // Su manager (TEAM, con visitas.administrar) la ve pero no puede confirmarla (AC-04.62).
    const managerPage = await sessionFor(browser, manager);
    const managerDetail = waitForApi(managerPage, 'GET', /^\/visits\/[^/]+$/);
    await managerPage.goto(visitUrl);
    const managerView = (await (await managerDetail).json()) as { code: string; allowedActions: string[] };
    expect(managerView.code).toBe(code);
    expect(managerView.allowedActions).not.toContain('CONFIRM');
    await expect(managerPage.getByText('Pendiente de confirmar por el asesor dueño de la visita.')).toBeVisible();
    await expect(managerPage.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);

    // El asesor dueño la confirma (AC-04.33).
    await page.goto(visitUrl);
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Confirmar visita' });
    await confirmation.getByLabel(/^Resumen de confirmación/).fill('Visita confirmada por el asesor.');
    const confirmed = waitForApi(page, 'POST', /^\/visits\/[^/]+\/confirmation$/);
    await confirmation.getByRole('button', { name: 'Confirmar', exact: true }).click();
    expect((await confirmed).status()).toBe(HTTP_OK);
    await expect(page.getByText(`Visita ${code} confirmada.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reprogramar' })).toHaveCount(0);
    await openAgendaDay(page, today);
    await expect(agendaEvents(page, objective, 'Confirmada')).toHaveCount(1);

    // Historial: una sola entrada para la visita reprogramada, realizada y confirmada (AC-04.17).
    await page.goto(`/actividad/historial?customerId=${project.customerId}`);
    await expect(page.getByRole('link', { name: `Ver visita ${code}`, exact: true })).toHaveCount(1);
  });

  test('PF-04.60 · sin visitas.cerrar no hay «Confirmar»; sin opciones del módulo no hay menú de Actividad comercial', async ({ browser }) => {
    test.skip(
      !visitViewer.email || !noActivityUser.email || !visitViewer.password || !doneVisitId,
      'Define E2E_VISIT_VIEWER_EMAIL, E2E_NO_ACTIVITY_EMAIL, E2E_RESTRICTED_PASSWORD y E2E_DONE_VISIT_ID.',
    );

    // Con visitas.ver y sin visitas.cerrar: ve la visita REALIZADA, sin acciones (AC-04.35).
    const viewerPage = await sessionFor(browser, visitViewer);
    const navigation = viewerPage.getByRole('navigation', { name: 'Navegación principal' });
    const group = navigation.getByRole('button', { name: 'Actividad comercial', exact: true });
    if ((await group.getAttribute('aria-expanded')) !== 'true') {
      await group.click();
    }
    await expect(navigation.getByRole('link', { name: 'Visitas', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Agenda', exact: true })).toHaveCount(0);

    const detail = waitForApi(viewerPage, 'GET', new RegExp(`^/visits/${doneVisitId}$`));
    await viewerPage.goto(`/actividad/visitas/${doneVisitId}`);
    const visit = (await (await detail).json()) as { status: { label: string }; allowedActions: string[] };
    expect(visit.status.label).toBe('Realizada');
    expect(visit.allowedActions).toEqual([]);
    await expect(viewerPage.getByText('Pendiente de confirmar por el asesor dueño de la visita.')).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Corregir realización' })).toHaveCount(0);

    // Sin opciones del módulo: /me/menu no lo trae y el menú lateral no lo muestra (AC-04.58).
    const context = await browser.newContext();
    const page = await context.newPage();
    sessions.set(noActivityUser.email, { context, page });
    await page.goto('/acceso');
    await page.getByLabel(/correo electrónico/i).fill(noActivityUser.email);
    await page.getByLabel(/^contraseña/i).fill(noActivityUser.password);
    const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    const modules = (await (await menu).json()) as Array<{ key: string; options: Array<{ key: string }> }>;
    expect(modules.map((module) => module.key)).not.toContain('actividad-comercial');
    expect(modules.flatMap((module) => module.options.map((option) => option.key)).some((key) => key.startsWith('actividad-'))).toBe(false);
    const ownNavigation = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(ownNavigation.getByRole('button', { name: 'Clientes', exact: true }).or(ownNavigation.getByRole('link', { name: 'Clientes', exact: true })).first()).toBeVisible();
    await expect(ownNavigation.getByRole('button', { name: 'Actividad comercial', exact: true })).toHaveCount(0);
    await page.goto('/actividad/agenda');
    await expect(page.getByRole('heading', { name: 'Sin acceso', level: 1 })).toBeVisible();
  });

  test('PF-04.61 · bandeja: completar una actividad vencida la retira y la agenda la muestra completada', async ({ browser }) => {
    test.skip(
      !asesor.email || !asesor.password || !project.customerId || !callTypeId,
      'Define E2E_ASESOR_*, E2E_PROJECT_CUSTOMER_ID y E2E_CALL_TYPE_ID.',
    );
    const subject = `E2E vencida ${uniqueSuffix()}`;
    const dueAt = new Date(Date.now() - DAY_MS);
    dueAt.setHours(8, (Date.now() % 12) * 5, 0, 0);
    const page = await sessionFor(browser, asesor);

    // Una actividad propia ya vencida (vencimiento de ayer), creada por la interfaz.
    await page.goto(`/actividad/actividades/nueva?customerId=${project.customerId}&typeId=${callTypeId}`);
    const form = page.getByRole('form', { name: 'Crear actividad' });
    await expect(form.getByRole('combobox', { name: /Cliente/ })).toHaveValue(new RegExp(escapeRegExp(project.customerName)));
    await form.getByLabel(/^Asunto/).fill(subject);
    await form.getByLabel(/^Vencimiento/).fill(dateTimeLocal(dueAt));
    const created = waitForApi(page, 'POST', /^\/activities$/);
    await form.getByRole('button', { name: 'Crear actividad' }).click();
    expect((await created).status()).toBe(HTTP_CREATED);
    const code = await codeFromNotice(page, /creada\./, ACTIVITY_CODE);

    // Bandeja, pestaña Vencidas del cliente: completar la retira (AC-04.10).
    await page.goto(`/actividad/pendientes?bucket=OVERDUE&customerId=${project.customerId}`);
    const complete = page.getByRole('button', { name: `Completar ${code}`, exact: true });
    await expect(complete).toBeVisible();
    await complete.click();
    const dialog = page.getByRole('dialog', { name: 'Completar actividad' });
    await dialog.getByLabel(/^Notas del resultado/).fill('Se resolvió por teléfono.');
    const completion = waitForApi(page, 'POST', /^\/activities\/[^/]+\/completion$/);
    await dialog.getByRole('button', { name: 'Completar', exact: true }).click();
    expect((await completion).status()).toBe(HTTP_OK);
    await expect(page.getByText(`Actividad ${code} completada.`)).toBeVisible();
    await expect(page.getByRole('button', { name: `Completar ${code}`, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: new RegExp(`^Abrir la actividad ${escapeRegExp(code)}:`) })).toHaveCount(0);

    // Agenda (listado del día de su vencimiento): aparece como completada (AC-04.56).
    const day = dayKey(dueAt);
    const agenda = waitForApi(page, 'GET', /^\/agenda$/);
    await page.goto(`/actividad/agenda?view=list&from=${day}&to=${day}`);
    expect((await agenda).status()).toBe(HTTP_OK);
    const row = page.getByRole('link', { name: `Abrir el resumen de ${code}: ${subject}` });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Completada', { exact: true })).toBeVisible();
  });
});
