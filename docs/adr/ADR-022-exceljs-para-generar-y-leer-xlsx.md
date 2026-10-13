# ADR-022 - `exceljs` para generar y leer archivos XLSX

## Status
Accepted — 2026-10-10

Proyecto: Mi Cliente AG. Resuelve D-05.1 (exportación de Reportes, F-39) y D-06.1
(lectura de la carga masiva de clientes, F-42) del CRM
(`docs/implementation-plans/crm/decisiones-pendientes.md`). Un solo ADR para
ambos usos, como pedía la consolidación.

## Context

El alcance pide **exportar a Excel** los reportes con el conjunto filtrado
completo (§7.6) y **cargar clientes** desde CSV o XLSX (§8.1). El repositorio no
tiene ninguna librería de hojas de cálculo; CLAUDE.md §8.6 exige ADR para
incorporarla. Sin ella, F-39 estaba `bloqueada` y F-42 solo podía construirse
con CSV.

Las dos necesidades son distintas en riesgo:

- **Escribir** XLSX con datos propios: el riesgo es la *inyección de fórmulas*
  (CSV/XLSX injection) cuando una celda contiene texto del usuario que empieza
  por `=`, `+`, `-`, `@`, tabulador o retorno de carro, y la memoria si se
  exporta mucho (tope `crm.reportes.max_filas_exportacion` = 100 000).
- **Leer** XLSX que sube un usuario: es un **archivo no confiable**. Un XLSX es un
  ZIP con XML dentro: bombas ZIP, rutas maliciosas, XML con DTD o entidades
  externas (XXE, expansión exponencial), macros, fórmulas y tipos de celda
  ambiguos (fechas, números con precisión perdida).

Alternativas evaluadas en 05 y 06: SheetJS (`xlsx`), `read-excel-file` +
`write-excel-file`, lector propio (ZIP + parser SAX) y `exceljs`.

## Decision

**Se adopta `exceljs` (licencia MIT) como única librería XLSX del backend,
envuelta en `backend/src/common/xlsx.ts`. Ninguna otra pieza la importa.** El
frontend no la usa: los archivos se generan y se leen en el servidor.

### Escritura (Reportes, plantilla y archivo de errores de la carga)

- Escritor en **streaming** (`stream.xlsx.WorkbookWriter`) hacia la respuesta
  HTTP, fila a fila, sin construir el libro en memoria.
- Toda celda con texto del usuario se escribe como **texto**, nunca como
  fórmula, y pasa por la neutralización existente (`backend/src/common/csv.ts`:
  apóstrofo delante de `=`, `+`, `-`, `@`, tabulador y CR).
- Montos y tonelajes como número con el formato de la columna; fechas como
  fecha. Por encima del tope de filas: `422 EXPORT_TOO_LARGE`, nunca un archivo
  truncado.

### Lectura de archivos no confiables (carga masiva)

Antes de entregar el archivo a `exceljs`, y **sin** la librería:

1. **Firma:** ZIP (`50 4B 03 04`) con `[Content_Types].xml` y
   `xl/workbook.xml`; un contenedor OLE (`.xls` o XLSX cifrado) se rechaza
   (`415`).
2. **Guardia ZIP propia** (`xlsx-archive-guard.ts`) sobre el directorio central:
   máximo 100 entradas, tamaño descomprimido declarado ≤ 64 MB, razón de
   compresión por entrada ≤ 100:1, sin rutas absolutas ni `..`; se rechazan
   `vbaProject.bin` y contenidos de macro.

Durante la lectura (los tamaños declarados pueden mentir):

3. Lector en **streaming** (`stream.xlsx.WorkbookReader`) solo de la hoja de
   datos; contadores de bytes descomprimidos y de filas que abortan al superar
   los topes (`crm.importaciones.max_filas` = 5 000, `max_mb` = 10) y tiempo
   máximo de 20 s (`PARSE_TIMEOUT`).
4. **Fórmulas nunca se evalúan:** se toma el valor en caché si existe y se
   registra la incidencia; un texto que empieza por `=`, `@`, tab o CR se
   rechaza (`FORMULA_NOT_ALLOWED`, D-06.11).
5. Todos los valores se leen como **texto** y los convierte el validador de
   clientes (sin conversión implícita de fechas ni números por la librería).
6. **XML sin DTD ni entidades externas:** requisito verificado con una prueba
   (archivo con DTD y entidad `file:///etc/passwd` → no se resuelve).

### Condiciones de incorporación (gate de la implementación)

- Versión **fijada exacta** en `backend/package.json` y en el lockfile.
- `pnpm audit` sin vulnerabilidades altas o críticas en `exceljs` ni en sus
  dependencias transitivas de ZIP y XML. Si el gate falla, no se incorpora y se
  reabre esta decisión (alternativa: lector propio, abajo).
- Pruebas obligatorias: bomba ZIP, ZIP con 1 000 entradas, tamaños declarados
  falsos, DTD/XXE, macro, cifrado, fórmulas, 100 000 filas exportadas con
  memoria acotada.

## Alternatives

- **SheetJS (`xlsx`).** Muy completa, pero la versión publicada en npm está
  congelada con avisos de seguridad conocidos (contaminación de prototipo,
  ReDoS) que solo se corrigen en versiones distribuidas fuera del registro npm.
  Rompe `pnpm audit`, el lockfile verificable y la política de dependencias de
  SECURITY.md. Descartada.
- **`read-excel-file` + `write-excel-file`.** MIT y ligeras, pero son dos
  dependencias y con menos control del streaming en escritura grande.
- **Lector y escritor propios** (ZIP + parser SAX). Máximo control, pero más
  código propio de alto riesgo y dos dependencias de bajo nivel igualmente.
  Queda como plan B si `exceljs` no supera el gate.

## Consequences

- F-39 (exportación XLSX) y la variante XLSX de F-42 pasan a `especificada`.
- Una sola dependencia cubre exportación, plantilla de carga, lectura y archivo
  de errores; cambiarla afecta solo a `common/xlsx.ts`.
- `exceljs` tiene un ritmo de publicación lento: su estado se revisa en cada
  `pnpm audit` del pipeline (ADR-012) y la guardia ZIP propia no depende de ella.
- El CSV sigue con el lector propio (`common/csv-reader.ts`, D-06.2): no se
  añade otra librería.

## Security Considerations

- El archivo subido es no confiable: la guardia ZIP y los topes se aplican
  **antes** y **durante** la lectura; se mide la memoria en las pruebas.
- Sin evaluación de fórmulas, sin macros, sin DTD ni entidades externas.
- Inyección de fórmulas neutralizada en toda exportación y en el archivo de
  errores; las celdas de usuario se escriben como texto.
- El contenido de las filas (puede incluir datos personales de contactos) no se
  registra en logs; las incidencias guardan códigos, no valores.
- Exportar exige `reportes.exportar` y respeta el alcance del usuario: la
  librería no cambia ninguna decisión de autorización.

## Addendum — 2026-10-13 (implementación de la carga masiva, Módulo 6)

- **Versión:** `exceljs` **4.4.0**, fijada exacta. `pnpm audit --prod`: la única advertencia nueva
  es **moderada** en la dependencia transitiva `uuid@8.3.2` (`<11.1.1`, comprobación de límites
  al escribir en un búfer que pasa el llamador; `exceljs` no usa esa variante). Ninguna alta ni
  crítica: el gate de incorporación se cumple.
- **Lectura sin streaming:** `stream.xlsx.WorkbookReader` escribe cada hoja en un archivo
  temporal en disco cuando `xl/sharedStrings.xml` aparece después de las hojas dentro del ZIP,
  que es el orden habitual de Excel. Eso contradice la regla "nunca disco temporal" (06 H.2).
  Se usa `workbook.xlsx.load(buffer)` en memoria, **después** de la guardia ZIP, que ahora
  además descomprime cada entrada con `maxOutputLength` (si el tamaño declarado miente, se
  rechaza), rechaza XML con DTD/entidades sin parsearlo y cuenta filas con valores y celdas por
  hoja. Así la memoria de la librería queda acotada por los topes de filas y columnas, no por
  lo que declare el archivo. Tiempo máximo de lectura: 20 s (`PARSE_TIMEOUT`).
- **Escritura:** `stream.xlsx.WorkbookWriter` (plantilla y archivo de errores), celdas con
  `numFmt '@'` y valores neutralizados con `neutralizeFormula` de `common/csv.ts`.
- `common/xlsx.ts` lo crea el Módulo 6 (`readSheetRows`, `writeTextWorkbook`); el Módulo 5
  añade allí su escritor de exportaciones. Las pruebas generan los archivos con `exceljs`
  directamente desde `modules/customer-imports/testing/` (código de prueba, fuera del build).
