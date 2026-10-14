/**
 * Duplicados dentro del archivo (06 RN-06.14, D-06.5, DM-4). Función pura: recibe
 * por fila las claves normalizadas que calcula el Módulo 2
 * (`CustomerValidationService.duplicateKeys`) y devuelve, por fila, con qué otra
 * fila choca en cada clave.
 *
 * - **Código de cliente** (bloqueante): todas las filas del grupo quedan
 *   `DUPLICATE_IN_FILE`, cada una apuntando a la primera *otra* fila del grupo.
 * - **NIT** (aviso, solo con la regla `nit = AVISAR`) y **razón social** (aviso):
 *   cada fila del grupo recibe una advertencia que cita la primera otra fila.
 */

export interface RowDuplicateKeys {
  readonly rowNumber: number;
  readonly customerCode: string | null;
  readonly taxId: string | null;
  readonly legalName: string | null;
}

export interface InFileDuplicates {
  /** `rowNumber` → primera otra fila con el mismo código. */
  readonly codeDuplicateOf: ReadonlyMap<number, number>;
  readonly taxIdDuplicateOf: ReadonlyMap<number, number>;
  readonly legalNameDuplicateOf: ReadonlyMap<number, number>;
}

function groupDuplicates(rows: readonly RowDuplicateKeys[], keyOf: (row: RowDuplicateKeys) => string | null): Map<number, number> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(row.rowNumber);
    else groups.set(key, [row.rowNumber]);
  }
  const result = new Map<number, number>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, second] = group as [number, number];
    for (const rowNumber of group) {
      result.set(rowNumber, rowNumber === first ? second : first);
    }
  }
  return result;
}

export function findInFileDuplicates(rows: readonly RowDuplicateKeys[]): InFileDuplicates {
  return {
    codeDuplicateOf: groupDuplicates(rows, (row) => row.customerCode),
    taxIdDuplicateOf: groupDuplicates(rows, (row) => row.taxId),
    legalNameDuplicateOf: groupDuplicates(rows, (row) => row.legalName),
  };
}
