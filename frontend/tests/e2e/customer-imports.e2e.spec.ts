import { readFile } from 'node:fs/promises';

import { expect, test, type Download, type Locator, type Page, type Response } from '@playwright/test';

/**
 * Recorridos del Módulo 6 · Carga masiva de clientes (06 §J.5: PF-06.49, PF-06.50).
 *
 * Precondiciones (TESTING.md §«E2E de Integraciones» y `backend/scripts/e2e-stack.ts`):
 * stack aislado con la semilla esencial y la demo, que deja
 * `crm.importaciones.habilitada = true` en ese esquema; nunca la base de desarrollo
 * compartida. El recorrido crea clientes con sufijo único (repetible).
 *
 * Variables (nunca se escriben credenciales aquí):
 * - `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — administrador (alcance ORGANIZATION, `importaciones.*`,
 *   `clientes.*`) con contraseña personal (`activate` la deja así).
 * - `E2E_IMPORT_EXISTING_CODE` — código de cliente de un cliente existente de `GT` que el
 *   administrador ve (lo imprime `activate`; p. ej. `DEMO-GT-001`).
 * - `E2E_ASESOR_EMAIL`, `E2E_ASESOR_PASSWORD` — asesor demo, sin `importaciones.ver`.
 *
 * El CSV se genera en la prueba con las columnas de la plantilla descargada (06 §J: no se
 * versionan archivos de carga): 3 filas válidas, 1 sin razón social y 1 cuyo código de cliente
 * ya existe en el país.
 */

const env = (name: string) => process.env[name] ?? '';
const adminEmail = env('E2E_ADMIN_EMAIL');
const adminPassword = env('E2E_ADMIN_PASSWORD');
const existingCode = env('E2E_IMPORT_EXISTING_CODE');
const asesorEmail = env('E2E_ASESOR_EMAIL');
const asesorPassword = env('E2E_ASESOR_PASSWORD');

const IMPORT_COUNTRY = 'GT';
const LIST_PATH = '/integraciones/clientes';
const TITLE = 'Carga masiva de clientes';
const API_PREFIX = '/api/v1';
const HTTP_CREATED = 201;
const HTTP_ACCEPTED = 202;
const BOM = String.fromCharCode(0xfeff);
const TEST_TIMEOUT_MS = 150_000;
const IMPORT_FINISH_TIMEOUT_MS = 30_000;

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

/** CSV mínimo (RFC 4180): comillas dobles, separador coma, sin BOM. Suficiente para los archivos del servidor. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Texto de un archivo descargado; comprueba que llega como CSV UTF-8 con BOM. */
async function downloadedCsv(download: Download): Promise<string[][]> {
  const path = await download.path();
  const text = await readFile(path, 'utf8');
  expect(text.startsWith(BOM)).toBe(true);
  return parseCsv(text.slice(BOM.length));
}

/** Valor de una tarjeta del resumen de la carga (`dt` → `dd`). */
function summaryValue(page: Page, label: string): Locator {
  return page
    .locator('[aria-label="Resumen de la carga"] > *')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
    .first();
}

function rowsTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Filas de la carga' });
}

async function showRows(page: Page, filter: string): Promise<void> {
  await page.getByRole('group', { name: 'Filtrar filas por estado' }).getByRole('button', { name: filter, exact: true }).click();
  await expect(page.getByRole('group', { name: 'Filtrar filas por estado' }).getByRole('button', { name: filter, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test.describe.serial('CRM · Carga masiva de clientes', () => {
  test.setTimeout(TEST_TIMEOUT_MS);

  test('PF-06.49 · administrador: plantilla → CSV con 3 válidas, 1 inválida y 1 duplicada → vista previa → confirma → archivo de errores → ficha del cliente importado', async ({
    page,
  }) => {
    test.skip(
      !adminEmail || !adminPassword || !existingCode,
      'Define E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD y E2E_IMPORT_EXISTING_CODE.',
    );
    const suffix = Date.now().toString(36).toUpperCase();
    const validNames = [`E2E Carga Uno ${suffix}`, `E2E Carga Dos ${suffix}`, `E2E Carga Tres ${suffix}`];
    const invalidCode = `E2E-${suffix}-SINRS`;
    const duplicateName = `E2E Carga Duplicada ${suffix}`;
    const fileName = `clientes-e2e-${suffix}.csv`;

    await signIn(page, adminEmail, adminPassword);

    // La opción sale del menú del servidor (ADR-018) y abre el historial.
    await page.getByRole('button', { name: 'Integraciones', exact: true }).click();
    await page.getByRole('link', { name: TITLE, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
    await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible();

    // Plantilla CSV: BOM + una sola fila con los encabezados de la plantilla.
    await page.getByRole('button', { name: 'Descargar plantilla' }).click();
    const templateDownload = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Plantilla CSV (UTF-8)' }).click();
    const template = await templateDownload;
    expect(template.suggestedFilename()).toBe('plantilla-clientes-v1.csv');
    const templateRows = await downloadedCsv(template);
    expect(templateRows).toHaveLength(1);
    const headers = templateRows[0] ?? [];
    expect(headers).toEqual(expect.arrayContaining(['Código de cliente', 'Razón social', 'País', 'NIT']));

    // CSV en el orden de columnas de la plantilla descargada.
    const fileRows: Record<string, string>[] = [
      ...validNames.map((name, index) => ({ 'Código de cliente': `E2E-${suffix}-${index + 1}`, 'Razón social': name, País: IMPORT_COUNTRY })),
      { 'Código de cliente': invalidCode, 'Razón social': '', País: IMPORT_COUNTRY },
      { 'Código de cliente': existingCode, 'Razón social': duplicateName, País: IMPORT_COUNTRY },
    ];
    const csv = [headers, ...fileRows.map((row) => headers.map((header) => row[header] ?? ''))]
      .map((cells) => cells.map(csvCell).join(','))
      .join('\r\n');

    // Nueva carga: el servidor valida en la misma petición y la pantalla abre el detalle.
    await page.getByRole('button', { name: 'Nueva carga' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nueva carga de clientes' });
    await dialog.getByLabel('Archivo de clientes').setInputFiles({
      name: fileName,
      mimeType: 'text/csv',
      buffer: Buffer.from(`${BOM}${csv}\r\n`, 'utf8'),
    });
    await expect(dialog.getByText(`Archivo elegido: ${fileName}`)).toBeVisible();
    const uploaded = waitForApi(page, 'POST', /^\/customer-imports$/);
    await dialog.getByRole('button', { name: 'Subir y validar' }).click();
    expect((await uploaded).status()).toBe(HTTP_CREATED);
    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}/[0-9a-f-]+`));

    // Vista previa: contadores y filtro de filas.
    await expect(page.getByText('Vista previa lista')).toBeVisible();
    await expect(page.getByText('Pendiente de confirmar').first()).toBeVisible();
    await expect(summaryValue(page, 'Total de filas')).toHaveText('5');
    await expect(summaryValue(page, 'Válidas')).toHaveText('3');
    await expect(summaryValue(page, 'Con advertencias')).toHaveText('0');
    await expect(summaryValue(page, 'Con errores')).toHaveText('2');

    const table = rowsTable(page);
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await showRows(page, 'Con errores');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr').first()).toContainText(invalidCode);
    await showRows(page, 'Duplicadas existentes');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table.locator('tbody tr').first()).toContainText(duplicateName);
    await expect(table.locator('tbody tr').first()).toContainText('Existente:');
    await showRows(page, 'Válidas');
    await expect(table.locator('tbody tr')).toHaveCount(3);

    // Confirmar: 3 se importan, 2 no.
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    const confirmDialog = page.getByRole('dialog', { name: /^Confirmar la importación de IMP-/ });
    await expect(confirmDialog.getByText('Se importarán 3 clientes. 2 filas no se importarán.')).toBeVisible();
    const confirmed = waitForApi(page, 'POST', /^\/customer-imports\/[^/]+\/confirmation$/);
    await confirmDialog.getByRole('button', { name: 'Confirmar importación' }).click();
    expect((await confirmed).status()).toBe(HTTP_ACCEPTED);

    // Resultado (la pantalla consulta el estado cada 2 s mientras importa).
    await expect(page.getByText('Importación completada con errores')).toBeVisible({ timeout: IMPORT_FINISH_TIMEOUT_MS });
    await expect(page.getByText('Completada con errores').first()).toBeVisible();
    await expect(summaryValue(page, 'Importadas')).toHaveText('3');
    await expect(summaryValue(page, 'Rechazadas al confirmar')).toHaveText('0');

    // Archivo de errores: las 2 filas no importadas, con su fila de Excel, estado e incidencias.
    const errorDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar archivo de errores' }).click();
    const errorFile = await errorDownload;
    expect(errorFile.suggestedFilename()).toMatch(/^errores-IMP-[\w-]+\.csv$/);
    const [errorHeaders = [], ...errorRows] = await downloadedCsv(errorFile);
    expect(errorHeaders).toEqual(['Fila del archivo', ...headers, 'Estado de la fila', 'Errores']);
    expect(errorRows).toHaveLength(2);
    const column = (row: string[], header: string) => row[errorHeaders.indexOf(header)] ?? '';
    const invalidRow = errorRows.find((row) => column(row, 'Código de cliente') === invalidCode);
    const duplicateRow = errorRows.find((row) => column(row, 'Código de cliente') === existingCode);
    expect(invalidRow && column(invalidRow, 'Fila del archivo')).toBe('5');
    expect(invalidRow && column(invalidRow, 'Estado de la fila')).toBe('Con errores');
    expect(invalidRow && column(invalidRow, 'Errores')).toContain('REQUIRED_FIELD_MISSING');
    expect(duplicateRow && column(duplicateRow, 'Fila del archivo')).toBe('6');
    expect(duplicateRow && column(duplicateRow, 'Razón social')).toBe(duplicateName);
    expect(duplicateRow && column(duplicateRow, 'Errores')).toContain('CUSTOMER_CODE_TAKEN');

    // Un cliente importado se abre en su ficha (Módulo 2).
    await showRows(page, 'Importadas');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    const imported = table.locator('tbody tr').filter({ hasText: validNames[0] });
    await imported.getByRole('link', { name: /^CLI-/ }).click();
    await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: validNames[0], level: 1 })).toBeVisible();
  });

  test('PF-06.50 · sin importaciones.ver no ve la opción de menú y la ruta directa muestra «Sin acceso»', async ({ page }) => {
    test.skip(!asesorEmail || !asesorPassword, 'Define E2E_ASESOR_EMAIL y E2E_ASESOR_PASSWORD.');

    const menu = waitForApi(page, 'GET', /^\/me\/menu$/);
    await signIn(page, asesorEmail, asesorPassword);
    const menuBody = JSON.stringify(await (await menu).json());
    expect(menuBody).toContain('/clientes');
    expect(menuBody).not.toContain(LIST_PATH);
    await expect(page.getByRole('button', { name: 'Integraciones', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: TITLE })).toHaveCount(0);

    await page.goto(LIST_PATH);
    await expect(page.getByRole('heading', { name: 'Sin acceso', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: TITLE })).toHaveCount(0);
  });
});
