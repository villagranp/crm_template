import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Recorrido de la administración de accesos (PLAN-ADMIN §7, E2E).
 *
 * Crear un rol propio → asignarlo a un usuario nuevo → ese usuario ve sólo su
 * menú (`GET /me/menu`, ADR-018) y una pantalla sin permiso muestra «Sin
 * acceso» → suspenderlo → ya no puede entrar.
 *
 * Precondiciones:
 * - Backend y base de datos aislados (ver TESTING.md §«E2E del acceso local»);
 *   nunca la base de desarrollo: el recorrido crea un rol y un usuario.
 * - El administrador ya tiene contraseña personal (no está pendiente de cambio).
 * - El backend tiene configurada `AUTH_DEFAULT_PASSWORD`.
 *
 * Es repetible sobre la misma base: el rol y el usuario llevan un sufijo único
 * y se localizan por su código y su correo, nunca por posición.
 *
 * Las credenciales llegan por variables de entorno y nunca se escriben aquí:
 * - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — administrador sin cambio pendiente
 * - `E2E_DEFAULT_PASSWORD` — la contraseña inicial del backend (`AUTH_DEFAULT_PASSWORD`)
 * - `E2E_NEW_USER_PASSWORD` — la que fija el usuario nuevo (≥ 12 caracteres)
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const defaultPassword = process.env.E2E_DEFAULT_PASSWORD ?? '';
const newUserPassword = process.env.E2E_NEW_USER_PASSWORD ?? '';

const hasCredentials = Boolean(adminEmail && adminPassword && defaultPassword && newUserPassword);

const API_PREFIX = '/api/v1';
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_FORBIDDEN = 403;
/** Argon2id en cada acceso y cuatro inicios de sesión: más margen que el de por defecto. */
const TEST_TIMEOUT_MS = 120_000;

/**
 * Promesa de la respuesta de la API con ese método y ruta. `query` exige
 * además esos parámetros, para no confundir una búsqueda con la carga inicial.
 */
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

async function signIn(page: Page, email: string, password: string): Promise<Response> {
  await page.goto('/acceso');
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/^contraseña/i).fill(password);
  const login = waitForApi(page, 'POST', /^\/auth\/login$/);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  return login;
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
}

test.describe.serial('administración de accesos', () => {
  test.skip(
    !hasCredentials,
    'Define E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_DEFAULT_PASSWORD y E2E_NEW_USER_PASSWORD para ejecutar el recorrido de administración.',
  );

  test('un rol propio concede sólo su menú y suspender corta el acceso', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const suffix = Date.now().toString(36);
    const roleCode = `e2e-equipos-${suffix}`;
    const roleName = `E2E Equipos ${suffix}`;
    const userEmail = `e2e-${suffix}@example.com`;
    const userFirstName = 'E2E';
    const userLastName = `Acceso ${suffix}`;

    await test.step('el administrador inicia sesión', async () => {
      const login = await signIn(page, adminEmail, adminPassword);
      expect(login.status()).toBe(HTTP_OK);
      await expect(page).not.toHaveURL(/\/acceso$/);
      await expect(page).not.toHaveURL(/\/cambiar-contrasena$/);
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();
    });

    await test.step('crea un rol propio', async () => {
      await page.goto('/administracion/roles');
      await expect(page.getByRole('heading', { name: 'Roles y permisos', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nuevo rol' }).click();

      const form = page.getByRole('dialog', { name: 'Nuevo rol' });
      await form.getByLabel(/^código/i).fill(roleCode);
      await form.getByLabel(/^nombre/i).fill(roleName);

      const created = waitForApi(page, 'POST', /^\/roles$/);
      await form.getByRole('button', { name: 'Crear rol' }).click();
      expect((await created).status()).toBe(HTTP_CREATED);
      await expect(form).toBeHidden();
    });

    // Tras crearlo, la pantalla abre su detalle.
    const roleDetail = page.getByRole('dialog', { name: roleName });

    await test.step('le concede sólo el permiso equipos.ver', async () => {
      await expect(roleDetail).toBeVisible();
      await roleDetail.getByRole('tab', { name: 'Permisos' }).click();

      const permission = roleDetail.getByRole('checkbox', { name: 'equipos.ver', exact: true });
      await permission.check();
      await expect(roleDetail.getByRole('checkbox', { checked: true })).toHaveCount(1);

      const saved = waitForApi(page, 'PUT', /^\/roles\/[^/]+\/permissions$/);
      await roleDetail.getByRole('button', { name: 'Guardar permisos' }).click();
      const response = await saved;
      expect(response.status()).toBe(HTTP_OK);
      expect(((await response.json()) as { permissionCodes: string[] }).permissionCodes).toEqual([
        'equipos.ver',
      ]);
      await expect(roleDetail.getByText('Permisos actualizados.')).toBeVisible();
    });

    await test.step('le concede sólo la opción de menú «Equipos»', async () => {
      await roleDetail.getByRole('tab', { name: 'Opciones de menú' }).click();

      await roleDetail.getByRole('checkbox', { name: 'Equipos', exact: true }).check();
      await expect(roleDetail.getByRole('checkbox', { checked: true })).toHaveCount(1);

      const saved = waitForApi(page, 'PUT', /^\/roles\/[^/]+\/menu-options$/);
      await roleDetail.getByRole('button', { name: 'Guardar opciones' }).click();
      const response = await saved;
      expect(response.status()).toBe(HTTP_OK);
      expect(((await response.json()) as { menuOptionIds: string[] }).menuOptionIds).toHaveLength(
        1,
      );
      await expect(roleDetail.getByText('Opciones actualizadas.')).toBeVisible();

      await roleDetail.getByRole('button', { name: 'Cerrar' }).click();
      await expect(roleDetail).toBeHidden();
    });

    await test.step('da de alta un usuario con sólo ese rol', async () => {
      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nuevo usuario' }).click();

      const form = page.getByRole('dialog', { name: 'Nuevo usuario' });
      await form.getByLabel(/^correo/i).fill(userEmail);
      await form.getByLabel(/^nombre/i).fill(userFirstName);
      await form.getByLabel(/^apellidos/i).fill(userLastName);

      const roles = form.getByRole('group', { name: 'Roles iniciales' });
      await roles.getByRole('checkbox', { name: roleName, exact: true }).check();
      await expect(roles.getByRole('checkbox', { checked: true })).toHaveCount(1);

      const created = waitForApi(page, 'POST', /^\/users$/);
      await form.getByRole('button', { name: 'Crear usuario' }).click();
      expect((await created).status()).toBe(HTTP_CREATED);
      await expect(form).toBeHidden();

      // La pantalla abre el detalle del usuario recién creado.
      const detail = page.getByRole('dialog', { name: `${userFirstName} ${userLastName}` });
      await expect(detail.getByText('Invitado', { exact: true })).toBeVisible();
      await detail.getByRole('button', { name: 'Cerrar' }).click();
      await expect(detail).toBeHidden();
    });

    await test.step('el administrador cierra sesión', async () => {
      await signOut(page);
    });

    await test.step('el usuario nuevo entra con la contraseña inicial y la cambia', async () => {
      const login = await signIn(page, userEmail, defaultPassword);
      expect(login.status()).toBe(HTTP_OK);
      await expect(page).toHaveURL(/\/cambiar-contrasena$/);

      await page.getByLabel(/^contraseña actual/i).fill(defaultPassword);
      await page.getByLabel(/^nueva contraseña/i).fill(newUserPassword);
      await page.getByLabel(/^repite la nueva contraseña/i).fill(newUserPassword);

      const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
      await page.getByRole('button', { name: /guardar contraseña/i }).click();
      await expect(page).not.toHaveURL(/\/cambiar-contrasena$/);
      expect((await menu).status()).toBe(HTTP_OK);
    });

    await test.step('ve sólo el menú que le concede su rol', async () => {
      const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
      // Las opciones del módulo viven dentro de su grupo desplegable del menú lateral.
      const adminGroup = navigation.getByRole('button', { name: 'Administración', exact: true });
      if ((await adminGroup.getAttribute('aria-expanded')) !== 'true') {
        await adminGroup.click();
      }
      await expect(navigation.getByRole('link', { name: 'Equipos', exact: true })).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Usuarios', exact: true })).toHaveCount(0);
      await expect(
        navigation.getByRole('link', { name: 'Roles y permisos', exact: true }),
      ).toHaveCount(0);
    });

    await test.step('una pantalla sin permiso muestra «Sin acceso»', async () => {
      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Sin acceso', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toHaveCount(0);
    });

    await test.step('el usuario nuevo cierra sesión', async () => {
      await signOut(page);
    });

    await test.step('el administrador suspende al usuario nuevo', async () => {
      const login = await signIn(page, adminEmail, adminPassword);
      expect(login.status()).toBe(HTTP_OK);
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toBeVisible();

      await page.goto('/administracion/usuarios');
      await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();

      const search = waitForApi(page, 'GET', /^\/users$/, { search: userEmail });
      await page.getByLabel('Buscar por nombre o correo').fill(userEmail);
      expect((await search).status()).toBe(HTTP_OK);

      const row = page
        .getByRole('table', { name: 'Usuarios' })
        .getByRole('row')
        .filter({ hasText: userEmail });
      await expect(row).toHaveCount(1);
      await row.getByRole('button', { name: `Ver ${userFirstName} ${userLastName}` }).click();

      const detail = page.getByRole('dialog', { name: `${userFirstName} ${userLastName}` });
      await expect(detail.getByText('Activo', { exact: true })).toBeVisible();
      await detail.getByRole('button', { name: 'Suspender' }).click();

      const confirm = page.getByRole('dialog', { name: 'Suspender usuario' });
      await confirm
        .getByLabel(/^motivo/i)
        .fill('Prueba E2E: verificar que la suspensión corta el acceso.');

      const suspended = waitForApi(page, 'POST', /^\/users\/[^/]+\/suspend$/);
      await confirm.getByRole('button', { name: 'Suspender' }).click();
      expect((await suspended).status()).toBe(HTTP_OK);
      await expect(confirm).toBeHidden();
      await expect(detail.getByText('Usuario suspendido. Sus sesiones se cerraron.')).toBeVisible();
      await expect(detail.getByText('Suspendido', { exact: true })).toBeVisible();

      await detail.getByRole('button', { name: 'Cerrar' }).click();
      await signOut(page);
    });

    await test.step('el usuario suspendido ya no puede entrar', async () => {
      const login = await signIn(page, userEmail, newUserPassword);
      expect(login.status()).toBe(HTTP_FORBIDDEN);
      await expect(page).toHaveURL(/\/acceso$/);
      await expect(page.getByRole('alert')).toHaveText(/tu cuenta está deshabilitada/i);
      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);
    });
  });
});
