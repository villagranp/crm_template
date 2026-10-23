# Plan de implementación — Carga inicial de datos por scripts con plantilla

- **Origen:** decisión del responsable de negocio (2026-10-15): la vía de carga es **scripts con plantilla ejecutados por quien administra el sistema**, no pantallas en la aplicación. Entidades: **proyectos**, **productos y familias**, **minuto de seguridad**. Tipos de cambio no entran. Los usuarios se añadieron el 2026-10-23 (ADR-030).
- **Estado:** **implementado (2026-10-15)**; lo que difiere de lo definido está en [§11](#11-desviaciones-de-la-implementación).
- **Decisiones que lo enmarcan:** [DM-23](crm/00-modelo-de-datos.md) (catálogo real de productos y familias «por script versionado desde un archivo del negocio»), [06 — Integraciones](crm/06-integraciones.md) (patrón de plantilla, lectura segura y validación), [AJUSTES-1](AJUSTES-1.md) (minuto de seguridad), [ADR-004](../adr/) (puertos y adaptadores), [ADR-025](../adr/ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md).
- **Skills aplicables:** `feature-development`, `requirements-analysis`, `architecture`, `backend-nestjs`, `database`, `security`, `testing`, `coding-standards`, `documentation`, `code-review`. No aplican `api-design`, `authorization` de endpoints ni `frontend-react`: no hay endpoints ni pantallas.
- **ADR:** no se requiere. No hay librería, ORM ni patrón nuevo: es un módulo **sin controladores** que reutiliza los servicios de aplicación existentes y el patrón de plantilla de la carga masiva de clientes.

> Los identificadores son `D-CI.n` (decisión), `RN-CI.n` (regla) y `PF-CI.n` (prueba).

---

## 1. Entendimiento

### 1.1 Requerimiento

Cargar de una sola vez los datos de arranque del sistema —proyectos, el catálogo de productos con sus familias y los minutos de seguridad— desde archivos con una plantilla, sin escribir en la base ni saltarse las reglas de la aplicación: folios, unicidad, visibilidad y auditoría deben ser las de siempre.

### 1.2 Qué existe y qué se añade

| Pieza | Existe hoy | Brecha |
|---|---|---|
| Plantilla, lectura segura y validación | `customer-imports`: firma de archivo, guardia ZIP, lector CSV/XLSX, saneamiento de celdas, archivo de errores | Reutilizarlos para otras entidades; hoy están atados a las columnas de clientes |
| Crear proyectos | `ProjectsService.create` + `ProjectClassificationService.update` | No eran invocables sin HTTP desde otro módulo (no se exportaban) |
| Crear familias y productos | `ProductMastersService.createFamily/createProduct` | Ídem |
| Crear minutos | `SafetyMinutesService.create` | Ídem |
| Carga de catálogo real de productos | DM-23 la prevé «por script versionado»; no existe | El script |

### 1.3 Fuera de alcance

- Tipos de cambio (decisión del responsable). Los **usuarios** entraron después (2026-10-23, ADR-030): entidad `users`.
- **Actualizar** lo que ya existe: la carga solo crea; lo existente se reporta y se omite (D-CI.6).
- Pantallas de carga en la aplicación y endpoints HTTP: no hay ninguno; nada se expone por red.
- Cargar clientes: ya existe la carga masiva (Módulo 6) y es requisito previo (§5.1).

---

## 2. Decisiones

Los valores por defecto los fijó el encargo; D-CI.4 y las marcadas «(propuesta)» son decisiones técnicas tomadas donde el diseño no cerraba, **a confirmar en la revisión**.

| Id | Decisión | Motivo |
|---|---|---|
| **D-CI.1** | Vía = **scripts con plantilla** ejecutados por quien administra el sistema (resuelta por el responsable, 2026-10-15) | Quien carga es el administrador y es una operación de arranque, no de uso diario |
| **D-CI.2** | Entidades `projects`, `products` (familias y productos en el mismo libro) y `safety-minutes` | Resuelta por el responsable |
| **D-CI.3** | **Un solo CLI** `backend/scripts/load-initial-data.ts` (`load:data`) con subcomandos `template`, `validate` y `apply`. `validate` no escribe nada y es lo que corre si se omite el subcomando | Un solo punto de entrada y por omisión seguro |
| **D-CI.4** | **La clave que identifica al cliente en la plantilla de proyectos es el «Código CRM del cliente»** (`customers.crm_code`, p. ej. `CLI-2026-00001`) | Es la única clave **única en todo el sistema** y siempre presente: el «código de cliente» es opcional y único solo por país (o global según `crm.clientes.unicidad_codigo`) y el NIT puede repetirse entre establecimientos. El país del cliente es el valor por defecto del país del proyecto |
| **D-CI.5** | Límites: **5 000 filas** de datos por archivo (suma de hojas), **10 MB**, **30 columnas**, lectura de XLSX con tope de **20 s**; son los de la carga masiva (`crm.importaciones.*`) y viven en constantes (`initial-data-file-reader.ts`) | Mismo riesgo y mismos valores aprobados |
| **D-CI.6** | **Idempotente por defecto**: lo que ya existe (proyecto por código o por cliente + nombre, familia por código, producto por SKU, minuto por fecha) se reporta como «ya existe» y se omite **sin modificarlo** | Repetir la carga nunca duplica ni pisa datos editados |
| **D-CI.7** | **Todo o nada por entidad ante errores de validación**: si `validate` encuentra un error, `apply` no aplica nada. Una vez limpia la validación, cada fila se crea con su servicio, que gestiona su propia transacción; un rechazo del servicio (carrera) es un error de esa fila y la carga sigue | Lo que garantiza la atomicidad es la validación previa; no se abre una transacción gigante sobre servicios que ya tienen la suya |
| **D-CI.8** | En CSV, productos usa dos archivos: `--file` es el de **productos** y el de **familias** es el mismo nombre con el sufijo `-familias` junto a él (opcional) | `plantilla-productos.csv` + `plantilla-productos-familias.csv`; en XLSX, un libro con las hojas «Familias» y «Productos» |
| **D-CI.9** | En texto libre se rechaza el texto que empieza por `=`, `+`, `-` o `@` (y tabulador o retorno de carro), además de las fórmulas reales | La regla pedida es más estricta que la de clientes (`= @ tab CR`, que debe admitir `+`/`-` en teléfonos) |
| **D-CI.10** | La hoja de datos de la plantilla va **vacía**; los ejemplos ficticios están en «Instrucciones» (y en el README) (propuesta) | Un ejemplo olvidado en la hoja de datos se cargaría de verdad |
| **D-CI.11** | Código de salida: **0** sin errores; **1** errores de validación o de aplicación; **2** uso incorrecto, archivo, actor o entorno rechazados; **3** error inesperado (propuesta) | Que un pipeline distinga «corrija el archivo» de «corrija el comando» |
| **D-CI.12** | El actor de `apply` es un usuario **activo**, con el rol de **administrador** vigente y el permiso de la entidad (`proyectos.crear` y `proyectos.administrar`; `productos.configurar`; `minuto_seguridad.crear`). Es el autor (`created_by_id`) y el sujeto de la auditoría | Pedido por el encargo; el permiso de la entidad evita un administrador con roles recortados |
| **D-CI.13** | El informe CSV (hoja, fila, columna, estado, código, motivo) se escribe junto al archivo de entrada en la carpeta de trabajo, solo si hay errores u omitidas, con nombre `informe-carga-<entidad>-<modo>-<marca de tiempo>.csv` y **sin sobrescribir** (`--report` elige la ruta). `.gitignore` excluye `informe-carga-*.csv` (propuesta) | Un informe previo nunca se pierde |
| **D-CI.14** | El script fija `LOG_LEVEL=warn` si no viene en el entorno (propuesta) | El arranque de Nest escribe eventos informativos que estorban en un script; un valor definido en el shell manda |
| **D-CI.15** | El CSV de `template --format csv` y los CSV versionados de `docs/templates/` usan **BOM + LF**; el lector acepta LF y CRLF. `.gitattributes` ya normaliza el texto a LF (`* text=auto eol=lf`) (propuesta) | Un solo formato, estable en el repositorio |
| **D-CI.16** | `template` **no sobrescribe** una plantilla existente: avisa y sale con 2 sin escribir nada, salvo `--force` (propuesta) | Una plantilla editada nunca se pierde |
| **D-CI.17** | Las **advertencias** (`EXISTS_DIFFERENT`, `CLASSIFICATION_FAILED`) no bloquean ni cambian el código de salida (0), pero tienen categoría propia en el resumen y en el informe (estado «Advertencia») (propuesta) | Piden revisión manual sin impedir una carga correcta |


---

## 3. Reglas

| ID | Regla |
|---|---|
| RN-CI.1 | Un archivo se rechaza **completo** si faltan columnas de la plantilla, sobran columnas desconocidas, hay columnas repetidas, la hoja no existe (XLSX), no es un CSV UTF-8 bien formado, supera los límites o no tiene filas. Todas las columnas son obligatorias **en el archivo** aunque el campo sea opcional; el orden es libre; los encabezados se comparan sin mayúsculas ni acentos |
| RN-CI.2 | Lectura segura, en este orden: firma real del archivo (no la extensión) → guardia ZIP (XLSX: sin macros, cifrado, DTD, rutas peligrosas ni bombas de compresión) → lector → encabezados. Es el código de la carga masiva de clientes, sin copias |
| RN-CI.3 | Saneamiento de celdas (el de la carga masiva): recorte (incluido el espacio duro), vacío = ausente, enteros sin notación científica, fórmulas reales de Excel, fechas de Excel, booleanos y errores de celda rechazados. Las fechas se escriben como **texto** `AAAA-MM-DD` (una fecha de Excel es `INVALID_DATE`) |
| RN-CI.4 | Se valida **fila a fila acumulando todos los errores** con hoja, fila (la del archivo: el encabezado es la 1), columna y motivo. Ningún mensaje, informe ni log contiene el contenido de una celda ni datos de la fila |
| RN-CI.5 | Duplicados **dentro del archivo**: familia por código, producto por SKU, proyecto por código y por cliente + nombre (sin acentos ni mayúsculas), minuto por fecha. Todas las filas del grupo se marcan `DUPLICATE_IN_FILE`, citando otra fila |
| RN-CI.6 | **Proyectos.** Obligatorios: nombre y código CRM del cliente (los que exige `ProjectsService.create`; `crm.campos_obligatorios.project` puede añadir otros y el servicio lo hace cumplir). El cliente debe existir, no estar eliminado y, **con actor**, ser visible y activo para él. País: ISO de un país activo (vacío = el del cliente). Responsable: correo o código de colaborador de un usuario activo (vacío = el actor); con actor, asignable por él. Tipo y sector: códigos de catálogo activos. Fecha de fin ≥ fecha de inicio; la de decisión no se restringe. Código de proyecto opcional (vacío = folio `PRY-AAAA-nnnnn`). **`validate` anticipa los obligatorios parametrizados**: lee `crm.campos_obligatorios` (clave `project`) con `ParameterReader` y `projectRequiredFields`, y reporta `REQUIRED_FIELD_MISSING` por fila y columna para los campos que la plantilla trae (ciudad, dirección, descripción, fechas) y, si la fila clasifica (trae tipo o sector), para el tipo y el sector. Si la parametrización exige además la **unidad de medida o la cantidad estimada** al clasificar y alguna fila clasifica, la plantilla no puede cumplirla: `validate` y `apply` abortan con `TEMPLATE_CANNOT_SATISFY` y un mensaje claro, sin escribir nada |
| RN-CI.7 | **Familias y productos.** Las familias se procesan **antes** que los productos. Una familia de un producto puede ser una que ya exista (activa) o una definida en la hoja «Familias» del mismo archivo. Unidad base: código de una unidad activa. Códigos y SKU se guardan recortados y en mayúsculas, con los patrones del maestro (`FAMILY_CODE_PATTERN`, `SKU_PATTERN`) |
| RN-CI.8 | **Minuto de seguridad.** Fecha hoy o futura en la zona del negocio (`crm.zona_horaria_negocio`); las pasadas son error `PAST_DATE`. Mensaje: texto plano de 1 a 1 000 caracteres, sin caracteres de control ni bidi |
| RN-CI.9 | `validate` **no escribe nada**. `apply` valida primero; si hay algún error no aplica nada (D-CI.7); si no, crea cada fila con el servicio de aplicación, lo que deja los eventos de auditoría de siempre (`crm.project.created`, `crm.project.classified`, `crm.product_family.created`, `crm.product.created`, `safety_minute.created`) con el actor indicado |
| RN-CI.10 | `apply` **nunca** se ejecuta sin `--actor` válido; con `NODE_ENV=production` exige además `--confirm-production`. Un actor rechazado se detecta antes de leer el archivo |
| RN-CI.11 | La clasificación del proyecto (tipo y sector) se guarda con `ProjectClassificationService` en modo sin tonelaje (`NONE`); el tonelaje y las reglas de conversión no forman parte de la carga |
| RN-CI.12 | **«Ya existe» no oculta conflictos.** Proyectos: «ya existe» solo si coinciden **cliente y nombre**; si el código ya lo usa un proyecto de **otro cliente o con otro nombre**, es `CODE_CONFLICT` por fila y bloquea `apply` (todo o nada); un proyecto del cliente con el mismo nombre pero otro código se omite con la advertencia `EXISTS_DIFFERENT`. Familias y productos: si el código o el SKU ya existe pero el nombre, la descripción o el orden (familia), o la descripción, la familia o la unidad (producto) difieren, se omite **sin modificar** con la advertencia `EXISTS_DIFFERENT` (sale con 0); una re-ejecución idéntica sigue siendo «ya existe» sin advertencia. Minutos: se compara solo la fecha |
| RN-CI.13 | **Paridad con las validaciones HTTP.** El cargador llama a los servicios sin `ValidationPipe`, así que repite las reglas de los DTO de alta (`CreateProductFamilyDto`, `CreateProductDto`, `CreateSafetyMinuteDto`, `CreateProjectDto`): patrones de código y SKU, longitudes, texto plano del mensaje, normalización a mayúsculas y de CRLF a LF, rangos y fechas. `initial-data-dto-parity.spec.ts` fija la paridad: lo que un DTO rechaza lo rechaza `validate`. Además rechaza el carácter nulo y exige para el **código de proyecto** letras, dígitos, guion y guion bajo (30): `=1+1` o `@x` no pasan |
| RN-CI.14 | **Claves de resolución.** Sin distinguir mayúsculas: correo del responsable o del actor (se guarda en minúsculas), código CRM del cliente (siempre sale del folio `CLI-nnnnn`, en mayúsculas, y se compara sin distinguir mayúsculas), códigos de catálogo (tipo y sector), país (ISO en mayúsculas), familia, unidad y SKU (se normalizan a mayúsculas antes de buscar). Distingue mayúsculas: el **código de colaborador**, tal como está registrado |

---

## 4. Plantillas y columnas

Versión de plantilla: **`1`** (`INITIAL_DATA_TEMPLATE_VERSION`). Definición única en `initial-data-templates.ts`. Archivos versionados en [`docs/templates/`](../templates/README.md).

### 4.1 `projects` — hoja «Proyectos»

| Columna | Obligatoria | Formato |
|---|---|---|
| Nombre del proyecto | Sí | Texto, 200 |
| Código CRM del cliente | Sí | `customers.crm_code`, 30 |
| País | No | ISO de dos letras de un país activo |
| Ciudad | No | Texto, 120 |
| Dirección | No | Texto, 300 |
| Descripción | No | Texto, 10 000 |
| Fecha estimada de inicio | No | `AAAA-MM-DD` |
| Fecha estimada de fin | No | `AAAA-MM-DD`, ≥ inicio |
| Fecha estimada de decisión | No | `AAAA-MM-DD` |
| Responsable | No | Correo o código de colaborador; vacío = el actor |
| Tipo de proyecto | No | Código de `crm.tipo_proyecto` activo |
| Sector | No | Código de `crm.sector_proyecto` activo |
| Código de proyecto | No | 30; vacío = folio automático |

### 4.2 `products` — hojas «Familias» y «Productos»

| Hoja | Columna | Obligatoria | Formato |
|---|---|---|---|
| Familias | Código de familia | Sí | Letras, dígitos, `-` y `_` (1–40) |
| Familias | Nombre | Sí | Texto, 120 |
| Familias | Descripción | No | Texto, 400 |
| Familias | Orden | No | Entero 0–100 000; vacío = 0 |
| Productos | SKU | Sí | Letras, dígitos, espacios y `. _ - /` (1–60) |
| Productos | Descripción | Sí | Texto, 300 |
| Productos | Código de familia | Sí | Familia existente activa o de la hoja «Familias» |
| Productos | Código de unidad base | Sí | Unidad activa |

### 4.3 `safety-minutes` — hoja «Minutos»

| Columna | Obligatoria | Formato |
|---|---|---|
| Fecha de visualización | Sí | `AAAA-MM-DD`, hoy o futura |
| Mensaje | Sí | Texto plano, 1 000 |

### 4.4 Libro XLSX

Hojas de datos (vacías) + «Instrucciones» (hoja, columna, obligatoria, formato, longitud, ejemplo ficticio y versión) + «Valores válidos» (códigos y etiquetas **activos** leídos de la base con `template`; los de `docs/templates/` son los de la semilla esencial). Todas las celdas son de texto. CSV: BOM + encabezados, un archivo por hoja.

---

## 5. Uso

Desde la raíz del repositorio (en PowerShell con `'@app/backend'` entre comillas):

```bash
pnpm --filter @app/backend run load:data -- template projects --format xlsx --out ./plantillas
pnpm --filter @app/backend run load:data -- validate projects --file ./proyectos.xlsx [--actor <correo|codigo>] [--report ./informe.csv]
pnpm --filter @app/backend run load:data -- apply projects --file ./proyectos.xlsx --actor <correo|codigo> [--report ./informe.csv] [--confirm-production]
```

Entidades: `projects`, `products`, `safety-minutes`, `entra-identities` (§5.2). `template` escribe `plantilla-proyectos.xlsx|csv`, `plantilla-productos.xlsx` o `plantilla-productos.csv` + `plantilla-productos-familias.csv`, `plantilla-minuto-seguridad.xlsx|csv` con los valores activos de la base. Sin subcomando (`load:data -- projects --file …`) se valida.

Antes de escribir, el script imprime **servidor, base y esquema** de `DATABASE_URL` (sin credenciales) para que quien lo ejecuta confirme el destino. La salida es un resumen con conteos por hoja (leídas, por crear, creadas, ya existen, con errores), la lista de incidencias (hasta 50 en consola; todas en el CSV) y el resultado. Orden de carga, pasos y manejo de errores: [`docs/templates/README.md`](../templates/README.md). QA: [`qa-windows.md`](../deployment/qa-windows.md) §«Carga inicial de datos».

### 5.2 Vínculos con Entra ID (`entra-identities`, ADR-027)

Quinta entidad del mismo CLI, añadida para el corte a Microsoft Entra ID
([ADR-027](../adr/ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md)). **Excepción al «solo crea
entidades de negocio»:** no crea filas de negocio sino la `UserIdentity` (`ENTRA_ID`, `subject` = `oid`) de un
usuario **existente**. Mismo patrón y garantías que `projects`/`products`: plantilla `plantilla-vinculos-entra`
(`docs/templates/`, v1) con las columnas «Correo o código de colaborador» y «Object ID (oid)»; `validate` no
escribe y es la omisión; `apply` exige `--actor` (administrador activo con `usuarios.editar`); idempotente;
informe sin datos de celdas; lectura segura de archivos.

Reglas: usuario existente y no eliminado (suspendido sí); `oid` con formato GUID (se guarda en minúsculas); un
`oid` ya vinculado a otro usuario es error `IDENTITY_TAKEN`; el mismo `oid` ya vinculado al mismo usuario es
«ya existe»; otro `oid` ya vinculado al usuario es advertencia `EXISTS_DIFFERENT` (se omite sin modificar);
duplicados del `oid` o del usuario en el archivo son error `DUPLICATE_IN_FILE`. Crea **solo** `UserIdentity`
(nunca roles ni permisos) y audita `user.identity_linked`. Se vincula siempre por `oid`, nunca por correo. El
servicio de aplicación es `EntraIdentityLinkService` (módulo de acceso); la lectura de identidades existentes
es el método `findEntraIdentities` del puerto `InitialDataLookup`. Los `*.e2e` están en
`backend/test/sso-entra.e2e.spec.ts`. Uso completo: [`docs/templates/README.md`](../templates/README.md) y el
runbook de [`AUTHENTICATION.md`](../../AUTHENTICATION.md) §4.3.

### 5.1 Orden de carga

**Usuarios → clientes → proyectos** (los proyectos necesitan clientes y responsables ya existentes); **familias → productos** (en el mismo archivo); los minutos son independientes. Si falta un requisito, `validate` lo dice fila por fila (`UNKNOWN_REFERENCE`).

---

## 6. Seguridad

| Control | Cómo |
|---|---|
| Sin superficie de red | `InitialDataLoadModule` no tiene controladores; el script abre un contexto standalone (`NestFactory.createApplicationContext`), sin servidor HTTP |
| Autorización | `apply` exige actor activo con rol de administrador vigente (`AccessService.isAdministrador`) y el permiso de la entidad; los servicios además aplican visibilidad y asignabilidad (proyectos). En producción, `--confirm-production` |
| Archivo no confiable | (la ruta sigue enlaces simbólicos: riesgo bajo, es un CLI de administrador) Firma real, guardia ZIP, límites de filas, columnas, tamaño y tiempo; ruta validada (existe, es archivo, extensión `.csv`/`.xlsx`, ≤ 10 MB) |
| Inyección de fórmulas | RN-CI.3 y D-CI.9 al leer; el informe CSV y las plantillas neutralizan `= + - @ tab CR` al escribir |
| Sin PII | Mensajes y logs citan fila, columna y motivo, nunca el valor. Un rechazo de servicio aporta su código y los nombres de campo, no su mensaje; un error inesperado, solo el nombre de su clase. `--actor` no se repite en ningún mensaje. No se registran contraseñas |
| Escritura solo por servicios | Ninguna escritura directa con Prisma. El puerto `InitialDataLookup` (adaptador `PrismaInitialDataLookupRepository`) solo **lee** para resolver códigos y comprobar existentes |
| Auditoría | La de cada servicio, con el actor como sujeto (`actorId`, `actorEmail`) y un `correlationId` por ejecución |
| Sin secretos | No se versiona ninguna credencial; las plantillas usan datos ficticios y correos `example.invalid` |

---

## 7. Servicios reutilizados

| Entidad | Servicio | Qué se obtiene |
|---|---|---|
| Proyectos | `ProjectsService.create` | Cliente utilizable (`CustomerReferenceGuard`), país por defecto del cliente, asesor asignable, código manual solo con `proyectos.administrar`, folio `PRY-AAAA-nnnnn`, fase inicial, auditoría `crm.project.created` |
| Proyectos | `ProjectClassificationService.update` | Tipo y sector validados contra catálogo, auditoría `crm.project.classified` |
| Proyectos (previo) | `CustomerReferenceGuard.assertUsableCustomer`, `ProjectAccessService.isAssignableOwner` | Con actor, reporta en la validación lo que el servicio rechazaría después |
| Familias y productos | `ProductMastersService.createFamily`, `createProduct` | Unicidad (`409`), familia y unidad activas, auditoría `crm.product_family.created` y `crm.product.created` |
| Minutos | `SafetyMinutesService.today`, `create` | «Hoy» en la zona del negocio, regla de fecha pasada, unicidad por fecha, auditoría `safety_minute.created` |

Los cuatro servicios no se exportaban de sus módulos: `ProjectsModule` (`ProjectsService`, `ProjectClassificationService`), `ProductsModule` (`ProductMastersService`) y `SafetyMinutesModule` (`SafetyMinutesService`) los exportan ahora (aditivo). **Ningún caso de uso necesitó atajo**: todos se invocan sin HTTP con un actor `{ userId, permissions, audit }` construido como lo hace `CustomerActorResolver.fromRequest`, sin `request`.

---

## 8. Plan de pruebas

**Unitarias** (`src/modules/initial-data-load/`):

| Archivo | Cubre |
|---|---|
| `initial-data-templates.spec.ts` | Definición (claves y encabezados únicos), plantillas generadas (CSV y XLSX) y **PF-CI.1: los encabezados y la versión de las plantillas versionadas en `docs/templates/` coinciden con los del código** |
| `initial-data-file-reader.spec.ts` | Lectura CSV/XLSX, numeración de filas, columnas que faltan, sobran o repetidas, hojas obligatorias en XLSX (sin recurrir a la primera), archivos vacíos, codificación, formato, límite de filas, firma |
| `initial-data-dto-parity.spec.ts` | RN-CI.13: valores que cada DTO de alta rechaza o acepta frente a `validate`, por entidad |
| `initial-data-rows.spec.ts` | Saneamiento (fórmulas `= + - @`, longitud, fechas, enteros, tipos de celda), obligatorios, validación por fila de cada entidad, duplicados dentro del archivo, mensajes sin valores |
| `initial-data-report.spec.ts` | Conteos, resumen de consola, límite de incidencias, CSV del informe (BOM, neutralización), código de salida |
| `initial-data-loader.service.spec.ts` | Resolución por código y por correo, «ya existe», actor (inexistente, inactivo, sin rol, sin permiso), orden familias → productos, todo o nada, rechazo de servicio por fila sin datos, clasificación fallida |
| `cli/load-initial-data.cli.spec.ts` | Argumentos, validación de rutas, CSV hermano de familias, producción, informe, códigos de salida |
| `common/xlsx.spec.ts` | `exactSheet` |

**Integración** (`backend/test/initial-data-load.e2e.spec.ts`, esquema `integration_carga_inicial`): recorrido real del CLI con archivos en disco, PostgreSQL y los servicios reales: `template` con los valores activos de la base; `validate` que no escribe; `apply` que crea y deja auditoría con el actor; segunda ejecución idempotente (todo «ya existe», sin duplicados ni eventos nuevos); archivo con errores que no aplica nada (informe con fila, columna y motivo y sin datos); actor inexistente, sin rol de administrador y suspendido; `--confirm-production`; fecha pasada; familia, unidad y cliente inexistentes; estructura inválida; fórmulas; además dos pruebas que arrancan `ts-node scripts/load-initial-data.ts` de verdad (contexto standalone de Nest, códigos de salida 0, 1 y 2).

**Resultado (2026-10-15, tras la revisión):** `typecheck`, `lint --max-warnings 0` y `pnpm build` en verde; unitarias del backend 1 882 pruebas en 146 suites; integración completa con `INTEGRATION_SCHEMA=integration_carga_inicial` 1 269 pruebas en 58 suites (31 en `initial-data-load.e2e.spec.ts`). Los obligatorios parametrizados se simulan en la prueba de integración sin tocar el parámetro global (las suites corren en paralelo).

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Ejecutar `apply` contra la base equivocada | El script imprime servidor, base y esquema antes de escribir; `--confirm-production`; `validate` por omisión; el procedimiento de QA lo pide primero en `validate` |
| Carga a medias si un servicio rechaza una fila después de validar (carrera) | El rechazo queda como error de esa fila (con «vuelva a ejecutar la carga» si es un conflicto `409`) y el informe lo lista; volver a ejecutar es seguro porque lo creado se omite como «ya existe» (D-CI.6) |
| Proyecto creado sin clasificación si falla el guardado de tipo y sector después del alta | Casi imposible (tipo y sector y los obligatorios parametrizados se validan antes). Se cuenta aparte: **creada con advertencia** (`CLASSIFICATION_FAILED`), ni «creada» ni «con error», sin doble conteo. **Reparación:** abrir el proyecto en la aplicación (Proyectos) y guardar su tipo y sector; repetir `apply` lo omite como «ya existe» y no lo arregla |
| La auditoría se escribe después de cada alta y fuera de su transacción (compromiso conocido de `AuditService`) | Se hereda; el fallo de la auditoría detiene esa fila con error, no deja un error silencioso |
| Un administrador pierde el archivo de informe | No se sobrescribe y el resumen de consola trae las primeras 50 incidencias |
| Datos personales en los archivos de entrada (correos de responsables) | Los archivos los custodia quien carga; ningún informe ni log los repite; borrar el archivo tras la carga (README de plantillas) |
| Plantilla versionada desactualizada respecto al código | PF-CI.1 falla si los encabezados o la versión no coinciden |

---

## 10. Archivos

**Nuevos.** `backend/scripts/load-initial-data.ts` (entrada del CLI), `backend/scripts/generate-initial-data-templates.ts` (regenera `docs/templates/`), `backend/src/modules/initial-data-load/` (`initial-data-templates.ts`, `initial-data-file-reader.ts`, `initial-data-rows.ts`, `initial-data-report.ts`, `initial-data-template-files.ts`, `initial-data-loader.service.ts`, `initial-data-load.module.ts`, `ports/initial-data-lookup.port.ts`, `cli/load-initial-data.cli.ts` y sus `*.spec.ts`), `backend/src/infrastructure/database/prisma/repositories/prisma-initial-data-lookup.repository.ts`, `backend/test/initial-data-load.e2e.spec.ts`, `docs/templates/` (plantillas versionadas y README), este documento.

**Modificados (aditivos).** `app.module.ts` (registra `InitialDataLoadModule`), `projects.module.ts`, `products.module.ts` y `safety-minutes.module.ts` (exportan sus servicios), `common/xlsx.ts` (`exactSheet`), `customer-imports/cell-sanitizer.ts` (el saneamiento acepta cualquier columna con la forma `SanitizableColumn`; `ImportColumn` la cumple y el comportamiento de la carga masiva no cambia), `backend/package.json` (`load:data`, `load:data:templates`), `.gitignore`, `CHANGELOG.md`, `docs/deployment/qa-windows.md`.

---

## 11. Desviaciones de la implementación

1. **La clave del cliente es el código CRM** y no «código de cliente o NIT» (D-CI.4): ni el código de cliente ni el NIT identifican de forma inequívoca.
2. **El libro de productos tiene las hojas «Familias» y «Productos»** y, en CSV, el archivo de familias es opcional y va junto al de productos (D-CI.8).
3. **La hoja de datos va vacía** y los ejemplos están en «Instrucciones» (D-CI.10): `docs/templates/` no trae filas de ejemplo; el README las muestra.
4. **`validate` acepta `--actor` opcional**: con él, además de lo que lee de la base, comprueba lo que los servicios comprobarían (cliente visible y activo, responsable asignable) para que `apply` no descubra esos errores a mitad de carga. Sin él no se puede comprobar la visibilidad.
5. **`backend/scripts/` no pasa por `lint` ni `typecheck`** (igual que `e2e-stack.ts`): los dos archivos del directorio son solo el arranque; toda la lógica está en `src/modules/initial-data-load/`, que sí. La prueba de integración arranca el script de verdad.
6. **Sin metadato de origen en la auditoría**: los servicios no admiten distinguir «carga inicial» en el evento; el origen es el actor y el `correlationId` de la ejecución.
7. **La descripción de «Ya existe» es más estricta** que el encargo original (D-CI.6): se distingue de un conflicto (RN-CI.12).
8. **Sin binario compilado**: el script corre con `ts-node` como la semilla (`prisma:seed`). El módulo sí se compila con el build, así que un script `node dist/…` equivalente es posible si la operación lo pide.
