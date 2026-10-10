import { expect, test } from '@playwright/test';

/**
 * Prueba de humo, sin sesión.
 *
 * Verifica que la pantalla de acceso existe y que el shell no se muestra a
 * nadie sin sesión: cualquier ruta, conocida o no, lleva a `/acceso`. Los
 * recorridos con sesión viven en `auth-local` y `admin-access` (ver TESTING.md).
 */
test.describe('shell de la aplicación sin sesión', () => {
  test('la raíz lleva a la pantalla de acceso', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/acceso$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /bienvenido de nuevo/i }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
  });

  test('una ruta protegida o desconocida también lleva a la pantalla de acceso', async ({
    page,
  }) => {
    for (const path of ['/administracion/usuarios', '/esta-ruta-no-existe']) {
      await page.goto(path);

      await expect(page).toHaveURL(/\/acceso$/);
    }
  });

  test('muestra la pantalla de acceso', async ({ page }) => {
    await page.goto('/acceso');

    await expect(
      page.getByRole('heading', { level: 1, name: /bienvenido de nuevo/i }),
    ).toBeVisible();
  });
});
