import { expect, test } from '@playwright/test';

/**
 * Prueba de humo de la plantilla.
 *
 * Verifica que el shell renderiza, que la ruta desconocida cae en la página de
 * no encontrado y que la pantalla de acceso existe. Los recorridos de negocio
 * los añade cada proyecto, uno por camino crítico (ver TESTING.md).
 */
test.describe('shell de la aplicación', () => {
  test('renderiza el panel de control de la plantilla', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /panel de control/i })).toBeVisible();
  });

  test('muestra la página de no encontrado en una ruta desconocida', async ({ page }) => {
    await page.goto('/esta-ruta-no-existe');

    await expect(page.getByRole('heading', { name: /página no encontrada/i })).toBeVisible();
  });

  test('muestra la pantalla de acceso', async ({ page }) => {
    await page.goto('/acceso');

    await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible();
  });
});
