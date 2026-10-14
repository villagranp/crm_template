import { expect, test, type Page, type Response } from '@playwright/test';

/**
 * Recorrido completo del acceso local (PLAN-AUTH-LOCAL §7, E2E).
 *
 * Entra con la contraseña inicial del administrador, cambia la contraseña
 * obligatoria (D13), comprueba que ve el menú que la base de datos le concede
 * (`GET /me/menu`, ADR-018) y cierra sesión.
 *
 * Precondiciones:
 * - Backend y base de datos levantados, con la semilla aplicada.
 * - El administrador tiene la contraseña inicial pendiente de cambio. Tras una
 *   ejecución con éxito ya no la tiene: hay que restablecerla (o volver a
 *   sembrar una base limpia) antes de repetir.
 *
 * Las credenciales llegan por variables de entorno y nunca se escriben aquí:
 * - `E2E_ADMIN_EMAIL`
 * - `E2E_ADMIN_PASSWORD` — la contraseña inicial (`SEED_ADMIN_PASSWORD`)
 * - `E2E_ADMIN_NEW_PASSWORD` — la que se fija en el primer acceso (≥ 12 caracteres)
 */

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const adminNewPassword = process.env.E2E_ADMIN_NEW_PASSWORD ?? '';

const hasCredentials = Boolean(adminEmail && adminPassword && adminNewPassword);

const HTTP_OK = 200;

/** Respuesta de `method` sobre `/api/v1<path>` (ruta exacta). */
function waitForApi(page: Page, method: string, path: string): Promise<Response> {
  return page.waitForResponse(
    (response) => response.request().method() === method && new URL(response.url()).pathname === `/api/v1${path}`,
  );
}

test.describe('acceso local del administrador', () => {
  test.skip(
    !hasCredentials,
    'Define E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD y E2E_ADMIN_NEW_PASSWORD para ejecutar el recorrido de acceso.',
  );

  test('entra, fija su contraseña, ve su menú y cierra sesión', async ({ page }) => {
    await test.step('inicia sesión con la contraseña inicial', async () => {
      await page.goto('/acceso');
      await page.getByLabel(/correo electrónico/i).fill(adminEmail);
      await page.getByLabel(/^contraseña/i).fill(adminPassword);
      const login = waitForApi(page, 'POST', '/auth/login');
      await page.getByRole('button', { name: /iniciar sesión/i }).click();
      // Argon2id y varias escrituras: con los demás workers arrancando, el
      // login puede pasar de los 5 s de `expect`. Se espera su respuesta real.
      expect((await login).status()).toBe(HTTP_OK);
    });

    await test.step('la aplicación exige cambiar la contraseña antes de nada', async () => {
      await expect(page).toHaveURL(/\/cambiar-contrasena$/);
      await expect(
        page.getByText('Debes establecer una contraseña personal antes de continuar'),
      ).toBeVisible();

      // Cualquier otra ruta devuelve a la pantalla de cambio.
      await page.goto('/');
      await expect(page).toHaveURL(/\/cambiar-contrasena$/);
    });

    await test.step('fija una contraseña personal', async () => {
      await page.getByLabel(/^contraseña actual/i).fill(adminPassword);
      await page.getByLabel(/^nueva contraseña/i).fill(adminNewPassword);
      await page.getByLabel(/^repite la nueva contraseña/i).fill(adminNewPassword);

      const passwordChange = waitForApi(page, 'POST', '/auth/password/change');
      const menuResponse = waitForApi(page, 'GET', '/me/menu');
      await page.getByRole('button', { name: /guardar contraseña/i }).click();

      expect((await passwordChange).status()).toBe(HTTP_OK);
      expect((await menuResponse).status()).toBe(HTTP_OK);
      await expect(page).not.toHaveURL(/\/cambiar-contrasena$/);
    });

    await test.step('ve el menú que la base de datos le concede', async () => {
      const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
      await expect(navigation).toBeVisible();
      // El menú se agrupa en secciones (Principal, Módulos, Sistema) con su encabezado.
      await expect(navigation.getByRole('heading').first()).toBeVisible();
    });

    await test.step('cierra sesión', async () => {
      await page.getByRole('button', { name: 'Menú de usuario' }).click();
      await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();

      await expect(page.getByRole('button', { name: 'Menú de usuario' })).toHaveCount(0);

      // Sin sesión, una ruta protegida lleva al acceso: el refresh ya no sirve.
      await page.goto('/cambiar-contrasena');
      await expect(page).toHaveURL(/\/acceso$/);
    });
  });
});
