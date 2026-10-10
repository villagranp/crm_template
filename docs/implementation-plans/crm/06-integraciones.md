# 06 — Integraciones: carga masiva de clientes

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §8 / §8.1 (Módulo 6), con §4.2 (reglas de creación de clientes que se reutilizan), §1, §2, §10–§13
- **Funcionalidad de la matriz:** **F-42** — Carga masiva de clientes (CSV/XLSX) ([`matriz-trazabilidad.md`](matriz-trazabilidad.md))
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md) §2.4 (`Customer`), §2.14 (`CustomerImport`, `CustomerImportRow`), §3 (catálogos), §4 (visibilidad), §5 (permisos y menú), §6 (identificadores y unicidad), §8.2 (parámetros), §10 (DM-x)
- **Decisiones que lo enmarcan:** [ADR-004](../../adr/ADR-004-data-access-abstraction.md), [ADR-005](../../adr/ADR-005-rest-api-standard.md), [ADR-008](../../adr/ADR-008-authorization.md), [ADR-014](../../adr/ADR-014-modular-clean-architecture.md), [ADR-018](../../adr/ADR-018-identity-access-model.md), [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)
- **Estado:** especificación. No se ha tocado código, esquema, migraciones ni seeds.
- **Skills aplicados:** `requirements-analysis`, `user-story`, `api-design`, `backend-nestjs`, `frontend-react`, `design-system`, `database`, `security`, `authorization`, `access-management`, `testing`, `observability`, `adr`, `documentation`

> El módulo es **candidato a v1.0** y "requiere confirmación de viabilidad y
> aprobación para su habilitación productiva" (§8.1). Se especifica e implementa
> **completo**, pero queda detrás del parámetro `crm.importaciones.habilitada`,
> que vale `false` en producción hasta que el responsable apruebe su
> habilitación (contradicción C10 y DM-28 de `00`).
>
> Esta especificación **no** define reglas de validación de clientes: las
> consume del Módulo 2 ([`02-clientes-cuentas.md`](02-clientes-cuentas.md)). Si
> algo aquí parece una regla de cliente distinta de la del Módulo 2, es un
> defecto de esta especificación y manda el Módulo 2.

---

## A. Objetivo funcional

Permitir que un usuario autorizado dé de alta **muchos clientes de una vez** a
partir de un archivo CSV o XLSX, con la misma calidad de datos que el alta
manual: el archivo se lee, se valida fila por fila con las reglas del Módulo de
Clientes, el usuario revisa una vista previa con los errores de cada fila,
confirma, y el sistema crea **solo** los clientes válidos, deja constancia de
qué pasó con cada fila y permite descargar las filas rechazadas para
corregirlas.

Responsabilidades del módulo:

| Es responsable de | No es responsable de |
|---|---|
| Plantilla de carga, lectura segura del archivo, validación de estructura y columnas | Las reglas de un cliente válido (obligatorios, formatos, unicidad, duplicidad, alcance): son del Módulo 2 |
| Traducir valores de texto del archivo (código de catálogo, país, correo del responsable) a las referencias que espera el alta de clientes | Crear clientes por otra vía que no sea el caso de uso de alta del Módulo 2 |
| Detectar duplicados **entre filas del mismo archivo** | Actualizar o fusionar clientes existentes (no hay regla aprobada, DM-28) |
| Vista previa, confirmación, resultado por fila, archivo de errores, historial | La carga inicial de datos maestros (seeds, `00` §8), que es un proceso separado (§8.1) |
| Registro de cada carga (usuario, fecha, estado, contadores) y su auditoría | Contactos, proyectos, adjuntos u otras entidades: solo clientes |

El resultado son filas normales de `customers` (con `sourceImportId`), utilizables
desde el primer momento por Proyectos, Actividad comercial, Inicio y Reportes.

---

## B. Alcance completo

### B.1 Las 17 funcionalidades de §8.1

| # | Funcionalidad (§8.1) | Cómo se cubre | Pantalla / servicio | Reglas | Criterios |
|---|---|---|---|---|---|
| 1 | Descargar plantilla de clientes | Plantilla CSV y XLSX generada en el servidor con las columnas de §8.1; la XLSX incluye hojas de instrucciones y de valores válidos leídos de la base | E.2 "Descargar plantilla" · `GET /customer-imports/template` | RN-06.5, RN-06.6 | AC-06.1, AC-06.2 |
| 2 | Seleccionar archivo | Selector y arrastrar-soltar de un único `.csv` o `.xlsx`, con comprobación previa de tamaño y extensión en el cliente (solo ayuda, no control) | E.3 "Nueva carga" | RN-06.7 | AC-06.3 |
| 3 | Leer los registros | Subida multipart; lectura en el servidor con lector CSV propio o lector XLSX (D-06.1, D-06.2), en memoria acotada | `POST /customer-imports` | RN-06.7–RN-06.11 | AC-06.4 |
| 4 | Validar estructura | Archivo legible, tipo real coincide con la extensión, no vacío, una sola hoja de datos, fila de encabezados, límites de tamaño y filas | `POST /customer-imports` → `422 INVALID_IMPORT_FILE` / `413` / `415` | RN-06.8, RN-06.9 | AC-06.5, AC-06.6 |
| 5 | Validar columnas | Encabezados = columnas de la plantilla (orden libre, comparación sin mayúsculas ni acentos); faltantes, desconocidas o repetidas invalidan el archivo | `POST /customer-imports` → `422 INVALID_IMPORT_FILE` | RN-06.10 | AC-06.7 |
| 6 | Validar campos obligatorios | Por fila, con el servicio de validación del Módulo 2 (obligatorios de `crm.campos_obligatorios.customer`) | Fase de validación | RN-06.13 | AC-06.8 |
| 7 | Validar formatos | Por fila: longitudes, correo, teléfono y NIT por país (Módulo 2); tipo de celda y contenido peligroso (propio del archivo) | Fase de validación | RN-06.11, RN-06.13 | AC-06.8, AC-06.24 |
| 8 | Validar valores de catálogos | Tipo de empresa, estado y calificación por `code` contra `crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente` activos; país por `isoCode`; responsable por código de colaborador o correo — todo resuelto y validado por `CustomerValidationService` en modo `BY_NATURAL_KEY` (D-02.17) | Fase de validación | RN-06.12, RN-06.13 | AC-06.9 |
| 9 | Detectar duplicados dentro del archivo | Por código de cliente y NIT normalizados (mismas funciones de normalización del Módulo 2) dentro del ámbito de unicidad vigente | Fase de validación | RN-06.14 | AC-06.10 |
| 10 | Detectar duplicados contra los clientes existentes | Por código y NIT (unicidad dura, incluye eliminados lógicos) y por reglas blandas de `crm.clientes.reglas_duplicidad`, vía Módulo 2 | Fase de validación | RN-06.15, RN-06.16 | AC-06.11, AC-06.12 |
| 11 | Mostrar vista previa | Resumen de la carga y tabla paginada de filas con su estado, filtrable por estado | E.4 "Detalle de carga" · `GET /customer-imports/{id}`, `/rows` | RN-06.17 | AC-06.13 |
| 12 | Mostrar errores por registro | Cada fila muestra sus incidencias `{campo, código, mensaje, severidad}` | E.4 · `GET /customer-imports/{id}/rows` | RN-06.17, RN-06.18 | AC-06.14 |
| 13 | Confirmar importación | Acción explícita con resumen ("se importarán N, se rechazarán M"); transición atómica `VALIDATED → IMPORTING` | E.4 · `POST /customer-imports/{id}/confirmation` | RN-06.19, RN-06.20 | AC-06.15, AC-06.16 |
| 14 | Importar registros válidos | Cada fila válida se crea mediante el caso de uso de alta del Módulo 2, en su propia transacción, revalidada en ese momento | Procesamiento de la confirmación | RN-06.21–RN-06.24 | AC-06.17, AC-06.18 |
| 15 | Rechazar registros inválidos | Filas `INVALID`, `DUPLICATE_IN_FILE`, `DUPLICATE_EXISTING` nunca se importan; las que fallan al revalidar pasan a `REJECTED` sin afectar a las demás | Procesamiento de la confirmación | RN-06.21, RN-06.22 | AC-06.18, AC-06.19 |
| 16 | Descargar archivo de errores | Archivo con las filas no importadas, sus valores originales y sus errores, en el formato del archivo subido, protegido contra inyección de fórmulas | E.4 · `GET /customer-imports/{id}/error-file` | RN-06.26, RN-06.29 | AC-06.20, AC-06.21 |
| 17 | Consultar resultado e historial de cargas | Historial paginado y filtrable; detalle con resultado por fila y enlaces a los clientes creados | E.1 "Historial" y E.4 · `GET /customer-imports`, `/{id}` | RN-06.27, RN-06.28 | AC-06.22, AC-06.23 |

### B.2 Reglas transversales de §8.1, dónde se cumplen

| Regla de §8.1 | Dónde |
|---|---|
| CSV y XLSX | RN-06.7, D-06.1, D-06.2 |
| Candidata a v1.0, habilitación productiva sujeta a aprobación | RN-06.1, RN-06.2, D-06.9 |
| Separada de la carga inicial de datos maestros | RN-06.3 |
| Mismos campos que el alta del Módulo 2; identificador CRM automático | RN-06.5, RN-06.21 |
| Reutilizar las validaciones del Módulo de Clientes | RN-06.13, G.1 |
| No permitir duplicados | RN-06.14, RN-06.15, RN-06.23 |
| No sobrescribir clientes existentes sin una regla aprobada | RN-06.16 (DM-28) |
| Mostrar resultados por fila | RN-06.17 |
| Registrar usuario, fecha y estado de cada carga | RN-06.27 |
| Mantener integridad ante errores parciales | RN-06.21, RN-06.22 |
| Restringir la ejecución a usuarios autorizados | H.1 |
| Clientes como destino; Administración da permisos, catálogos y parámetros; importados usables en los demás módulos | G |

### B.3 Fuera de alcance (explícito)

- Actualizar, fusionar o "completar" clientes existentes desde el archivo (no hay regla aprobada; DM-28). Se conserva como decisión, no se implementa.
- Importar contactos, proyectos, adjuntos o cualquier otra entidad. El campo "Archivos adjuntos" del alta (§4.2) **no** está en la lista de campos de importación de §8.1.
- Integración con SAP u otros sistemas externos (§1 regla 10, §4.1).
- Cargas programadas, por API de máquina a máquina o por carpeta compartida.
- Reanudar una carga interrumpida: se reporta y se sube un archivo nuevo (RN-06.24).
- Formatos distintos de CSV y XLSX (`.xls`, `.xlsm`, `.ods`, `.txt`, `.json`).

---

## C. Reglas de negocio

Cada regla indica su origen. Las marcadas *(propuesta)* no están escritas en el
alcance y se aplican con su valor por defecto mientras no se objete la decisión
que se cita.

### Habilitación y separación

- **RN-06.1 — Interruptor de habilitación.** La carga masiva solo opera si `crm.importaciones.habilitada = true` (`SystemParameter`, grupo `crm`, `00` §8.2). Con `false`, la subida y la confirmación responden `409 IMPORTS_DISABLED`; consultar el historial, el detalle, las filas, la configuración y descargar el archivo de errores de cargas anteriores siguen disponibles. Una carga ya en `IMPORTING` cuando se deshabilita **termina** (no se corta a medias). Origen: §8.1, DM-28, C10.
- **RN-06.2 — Valor por entorno.** La semilla esencial crea el parámetro con `false` en todos los entornos y nunca pisa su valor (`00` §8.2). En desarrollo y QA lo activa un administrador desde *Parámetros* o la semilla de demostración (que ya está protegida contra producción, `00` §8.1). En producción solo cambia por decisión formal del responsable, y el cambio queda en `audit_logs` como cualquier cambio de parámetro. Quién puede cambiarlo: D-06.9 *(propuesta)*.
- **RN-06.3 — Separación de los seeds.** Ningún seed ni script de datos maestros usa este módulo, y este módulo no crea ni modifica catálogos, países, usuarios, roles ni parámetros: solo crea clientes. La carga de demostración `DEMO-IMP-0001` de `00` §8.3 se inserta directamente por la semilla de demo, no a través de los endpoints. Origen: §8.1, §1 regla 6.
- **RN-06.4 — Código de la carga.** Cada carga recibe un código humano con la secuencia `crm.importacion` (`IMP-2026-0007`, `00` §6.1), asignado en la misma transacción que crea el registro.

### Plantilla y columnas

- **RN-06.5 — Columnas.** Las de §8.1, que son las del alta del Módulo 2 sin el identificador CRM (lo genera el sistema) ni los adjuntos:

  | Encabezado de la plantilla | Campo del alta (Módulo 2) | Longitud máx. (`00` §2.4) | Cómo se escribe en el archivo |
  |---|---|---|---|
  | Código de cliente | `customerCode` | 40 | Texto. Opcional salvo que DM-18 diga lo contrario |
  | Razón social | `legalName` | 200 | Texto |
  | Nombre comercial | `tradeName` | 200 | Texto |
  | País | `countryId` | — | Código ISO alfa-2 (`GT`) (D-02.17, D-06.4) |
  | Ciudad | `city` | 120 | Texto libre (DM-19) |
  | Dirección | `address` | 300 | Texto |
  | Teléfono | `phone` | 40 | Texto; formato según `countries.phone_pattern` (DM-3) |
  | Correo | `email` | 320 | Texto |
  | Tipo de empresa | `companyTypeId` | — | `code` de `crm.tipo_empresa` (D-02.17, D-06.4) |
  | Estado | `statusId` | — | `code` de `crm.estado_cliente`; vacío → valor por defecto de `crm.valores_por_defecto` (lo aplica el Módulo 2) |
  | Calificación | `ratingId` | — | `code` de `crm.calificacion_cliente` |
  | Responsable comercial | `salesOwnerId` | — | Código de colaborador (`users.employee_code`) o correo del usuario (D-02.17, D-06.4) |
  | NIT | `taxId` | 30 | Texto; la etiqueta real por país está en `countries.tax_id_label` (C4) |

  Qué columnas son obligatorias **no** se fija aquí: sale de `crm.campos_obligatorios.customer` y de las reglas del Módulo 2, y la plantilla lo muestra leyendo el mismo parámetro.
- **RN-06.6 — Contenido de la plantilla.** *XLSX:* hoja `Clientes` (encabezados, columnas con formato de texto para que códigos, NIT y teléfonos no pierdan ceros a la izquierda ni pasen a notación científica), hoja `Instrucciones` (por columna: obligatoria sí/no, formato, longitud máxima, ejemplo ficticio) y hoja `Valores válidos` (códigos y etiquetas **activos** de los tres catálogos y de los países, leídos de la base en el momento de la descarga). No lista usuarios (minimización: el responsable se escribe por correo o código). *CSV:* BOM UTF-8 + fila de encabezados; las instrucciones se muestran en la pantalla. Ambas llevan versión de plantilla (`templateVersion`, inicial `1`) en el nombre del archivo y, en la XLSX, en la hoja de instrucciones. Origen: §8.1 punto 1, §1 regla 8.

### Lectura y estructura del archivo

- **RN-06.7 — Formatos y límites.** Un solo archivo por carga, `.csv` o `.xlsx`. Tamaño máximo: `crm.importaciones.max_mb` (10), nunca por encima del tope duro de 10 MB del servidor y de NGINX (`client_max_body_size 10m`). Filas de datos máximas: `crm.importaciones.max_filas` (5 000), nunca por encima de un tope duro de 10 000 en código. Si un administrador fija un valor mayor, se aplica el tope y `GET /customer-imports/settings` muestra el valor efectivo. Origen: `00` §8.2 *(topes duros: propuesta)*.
- **RN-06.8 — Tipo real.** El tipo se determina por el contenido, no por la extensión ni por el `Content-Type` enviado; los tres deben ser coherentes (H.2). Archivos `.xls` (OLE), `.xlsm` o con macros, cifrados o protegidos con contraseña, y binarios renombrados a `.csv` se rechazan con `415 UNSUPPORTED_FILE_TYPE`.
- **RN-06.9 — Estructura.** Se rechaza el archivo completo (`422 INVALID_IMPORT_FILE`, con `details` por problema) si: no tiene encabezados, no tiene filas de datos, supera el máximo de filas, la XLSX no tiene una hoja llamada `Clientes` ni una primera hoja visible con datos, el CSV no es UTF-8 válido (D-06.3) o tiene comillas sin cerrar. Las filas completamente vacías se ignoran (no cuentan ni se numeran como datos, pero la numeración de las siguientes respeta su posición en el archivo). Un archivo rechazado por estructura **queda registrado** en el historial con estado `FAILED` y `failureReason`, sin filas (RN-06.27).
- **RN-06.10 — Columnas.** Los encabezados se comparan normalizados (sin mayúsculas, acentos ni espacios sobrantes) contra los de RN-06.5. El orden es libre. Una columna requerida por la plantilla que falta, una columna desconocida o un encabezado repetido invalidan el archivo (`422 INVALID_IMPORT_FILE`, `details[].issue` = `MISSING_COLUMN` / `UNKNOWN_COLUMN` / `DUPLICATE_COLUMN`). Estricto a propósito: una columna desplazada asignaría datos al campo equivocado en miles de filas.
- **RN-06.11 — Lectura de celdas.** Todo valor se lee **como texto**: se recortan espacios (incluido el espacio duro) al inicio y al final; cadena vacía = ausente. En XLSX: un número entero se convierte a texto sin decimales ni notación científica; un número con decimales en una columna de código, NIT o teléfono, una fecha, un booleano o un error de celda (`#N/A`) → incidencia `INVALID_CELL_TYPE`; una celda con **fórmula** → incidencia `FORMULA_NOT_ALLOWED` (no se usa el valor calculado); el texto enriquecido se aplana; los hipervínculos aportan solo su texto. En CSV y XLSX, un valor de texto libre (razón social, nombre comercial, ciudad, dirección) que empieza por `=`, `@`, tabulador o retorno de carro → `FORMULA_NOT_ALLOWED` (D-06.11). Un valor que supera la longitud máxima → `MAX_LENGTH`. Los mensajes de incidencia **nunca** repiten el valor de la celda.

### Validación de filas

- **RN-06.12 — Referencias por clave natural (las resuelve el Módulo 2).** El archivo trae texto; el Módulo 6 **no** traduce referencias. Construye con cada fila un `CustomerDraft` (02 §F.6.1) con los valores ya saneados (RN-06.11) y lo entrega en modo `BY_NATURAL_KEY`: catálogo por `code` (dentro del catálogo de la columna, `CatalogReferenceValidator` "por `code`", `00` §3.5), país por `isoCode`, responsable por código de colaborador o correo (D-02.17). Valores no encontrados, inactivos o de otro catálogo los reporta el Módulo 2 con sus códigos (`INVALID_CATALOG_VALUE`, `INVALID_COUNTRY`, `INVALID_SALES_OWNER`…).
- **RN-06.13 — Validación reutilizada (Módulo 2).** Cada fila pasa por `CustomerValidationService.validate(draft, { mode: 'BY_NATURAL_KEY', actor, scope })` (02 §F.6.1, RN-02.12): obligatorios configurables, formatos de correo, teléfono y NIT por país, pertenencia y estado de catálogos, existencia y estado del responsable, unicidad de código y NIT según `crm.clientes.unicidad_codigo` / `unicidad_nit` (`00` §6.2), duplicados blandos según `crm.clientes.reglas_duplicidad`, valores por defecto y reglas de alcance del usuario que crea (p. ej. RN-02.11: quien no tiene `clientes.administrar` solo crea clientes de los que es responsable). `outcome.errors` se guarda tal cual (mismo `code` que el alta manual, 02 F5). El Módulo 6 no añade, quita ni relaja ninguna de esas reglas.
- **RN-06.14 — Duplicados dentro del archivo.** Dos o más filas son duplicadas entre sí si coinciden en código de cliente normalizado o en NIT normalizado (claves de `CustomerValidationService.duplicateKeys(draft)`, 02 §F.6.1; normalización de `00` §6.2 punto 4) dentro del mismo ámbito de unicidad: mismo país con el valor `PAIS`, cualquier país con `GLOBAL`. Por defecto **se rechazan todas las filas del grupo** con estado `DUPLICATE_IN_FILE`; cada una apunta en `duplicateOfRowNumber` a la primera otra fila del grupo (D-06.5 *(propuesta)*). Las coincidencias blandas (razón social normalizada) entre filas del archivo generan advertencia `POSSIBLE_DUPLICATE_IN_FILE`, no rechazo.
- **RN-06.15 — Duplicados contra existentes (duros).** Una fila cuyo código o NIT ya existe en `customers` dentro del ámbito de unicidad —**incluidos los eliminados lógicamente**, que siguen ocupando su código y NIT (`00` §2.4)— o que el Módulo 2 bloquea por una regla `BLOQUEAR` (`outcome.blockingDuplicates`, códigos `CUSTOMER_CODE_TAKEN`, `TAX_ID_TAKEN`, `DUPLICATE_BLOCKED`) queda `DUPLICATE_EXISTING` con `duplicateOfCustomerId`. El usuario solo ve la referencia al cliente existente (código CRM, razón social, enlace) si ese cliente está dentro de su visibilidad (H.4); si no, ve únicamente "ya existe un cliente con este código/NIT".
- **RN-06.16 — Sin sobrescritura.** Una fila que coincide con un cliente existente **nunca** lo actualiza, ni siquiera para completar campos vacíos. No existe modo "actualizar" en esta versión (DM-28). Si se aprueba una regla de sobrescritura, será un cambio de alcance con su propia especificación.
- **RN-06.17 — Estado de fila tras validar.** Exactamente uno: `VALID`, `INVALID` (al menos una incidencia de severidad `ERROR`), `DUPLICATE_IN_FILE` o `DUPLICATE_EXISTING`. Si una fila es duplicada y además tiene otros errores, el estado es el de duplicado y las demás incidencias se listan igual. `PENDING` solo existe durante la validación.
- **RN-06.18 — Advertencias.** Las coincidencias que el Módulo 2 resuelve con "avisar y pedir confirmación" (`outcome.duplicates` con regla `AVISAR`; `409 POSSIBLE_DUPLICATE` en el alta manual) se registran como incidencias de severidad `WARNING` y código `POSSIBLE_DUPLICATE` en una fila `VALID`. El Módulo 2 deja expresamente al Módulo 6 la decisión en modo `IMPORT` (02 §F.6.2). Al confirmar, esas filas se importan solo si el usuario marca explícitamente "Importar también las filas con advertencias" (`includeRowsWithWarnings = true`), que se traduce en `acknowledgedDuplicateIds` = los candidatos avisados de la fila, igual que la confirmación explícita del alta manual; si no, pasan a `REJECTED` con `POSSIBLE_DUPLICATE` (D-06.6 *(propuesta)*; coincide con la sugerencia de 02 de rechazar por defecto). La forma de cada incidencia es `{ field, code, message, severity }`: añade `severity` al JSON `errors` de `00` §2.14 sin cambiar el esquema.

### Confirmación e importación

- **RN-06.19 — Quién confirma o cancela.** Solo una carga en `VALIDATED` se confirma o cancela. Puede hacerlo quien la subió o un usuario con `importaciones.crear` cuyo alcance de datos sea `ORGANIZATION` (D-06.10 *(propuesta)*). Requiere al menos una fila `VALID` (si no, `422 NO_VALID_ROWS`). La confirmación lleva `expectedValidRows`: si no coincide con el recuento actual, `409 IMPORT_CHANGED` (la pantalla estaba desactualizada).
- **RN-06.20 — Confirmación única.** La transición `VALIDATED → IMPORTING` es atómica y condicional (`UPDATE … WHERE id = $1 AND status = 'VALIDATED'`). Si dos peticiones confirman a la vez (doble clic, dos pestañas, dos usuarios), una gana y la otra recibe `409 INVALID_IMPORT_STATUS`. Se registran `confirmedById` y `confirmedAt`.
- **RN-06.21 — Una transacción por fila.** Cada fila `VALID` se importa en **su propia transacción** que: (1) revalida la fila con el Módulo 2 (los catálogos, el responsable, los parámetros o los clientes pueden haber cambiado desde la vista previa); (2) invoca `CustomerCreationService.create(draft, { mode: 'BY_NATURAL_KEY', source: 'IMPORT', sourceImportId, acknowledgedDuplicateIds, actor, audit })` (02 §F.6.2), el mismo caso de uso del alta manual, que revalida, asigna `crmCode` con `crm.cliente` bajo bloqueo de fila, inserta el cliente con `sourceImportId`, `createdById = confirmedById` y escribe su auditoría; (3) marca la fila `IMPORTED` con `customerId`. Si cualquier paso falla, se deshace solo esa fila y se marca `REJECTED` con la incidencia correspondiente en otra sentencia. Una fila nunca queda con cliente creado y estado distinto de `IMPORTED` (lo garantiza también el `CHECK ck_customer_import_rows_imported` de `00` §2.14). Origen: §8.1 "mantener integridad ante errores parciales", `00` §2.14.
- **RN-06.22 — Las filas inválidas no se tocan.** Las filas `INVALID`, `DUPLICATE_IN_FILE` y `DUPLICATE_EXISTING` no se reintentan ni se importan al confirmar; conservan su estado (rechazadas en la validación). `REJECTED` identifica las que fallaron **en la confirmación**.
- **RN-06.23 — Concurrencia entre cargas.** Dos cargas (del mismo usuario o de usuarios distintos) con el mismo código o NIT pueden pasar ambas la validación. La base decide al importar: los únicos `uq_customers_country_customer_code` y `uq_customers_country_tax_id` hacen fallar la segunda inserción, que el Módulo 2 traduce a su error de duplicado y la fila queda `REJECTED` con `DUPLICATE_EXISTING` y `duplicateOfCustomerId`. Con unicidad `GLOBAL`, el bloqueo consultivo del Módulo 2 (`00` §6.2) cubre la carrera entre países. Los duplicados blandos no tienen garantía de base: dos cargas simultáneas pueden crear dos clientes con razón social parecida (aceptado; es una advertencia, no una regla dura).
- **RN-06.24 — Procesamiento e interrupción.** La confirmación responde `202 Accepted` y el procesamiento continúa en segundo plano en el mismo proceso (D-06.7 *(propuesta)*); la pantalla consulta el estado periódicamente. El proceso actualiza `customer_imports.updated_at` cada 50 filas como señal de vida. Una carga en `IMPORTING` sin señal de vida durante 15 minutos se considera interrumpida: al leerla o al iniciar otra carga, pasa a `FAILED` con `failureReason = 'PROCESS_INTERRUPTED'`, sus filas aún `VALID` pasan a `REJECTED` (`IMPORT_INTERRUPTED`) y se recalculan los contadores. Los clientes ya creados permanecen (cada uno se confirmó en su propia transacción). No hay reanudación: el usuario descarga el archivo de errores y lo vuelve a subir; los ya importados se detectarán como duplicados.
- **RN-06.25 — Cierre.** Al terminar: `COMPLETED` si todas las filas del archivo se importaron; `COMPLETED_WITH_ERRORS` si se importó al menos una y hubo filas rechazadas (en validación o confirmación); `FAILED` si un fallo inesperado impidió continuar. Se fija `completedAt` y se recalculan `validRows`, `invalidRows` e `importedRows` desde las filas (`00` §2.14).

  Máquina de estados de la carga (`ImportStatus`):

  ```mermaid
  stateDiagram-v2
      [*] --> UPLOADED: archivo recibido
      UPLOADED --> VALIDATING
      UPLOADED --> FAILED: estructura inválida
      VALIDATING --> VALIDATED
      VALIDATING --> FAILED: error inesperado
      VALIDATED --> IMPORTING: confirmar
      VALIDATED --> CANCELLED: cancelar
      IMPORTING --> COMPLETED
      IMPORTING --> COMPLETED_WITH_ERRORS
      IMPORTING --> FAILED: interrupción
      COMPLETED --> [*]
      COMPLETED_WITH_ERRORS --> [*]
      FAILED --> [*]
      CANCELLED --> [*]
  ```

### Archivo de errores, historial y retención

- **RN-06.26 — Archivo de errores.** Contiene cada fila no importada (`INVALID`, `DUPLICATE_IN_FILE`, `DUPLICATE_EXISTING`, `REJECTED`) con: "Fila del archivo", las columnas de la plantilla con los valores originales, "Estado" y "Errores" (`código: mensaje` separados por `; `). Mismo formato que el archivo subido, de modo que se corrige y se vuelve a subir. Se **genera al vuelo** desde `customer_import_rows.raw_data` (D-06.8 *(propuesta)*): no depende del almacenamiento de archivos (DM-8). Toda celda pasa por la neutralización de fórmulas de `backend/src/common/csv.ts` (apóstrofo delante de `=`, `+`, `-`, `@`, tabulador y retorno de carro) también en XLSX, donde además se escribe siempre como celda de texto, nunca como fórmula. Si no hay filas no importadas, `404 RESOURCE_NOT_FOUND`; si los datos de filas ya se purgaron, `409 IMPORT_DATA_PURGED`.
- **RN-06.27 — Registro de cada carga.** Toda carga queda en `customer_imports` con usuario que la inició, fecha, formato, nombre original (saneado), estado, versión de plantilla, contadores, motivo de fallo, quién y cuándo confirmó y cuándo terminó — también las rechazadas por estructura y las canceladas. Los registros de carga no se eliminan. Origen: §8.1 "registrar usuario, fecha y estado de cada carga".
- **RN-06.28 — Numeración de filas.** `rowNumber` = 1 para la primera fila de datos (`00` §2.14). La pantalla y el archivo de errores muestran "Fila del archivo" = `rowNumber + 1`, que es el número que el usuario ve en Excel (la fila 1 es el encabezado).
- **RN-06.29 — Retención.** `raw_data` puede contener datos de contacto: a los `crm.importaciones.dias_retencion_filas` días (90) desde `completedAt` (o desde `createdAt` si nunca se completó) se sustituye por `{}` y se marca la fila como purgada; las incidencias se conservan (no contienen valores, RN-06.11). El registro de la carga y sus contadores se conservan siempre. El archivo original **no se guarda** mientras DM-8 no esté resuelto (D-06.8). Mecanismo de purga: D-06.12. Origen: DM-28, `00` §4.5.
- **RN-06.30 — Una carga activa por usuario.** Un usuario no puede tener dos cargas en `VALIDATING` o `IMPORTING` a la vez (`409 IMPORT_IN_PROGRESS`) *(propuesta)*. Puede tener varias en `VALIDATED` (pendientes de confirmar).

---

## D. Modelo de datos

**Ninguna tabla nueva.** El módulo usa exactamente las entidades de `00`.

### D.1 Entidades propias

| Entidad (tabla) | Uso | Referencia |
|---|---|---|
| `CustomerImport` (`customer_imports`) | Una fila por carga: código, formato, nombre original, estado, versión de plantilla, contadores, motivo de fallo, quién inició/confirmó, fechas | `00` §2.14 |
| `CustomerImportRow` (`customer_import_rows`) | Una fila por fila de datos no vacía: número, valores leídos (`raw_data`), estado, incidencias (`errors`), duplicado de fila o de cliente, cliente creado | `00` §2.14 |
| Enums `ImportFileFormat`, `ImportStatus`, `ImportRowStatus` | Formato, estado de carga y de fila | `00` §2.1 |

Uso concreto de columnas que `00` deja abiertas:

| Columna | Uso en este módulo |
|---|---|
| `customer_imports.source_file_id` | **Nulo** mientras DM-8 no esté resuelto (D-06.8). El archivo se procesa en memoria y no se guarda |
| `customer_imports.error_file_id` | **Nulo**: el archivo de errores se genera al vuelo (D-06.8). Si en el futuro se decide guardarlo, la columna ya existe |
| `customer_imports.template_version` | Versión de la plantilla detectada o asumida (`1`) |
| `customer_imports.failure_reason` | Código legible del fallo (`MISSING_COLUMN: Razón social`, `PROCESS_INTERRUPTED`…); nunca valores de celdas |
| `customer_import_rows.raw_data` | `{ "<campo>": "<texto leído>" }` con las claves de RN-06.5 (`customerCode`, `legalName`…); `{}` tras la purga |
| `customer_import_rows.errors` | `[{ field, code, message, severity: "ERROR" \| "WARNING" }]` (RN-06.18) |

Contadores (semántica, coherente con el `CHECK ck_customer_imports_counters`):
`totalRows` = filas de datos no vacías; `validRows` = filas que quedaron `VALID` tras la
validación; `invalidRows` = `INVALID` + `DUPLICATE_IN_FILE` + `DUPLICATE_EXISTING`;
`importedRows` = `IMPORTED`. Las rechazadas en la confirmación se derivan
(`validRows − importedRows` al cerrar) y la API las expone como `rejectedRows`.

### D.2 Entidades compartidas (solo uso; no se modifican)

| Entidad | Dueño | Uso |
|---|---|---|
| `Customer` (`customers`) | Módulo 2 | Destino. Se crea **solo** por el caso de uso de alta del Módulo 2 con `sourceImportId`. Lectura de existentes para duplicados (vía Módulo 2) |
| `Country` (`countries`) | Fase 0 / Módulo 7 | País por `isoCode` (lo resuelve el Módulo 2); patrones de NIT y teléfono los aplica el Módulo 2 |
| `Catalog`, `CatalogItem` | Fase 0 / Módulo 7 | `crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente` (`00` §3.2) |
| `User` | Plantilla | Responsable comercial (por `email_normalized` o `employee_code`); `started_by_id`, `confirmed_by_id` |
| `SystemParameter` | Fase 0 / Módulo 7 | `crm.importaciones.habilitada`, `.max_filas`, `.max_mb`, `.dias_retencion_filas`; además, a través del Módulo 2, `crm.campos_obligatorios`, `crm.valores_por_defecto`, `crm.clientes.unicidad_codigo`, `.unicidad_nit`, `.reglas_duplicidad` |
| `Sequence` | Fase 0 | `crm.importacion` (código de la carga) y, a través del Módulo 2, `crm.cliente` |
| `AuditLog` | Plantilla | Eventos de carga (H.6) y altas de clientes (las escribe el Módulo 2) |
| `StoredFile` | Plantilla | No se usa en esta versión (D-06.8) |

### D.3 Claves, relaciones e integridad

- `customer_import_rows.import_id → customer_imports.id` (`Cascade`; una carga nunca se borra, RN-06.27).
- `customer_import_rows (import_id, row_number)` único; `row_number ≥ 1`.
- `customer_import_rows.customer_id → customers.id` (`SetNull`) y `CHECK (status = 'IMPORTED') = (customer_id IS NOT NULL)`.
- `customer_import_rows.duplicate_of_customer_id → customers.id` (`SetNull`).
- `customers.source_import_id → customer_imports.id` (`SetNull`).
- `customer_imports.started_by_id`, `confirmed_by_id → users.id` (`Restrict`).
- Unicidad de clientes: `uq_customers_country_customer_code`, `uq_customers_country_tax_id` (garantía final ante concurrencia, RN-06.23).
- Índices de consulta: `idx_customer_imports_started_by_id_created_at` (historial propio), `idx_customer_imports_status_created_at` (filtro por estado), `idx_customer_import_rows_import_id_status` (vista previa filtrada).

### D.4 Catálogos utilizados

`crm.tipo_empresa`, `crm.estado_cliente` (su `metadata.isActive` lo interpreta el
Módulo 2), `crm.calificacion_cliente`. Ninguna lista de valores fija en el
frontend ni en el código del importador: la plantilla y la validación leen la
base (§1 regla 8).

---

## E. Pantallas y componentes

Rutas bajo el módulo de menú `integraciones` (`00` §5.3). La opción
`integraciones-clientes` (`/integraciones/clientes`, permiso `importaciones.ver`,
icono `upload_file`) se siembra **con este módulo** (DM-32), junto con su ruta en
`app-routes.registry.json` y en el router. El detalle es ruta hija, no opción de menú.

Componentes base: `DataTable`, `ListToolbar`, `ConfirmDialog`, `EmptyState`,
`AdminListCard`, desde la ubicación compartida que fija D-02.11 (promovidos desde
`features/admin/common`; nunca importados directamente de otra área); tema y tokens de ADR-017 (ningún color, duración o píxel
escrito a mano); mobile-first: en pantallas estrechas las tablas pasan a lista de
tarjetas.

### E.1 Historial de cargas — `/integraciones/clientes`

| Elemento | Detalle |
|---|---|
| Encabezado | Título "Carga masiva de clientes"; acciones **Nueva carga** y **Descargar plantilla** (menú: CSV / Excel), visibles solo con `importaciones.crear` |
| Aviso de habilitación | Si `settings.enabled = false`: banner informativo "La carga masiva no está habilitada en este entorno" y acciones de alta deshabilitadas (el historial sigue visible) |
| Tabla | Código, archivo, formato, estado (chip), total, válidas, con errores, importadas, iniciada por, fecha. Orden por fecha (defecto desc), código o estado |
| Filtros (en la URL) | Estado, rango de fechas, búsqueda (código o nombre de archivo); "Iniciada por" solo para alcance `ORGANIZATION` |
| Paginación | En servidor, `pageSize` ≤ 100 |
| Navegación | Clic en fila → E.4 |
| Estados | Cargando (esqueleto), vacío ("Aún no hay cargas" + llamada a Nueva carga si tiene permiso), error (mensaje de `describeApiError` + reintentar), sin permiso (ruta protegida → página de acceso denegado) |

### E.2 Descargar plantilla

Acción de E.1 y de E.3. Descarga con `httpClient.download` (el token no viaja en
un `<a href>`) y `saveFile`. Nombre: `plantilla-clientes-v1.xlsx` / `.csv`.
Estados: botón con indicador de progreso; error → aviso.

### E.3 Nueva carga (diálogo o paso inicial)

| Elemento | Detalle |
|---|---|
| Selector | Zona de arrastrar-soltar + botón "Seleccionar archivo"; `accept=".csv,.xlsx"`; un solo archivo |
| Ayuda | Formatos admitidos, tamaño y filas máximos (de `settings`), enlace a la plantilla, nota "guarde el CSV como UTF-8" |
| Comprobación previa (cliente) | Extensión y tamaño contra `settings`. Es comodidad; el servidor vuelve a validar todo |
| Subida | Barra de progreso; botón Cancelar mientras sube |
| Resultado | `201` → navega al detalle (E.4). `413`/`415`/`422 INVALID_IMPORT_FILE` → errores de estructura listados en el propio diálogo (columna faltante, desconocida, archivo vacío, demasiadas filas…), con opción de elegir otro archivo. `409 IMPORTS_DISABLED` / `IMPORT_IN_PROGRESS` → mensaje específico |
| Estados | Inicial, archivo elegido, subiendo, validando (el servidor responde al terminar la validación), error |

### E.4 Detalle de carga — `/integraciones/clientes/:importId`

Una sola pantalla que cubre vista previa, confirmación y resultado, según el estado.

| Zona | Contenido |
|---|---|
| Cabecera | Código, archivo, formato, estado (chip), iniciada por y fecha, confirmada por y fecha, terminada |
| Indicador de pasos | Archivo → Validación → Confirmación → Resultado, marcado según el estado |
| Resumen | Tarjetas: total, válidas, con advertencias, con errores, duplicadas (en archivo / existentes), importadas, rechazadas al confirmar |
| Tabla de filas | Fila del archivo, razón social, código de cliente, NIT, país, estado de fila (chip) e incidencias (lista expandible: campo, mensaje; advertencias diferenciadas de errores). Para `DUPLICATE_EXISTING`, enlace al cliente existente si es visible. Para `IMPORTED`, código CRM con enlace a la ficha del cliente (`/clientes/:id`, Módulo 2) |
| Filtro de filas | Pestañas o selector: Todas · Válidas · Con advertencias · Con errores · Duplicadas en archivo · Duplicadas existentes · Importadas · Rechazadas |
| Acciones (`VALIDATED`) | **Confirmar importación** → `ConfirmDialog` con "Se importarán N clientes. M filas no se importarán." y casilla "Importar también las N filas con advertencias" (desmarcada); **Cancelar carga** → confirmación |
| Acciones (siempre que existan filas no importadas y no purgadas) | **Descargar archivo de errores** |

Estados de la pantalla:

| Estado de la carga | Qué ve el usuario |
|---|---|
| `UPLOADED` / `VALIDATING` | Indicador de validación en curso (estado transitorio; la subida responde al terminar) |
| `VALIDATED` | Vista previa completa y acciones de confirmar/cancelar. Si no hay filas válidas: aviso y confirmar deshabilitado |
| `IMPORTING` | Progreso `importadas + rechazadas / válidas`, consultando cada 2 s; acciones deshabilitadas |
| `COMPLETED` | Mensaje de éxito, resumen y filas importadas |
| `COMPLETED_WITH_ERRORS` | Resumen con importadas y rechazadas; acceso directo al filtro de rechazadas y al archivo de errores |
| `FAILED` | Motivo del fallo; para fallo de estructura, la lista de problemas; para interrupción, cuántas se importaron |
| `CANCELLED` | Aviso de carga cancelada; vista previa de solo lectura |
| Filas purgadas | Valores sustituidos por "Datos eliminados por política de retención"; estados, incidencias y contadores visibles; archivo de errores no disponible |
| Carga no visible / inexistente | Página de no encontrado (el backend responde `404`) |

Accesibilidad: chips de estado con texto (no solo color), tabla con encabezados
asociados, foco gestionado en diálogos, anuncio (`aria-live`) del cambio de estado
durante `IMPORTING`.

---

## F. Servicios y contratos

### F.1 Endpoints propios

Todos bajo `/api/v1`, autenticados, con el formato de error de `API-STANDARDS.md` §8
y `X-Correlation-ID`. Las rutas literales (`settings`, `template`) se declaran
antes de `:id`.

| # | Método | Ruta | Permiso(s) (`@RequirePermission`, se exigen todos) | Éxito | Propósito |
|---|---|---|---|---|---|
| 1 | GET | `/customer-imports/settings` | `importaciones.ver` | `200` | Habilitación, límites efectivos, formatos, versión y columnas de la plantilla |
| 2 | GET | `/customer-imports/template?format=CSV\|XLSX` | `importaciones.crear` | `200` archivo | Plantilla (funcionalidad 1) |
| 3 | POST | `/customer-imports` (multipart) | `importaciones.crear`, `clientes.crear` | `201` + `Location` | Subir, leer y validar (funcionalidades 2–10) |
| 4 | GET | `/customer-imports` | `importaciones.ver` | `200` paginado | Historial (funcionalidad 17) |
| 5 | GET | `/customer-imports/{id}` | `importaciones.ver` | `200` | Resumen y resultado (11, 17) |
| 6 | GET | `/customer-imports/{id}/rows` | `importaciones.ver` | `200` paginado | Vista previa y errores por fila (11, 12) |
| 7 | POST | `/customer-imports/{id}/confirmation` | `importaciones.crear`, `clientes.crear` | `202` | Confirmar e importar (13–15) |
| 8 | POST | `/customer-imports/{id}/cancellation` | `importaciones.crear` | `200` | Cancelar una carga validada |
| 9 | GET | `/customer-imports/{id}/error-file` | `importaciones.ver` | `200` archivo | Archivo de errores (16) |

Las operaciones 3, 7 y 8 comprueban además RN-06.1 (habilitación). Las 5–9
aplican la visibilidad de H.4 (fuera de alcance → `404`).

#### 1. `GET /customer-imports/settings`

```json
{
  "enabled": false,
  "maxFileSizeMb": 10,
  "maxRows": 5000,
  "formats": ["CSV", "XLSX"],
  "templateVersion": "1",
  "columns": [
    { "key": "legalName", "header": "Razón social", "isRequired": true, "maxLength": 200, "description": "Nombre legal de la empresa" }
  ]
}
```

`isRequired` se calcula con `crm.campos_obligatorios.customer` y las reglas del Módulo 2.

#### 2. `GET /customer-imports/template`

- Query `CustomerImportTemplateQueryDto`: `format` ∈ `CSV | XLSX` (obligatorio).
- `200`, `Content-Type: text/csv; charset=utf-8` o `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; `Content-Disposition: attachment; filename="plantilla-clientes-v1.<ext>"`; `Cache-Control: no-store`.
- Errores: `400 VALIDATION_FAILED` (formato inválido), `401`, `403`.

#### 3. `POST /customer-imports`

- `Content-Type: multipart/form-data`; un único campo `file`. Límites del interceptor de subida (Multer, ya incluido en `@nestjs/platform-express`): `fileSize` = límite efectivo de RN-06.7, `files: 1`, `fields: 0`, `parts: 2`, `fieldNameSize: 50`, almacenamiento **en memoria** (nunca disco temporal).
- Proceso síncrono: comprobar habilitación y carga activa → detectar tipo (H.2) → crear `CustomerImport` (`UPLOADED`, código `crm.importacion`) → leer y validar estructura (`VALIDATING`) → resolver referencias y validar filas con el Módulo 2 en lotes → guardar filas → `VALIDATED`.
- `201` + `Location: /api/v1/customer-imports/{id}`, cuerpo `CustomerImportResponseDto` con estado `VALIDATED`. **Filas inválidas no son un error HTTP**: son el resultado de una validación correcta.
- Errores:

  | Status | `code` | Cuándo |
  |---|---|---|
  | 400 | `VALIDATION_FAILED` | Falta `file`, más de un archivo, campos extra |
  | 401 | `UNAUTHENTICATED` | Sin sesión |
  | 403 | `PERMISSION_DENIED` | Falta `importaciones.crear` o `clientes.crear` |
  | 409 | `IMPORTS_DISABLED` | `crm.importaciones.habilitada = false` |
  | 409 | `IMPORT_IN_PROGRESS` | El usuario ya tiene una carga en `VALIDATING`/`IMPORTING` |
  | 413 | `FILE_TOO_LARGE` | Supera el tamaño efectivo (NGINX responde 413 antes si supera 10 MB; el frontend trata el 413 aunque no traiga cuerpo JSON) |
  | 415 | `UNSUPPORTED_FILE_TYPE` | Tipo real no admitido o incoherente con la extensión; XLSX con macros, cifrada, `.xls` |
  | 422 | `INVALID_IMPORT_FILE` | Estructura o columnas inválidas, vacío, demasiadas filas, codificación, ZIP sospechoso (H.2). `details[]` = `{ field: "file" \| "columns" \| "rows", issue: "MISSING_COLUMN" \| "UNKNOWN_COLUMN" \| "DUPLICATE_COLUMN" \| "EMPTY_FILE" \| "NO_DATA_ROWS" \| "TOO_MANY_ROWS" \| "INVALID_ENCODING" \| "MALFORMED_CSV" \| "SHEET_NOT_FOUND" \| "ARCHIVE_LIMITS_EXCEEDED" \| "PARSE_TIMEOUT", column?: "<encabezado>" }`. La carga queda en el historial como `FAILED` |
  | 429 | `RATE_LIMIT_EXCEEDED` | Límite de subidas (H.5) |

  `413` y `415` no figuran en la tabla de `API-STANDARDS.md` §3: se añaden al implementar (D-06.13).

#### 4. `GET /customer-imports`

- `CustomerImportQueryDto`: `page`, `pageSize` (≤ 100), `sortBy` ∈ `createdAt | code | status` (lista blanca), `sortOrder`, `status?` (uno o varios `ImportStatus`), `createdFrom?`, `createdTo?` (ISO 8601), `search?` (abarca `code` y `originalFileName`), `startedById?` (UUID; solo tiene efecto con alcance `ORGANIZATION`).
- `200` `{ data: CustomerImportListItemDto[], pagination }`.
- Errores: `400`, `401`, `403`.

#### 5. `GET /customer-imports/{id}`

- `200` `CustomerImportResponseDto`. Si la carga está en `IMPORTING` sin señal de vida (RN-06.24), se marca `FAILED` antes de responder.
- Errores: `400` (UUID inválido), `401`, `403`, `404`.

#### 6. `GET /customer-imports/{id}/rows`

- `CustomerImportRowQueryDto`: `page`, `pageSize` (≤ 100), `status?` (uno o varios `ImportRowStatus`), `hasWarnings?` (boolean). Orden fijo por `rowNumber`.
- `200` `{ data: CustomerImportRowDto[], pagination }`.
- Errores: `400`, `401`, `403`, `404`.

#### 7. `POST /customer-imports/{id}/confirmation`

- Body `ConfirmCustomerImportDto`: `{ "expectedValidRows": 42, "includeRowsWithWarnings": false }`.
- `202 Accepted`, cuerpo `CustomerImportResponseDto` con estado `IMPORTING`; `Location` = el recurso de la carga.
- Errores: `400`, `401`, `403`, `404`, `409 IMPORTS_DISABLED`, `409 INVALID_IMPORT_STATUS` (no está en `VALIDATED`, ya confirmada o cancelada), `409 IMPORT_CHANGED` (`expectedValidRows` no coincide), `403 PERMISSION_DENIED` si no es quien la subió ni tiene alcance `ORGANIZATION` (RN-06.19), `422 NO_VALID_ROWS`, `429`.

#### 8. `POST /customer-imports/{id}/cancellation`

- Sin body. `200` `CustomerImportResponseDto` en `CANCELLED`.
- Errores: `401`, `403`, `404`, `409 IMPORTS_DISABLED`, `409 INVALID_IMPORT_STATUS`.

#### 9. `GET /customer-imports/{id}/error-file`

- `200` archivo en el formato de la carga (`text/csv; charset=utf-8` con BOM, o XLSX); `Content-Disposition: attachment; filename="errores-IMP-2026-0007.<ext>"`; `Cache-Control: no-store`.
- Errores: `401`, `403`, `404` (no visible, o sin filas no importadas), `409 IMPORT_DATA_PURGED`.

### F.2 DTOs

| DTO | Campos |
|---|---|
| `CustomerImportSettingsResponseDto` | `enabled`, `maxFileSizeMb`, `maxRows`, `formats: ImportFileFormat[]`, `templateVersion`, `columns: { key, header, isRequired, maxLength \| null, description }[]` |
| `CustomerImportTemplateQueryDto` | `format: 'CSV' \| 'XLSX'` |
| `CustomerImportQueryDto` | Ver F.1 §4 |
| `CustomerImportListItemDto` | `id`, `code`, `format`, `originalFileName`, `status`, `totalRows`, `validRows`, `invalidRows`, `importedRows`, `startedBy: { id, displayName }`, `createdAt`, `completedAt` |
| `CustomerImportResponseDto` | Lo anterior + `templateVersion`, `rejectedRows`, `warningRows`, `failureReason`, `validatedAt`, `confirmedBy: { id, displayName } \| null`, `confirmedAt`, `isPurged`, `canConfirm`, `canCancel`, `hasErrorFile` (los `can*`/`has*` se calculan para el usuario actual) |
| `CustomerImportRowQueryDto` | Ver F.1 §6 |
| `CustomerImportRowDto` | `rowNumber`, `fileRowNumber` (= `rowNumber + 1`), `status`, `values: { customerCode, legalName, tradeName, country, city, address, phone, email, companyType, status, rating, salesOwner, taxId } \| null` (texto leído; `null` si purgado), `issues: { field, code, message, severity }[]`, `duplicateOfRowNumber \| null`, `duplicateOfCustomer: { id, crmCode, legalName } \| null` (solo si visible, H.4), `customer: { id, crmCode } \| null` |
| `ConfirmCustomerImportDto` | `expectedValidRows: int ≥ 1`, `includeRowsWithWarnings: boolean` (defecto `false`) |

Todos los DTO de entrada con `class-validator` (`whitelist`, `forbidNonWhitelisted`).
Ningún DTO expone `rawData` ni el modelo de Prisma directamente.

### F.3 Códigos de incidencia de fila

Los mensajes de incidencia (en español) los produce el servidor, porque la
vista previa y el archivo de errores deben decir lo mismo; el frontend los
muestra tal cual y puede refinarlos por `code`. Nunca contienen el valor de la celda.

| Origen | Códigos |
|---|---|
| Propios del archivo (Módulo 6) | `MAX_LENGTH`, `INVALID_CELL_TYPE`, `FORMULA_NOT_ALLOWED`, `DUPLICATE_IN_FILE`, `POSSIBLE_DUPLICATE_IN_FILE` (advertencia), `IMPORT_INTERRUPTED`, `CREATE_FAILED` (error inesperado al crear; se registra con correlation ID) |
| Del Módulo 2 (se copian sin cambiar, 02 F5 y §F.6.1) | `REQUIRED_FIELD_MISSING`, `INVALID_CATALOG_VALUE`, `INVALID_COUNTRY`, `INVALID_SALES_OWNER`, `INVALID_PHONE_FORMAT`, `INVALID_TAX_ID_FORMAT`, `CUSTOMER_CODE_TAKEN`, `TAX_ID_TAKEN`, `DUPLICATE_BLOCKED`, `POSSIBLE_DUPLICATE` (advertencia en la importación), `FIELD_NOT_EDITABLE` (responsable ajeno sin `clientes.administrar`), el error de formato de correo y los que 02 añada. Si 02 cambia un código, la importación lo hereda sin tocar este módulo |

### F.4 Operaciones consumidas de otros módulos

| Operación | Módulo dueño | Uso |
|---|---|---|
| `CustomerValidationService.validate` (02 §F.6.1) | Módulo 2 | Validar cada fila sin escribir, en modo `BY_NATURAL_KEY` |
| `CustomerValidationService.duplicateKeys` (02 §F.6.1) | Módulo 2 | Claves normalizadas para duplicados dentro del archivo |
| `CustomerCreationService.create` (02 §F.6.2) | Módulo 2 | Crear cada cliente válido al confirmar |
| `CustomerReferenceGuard` / visibilidad de clientes (02 §F.6.3) | Módulo 2 | Decidir si se muestra la referencia a un cliente existente (H.4) |
| `CatalogReferenceValidator` (por `code`) | Fase 0 (`00` §3.5) | Lo usa el Módulo 2 dentro de la validación; el Módulo 6 lo usa solo para la hoja de valores válidos de la plantilla (lectura de elementos activos) |
| `VisibilityScopeResolver` | Fase 0 (`00` §11) | Historial (alcance `ORGANIZATION`) |
| `SequenceGenerator.next('crm.importacion', tx)` | Fase 0 (`00` §6.1) | Código de la carga |
| `ParameterReader.get<T>(key)` (02 §F.6.5) | Fase 0 / módulo `parameters` | Habilitación y límites |
| `AuditService.record` | Módulo `audit` (existente) | Eventos de carga |

---

## G. Relaciones e integraciones internas

### G.1 Clientes (Módulo 2) — destino y dueño de las reglas

El Módulo 6 **no** reimplementa ninguna validación de cliente. Consume
exactamente el contrato que publica [`02-clientes-cuentas.md`](02-clientes-cuentas.md)
§F.6 (exportado por `backend/src/modules/customers/customers.module.ts`):

| Servicio (02) | Uso en el Módulo 6 | Entrada que construye el Módulo 6 | Qué hace con la salida |
|---|---|---|---|
| `CustomerValidationService.validate(draft, { mode: 'BY_NATURAL_KEY', actor, scope })` (§F.6.1, RN-02.12) | Fase de validación, una vez por fila | `CustomerDraft` con los 13 valores saneados (RN-06.11), sin adjuntos | `errors` → incidencias `ERROR`; `blockingDuplicates` → `DUPLICATE_EXISTING`; `duplicates` blandos → incidencias `WARNING` (RN-06.18) |
| `CustomerValidationService.duplicateKeys(draft)` (§F.6.1) | Duplicados dentro del archivo (RN-06.14) | El mismo `CustomerDraft` | Agrupa filas por clave |
| `CustomerCreationService.create(draft, { mode: 'BY_NATURAL_KEY', source: 'IMPORT', sourceImportId, acknowledgedDuplicateIds, actor, audit })` (§F.6.2) | Confirmación, una vez por fila `VALID`, en su transacción | El `CustomerDraft` guardado en `raw_data` | `{ id, crmCode }` → fila `IMPORTED`; error de dominio → fila `REJECTED` con su `code` |
| Visibilidad de clientes (§F.6.3 / repositorio de clientes con `VisibilityScope`) | Referencia a un cliente existente duplicado (H.4) | `duplicateOfCustomerId`, actor | Rellena `duplicateOfCustomer` solo si es visible |

Rendimiento: `validate` por fila hace sus propias consultas de duplicados.
Si con 5 000 filas no se cumple PF-06.44, se añade **en el Módulo 2** una
variante por lotes (`validateMany` / búsqueda de candidatos por lotes de claves),
con sus pruebas, como preparación de contrato permitida por §11; nunca como
copia de reglas en el Módulo 6. Lo mismo para cualquier capacidad que falte.

Coherencia comprobada con 02: las reglas blandas se evalúan con `DuplicateRules`
(02 §F.6.4, desde `crm.clientes.reglas_duplicidad`) dentro de `validate`; el Módulo 6
no las lee ni las interpreta. Modo `BY_NATURAL_KEY` (D-02.17), `FieldIssue` con
la misma forma que `customer_import_rows.errors` (el Módulo 6 solo añade
`severity`, D-06.6), `metadata.source = IMPORT` en el evento de alta, y "nunca
sobrescribe un cliente existente" (02 §F.6.2).

Los clientes importados son filas normales de `customers`: tienen `crmCode`,
responsable, país y estado como cualquier otro, aparecen en la búsqueda, la ficha
y las listas del Módulo 2, y se distinguen solo por `sourceImportId`.

### G.2 Administración (Módulo 7) y Fase 0

| Proporciona | Cómo lo usa el Módulo 6 |
|---|---|
| Permisos `importaciones.ver`, `importaciones.crear` (sembrados en Fase 0, `00` §5.2) y `clientes.crear` | Guardas de los endpoints (H.1) |
| Catálogos de clientes y países | Resolución de valores (RN-06.12) y hoja de valores válidos (RN-06.6) |
| Parámetros `crm.importaciones.*` y los de clientes | Habilitación, límites, retención; reglas de validación vía Módulo 2 |
| Auditoría | Consulta de los eventos `crm.customer_import.*` desde la pantalla de auditoría existente |

Las pantallas de mantenimiento ya existen (PLAN-ADMIN) y el Módulo 7 las
extiende; el Módulo 6 funciona con los valores sembrados aunque el Módulo 7 aún
no se haya entregado.

### G.3 Resto de módulos

| Módulo | Relación |
|---|---|
| Proyectos (3) | Usa los clientes importados como cualquier cliente (`projects.customer_id`) |
| Actividad comercial (4) | Visitas y actividades sobre clientes importados |
| Inicio (1) | Los cuenta en sus indicadores si aplica; sin tratamiento especial |
| Reportes (5) | Los reporta como cualquier cliente. **Comparte la librería de hojas de cálculo** (D-06.1): la exportación a Excel de §7.6 y la lectura/plantilla de este módulo deben usar la misma |

### G.4 Comportamiento si una dependencia no está implementada

| Falta | Efecto |
|---|---|
| Módulo 2 | El Módulo 6 **no puede implementarse** (dependencia dura). El orden de §11 ya lo pone después |
| Módulo 7 | Sin efecto funcional: catálogos y parámetros vienen de los seeds; su edición usa las pantallas existentes |
| Módulos 1, 3, 4, 5 | Sin efecto; los clientes importados quedan disponibles cuando lleguen |
| ADR de la librería XLSX (D-06.1) | Se puede entregar la parte CSV; la XLSX (lectura, plantilla y archivo de errores en XLSX) queda bloqueada hasta aprobar el ADR |
| DM-8 (almacenamiento) | Sin bloqueo: no se guarda el archivo original y el de errores se genera al vuelo (D-06.8) |

---

## H. Seguridad

### H.1 Quién puede ejecutar cargas

| Operación | Permiso | Notas |
|---|---|---|
| Ver historial, detalle, filas, configuración, archivo de errores | `importaciones.ver` | Más la visibilidad de H.4 |
| Descargar plantilla | `importaciones.crear` | |
| Subir/validar | `importaciones.crear` **y** `clientes.crear` | Crea clientes: necesita el permiso de alta del Módulo 2 |
| Confirmar | `importaciones.crear` **y** `clientes.crear` | Además: autor de la carga o alcance `ORGANIZATION` (RN-06.19). Cada fila respeta las reglas de alcance que el Módulo 2 aplica al alta |
| Cancelar | `importaciones.crear` | Mismo requisito de autoría |

Matriz propuesta (`00` §5.4, DM-11): `importaciones.ver/crear` solo para
`administrador`. ADR-020 rige: conceder estos permisos a otro rol es exclusivo
del administrador. El frontend oculta acciones sin permiso, pero la decisión es
siempre del backend (deny-by-default, guard global). Pruebas de `401` y `403` en
cada endpoint.

### H.2 Validación del archivo

| Riesgo | Control |
|---|---|
| Archivo enorme / agotamiento de memoria | NGINX `client_max_body_size 10m`; Multer `fileSize` con el límite efectivo, `files: 1`, `parts: 2`; almacenamiento en memoria acotado; nunca disco temporal |
| Tipo falso (extensión cambiada) | Detección por firma: XLSX = ZIP (`50 4B 03 04`) que contiene `[Content_Types].xml` y `xl/workbook.xml`; OLE (`D0 CF 11 E0`, `.xls` o XLSX cifrada) → `415`; CSV = UTF-8 válido sin bytes NUL ni firma binaria conocida. La extensión y el `Content-Type` declarados deben coincidir con lo detectado |
| Macros | Se rechaza si el paquete contiene `xl/vbaProject.bin` o el tipo de contenido de libro con macros. Nunca se ejecuta nada del archivo |
| Bomba ZIP (XLSX) | **Antes** de descomprimir, se lee el directorio central del ZIP en memoria: máximo 100 entradas, tamaño descomprimido declarado total ≤ 64 MB, razón de compresión por entrada ≤ 100:1, sin rutas absolutas ni `..`. **Durante** la lectura (los tamaños declarados pueden mentir), un contador de bytes descomprimidos y de filas aborta al superar los mismos topes. Tiempo máximo de lectura 20 s → `PARSE_TIMEOUT` |
| XML malicioso (XXE, expansión de entidades) | El lector XLSX no debe resolver entidades externas ni procesar DTD; requisito explícito del ADR (D-06.1) y prueba con un archivo con DTD |
| Vínculos externos y conexiones de datos | Se ignoran (`xl/externalLinks/*`, `connections.xml`); nunca se sigue una URL del archivo (sin SSRF) |
| Fórmulas al leer | Celdas con fórmula → `FORMULA_NOT_ALLOWED`; texto libre que empieza por `=`, `@`, tab o CR → `FORMULA_NOT_ALLOWED` (RN-06.11). Evita guardar cargas útiles que otro sistema ejecutaría al exportar |
| Fórmulas al escribir (archivo de errores y plantilla) | Neutralización de `backend/src/common/csv.ts` en CSV y en XLSX; celdas XLSX siempre de tipo texto (RN-06.26) |
| Filas excesivas | Recuento en streaming; al superar el máximo efectivo se aborta sin seguir leyendo (`TOO_MANY_ROWS`) |
| Celdas o líneas patológicas | Longitud máxima por campo (RN-06.5); línea CSV máxima de 16 KB; máximo 30 columnas |
| Nombre de archivo | Se guarda saneado (sin caracteres de control ni separadores de ruta, ≤ 255) solo como dato; nunca se usa para construir rutas ni cabeceras sin codificar |
| Antivirus | No aplica mientras el archivo no se almacene ni se redistribuya (D-06.8); si DM-8 decide guardarlo, se aplica su política |

### H.3 Inyección y datos

- Todas las consultas por Prisma parametrizado; búsquedas de duplicados en lote con `IN` parametrizado; sin SQL concatenado.
- `sortBy` y filtros por lista blanca.
- Los valores leídos pasan por los mismos validadores del Módulo 2 antes de llegar a `customers`.

### H.4 Visibilidad

- `customer_imports`: visible para quien la inició (`started_by_id`); con alcance `ORGANIZATION` y `importaciones.ver`, todas (`00` §4.2). Fuera de alcance → `404` (no se revela la existencia, ADR-008).
- Referencias a clientes existentes en duplicados: `duplicateOfCustomer` solo se rellena si ese cliente es visible para el usuario según `VisibilityScopeResolver` y las herencias de DM-13; si no, la incidencia dice que existe, sin identificarlo (evita enumerar clientes ajenos).
- Clientes creados: su visibilidad posterior la decide su responsable comercial y país, como cualquier cliente.

### H.5 Abuso y disponibilidad

- `@Throttle` específico: subida 10/min por usuario; confirmación 5/min; plantilla y archivo de errores 30/min. Además del límite global y del `limit_req` de NGINX.
- Una carga activa por usuario (RN-06.30).
- La confirmación crea filas una a una con transacciones cortas: el bloqueo de la secuencia `crm.cliente` se mantiene solo durante cada alta, sin bloquear el alta manual de otros usuarios más que unos milisegundos.

### H.6 Auditoría y logs

| Evento (`audit_logs`, `resourceType = 'crm.customer_import'`) | Cuándo | Datos (`changes` / metadatos) |
|---|---|---|
| `crm.customer_import.uploaded` | Subida aceptada | código, formato, tamaño en bytes, versión de plantilla |
| `crm.customer_import.validated` | Fin de validación | contadores |
| `crm.customer_import.failed` | Rechazo por estructura o interrupción | `failureReason` |
| `crm.customer_import.confirmed` | Confirmación | `expectedValidRows`, `includeRowsWithWarnings` |
| `crm.customer_import.completed` | Cierre | estado final y contadores |
| `crm.customer_import.cancelled` | Cancelación | — |
| `crm.customer_import.error_file_downloaded` | Descarga del archivo de errores (contiene datos de clientes en bloque) | número de filas |
| `crm.customer.created` (lo escribe el Módulo 2) | Cada cliente importado | metadatos `{ source: "IMPORT", sourceImportId, rowNumber }` (02 RN de auditoría: `metadata.source = UI \| IMPORT`) |

Logs estructurados (`AppLogger`, correlation ID): solo `importId`, código,
formato, contadores, duración, números de fila y códigos de incidencia. **Nunca**
contenido de celdas, `raw_data`, nombre original del archivo, correos ni
teléfonos. Las excepciones del lector se registran sin el fragmento del archivo.

### H.7 Datos personales

`raw_data` puede contener correos y teléfonos (normalmente de empresa, pero
también personales): visible solo para quien ve la carga, purgado a los 90 días
(RN-06.29), nunca en logs. El archivo de errores es una extracción en bloque:
exige visibilidad sobre la carga, se audita y se sirve con `no-store`.

---

## I. Criterios de aceptación

Todos trazan a **F-42**. Formato Given/When/Then; cada uno es verificable por al
menos una prueba de J.

| ID | Funcionalidad §8.1 | Criterio |
|---|---|---|
| AC-06.1 | 1 | **Dado** un usuario con `importaciones.crear`, **cuando** descarga la plantilla en CSV o XLSX, **entonces** recibe un archivo con exactamente las 13 columnas de RN-06.5 en español y la versión de plantilla en el nombre |
| AC-06.2 | 1 | **Dado** que un administrador desactivó un elemento de `crm.tipo_empresa`, **cuando** se descarga la plantilla XLSX, **entonces** la hoja `Valores válidos` no lo incluye y la hoja `Instrucciones` marca como obligatorias las columnas que exige `crm.campos_obligatorios.customer` |
| AC-06.3 | 2 | **Dado** el diálogo de nueva carga, **cuando** el usuario elige un archivo con extensión distinta de `.csv`/`.xlsx` o mayor que el límite, **entonces** la pantalla lo avisa sin subirlo; y **cuando** elige uno válido, **entonces** puede subirlo con indicador de progreso |
| AC-06.4 | 3 | **Dado** un archivo CSV (delimitado por `,` o `;`, UTF-8 con o sin BOM) o XLSX válido de N filas de datos, **cuando** se sube, **entonces** se crea una carga `VALIDATED` con `totalRows = N` y una fila `customer_import_rows` por fila no vacía con sus valores leídos como texto |
| AC-06.5 | 4 | **Dado** un archivo vacío, sin filas de datos, con más filas que el máximo efectivo, o un CSV que no es UTF-8, **cuando** se sube, **entonces** responde `422 INVALID_IMPORT_FILE` con el `issue` correspondiente y el historial muestra la carga `FAILED` con su motivo y sin filas |
| AC-06.6 | 4 | **Dado** un `.xls`, una XLSX con macros, una XLSX cifrada o un ejecutable renombrado a `.csv`/`.xlsx`, **cuando** se sube, **entonces** responde `415 UNSUPPORTED_FILE_TYPE`; **dado** un archivo mayor que el límite, **entonces** `413 FILE_TOO_LARGE` |
| AC-06.7 | 5 | **Dado** un archivo con una columna requerida ausente, una columna desconocida o un encabezado repetido, **cuando** se sube, **entonces** responde `422 INVALID_IMPORT_FILE` con `MISSING_COLUMN`/`UNKNOWN_COLUMN`/`DUPLICATE_COLUMN` y el nombre de la columna; **dado** las columnas correctas en otro orden y con otras mayúsculas o sin acentos, **entonces** se acepta |
| AC-06.8 | 6, 7 | **Dada** una fila sin un campo obligatorio, con correo, teléfono o NIT de formato inválido para su país, o con un valor más largo que el máximo, **cuando** se valida, **entonces** la fila queda `INVALID` con una incidencia por problema cuyo `code` es el mismo que devolvería el alta manual del Módulo 2 para ese dato |
| AC-06.9 | 8 | **Dada** una fila con tipo de empresa, estado o calificación inexistente, inactivo o de otro catálogo, país desconocido o inactivo, o responsable que no existe o que el Módulo 2 no admite, **cuando** se valida, **entonces** la fila queda `INVALID` con `INVALID_CATALOG_VALUE`/`INVALID_COUNTRY`/`INVALID_SALES_OWNER` (códigos del Módulo 2); **y** los valores escritos como `code` de catálogo, `isoCode` de país y código de colaborador o correo del responsable se aceptan |
| AC-06.10 | 9 | **Dadas** dos o más filas con el mismo código de cliente o NIT normalizado dentro del ámbito de unicidad, **cuando** se valida, **entonces** todas quedan `DUPLICATE_IN_FILE` con `duplicateOfRowNumber` y ninguna se importará (D-06.5) |
| AC-06.11 | 10 | **Dada** una fila cuyo código o NIT coincide con un cliente existente —activo, inactivo o eliminado lógicamente— en el ámbito de unicidad, **cuando** se valida, **entonces** queda `DUPLICATE_EXISTING`; la referencia al cliente existente solo aparece si el usuario puede verlo |
| AC-06.12 | 10 | **Dada** una fila que solo coincide por razón social normalizada con un cliente existente y la regla es `AVISAR`, **cuando** se valida, **entonces** queda `VALID` con una advertencia `POSSIBLE_DUPLICATE`; al confirmar sin `includeRowsWithWarnings` pasa a `REJECTED`, y con `includeRowsWithWarnings = true` se importa |
| AC-06.13 | 11 | **Dada** una carga `VALIDATED`, **cuando** el usuario abre su detalle, **entonces** ve el resumen con los contadores y una tabla paginada de filas filtrable por estado, con la "Fila del archivo" igual a la fila de Excel |
| AC-06.14 | 12 | **Dada** una fila con varios problemas, **cuando** se muestra en la vista previa, **entonces** se listan todas sus incidencias con campo y mensaje en español, distinguiendo advertencias de errores, y ningún mensaje contiene el valor de la celda |
| AC-06.15 | 13 | **Dada** una carga `VALIDATED` con al menos una fila válida, **cuando** su autor confirma con el `expectedValidRows` correcto, **entonces** responde `202`, la carga pasa a `IMPORTING` con `confirmedById`/`confirmedAt`, y la pantalla muestra el progreso hasta el estado final |
| AC-06.16 | 13 | **Dada** una carga, **cuando** se confirma dos veces en paralelo, en un estado distinto de `VALIDATED`, sin filas válidas o con un `expectedValidRows` desactualizado, **entonces** solo una confirmación prospera y las demás reciben `409 INVALID_IMPORT_STATUS`, `422 NO_VALID_ROWS` o `409 IMPORT_CHANGED` |
| AC-06.17 | 14 | **Dada** una confirmación, **cuando** termina, **entonces** cada fila `VALID` importada tiene un cliente creado con `crmCode` de la secuencia `crm.cliente`, `sourceImportId` de la carga, `createdById` = quien confirmó, valores por defecto aplicados por el Módulo 2 y un registro `crm.customer.created` en auditoría; y ese cliente aparece en la búsqueda de clientes del Módulo 2 para quien tenga visibilidad |
| AC-06.18 | 14, 15 | **Dada** una carga con filas válidas en la que una fila falla al crear (por ejemplo, otro usuario creó entretanto un cliente con el mismo NIT), **cuando** se procesa, **entonces** esa fila queda `REJECTED` con su incidencia, las demás filas válidas se importan, y no existe ningún cliente creado sin su fila `IMPORTED` ni ninguna fila `IMPORTED` sin cliente |
| AC-06.19 | 15 | **Dada** una carga confirmada, **entonces** ninguna fila `INVALID`, `DUPLICATE_IN_FILE` o `DUPLICATE_EXISTING` genera un cliente, y el estado final es `COMPLETED` si se importaron todas las filas o `COMPLETED_WITH_ERRORS` si hubo alguna rechazada |
| AC-06.20 | 16 | **Dada** una carga con filas no importadas, **cuando** se descarga el archivo de errores, **entonces** contiene solo esas filas, en el formato de la carga, con "Fila del archivo", los valores originales en las columnas de la plantilla, estado y errores; y puede volver a subirse tras corregirlo |
| AC-06.21 | 16 | **Dada** una fila cuyo valor original empieza por `=`, `+`, `-` o `@`, **cuando** aparece en el archivo de errores (CSV o XLSX), **entonces** la celda está neutralizada (apóstrofo) y en XLSX es de tipo texto, nunca fórmula |
| AC-06.22 | 17 | **Dado** un usuario con `importaciones.ver`, **cuando** abre el historial, **entonces** ve sus cargas (todas si su alcance es `ORGANIZATION`) con código, archivo, estado, contadores, usuario y fecha, paginadas, ordenables y filtrables por estado y fechas; una carga ajena fuera de su alcance responde `404` |
| AC-06.23 | 17 | **Dada** una carga cuyos datos de fila superaron `crm.importaciones.dias_retencion_filas`, **cuando** se purga, **entonces** `raw_data` queda vacío, la pantalla muestra "Datos eliminados por política de retención", los estados, incidencias y contadores se conservan y el archivo de errores responde `409 IMPORT_DATA_PURGED` |
| AC-06.24 | 7 (seguridad) | **Dada** una XLSX con una celda con fórmula, o un CSV/XLSX cuya razón social empieza por `=` o `@`, **cuando** se valida, **entonces** la fila queda `INVALID` con `FORMULA_NOT_ALLOWED` en ese campo |
| AC-06.25 | Habilitación | **Dado** `crm.importaciones.habilitada = false`, **cuando** un usuario autorizado sube o confirma, **entonces** recibe `409 IMPORTS_DISABLED`; puede consultar el historial y la pantalla muestra el aviso de no habilitado. **Dado** `true`, las mismas operaciones funcionan |
| AC-06.26 | Autorización | **Dado** un usuario sin sesión, **cuando** llama a cualquier endpoint, **entonces** `401`; **dado** uno sin `importaciones.ver` (o sin `importaciones.crear`/`clientes.crear` en las operaciones que los exigen), **entonces** `403 PERMISSION_DENIED`; y la opción de menú solo aparece con `importaciones.ver` |
| AC-06.27 | Seguridad | **Dada** una XLSX cuyo contenido descomprimido supera los topes (bomba ZIP), o con DTD/entidades externas, **cuando** se sube, **entonces** se rechaza (`422 ARCHIVE_LIMITS_EXCEEDED` / `INVALID_IMPORT_FILE`) sin agotar memoria ni resolver ninguna entidad |
| AC-06.28 | Registro | **Dada** cualquier carga (validada, fallida, cancelada o completada), **entonces** existe su registro en `customer_imports` con usuario, fecha, estado y contadores, y los eventos de H.6 en `audit_logs`; y los logs de la aplicación no contienen ningún valor de celda |
| AC-06.29 | Concurrencia | **Dado** un usuario con una carga en `VALIDATING` o `IMPORTING`, **cuando** sube otra, **entonces** `409 IMPORT_IN_PROGRESS`; **dada** una carga en `IMPORTING` sin señal de vida 15 minutos, **cuando** se consulta, **entonces** pasa a `FAILED (PROCESS_INTERRUPTED)` con sus filas pendientes `REJECTED` y contadores coherentes |
| AC-06.30 | 13 | **Dada** una carga `VALIDATED`, **cuando** su autor la cancela, **entonces** queda `CANCELLED`, no se crea ningún cliente y ya no puede confirmarse |
| AC-06.31 | Separación | **Dado** el despliegue con la semilla esencial, **entonces** ningún seed invoca los endpoints de carga, y la carga masiva no crea ni modifica catálogos, países, usuarios ni parámetros |

---

## J. Pruebas funcionales

Tipo: **U** unitaria (Jest backend / Vitest frontend), **I** integración contra
PostgreSQL efímera (`backend/test/*.e2e.spec.ts`, infraestructura existente en
`backend/test/support`), **E** extremo a extremo (Playwright). Los archivos de
prueba (CSV, XLSX, bomba ZIP, XLSX con macro o DTD) se **generan en la propia
prueba** a partir de datos ficticios; no se versionan binarios opacos.

### J.1 Positivas

| ID | Tipo | Caso | AC |
|---|---|---|---|
| PF-06.1 | I | Plantilla CSV: BOM, 13 encabezados exactos, `Content-Disposition`, `no-store` | AC-06.1 |
| PF-06.2 | I | Plantilla XLSX: 3 hojas; columnas de texto; valores válidos = elementos activos; obligatorios según parámetro (cambiar el parámetro cambia la plantilla) | AC-06.1, AC-06.2 |
| PF-06.3 | I | CSV UTF-8 con BOM y `,`, 10 filas válidas → `201`, `VALIDATED`, 10 filas `VALID`, `Location` correcto, código `IMP-AAAA-nnnn` | AC-06.4 |
| PF-06.4 | I | CSV sin BOM con `;` (Excel en español) → mismo resultado | AC-06.4 |
| PF-06.5 | I | XLSX con columnas en otro orden y encabezados sin acentos → aceptado | AC-06.4, AC-06.7 |
| PF-06.6 | U | Lectura XLSX: entero `1234567890123` → `"1234567890123"` (sin notación científica); texto con ceros a la izquierda se conserva; espacios y espacio duro recortados; filas vacías ignoradas con numeración preservada | AC-06.4 |
| PF-06.7 | I | Catálogo por `code`; país por ISO; responsable por correo y por código de colaborador → `VALID` | AC-06.9 |
| PF-06.8 | I | Estado vacío → el cliente importado recibe el valor de `crm.valores_por_defecto` | AC-06.17 |
| PF-06.9 | I | Confirmar carga de 10 válidas → `202`; al terminar `COMPLETED`, 10 clientes con `crmCode` consecutivos, `sourceImportId`, `createdById` = confirmador, 10 `crm.customer.created` con `metadata.source = IMPORT` | AC-06.15, AC-06.17 |
| PF-06.10 | I | Cliente importado visible en `GET /customers` del Módulo 2 para su responsable y utilizable como `customerId` al crear un proyecto (cuando el Módulo 3 exista; hasta entonces, prueba de la FK) | AC-06.17 |
| PF-06.11 | I | Historial: paginación, orden por fecha/código/estado, filtros por estado y fechas, búsqueda por código y nombre de archivo | AC-06.22 |
| PF-06.12 | I | Archivo de errores CSV y XLSX de una carga con filas inválidas: solo filas no importadas, columnas correctas, mensajes; resubir el archivo corregido produce filas `VALID` | AC-06.20 |
| PF-06.13 | I | Cancelar carga `VALIDATED` → `CANCELLED`, ningún cliente, confirmar después → `409` | AC-06.30 |
| PF-06.14 | I | `GET /settings` refleja parámetros y aplica topes duros (parámetro `max_mb = 50` → efectivo 10) | AC-06.25 |

### J.2 Negativas

| ID | Tipo | Caso | AC |
|---|---|---|---|
| PF-06.15 | I | Archivo vacío, solo encabezados, 5 001 filas, CSV en Windows-1252, comillas sin cerrar → `422` con el `issue` correcto; carga `FAILED` en historial sin filas | AC-06.5 |
| PF-06.16 | I | `.xls` real, XLSX con `vbaProject.bin`, XLSX cifrada (OLE), PNG renombrado a `.csv`, CSV renombrado a `.xlsx` → `415` | AC-06.6 |
| PF-06.17 | I | Archivo de 10 MB + 1 byte → `413 FILE_TOO_LARGE`; sin campo `file` o con dos archivos → `400` | AC-06.6 |
| PF-06.18 | I | Columna faltante, desconocida y repetida → `422` con `MISSING_COLUMN`/`UNKNOWN_COLUMN`/`DUPLICATE_COLUMN` y nombre | AC-06.7 |
| PF-06.19 | I | Filas sin razón social, sin país, sin responsable; correo inválido; teléfono y NIT que no cumplen el patrón del país; razón social de 201 caracteres → `INVALID` con códigos idénticos a los del alta manual (la prueba compara con la respuesta de `POST /customers` del Módulo 2 para los mismos datos) | AC-06.8 |
| PF-06.20 | I | Tipo de empresa con un código de otro catálogo (`ALTA` de prioridad), elemento inactivo, etiqueta en lugar de código, país inactivo, responsable inexistente o suspendido → código correspondiente del Módulo 2 | AC-06.9 |
| PF-06.21 | I | Celda con fórmula `=1+1`, razón social `=HYPERLINK(...)`, `@SUM(...)` → `FORMULA_NOT_ALLOWED`; teléfono `+502…` válido sigue aceptado | AC-06.24 |
| PF-06.22 | I | Confirmar sin filas válidas → `422 NO_VALID_ROWS`; con `expectedValidRows` distinto → `409 IMPORT_CHANGED`; carga ya `COMPLETED` o `CANCELLED` → `409 INVALID_IMPORT_STATUS` | AC-06.16 |
| PF-06.23 | I | Confirmar o cancelar la carga de otro usuario sin alcance `ORGANIZATION` → `403`; ver carga ajena sin alcance → `404` | AC-06.22, AC-06.26 |
| PF-06.24 | I | `crm.importaciones.habilitada = false`: subir y confirmar → `409 IMPORTS_DISABLED`; historial y detalle → `200` | AC-06.25 |
| PF-06.25 | I | Cada endpoint sin token → `401`; con token sin permiso → `403`; subir con `importaciones.crear` pero sin `clientes.crear` → `403` | AC-06.26 |
| PF-06.26 | I | Bomba ZIP (entrada de 1 GB descomprimido, razón > 100:1), ZIP con 1 000 entradas, tamaños declarados falsos → rechazo sin superar un umbral de memoria del proceso | AC-06.27 |
| PF-06.27 | U | XLSX con DTD y entidad externa (`file:///etc/passwd`) → no se resuelve; se rechaza o se lee como texto literal, nunca con contenido del sistema | AC-06.27 |
| PF-06.28 | I | Archivo de errores con valores `=cmd`, `+1`, `-2`, `@x` → celdas con apóstrofo; en XLSX tipo texto | AC-06.21 |
| PF-06.29 | I | Segunda subida con una carga en `VALIDATING`/`IMPORTING` → `409 IMPORT_IN_PROGRESS` | AC-06.29 |
| PF-06.30 | I | Archivo de errores tras purga → `409 IMPORT_DATA_PURGED`; sin filas no importadas → `404` | AC-06.23 |

### J.3 Duplicados

| ID | Tipo | Caso | AC |
|---|---|---|---|
| PF-06.31 | I | Dos filas con el mismo código normalizado (`ab-12` y `AB 12`) en el mismo país → ambas `DUPLICATE_IN_FILE`; en países distintos con unicidad `PAIS` → ambas `VALID`; con `GLOBAL` → duplicadas | AC-06.10 |
| PF-06.32 | I | Dos filas con el mismo NIT (`1234567-8` y `12345678`) → `DUPLICATE_IN_FILE` | AC-06.10 |
| PF-06.33 | I | Fila con código de un cliente existente activo, inactivo y eliminado lógicamente → `DUPLICATE_EXISTING` en los tres casos; ningún cliente existente modificado (comparar `updatedAt` y valores) | AC-06.11 |
| PF-06.34 | I | Duplicado existente fuera de la visibilidad del usuario → incidencia sin `duplicateOfCustomer` | AC-06.11 |
| PF-06.35 | I | Razón social parecida con regla `AVISAR` → `VALID` + advertencia; confirmar sin y con `includeRowsWithWarnings` | AC-06.12 |

### J.4 Integración, integridad y concurrencia

| ID | Tipo | Caso | AC |
|---|---|---|---|
| PF-06.36 | I | Fallo parcial: 5 filas válidas; entre validación y confirmación se crea manualmente un cliente con el NIT de la fila 3 y se desactiva el tipo de empresa de la fila 4 → filas 1, 2 y 5 `IMPORTED`, 3 `REJECTED` (duplicado), 4 `REJECTED` (catálogo inactivo); estado `COMPLETED_WITH_ERRORS`; contadores coherentes con el `CHECK` | AC-06.18, AC-06.19 |
| PF-06.37 | I | Error inesperado inyectado en el alta de una fila (doble del puerto) → solo esa fila `REJECTED (CREATE_FAILED)`; sin cliente huérfano; las demás importadas | AC-06.18 |
| PF-06.38 | I | Dos usuarios con cargas validadas que contienen el mismo código; confirman en paralelo → exactamente un cliente con ese código; la otra fila `REJECTED` con `DUPLICATE_EXISTING` | AC-06.18 |
| PF-06.39 | I | Doble confirmación simultánea de la misma carga → una `202`, otra `409`; cada fila importada una sola vez | AC-06.16 |
| PF-06.40 | I | Carga en `IMPORTING` con `updated_at` de hace 16 min → al consultar pasa a `FAILED (PROCESS_INTERRUPTED)`, filas `VALID` restantes `REJECTED (IMPORT_INTERRUPTED)`, clientes ya creados intactos | AC-06.29 |
| PF-06.41 | I | Auditoría: cada operación deja su evento de H.6; captura de logs durante una carga sin ningún valor de celda, correo ni nombre de archivo | AC-06.28 |
| PF-06.42 | U | Máquina de estados: transiciones permitidas y prohibidas de `ImportStatus` | AC-06.16, AC-06.30 |
| PF-06.43 | U | Detección de tipo por firma, lector CSV (comillas, comillas escapadas, CRLF/LF, `;`/`,`, BOM, línea > 16 KB), guardia ZIP, normalización de encabezados, agrupación de duplicados en archivo | AC-06.4–AC-06.7, AC-06.10 |
| PF-06.44 | I | Rendimiento: 5 000 filas válidas se validan en menos de 15 s y se importan sin agotar el pool de conexiones ni bloquear un alta manual simultánea más de 1 s | AC-06.4, AC-06.17 |
| PF-06.45 | I | Purga de retención: filas con `completedAt` > 90 días → `raw_data = {}`; cargas recientes intactas | AC-06.23 |

### J.5 Frontend y extremo a extremo

| ID | Tipo | Caso | AC |
|---|---|---|---|
| PF-06.46 | U (Vitest) | Diálogo de nueva carga: validación previa de extensión/tamaño; listado de errores de estructura de un `422`; mensajes de `409`/`413`/`415` | AC-06.3, AC-06.5 |
| PF-06.47 | U (Vitest) | Detalle: estados `VALIDATED`/`IMPORTING`/`COMPLETED_WITH_ERRORS`/`FAILED`/`CANCELLED`/purgado; confirmación con casilla de advertencias; acciones ocultas sin permiso; aviso de no habilitado | AC-06.13–AC-06.15, AC-06.25 |
| PF-06.48 | U (Vitest) | `route-registry.spec.ts` sigue en verde con `/integraciones/clientes` registrada en router y registro | AC-06.26 |
| PF-06.49 | E | Administrador con el parámetro activo: descarga plantilla → sube CSV con 3 válidas, 1 inválida y 1 duplicada → revisa vista previa → confirma → ve `COMPLETED_WITH_ERRORS` → descarga archivo de errores → abre un cliente importado en su ficha | AC-06.1–AC-06.20 |
| PF-06.50 | E | Usuario sin `importaciones.ver` no ve la opción de menú y la ruta directa muestra acceso denegado | AC-06.26 |

---

## K. Dependencias y orden

### K.1 Requisitos previos

| Requisito | Origen | Bloquea |
|---|---|---|
| Tablas `customer_imports`, `customer_import_rows`, `customers` (con `source_import_id`), enums de importación | Fase 0, migración 7 de `00` §9 | Todo |
| Parámetros `crm.importaciones.*` y de clientes; secuencia `crm.importacion`; permisos `importaciones.ver/crear`; catálogos de clientes; países | Fase 0, semilla esencial (`00` §8.2) | Todo |
| `SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver` | Fase 0 (`00` §11) | Todo |
| Servicio de validación, caso de uso de alta, búsqueda en lote y normalización de clientes (G.1) | Módulo 2 | Todo |
| ADR de la librería de hojas de cálculo (D-06.1), probablemente abierto antes por el Módulo 5 (§7.6) | Módulos 5/6 | Solo XLSX |
| Decisiones DM-4, DM-18 (unicidad, código de cliente) antes de migrar | `00` §10 | Reglas de duplicados |
| Aprobación de habilitación productiva (DM-28, D-06.9) | Responsable del proyecto | Solo el uso en producción, no la implementación |

### K.2 Orden interno de implementación

1. Andamiaje del módulo backend `customer-imports`, puertos y repositorio Prisma; máquina de estados; lector tipado de parámetros si no existe.
2. Detección de tipo, lector CSV, normalización y validación de encabezados (sin dependencias nuevas).
3. Resolución de referencias, integración con el Módulo 2 (V, B, N) y duplicados en archivo → subida y vista previa (CSV).
4. Confirmación asíncrona por filas con el caso de uso C del Módulo 2; detección de interrupción; cancelación.
5. Plantilla y archivo de errores CSV (con `toCsv`).
6. Tras aprobar el ADR: adaptador XLSX (lectura con guardia ZIP, plantilla, archivo de errores).
7. Frontend: historial, nueva carga, detalle; extensión de `httpClient` para multipart; ruta, registro y opción de menú (DM-32).
8. Purga de retención (D-06.12), auditoría completa, documentación, E2E.

### K.3 Dependencias futuras

- Si se aprueba una regla de sobrescritura (DM-28), un modo "actualizar existentes" con su propia especificación.
- Si se resuelve DM-8 y se decide guardar el original o el archivo de errores, se usan `source_file_id` / `error_file_id` sin cambio de esquema.
- Si los volúmenes superan el tope de 10 000 filas, procesamiento en cola (ADR, D-06.7).
- Otras cargas masivas (contactos, proyectos) reutilizarían lector, guardia y máquina de estados, pero requieren alcance aprobado.

---

## L. Archivos de código

Rutas reales del repositorio; los nombres de archivos del Módulo 2 los fija su
especificación.

### L.1 Backend — nuevo módulo `backend/src/modules/customer-imports/`

| Archivo | Contenido |
|---|---|
| `customer-imports.module.ts` | Módulo Nest; importa el módulo de clientes (Módulo 2), `parameters`, `audit` |
| `customer-imports.controller.ts` | Los 9 endpoints de F.1, con `@RequirePermission`, `@Throttle`, interceptor de archivo con límites, OpenAPI completo (incl. `multipart/form-data`, `413`, `415`) |
| `customer-imports.service.ts` | Orquestación: subida/validación, consultas, confirmación, cancelación, archivo de errores, detección de interrupción |
| `customer-import-processor.ts` | Procesamiento en segundo plano por filas (RN-06.21, RN-06.24) |
| `import-status.ts` (+ `.spec.ts`) | Máquina de estados de `ImportStatus` |
| `import-template.ts` (+ `.spec.ts`) | Definición única de columnas (clave, encabezado, longitud, descripción), normalización y validación de encabezados; usada por plantilla, lectura y archivo de errores |
| `file-signature.ts` (+ `.spec.ts`) | Detección del tipo real por firma y coherencia con extensión/`Content-Type` |
| `xlsx-archive-guard.ts` (+ `.spec.ts`) | Lectura del directorio central del ZIP y topes (entradas, tamaño, razón, rutas, macros) sin dependencias |
| `in-file-duplicates.ts` (+ `.spec.ts`) | Agrupación de duplicados dentro del archivo (RN-06.14) |
| `cell-sanitizer.ts` (+ `.spec.ts`) | Recorte, longitud, `FORMULA_NOT_ALLOWED`, `INVALID_CELL_TYPE` (RN-06.11) |
| `error-file.ts` (+ `.spec.ts`) | Construcción del archivo de errores (CSV con `toCsv`; XLSX con `common/xlsx.ts`) |
| `customer-imports.service.spec.ts`, `customer-import-processor.spec.ts` | Unitarias con puertos dobles |
| `dto/customer-import.dto.ts` | DTOs de F.2 |
| `ports/customer-imports.repository.port.ts` | Puerto transaccional (crear carga, guardar filas en lote, transición condicional, contadores, consultas, purga) |
| (sin puerto propio de hojas de cálculo) | Se usa `backend/src/common/xlsx.ts`, el envoltorio de la librería que crea el Módulo 5 (05 L, D-05.1): este módulo le **añade** la lectura por filas en streaming con topes y la escritura de celdas de texto. Ninguna otra pieza importa la librería directamente |

### L.2 Backend — archivos existentes o compartidos

| Archivo | Cambio |
|---|---|
| `backend/src/common/csv-reader.ts` (+ `.spec.ts`) | **Nuevo**: lector CSV RFC 4180 (comillas, `,`/`;`, BOM, CRLF/LF, UTF-8 estricto, topes de línea/columnas), pareja de `csv.ts` (D-06.2) |
| `backend/src/common/csv.ts` | Sin cambios de comportamiento; se reutiliza `toCsv` y la neutralización de fórmulas (se exporta la función de celda si hace falta para XLSX) |
| `backend/src/common/xlsx.ts` (+ `xlsx.spec.ts`) | **Lo crea el Módulo 5** (D-05.1). Este módulo lo amplía con `readRows(buffer, limits)` (streaming, solo valores de texto, fórmulas detectadas, topes de filas/bytes/tiempo) y la plantilla de varias hojas. Si el Módulo 6 se implementa antes, lo crea él con la misma forma |
| `backend/src/infrastructure/database/prisma/repositories/prisma-customer-imports.repository.ts` | **Nuevo**: adaptador Prisma del puerto |
| `backend/src/app.module.ts` | Registrar `CustomerImportsModule` |
| `backend/src/modules/parameters/parameters.service.ts` | Lector tipado de parámetros si Fase 0 no lo creó; protección de `crm.importaciones.habilitada` (D-06.9) |
| `backend/src/modules/access/app-routes.registry.json` | Rutas `/integraciones/clientes` (y la hija si el registro lo requiere) |
| `backend/prisma/seed/access-catalog.ts` | Módulo `integraciones` y opción `integraciones-clientes` (DM-32); los permisos ya vienen de Fase 0 |
| `backend/prisma/seed/crm-parameters.ts` | Verificar que existen los cuatro `crm.importaciones.*` (Fase 0) |
| `backend/prisma/seed-demo.ts` | Activar `crm.importaciones.habilitada` fuera de producción (D-06.9) |
| `backend/prisma/scripts/purge-customer-import-rows.ts` + script en `backend/package.json` | Purga de retención (D-06.12) |
| `backend/package.json` / `pnpm-lock.yaml` | Librería XLSX (tras el ADR) y `@types/multer` (solo tipos de Multer, ya presente vía `@nestjs/platform-express`) |

### L.3 Backend — pruebas

| Archivo | Contenido |
|---|---|
| `backend/test/customer-imports.e2e.spec.ts` | Integración J.1–J.4 contra PostgreSQL efímera |
| `backend/test/support/import-fixtures.ts` | Generadores de CSV/XLSX de prueba, bomba ZIP, XLSX con macro/DTD/cifrado (datos ficticios) |

### L.4 Frontend — `frontend/src/features/crm/customer-imports/` (nuevo, área CRM de D-02.11)

Rutas relativas a `frontend/src/features/crm/`.

| Archivo | Contenido |
|---|---|
| `crm-routes.ts` (lo crea el Módulo 2) | Añadir `/integraciones/clientes` y `/integraciones/clientes/:importId`, permiso `importaciones.ver`, páginas lazy |
| `customer-imports/CustomerImportsPage.tsx` (+ `.spec.tsx`) | E.1 |
| `customer-imports/CustomerImportDetailPage.tsx` (+ `.spec.tsx`) | E.4 |
| `customer-imports/components/NewImportDialog.tsx` (+ `.spec.tsx`) | E.3 |
| `customer-imports/components/TemplateDownloadButton.tsx` | E.2 |
| `customer-imports/components/ImportSummary.tsx`, `ImportRowsTable.tsx`, `ImportStatusChip.tsx`, `ImportRowIssues.tsx`, `ConfirmImportDialog.tsx` | Piezas del detalle |
| `customer-imports/customer-imports.api.ts` | Llamadas con `httpClient` (incluida la subida multipart y las descargas) y tipos que reflejan los DTO |
| `customer-imports/customer-imports.queries.ts` | TanStack Query: historial, detalle (con sondeo cada 2 s en `IMPORTING`), filas, settings; mutaciones de subida, confirmación y cancelación |
| `customer-imports/customer-imports.errors.ts` | Mensajes para `IMPORTS_DISABLED`, `IMPORT_IN_PROGRESS`, `INVALID_IMPORT_FILE`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `INVALID_IMPORT_STATUS`, `IMPORT_CHANGED`, `NO_VALID_ROWS`, `IMPORT_DATA_PURGED` |
| `customer-imports/customer-imports.permissions.ts` | Derivación de acciones visibles desde los permisos del usuario |

El área sigue `frontend/src/features/crm/README.md` (creado por el Módulo 2) y no
importa de `features/crm/customers` salvo por su barril público (`index.ts`), p. ej.
para enlazar a la ficha del cliente.

### L.5 Frontend — archivos existentes

| Archivo | Cambio |
|---|---|
| `frontend/src/services/api/http-client.ts` (+ `.spec.ts`) | Admitir `FormData` como cuerpo (sin `Content-Type: application/json`, el navegador fija el límite multipart) |
| `frontend/src/routes/app-routes.tsx`, `route-paths.ts` | Rutas del módulo |
| `frontend/src/components/layout/MaterialSymbol.tsx` | Icono `upload_file` en `ICON_REGISTRY` |
| `frontend/tests/e2e/customer-imports.e2e.spec.ts` | PF-06.49, PF-06.50 |

### L.6 Documentación

| Archivo | Cambio |
|---|---|
| `docs/adr/ADR-0NN-libreria-hojas-de-calculo.md` | ADR de D-06.1 (próximo número libre; uno solo para Módulos 5 y 6) |
| `API-STANDARDS.md` §3 | Añadir `413` y `415` (D-06.13) |
| `docs/api/README.md` y OpenAPI | Endpoints de F.1 |
| `docs/implementation-plans/crm/00-modelo-de-datos.md` | Anotar `severity` en `errors` y el uso nulo de `source_file_id`/`error_file_id` (D-06.6, D-06.8) |
| `docs/implementation-plans/crm/matriz-trazabilidad.md`, `decisiones-pendientes.md` | Fila F-42 y decisiones D-06.x |
| `CHANGELOG.md` | Nueva funcionalidad y dependencia |

---

## Decisiones pendientes del módulo

### Reutilizadas de `00` §10

| # | Cómo afecta a este módulo | Valor por defecto aplicado |
|---|---|---|
| **DM-28** | Habilitación productiva, sobrescritura, retención de filas | `crm.importaciones.habilitada = false` en producción hasta aprobación; nunca sobrescribe; purga a 90 días |
| **DM-4** | Ámbito de unicidad de código y NIT y reglas blandas que usa la detección de duplicados | Único por país; razón social normalizada → aviso |
| **DM-18** | Si el código de cliente es obligatorio en el archivo | Opcional |
| **DM-19** | Ciudad como texto libre o catálogo (cambiaría la resolución de referencias) | Texto libre |
| **DM-3** | Formatos de NIT y teléfono por país (los aplica el Módulo 2) | Longitud y caracteres permitidos |
| **DM-2** | Países admitidos en la columna País | GT, SV, HN, NI, CR, PA |
| **DM-8** | Guardar el archivo original o el de errores | No se guardan (D-06.8) |
| **DM-11** | Quién recibe `importaciones.*` | Solo `administrador` |
| **DM-13** | Si una referencia a un cliente existente es visible para el usuario | Herencias de `00` §4.2 |
| **DM-32** | Momento de sembrar la opción de menú | Con este módulo |

### Nuevas

| # | Pregunta | Recomendación por defecto | Impacto si cambia |
|---|---|---|---|
| **D-06.1** | ¿Qué librería lee y escribe XLSX? (CLAUDE.md §8.6: **requiere ADR**) | **`exceljs`**, la misma que recomienda el Módulo 5 (D-05.1) para exportar: **un solo ADR** para ambos módulos, que debe cubrir también la **lectura** de archivos no confiables. No se encontró motivo de seguridad para separarlas, siempre que el ADR confirme los puntos de verificación de abajo y la guardia ZIP propia se aplique antes de entregar el archivo a la librería. Detalle (licencia MIT; lee y escribe XLSX, con lector y escritor en streaming; una sola dependencia para lectura, plantilla y archivo de errores). Debe ser **la misma que use el Módulo 5** para la exportación a Excel (§7.6): un ADR para ambos. Alternativas evaluadas: **SheetJS (`xlsx`)** — la versión publicada en npm (0.18.5) está congelada con avisos de seguridad conocidos (contaminación de prototipo y ReDoS) corregidos solo en versiones distribuidas desde la CDN del fabricante, fuera del registro npm: rompe `pnpm audit`, el lockfile verificable y la política de dependencias de SECURITY.md → descartada; **`read-excel-file` + `write-excel-file`** (MIT) — dos paquetes y menos control del streaming; **lector propio sobre un ZIP + parser SAX** — máximo control pero dos dependencias y más código propio. El ADR debe verificar con `pnpm audit` el estado de `exceljs` y de sus dependencias transitivas (descompresión ZIP y XML), su ritmo de mantenimiento, que su parser XML no resuelve entidades externas, y fijar la versión. En todo caso, la librería queda detrás de `backend/src/common/xlsx.ts` (el envoltorio de D-05.1) y la guardia ZIP propia se aplica antes de entregarle el archivo | Sin ADR aprobado no se implementa XLSX (sí CSV). Si se elige otra librería, solo cambia el adaptador |
| **D-06.2** | ¿Lector CSV propio o librería (`csv-parse`, `papaparse`)? | **Propio** (`backend/src/common/csv-reader.ts`, pareja de `csv.ts`): RFC 4180 acotado, sin conversión automática de tipos (que dañaría códigos con ceros a la izquierda), sin dependencia nueva | Con librería: ADR y adaptador; mismas pruebas |
| **D-06.3** | ¿Codificación y delimitador del CSV? | Solo **UTF-8** (con o sin BOM), decodificación estricta; delimitador `,` o `;` detectado en la fila de encabezados (Excel en español guarda con `;`). Un CSV en Windows-1252 se rechaza con instrucción "guardar como CSV UTF-8" | Aceptar Windows-1252 obliga a adivinar la codificación (riesgo de datos corruptos silenciosos) |
| **D-06.4** | ¿Cómo se escriben en el archivo los valores de catálogo, el país y el responsable? | Lo que admite el modo `BY_NATURAL_KEY` del Módulo 2 (D-02.17): `code` de catálogo, `isoCode` de país, código de colaborador o correo del responsable. La columna de la plantilla es una sola ("Responsable comercial") y acepta ambos. La hoja `Valores válidos` muestra código y etiqueta para que el usuario copie el código | Aceptar etiquetas o nombres de país se haría **en el Módulo 2** (resolución `BY_NATURAL_KEY`), no en el importador, para no tener dos resoluciones |
| **D-06.5** | Duplicados dentro del archivo: ¿rechazar todas las filas del grupo o conservar la primera? | **Rechazar todas**: el sistema no puede saber cuál de las versiones es la correcta | Conservar la primera: cambia una regla de `in-file-duplicates.ts` y AC-06.10 |
| **D-06.6** | Duplicados blandos ("avisar"): ¿cómo se confirman en una carga? | Advertencia en fila `VALID`; se importan solo con `includeRowsWithWarnings = true` en la confirmación; si no, `REJECTED`. Añade `severity` a cada incidencia del JSON `errors` (sin cambio de esquema; anotar en `00` §2.14) | Confirmación fila por fila: más pantalla y otro endpoint |
| **D-06.7** | ¿Procesamiento síncrono, en segundo plano en el proceso o en una cola? | Validación síncrona en la subida (acotada por los límites); confirmación `202` en segundo plano **en el mismo proceso**, con exclusividad por transición condicional y detección de interrupción. Sin cola ni planificador (serían una dependencia nueva con ADR) | Cola: ADR, infraestructura (Docker, despliegue) y reintentos; el contrato de la API no cambia |
| **D-06.8** | ¿Se guarda el archivo original y el de errores? | **No** mientras DM-8 no esté resuelto: el original se procesa en memoria; el de errores se genera al vuelo desde `raw_data`. `source_file_id` y `error_file_id` quedan nulos | Guardarlos: depende del ADR de DM-8, retención igual a la de las filas y política antivirus |
| **D-06.9** | Habilitación: ¿quién puede cambiar `crm.importaciones.habilitada` y qué ve el usuario con el módulo deshabilitado? | Cambiarlo exige `parametros.configurar` (como el grupo `seguridad`, PLAN-ADMIN D10), porque es la puerta de la aprobación productiva. Deshabilitado: `409 IMPORTS_DISABLED` en subir/confirmar/cancelar; consulta disponible; opción de menú visible con aviso. La semilla de demo lo activa fuera de producción | Cambia el servicio de parámetros (Módulo 7) y una prueba. Alternativa: ocultar la opción de menú desactivándola |
| **D-06.10** | ¿Quién puede confirmar o cancelar una carga? | Su autor, o un usuario con `importaciones.crear` y alcance `ORGANIZATION` | Solo el autor: más simple, sin `confirmedById` distinto; cambia una guarda |
| **D-06.11** | Valores que empiezan por `=`, `@`, tab o CR en campos de texto libre | Se rechazan al leer (`FORMULA_NOT_ALLOWED`). El Módulo 2 debería aplicar la misma regla en el alta manual para que ambos caminos acepten lo mismo (alinear en `02`) | Aceptarlos: se confía solo en la neutralización al exportar |
| **D-06.12** | Mecanismo de purga de `raw_data` (no hay planificador en el repositorio) | Script versionado `purge-customer-import-rows.ts`, ejecutado por la operación (tarea programada del entorno) y documentado en `docs/deployment/`; idempotente | Planificador en la aplicación: ADR |
| **D-06.13** | Códigos HTTP `413` y `415`, ausentes de la tabla de API-STANDARDS §3 | Usarlos (son los semánticamente correctos y NGINX ya responde `413`) y añadirlos a la norma | Mapear todo a `422`: el `413` de NGINX seguiría existiendo |

---

## Filas para la matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisión pendiente |
|---|---|---|---|---|---|---|---|---|---|---|
| F-42 | 6 Integraciones | Carga masiva de clientes (CSV/XLSX) | §8.1 | [06](06-integraciones.md) | `CustomerImport`, `CustomerImportRow`, `Customer`, `Country`, `CatalogItem` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `User`, `SystemParameter`, `Sequence`, `AuditLog` | Fase 0; Módulo 2 (validación y alta de clientes, F-06); ADR de librería XLSX compartido con F-39 | AC-06.1 – AC-06.31 | PF-06.1 – PF-06.50 | especificada | DM-28 (habilitación productiva), DM-4, DM-18, DM-8; D-06.1 (ADR XLSX, bloquea solo XLSX), D-06.2 – D-06.13 |
