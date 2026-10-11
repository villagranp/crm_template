/**
 * Contenidos mínimos con la firma real de cada tipo, para las pruebas unitarias
 * y de integración de adjuntos. No son documentos completos: solo lo que mira
 * la detección por firma (cabecera y, en OOXML, el directorio central del ZIP).
 */

export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');
export const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-datos-de-prueba', 'latin1'),
]);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF-datos', 'latin1')]);
export const HTML_BYTES = Buffer.from('<!doctype html><script>alert(1)</script>', 'utf8');

/** ZIP "stored" (sin compresión) con las entradas indicadas; CRC a cero (la detección no lo comprueba). */
export function buildZip(entryNames: readonly string[], options: { comment?: string; padding?: number } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const name of entryNames) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(`<xml>${name}</xml>`, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  // Relleno opcional entre los datos y el directorio, para archivos "grandes".
  const padding = Buffer.alloc(options.padding ?? 0, 0x20);
  const directory = Buffer.concat(centrals);
  const comment = Buffer.from(options.comment ?? '', 'utf8');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryNames.length, 8);
  end.writeUInt16LE(entryNames.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset + padding.length, 16);
  end.writeUInt16LE(comment.length, 20);

  return Buffer.concat([...locals, padding, directory, end, comment]);
}

export const DOCX_BYTES = buildZip(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
export const XLSX_BYTES = buildZip(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
/** ZIP genérico: no es OOXML. */
export const PLAIN_ZIP_BYTES = buildZip(['readme.txt', 'data.csv']);
