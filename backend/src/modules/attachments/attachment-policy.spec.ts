import {
  FALLBACK_FILE_NAME,
  fileExtensionOf,
  isAttachmentOwnerType,
  maxBytesFromMegabytes,
  newStorageKey,
  normalizeAttachmentDescription,
  sanitizeAttachmentFileName,
} from './attachment-policy';

describe('attachment-policy', () => {
  describe('sanitizeAttachmentFileName', () => {
    it('conserva un nombre normal con acentos', () => {
      expect(sanitizeAttachmentFileName('Cotización final.pdf')).toBe('Cotización final.pdf');
    });

    it('descarta cualquier ruta (Unix y Windows)', () => {
      expect(sanitizeAttachmentFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizeAttachmentFileName('C:\\Users\\ana\\contrato.docx')).toBe('contrato.docx');
    });

    it('quita caracteres de control y marcas de dirección que disfrazan la extensión', () => {
      const rightToLeftOverride = String.fromCodePoint(0x202e);
      expect(sanitizeAttachmentFileName(`factura${rightToLeftOverride}fdp.exe`)).toBe('facturafdp.exe');
      expect(sanitizeAttachmentFileName('linea\r\nnueva\u0000.pdf')).toBe('lineanueva.pdf');
    });

    it('sustituye reservados y colapsa espacios', () => {
      expect(sanitizeAttachmentFileName('a"b*c:d<e>f?g|h   i.pdf')).toBe('a_b_c_d_e_f_g_h i.pdf');
    });

    it('quita puntos y espacios en los extremos y usa un nombre por defecto si no queda nada', () => {
      expect(sanitizeAttachmentFileName('  .oculto.pdf. ')).toBe('oculto.pdf');
      expect(sanitizeAttachmentFileName('...')).toBe(FALLBACK_FILE_NAME);
      expect(sanitizeAttachmentFileName('dir/')).toBe(FALLBACK_FILE_NAME);
    });

    it('limita a 255 caracteres conservando la extensión', () => {
      const result = sanitizeAttachmentFileName(`${'a'.repeat(400)}.xlsx`);
      expect([...result]).toHaveLength(255);
      expect(result.endsWith('.xlsx')).toBe(true);
    });

    it('no parte un carácter compuesto al truncar', () => {
      const result = sanitizeAttachmentFileName(`${'😀'.repeat(300)}.pdf`);
      expect([...result]).toHaveLength(255);
      expect(result.endsWith('.pdf')).toBe(true);
      expect(result).not.toContain('\uFFFD');
    });
  });

  it('fileExtensionOf devuelve la extensión en minúsculas o vacía', () => {
    expect(fileExtensionOf('Informe.XLSX')).toBe('xlsx');
    expect(fileExtensionOf('sin-extension')).toBe('');
    expect(fileExtensionOf('.oculto')).toBe('');
    expect(fileExtensionOf('final.')).toBe('');
  });

  it('newStorageKey genera <año>/<mes>/<uuid> en UTC sin datos del usuario', () => {
    const key = newStorageKey(new Date('2026-01-31T23:30:00.000-06:00'), '7f8c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f');
    expect(key).toBe('2026/02/7f8c2b4e-1d2a-4c3b-9e8f-0a1b2c3d4e5f');
    expect(newStorageKey()).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
  });

  it('maxBytesFromMegabytes usa MiB como NGINX', () => {
    expect(maxBytesFromMegabytes(10)).toBe(10 * 1024 * 1024);
  });

  it('normalizeAttachmentDescription recorta y convierte vacío en null', () => {
    expect(normalizeAttachmentDescription('  plano  ')).toBe('plano');
    expect(normalizeAttachmentDescription('   ')).toBeNull();
    expect(normalizeAttachmentDescription(undefined)).toBeNull();
  });

  it('solo reconoce los tipos de dueño del modelo (DC-2)', () => {
    expect(isAttachmentOwnerType('visitEvent')).toBe(true);
    expect(isAttachmentOwnerType('opportunity')).toBe(false);
  });
});
