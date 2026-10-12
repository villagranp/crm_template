# 03 — Módulo 3: Proyectos

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §5 (5.1–5.11), con §1, §2, §4.4, §6.3, §7.1–§7.3, §9.2–§9.5, §10–§13
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md) (entidades, catálogos, parámetros, permisos, visibilidad, DM-n). Esta especificación **usa** ese contrato; no crea entidades ni tablas nuevas
- **Trazabilidad:** F-10 … F-20 de [`matriz-trazabilidad.md`](matriz-trazabilidad.md)
- **Alineado con:** [`02-clientes-cuentas.md`](02-clientes-cuentas.md) (D-02.1 opciones de formulario por módulo, D-02.10 disponibilidad por menú, D-02.11 área `features/crm`, D-02.12 registro de rutas con parámetro, `CustomerReferenceGuard`, piezas transversales F.6.5, contrato F-08), [`04-actividad-comercial.md`](04-actividad-comercial.md) (puntos de entrada embebidos, `last_activity_at`), [`01-inicio-dashboard.md`](01-inicio-dashboard.md) (predicados DEF-A…G de `commercial-metrics`, filtros de navegación E.3), [`05-reportes.md`](05-reportes.md) (RN-05.15–18, forma de `commercialStatus`)
- **Decisiones que lo enmarcan:** [ADR-004](../../adr/ADR-004-data-access-abstraction.md), [ADR-005](../../adr/ADR-005-rest-api-standard.md), [ADR-008](../../adr/ADR-008-authorization.md), [ADR-014](../../adr/ADR-014-modular-clean-architecture.md), [ADR-017](../../adr/ADR-017-design-system-grupo-ag.md), [ADR-018](../../adr/ADR-018-identity-access-model.md), [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md), [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md) (adjuntos), [ADR-024](../../adr/ADR-024-moneda-base-usd-y-tipos-de-cambio.md) (moneda base USD y tipos de cambio)
- **Estado:** especificada (documentación). **No** se ha tocado código, esquema, migraciones ni semillas. Decisiones del módulo resueltas por el responsable de negocio el 2026-10-10 (estimación en USD o moneda del país, DM-36; adjuntos desbloqueados, ADR-021)
- **Skills aplicables:** `feature-development`, `requirements-analysis`, `user-story`, `api-design`, `architecture`, `backend-nestjs`, `database`, `prisma`, `authorization`, `access-management`, `security`, `frontend-react`, `design-system`, `testing`, `observability`, `documentation`, `code-review`

> Núcleo de la operación comercial. Once funcionalidades relacionadas entre sí:
> proyecto, ficha, duplicado, búsqueda, vista de equipo, clasificación, fase del
> cliente, oportunidades, resultados, productos asociados y forecast M+6.
> Dos ejes que **nunca se acoplan**: la **fase del cliente** (avance de la obra,
> vive en el proyecto) y la **etapa comercial** (avance de la venta, vive en cada
> oportunidad).

---

## Índice

- [A. Objetivo funcional](#a-objetivo-funcional)
- [B. Alcance completo](#b-alcance-completo)
- [C. Reglas de negocio](#c-reglas-de-negocio)
- [D. Modelo de datos utilizado](#d-modelo-de-datos-utilizado)
- [E. Pantallas y componentes](#e-pantallas-y-componentes)
- [F. Servicios y contratos](#f-servicios-y-contratos)
- [G. Relaciones e integraciones internas](#g-relaciones-e-integraciones-internas)
- [H. Seguridad](#h-seguridad)
- [I. Criterios de aceptación](#i-criterios-de-aceptación)
- [J. Pruebas funcionales](#j-pruebas-funcionales)
- [K. Dependencias y orden](#k-dependencias-y-orden)
- [L. Archivos de código a implementar](#l-archivos-de-código-a-implementar)
- [Decisiones del módulo (resueltas el 2026-10-10)](#decisiones-del-módulo-resueltas-el-2026-10-10)
- [Precisiones de implementación (2026-10-11)](#precisiones-de-implementación-2026-10-11)
- [Filas para la matriz](#filas-para-la-matriz)

---

## A. Objetivo funcional

El módulo de Proyectos registra y gobierna las **obras o iniciativas de un
cliente** sobre las que se vende, y todo lo comercial que cuelga de ellas:

| Responsabilidad | Qué resuelve |
|---|---|
| Proyecto (alta, ficha, edición, duplicado, eliminación lógica) | Un registro único por obra, ligado a un cliente válido y a un asesor responsable |
| Búsqueda y vista de equipo | Encontrar proyectos con filtros combinables y ver los del equipo según el perfil, distinguiendo **ver** de **editar** |
| Clasificación | Tipo, sector o uso, unidad de medida y estimación de tonelaje con reglas de conversión configurables (sin factores fijos) |
| Fase del cliente | Avance de la obra (Diseño → Cotización → Construcción → Finalizado) con porcentaje e historial, **independiente** de las oportunidades |
| Oportunidades y resultados | Pipeline comercial por oportunidad (etapas configurables con transiciones validadas), su estimación (monto en USD o en la moneda del país del proyecto, con equivalente en USD, DM-36) y su resultado (Ganado, Perdido, Parcial) con las reglas del alcance, aplicadas en backend **y** en base de datos |
| Productos asociados | Cantidades comerciales y tonelajes por producto en el proyecto (y opcionalmente en una oportunidad), separados del maestro de productos |
| Forecast M+6 | Matriz editable de proyección mensual a seis meses, con línea única por proyecto-producto-período, ventana móvil sin borrar historia y totales solo en toneladas |

**Proveedor de datos** para Clientes (§4.4, proyectos del cliente), Actividad
comercial (vincular visitas y actividades a proyectos y oportunidades), Inicio
(indicadores, alertas, actividad reciente) y Reportes (proyectos, oportunidades,
forecast, embudo). **No** es dueño de clientes, usuarios, productos maestros,
catálogos, visitas ni actividades: los consume.

---

## B. Alcance completo

Cada subapartado del alcance se cubre íntegro. Nada se excluye; lo que depende
de una decisión abierta se especifica igualmente y se marca.

### B.1 Crear proyecto (§5.1 → F-10)

Formulario con: identificador único (UUID, generado), código de proyecto
(`PRY-AAAA-nnnnn`, generado; DM-17), nombre, cliente, país, ciudad o ubicación,
dirección, descripción, fechas estimadas (inicio y fin), fecha estimada de
decisión, asesor responsable y archivos adjuntos. Reglas: identificador único,
cliente válido, obligatorios, coherencia de fechas, asesor asociado, fecha y
usuario de creación, documentación adjunta (almacenamiento según ADR-021, ver
B.2 sección 9).

### B.2 Consultar y editar proyectos (§5.2 → F-11)

Ficha organizada en **diez secciones**, cada una consultable y editable según
rol y permisos, con auditoría de las modificaciones relevantes:

| # | Sección | Contenido | Dueño de los datos |
|---|---|---|---|
| 1 | Información general | Código, nombre, cliente, país, ciudad, dirección, descripción, fechas estimadas, fecha estimada de decisión, asesor, estado comercial derivado (DM-16), proyecto de origen si es duplicado, creado/actualizado por y cuándo, última actualización | Módulo 3 |
| 2 | Clasificación | Tipo, sector o uso, unidad de medida, cantidad estimada, regla de conversión aplicada, factor, tonelaje estimado (calculado o manual, DM-24) | Módulo 3 |
| 3 | Fase del cliente | Fase actual, porcentaje, fecha de actualización, comentario, historial | Módulo 3 |
| 4 | Oportunidades | Lista de oportunidades del proyecto con etapa, fecha, asesor, estimación (monto original con su moneda y equivalente en USD; tonelaje), siguiente acción; crear, editar, cambiar etapa | Módulo 3 |
| 5 | Resultados | Resultado vigente de cada oportunidad cerrada (resultado, motivo, % adjudicado, fecha de decisión, comentarios), resumen por resultado, historial de resultados | Módulo 3 |
| 6 | Productos asociados | SKU, descripción, familia, unidad, cantidad, tonelaje, estado, oportunidad; totales | Módulo 3 |
| 7 | Forecast | Matriz M+6 del proyecto (misma pieza que la pantalla de forecast, filtrada) | Módulo 3 |
| 8 | Seguimiento comercial | Última interacción, próxima acción, responsable, fecha de próxima acción, notas, adjuntos, trazabilidad | **Módulo 4** (aquí solo se consulta, §F.4) |
| 9 | Adjuntos | Archivos del proyecto: listar, subir, descargar, eliminar | Módulo 3 (almacenamiento: `FileStorage`, ADR-021) |
| 10 | Historial de cambios | Línea de tiempo: historial de fase, de etapas, de resultados y entradas de auditoría del proyecto y sus hijos | Módulo 3 (lee `audit_logs`) |

Además (00 §5.2, DM-33): **eliminación lógica** del proyecto con
`proyectos.eliminar`, que no borra información histórica.

### B.3 Duplicar proyecto (§5.3 → F-12)

Crear un proyecto nuevo a partir de otro, reutilizando datos generales
seleccionados; solicitar o confirmar nuevo nombre (y código, DM-17), cliente,
fechas y asesor; nuevo identificador; lista exacta de lo que **no** se copia en
RN-03.20–RN-03.23.

### B.4 Buscar proyectos (§5.4 → F-13)

Filtros combinables: nombre, código, cliente, país, ciudad o ubicación, asesor,
tipo de proyecto, fase, etapa de oportunidad y fechas. Ordenamiento, paginación
y navegación al detalle.

### B.5 Visualización de proyectos del equipo (§5.5 → F-14)

Consulta compartida según el perfil (Asesor, Jefe, Supervisor, Responsable de
país, Administrador). Columnas: proyecto, cliente, responsable, equipo, estado o
fase y última actualización. Distingue visibilidad de permiso de edición.

### B.6 Clasificación de proyectos (§5.6 → F-15)

Tipo de proyecto, sector o uso, unidad de medida y regla de conversión o
estimación de tonelaje, con catálogos y reglas configurables; sin factores fijos
en formularios ni componentes; validación de que la conversión aplicada es
válida.

### B.7 Fase del cliente (§5.7 → F-16)

Fases Diseño, Cotización, Construcción y Finalizado (catálogo
`crm.fase_cliente`); campos fase actual, porcentaje, fecha de actualización y
comentario; porcentaje 0–100; historial; independencia total de la etapa
comercial.

### B.8 Oportunidades comerciales (§5.8 → F-17)

Pipeline con etapas Contactado, Cotizando, Ganado, Perdido (catálogo
`crm.etapa_oportunidad`); campos identificador, proyecto, etapa, fecha, asesor,
estimación, siguiente acción; crear, consultar, editar, cambiar etapa, filtrar
por etapa y asesor, historial; varias por proyecto; transiciones validadas; la
etapa no modifica la fase. La estimación (DM-1, DM-36) es un monto en USD o en la
moneda del país del proyecto, guardado con la foto del tipo de cambio y su
equivalente en USD (RN-03.38, RN-03.78–RN-03.83), más un tonelaje opcional.

### B.9 Resultado de oportunidades (§5.9 → F-18)

Resultados Ganado, Perdido, Parcial; campos resultado, motivo, porcentaje
adjudicado, fecha de decisión, comentarios; motivo obligatorio si perdido,
porcentaje obligatorio si parcial, porcentaje 0–100, fecha de decisión,
auditoría; el parcial no genera etapa nueva.

### B.10 Productos asociados (§5.10 → F-19)

Relación producto ↔ proyecto (y oportunidad opcional) con SKU, descripción,
familia, unidad, cantidad, tonelaje, estado, proyecto y oportunidad. Buscar en
el catálogo local, seleccionar, asociar a proyectos y oportunidades, registrar
cantidades y tonelajes, editar, consultar en la ficha. Maestro separado de las
cantidades.

### B.11 Forecast comercial M+6 (§5.11 → F-20)

Matriz editable M+1…M+6 con proyecto, producto, año, mes, cantidad, unidad,
tonelaje, asesor y fecha de actualización. Registrar, editar, calcular
tonelajes, totales por período, total acumulado, filtros por proyecto, producto,
asesor y mes, fecha de actualización visible, forecast en la ficha. Línea única,
sin duplicados, sin negativos, con reglas de conversión, sin sumar unidades
incompatibles, ventana móvil, historia conservada, auditoría.

### B.12 Fuera del alcance de este módulo

| Qué | Dónde vive |
|---|---|
| Mantenimiento del maestro de productos, familias, unidades y reglas de conversión | Módulo 7 / carga por script (DM-23, DM-24). Aquí solo se **leen** |
| Mantenimiento de catálogos y parámetros (`crm.fase_cliente`, `crm.oportunidades.transiciones_etapa`…) | Módulo 7 (ya existe la pantalla genérica, PLAN-ADMIN) |
| Visitas, actividades, seguimiento, historial de interacciones | Módulo 4. Aquí solo se consulta su contrato para la sección 8 |
| Reportes, exportación a Excel, embudo | Módulo 5. Aquí no hay exportación (00 §5.2) |
| Indicadores y alertas | Módulo 1 (consume `projects.last_activity_at`, etapas, resultados, forecast) |
| Almacenamiento físico de los adjuntos | Transversal: puerto `FileStorage` + adaptador `LocalFileSystemStorage` (ADR-021), entregado con el Módulo 2; aquí solo se usa a través de `AttachmentsService` |
| Mantenimiento de monedas y tipos de cambio | Módulo 7, dentro de F-46 (extensión de alcance aprobada, 00 §2.16). Aquí solo se **leen** con `ExchangeRateReader` |

---

## C. Reglas de negocio

Notación: **[BD]** = la base de datos lo garantiza (CHECK, FK, único); **[CU]** =
el caso de uso lo valida en backend; **[P]** = depende de un parámetro de
`system_parameters`. Toda regla [BD] se valida también en [CU] para devolver un
error de negocio claro (la restricción de base es la red de seguridad).

### C.1 Proyecto: alta y edición

| ID | Regla | Garantía | Error |
|---|---|---|---|
| RN-03.1 | El identificador es un UUID generado por el sistema; el código se genera con `Sequence 'crm.proyecto'` (`PRY-{year}-{seq}`, 5 dígitos, reinicio anual) en la **misma transacción** del alta con bloqueo de fila. Es inmutable salvo con `proyectos.administrar` (DM-17), y único | [BD] `projects.code @unique` + [CU] | `409 PROJECT_CODE_TAKEN` |
| RN-03.2 | El cliente debe existir, no estar eliminado (`deletedAt` nulo) y ser **visible** para el usuario (00 §4.2, herencia DM-13). Un cliente cuyo estado tiene `metadata.isActive = false` no admite proyectos nuevos (D-03.4 = D-02.16). Se valida **solo** con `CustomerReferenceGuard.assertUsableCustomer(customerId, actor, { requireActive: true })` del Módulo 2 (02 F.6.3): no existe, eliminado o no visible → `404` (no revela existencia); inactivo → `422 CUSTOMER_INACTIVE`. En una edición que no cambia el cliente no se exige `requireActive` | [BD] FK + [CU] | `404 RESOURCE_NOT_FOUND` / `422 CUSTOMER_INACTIVE` |
| RN-03.3 | Obligatorios mínimos: nombre, cliente, país, asesor (base) más los que añada `crm.campos_obligatorios.project` [P] (leído con `ParameterReader`). El parámetro solo puede **añadir** obligatorios | [BD] NOT NULL + [CU] [P] | `400 VALIDATION_FAILED` (DTO) / `422 REQUIRED_FIELD_MISSING` (con `details[].field`) |
| RN-03.4 | Coherencia de fechas: fin estimado ≥ inicio estimado. La fecha estimada de decisión no se restringe respecto a inicio/fin (DM-16). Todas son fechas de calendario `date` (DM-31), sin hora | [BD] `ck_projects_estimated_dates` + [CU] | `422 INVALID_DATE_RANGE` |
| RN-03.5 | País activo de `countries`; por defecto, el país del cliente. Ciudad o ubicación es texto libre (DM-19) | [BD] FK + [CU] | `422 UNKNOWN_REFERENCE` |
| RN-03.6 | Asesor responsable: por defecto, el usuario que crea. Asignar a otro usuario (en alta, edición o duplicado) exige `proyectos.administrar` (DM-34) y que el destino sea un usuario `ACTIVE`, con algún rol del CRM y **dentro del alcance** de quien asigna (D-03.16). Mismo criterio que `salesOwnerId` en 02 | [CU] | `403 FIELD_NOT_EDITABLE` / `422 INVALID_OWNER` |
| RN-03.7 | Al crear: fase = `crm.valores_por_defecto["project.phaseId"]` [P] (`DISENO`), porcentaje = `metadata.defaultProgress` de esa fase o 0, `phaseUpdatedAt = ahora`, y una primera fila en `project_phase_history` (`fromPhaseId = null`) | [CU] | — |
| RN-03.8 | Se registran `createdAt`/`createdById`, `updatedAt`/`updatedById` y una entrada de auditoría `crm.project.created` (`resourceType = crm.project`) | [CU] | — |
| RN-03.9 | **Última actualización** (`lastActivityAt`): se actualiza en la **misma transacción** de toda mutación del proyecto o de algo suyo dentro de este módulo (datos generales, clasificación, fase, oportunidad, etapa, resultado, producto asociado, línea de forecast, adjunto). Es la fecha que muestran la vista de equipo, Inicio y Reportes (00 §2.6, DM-16) | [CU] | — |
| RN-03.10 | Cambiar el **cliente** de un proyecto solo es posible si no tiene visitas ni actividades vinculadas (la FK compuesta con `onUpdate: Restrict` lo impide en base) | [BD] + [CU] | `409 PROJECT_CUSTOMER_LOCKED` |
| RN-03.11 | Elementos de catálogo escritos por el módulo (`projectTypeId`, `sectorId`, `phaseId`, `stageId`, `reasonId`, `statusId` de producto asociado) se validan con `CatalogReferenceValidator.assertItem(catalogKey, id, { requireActive })`: en alta o cambio, activo; en edición sin cambio, se conserva aunque se haya desactivado (00 §3.5) | [CU] | `422 INVALID_CATALOG_VALUE` |
| RN-03.12 | Eliminación siempre **lógica** (`deletedAt`) con `proyectos.eliminar`; bloqueada si el proyecto tiene oportunidades abiertas (etapa con `isClosed = false`), productos asociados activos con forecast futuro, o visitas no canceladas / actividades abiertas vinculadas (DM-33). Un proyecto eliminado desaparece de búsquedas y vistas y responde `404`; su historia se conserva | [CU] | `409 PROJECT_HAS_ACTIVE_CHILDREN` |
| RN-03.13 | Auditoría de modificaciones relevantes: toda mutación escribe en `audit_logs` el evento `crm.<recurso>.<acción en pasado>` con la diferencia `{campo: {antes, despues}}`; una edición que no cambia nada no deja registro (comportamiento existente de `AuditService`). Las entradas de entidades hijas llevan `metadata.projectId` | [CU] | — |

### C.2 Estado comercial derivado (lectura)

| ID | Regla |
|---|---|
| RN-03.14 | **Estado comercial del proyecto** (DM-16 = DEF-B de 01 = RN-05.17): si tiene oportunidades abiertas → la etapa abierta de mayor `metadata.order`; si no hay abiertas y alguna tiene resultado `WON` o `PARTIAL` → "Ganado"; si todas las cerradas son `LOST` → "Perdido"; sin oportunidades no eliminadas → "Sin oportunidades". Se calcula con subconsulta agregada por proyecto (nunca un `JOIN` que multiplique filas), no se almacena (P4). Forma en la API (igual que 05): `commercialStatus { kind: OPEN_STAGE\|WON\|LOST\|NO_OPPORTUNITIES, label, stage: { id, code, label } \| null }` |
| RN-03.15 | **Proyecto activo** (DM-16 = KPI-01 = RN-05.15): no eliminado y fase con `metadata.isFinal = false` |
| RN-03.77 | **Fuente única de fórmulas** (01 RN-01.10): "oportunidad abierta/cerrada" (DEF-A), estado comercial (DEF-B), última actualización (DEF-C) y ventana de forecast (DEF-G) se usan desde los predicados de `backend/src/modules/commercial-metrics/metric-definitions.ts`. Como el Módulo 3 se implementa **antes** que Inicio (ALCANCE §11), este módulo **crea** ese archivo con DEF-A, DEF-B, DEF-C y DEF-G (puros, sin Prisma) en la ubicación que fija 01; el Módulo 1 lo completa con el resto y con `CommercialMetricsService`. Ningún archivo de `projects`/`opportunities`/`forecast` consulta `metadata.isClosed`/`isFinal` directamente (la prueba de arquitectura PF-01.24 lo vigila) |

### C.3 Búsqueda y vista de equipo

| ID | Regla |
|---|---|
| RN-03.16 | Los filtros se combinan con **Y**. `search` abarca nombre y código (contiene, sin distinguir mayúsculas ni acentos); `city` es "contiene". El filtro por etapa devuelve los proyectos con **al menos una** oportunidad no eliminada en esa etapa, **sin duplicar** el proyecto (subconsulta `EXISTS`, nunca `JOIN` que multiplique filas) |
| RN-03.17 | El filtro de fechas exige `dateField` ∈ `estimatedDecisionDate`, `estimatedStartDate`, `estimatedEndDate`, `createdAt`, `lastActivityAt` y `dateFrom ≤ dateTo` (`422 INVALID_DATE_RANGE`) |
| RN-03.18 | Todo listado aplica primero el **alcance de visibilidad** del usuario (00 §4.2). Un filtro (por asesor, equipo o país) nunca amplía el alcance: se intersecta con él. Un equipo fuera del alcance produce un resultado vacío, no un error que revele su existencia |
| RN-03.19 | Cada fila y cada ficha devuelven `capabilities` calculadas por el backend (`canEdit`, `canAdminister`, `canDelete`, `canDuplicate`, `canCreateOpportunity`, `canEditForecast`) a partir de permisos + propiedad (DM-34). El frontend las usa para mostrar u ocultar acciones; el backend vuelve a decidir en cada mutación |

### C.4 Duplicado

| ID | Regla |
|---|---|
| RN-03.20 | **Se solicita o confirma** (obligatorio en el diálogo): nombre nuevo (obligatorio, distinto de vacío), cliente (por defecto el del origen; válido según RN-03.2), fechas estimadas de inicio, fin y decisión (por defecto las del origen; RN-03.4), asesor responsable (por defecto el del origen; RN-03.6). El código se genera nuevo; introducirlo a mano exige `proyectos.administrar` (DM-17) |
| RN-03.21 | **Se copian si el usuario los selecciona** (marcados por defecto): país, ciudad, dirección, descripción y clasificación (tipo, sector, unidad, cantidad estimada). El tonelaje estimado **no** se copia: se recalcula con la regla vigente al duplicar (RN-03.27); si el origen tenía estimación manual, se copia como manual |
| RN-03.22 | **Se copian solo si el usuario lo marca** (desmarcado por defecto): productos asociados activos, con el estado inicial del catálogo `crm.estado_producto_asociado` (primer elemento activo por `sortOrder`, `PROPUESTO`), **sin oportunidad**, con su cantidad y unidad, y tonelaje recalculado con las reglas vigentes (00 §2.6) |
| RN-03.23 | **Nunca se copian**: identificador y código; oportunidades (y con ellas sus estimaciones, monedas y fotos de tipo de cambio), sus etapas e historiales; resultados comerciales; fase, porcentaje e historial de fase (el nuevo arranca en la fase por defecto, RN-03.7); líneas de forecast (ni como confirmadas ni como borrador); visitas realizadas, actividades históricas y confirmaciones (Módulo 4); adjuntos (D-03.9); auditoría; `lastActivityAt`, `createdAt`/`createdById` (son los del nuevo alta); `deletedAt` |
| RN-03.24 | El nuevo proyecto guarda `duplicatedFromId` = origen (solo trazabilidad, [BD] no autorreferencia). Exige `proyectos.crear` **y** que el origen sea visible (`proyectos.ver` dentro del alcance). Auditoría `crm.project.duplicated` con `metadata.sourceProjectId` |

### C.5 Clasificación y conversión

| ID | Regla |
|---|---|
| RN-03.25 | Tipo (`crm.tipo_proyecto`) y sector (`crm.sector_proyecto`) salen de catálogos; la unidad de medida, de `units_of_measure` activas. Nada de listas fijas en el frontend (ALCANCE §1 regla 8) |
| RN-03.26 | Modo de estimación del tonelaje del proyecto: `RULE` (por regla), `MANUAL` (estimación manual, permitida **solo** en el proyecto, DM-24) o `NONE` (sin estimación). Con `RULE` se exigen unidad y cantidad estimada ≥ 0 |
| RN-03.27 | Con `RULE`, el backend resuelve la regla con `UnitConversionResolver` desde la unidad del proyecto hacia la unidad de tonelaje (`crm.forecast.unidad_tonelaje` [P], `TON`) por precedencia **PROJECT_TYPE (tipo del proyecto) > GLOBAL** (para el proyecto no aplican PRODUCT ni PRODUCT_FAMILY). Solo reglas activas. Copia la regla y su factor en el proyecto (`conversionRuleId`, `conversionFactor`) y calcula `estimatedTonnage = estimatedQuantity × factor` |
| RN-03.28 | **Validez de la conversión**: la regla aplicada debe estar activa, convertir **desde** la unidad del proyecto ([BD] FK compuesta `(conversion_rule_id, measure_unit_id)`), **hacia** la unidad de tonelaje configurada ([CU]) y, si es de ámbito `PROJECT_TYPE`, corresponder al tipo del proyecto ([CU]). Sin regla aplicable → error; el usuario puede elegir `MANUAL` o `NONE` |
| RN-03.29 | El factor guardado es una **foto**: cambiar después una regla no reescribe el tonelaje guardado; se recalcula solo cuando se vuelve a guardar la clasificación (o la línea) |
| RN-03.30 | Aritmética decimal exacta en backend (nunca `number` de punto flotante): `tonnage = round(quantity × factor, 4, HALF_UP)` (D-03.13). La API transporta cantidades, factores, tonelajes y porcentajes como **cadenas decimales** |
| RN-03.31 | **No sumar unidades incompatibles** (00 §2.3): los totales y acumulados suman **solo toneladas**; las cantidades se totalizan **agrupadas por unidad**; las líneas sin regla se muestran como "sin conversión" y no entran en el total de toneladas. El tonelaje existe si y solo si hay regla aplicada en productos asociados y forecast ([BD] `ck_*_conversion`) |

### C.6 Fase del cliente

| ID | Regla |
|---|---|
| RN-03.32 | Fases del catálogo `crm.fase_cliente` (activas, orden por `metadata.order`). Campos: fase, porcentaje, fecha de actualización (la pone el sistema: `phaseUpdatedAt = ahora`), comentario (opcional, ≤ 1000) |
| RN-03.33 | Porcentaje entre 0 y 100, con hasta 2 decimales | 
| RN-03.34 | **Reglas de avance** `crm.proyectos.reglas_avance` [P] (por defecto `{"FINALIZADO":{"progresoMinimo":100}}`): una fase con `progresoMinimo` exige porcentaje ≥ ese valor. Si al cambiar de fase no se envía porcentaje, se propone `metadata.defaultProgress` de la fase destino |
| RN-03.35 | Cada cambio (de fase, de porcentaje o de ambos) inserta una fila en `project_phase_history` (fase y porcentaje anterior y nuevo, comentario, usuario, fecha). Se admite cambiar solo el porcentaje (misma fase). Se admite retroceder de fase; queda en el historial (D-03.15). Un cambio sin diferencias se rechaza |
| RN-03.36 | **Independencia**: ningún caso de uso de oportunidades, resultados, productos o forecast escribe `phaseId`/`phaseProgress`; ningún caso de uso de fase escribe etapas. Una fase final (`isFinal`) **no** bloquea crear, editar ni cerrar oportunidades |

Errores: `422 INVALID_PROGRESS` (fuera de rango, también [BD]
`ck_projects_phase_progress`), `422 PHASE_PROGRESS_RULE` (regla de avance),
`422 PHASE_UNCHANGED`, `422 INVALID_CATALOG_VALUE`.

### C.7 Oportunidades y etapas

| ID | Regla |
|---|---|
| RN-03.37 | Identificador UUID + código `OPO-{year}-{seq}` de `Sequence 'crm.oportunidad'`, inmutable. Pertenece a un proyecto visible y no eliminado. Un proyecto puede tener varias |
| RN-03.38 | Campos: etapa (`crm.etapa_oportunidad`), fecha (fecha de identificación, `opportunityDate`, DM-35; por defecto hoy en `crm.zona_horaria_negocio`), asesor (por defecto el usuario; otro exige `oportunidades.administrar`), estimación (DM-1, DM-36: el cliente envía solo monto ≥ 0 y moneda; el servidor resuelve y guarda `exchangeRate`, `exchangeRateDate` y `estimatedAmountUsd`; los cinco campos de monto van juntos o ninguno, [BD] `ck_opportunities_amount_set`; un monto sin moneda → `422 CURRENCY_REQUIRED`; la moneda que el formulario propone por defecto es la del país del proyecto; tonelaje estimado ≥ 0 opcional e independiente del monto, no se convierte), descripción, siguiente acción y su fecha. Reglas de la estimación: RN-03.78–RN-03.83 |
| RN-03.39 | Etapa inicial = `crm.valores_por_defecto["opportunity.stageId"]` [P] (`CONTACTADO`) o la que elija el usuario entre las **abiertas** (`isClosed = false`). No se crea una oportunidad directamente en etapa cerrada (D-03.7) → `422 INVALID_INITIAL_STAGE`. El alta inserta la primera fila de `opportunity_stage_history` (`fromStageId = null`) |
| RN-03.40 | **Transiciones** (DM-6) configurables en `crm.oportunidades.transiciones_etapa` [P], mapa `{codigoOrigen: [codigosDestino]}` por **código** de etapa. Valor por defecto recomendado: `{"CONTACTADO":["COTIZANDO","GANADO","PERDIDO"],"COTIZANDO":["CONTACTADO","GANADO","PERDIDO"],"GANADO":[],"PERDIDO":[]}`. Una transición no listada → `422 INVALID_STAGE_TRANSITION`. El cambio de parámetro rige sin desplegar |
| RN-03.41 | **Regla de respaldo** para etapas nuevas que el administrador añada al catálogo y no figuren como origen en el mapa: desde una etapa abierta se permite ir a cualquier etapa activa; desde una cerrada, ninguna (equivale a la recomendación de DM-6). Destinos inactivos o inexistentes en el catálogo se ignoran |
| RN-03.42 | **Reabrir** (de etapa cerrada a abierta) está fuera del mapa: exige `oportunidades.administrar`, comentario obligatorio (D-03.8), destino = cualquier etapa abierta activa; anula el resultado vigente (borra `opportunity_results`, inserta `opportunity_result_history` con `action = CLEARED`) y limpia `closedAt` |
| RN-03.43 | Ir a la **misma** etapa → `422 STAGE_UNCHANGED`. Cada cambio inserta una fila en `opportunity_stage_history` y actualiza `stageChangedAt`; pasar a etapa cerrada fija `closedAt`. Permisos: a etapa abierta, `oportunidades.editar` (propia) o `administrar`; a etapa cerrada, además `oportunidades.cerrar` |
| RN-03.44 | La etapa **nunca** modifica la fase del cliente (RN-03.36) |
| RN-03.45 | Eliminación lógica con `oportunidades.eliminar`: solo oportunidades **abiertas** sin productos asociados activos ni actividades abiertas vinculadas; las cerradas no se eliminan (conservan el resultado para reportes) (DM-33, D-03.12) → `409 OPPORTUNITY_CLOSED` / `409 OPPORTUNITY_HAS_DEPENDENCIES` |

### C.8 Resultado (relación etapa ↔ resultado, DM-15 / contradicción C1)

Resolución adoptada de 00 §3.4: **la etapa cerrada y el resultado se registran
juntos**; "Parcial" vive bajo la etapa con `outcome = "WON"` (Ganado).

| ID | Regla | Garantía | Error |
|---|---|---|---|
| RN-03.46 | Pasar a una etapa cerrada **exige** registrar el resultado en la misma operación; no puede existir una oportunidad en etapa cerrada sin resultado ni con resultado en etapa abierta | [CU] (una transacción) | `422 RESULT_REQUIRED` / `422 RESULT_NOT_ALLOWED` |
| RN-03.47 | Correspondencia: `WON` y `PARTIAL` → etapa con `metadata.outcome = "WON"`; `LOST` → etapa con `metadata.outcome = "LOST"` (según `stageOutcome` del catálogo `crm.resultado_oportunidad`) | [CU] | `422 RESULT_STAGE_MISMATCH` |
| RN-03.48 | `LOST` exige motivo (`crm.motivo_resultado`, cuyo `metadata.appliesTo` incluya el resultado) | [BD] `ck_opportunity_results_lost_reason` + [CU] | `422 RESULT_REASON_REQUIRED` / `422 INVALID_CATALOG_VALUE` |
| RN-03.49 | `PARTIAL` exige porcentaje adjudicado; todo porcentaje está entre 0 y 100 (2 decimales). `WON` sin porcentaje (implícito 100 %, DM-15); `LOST` sin porcentaje | [BD] `ck_opportunity_results_partial_percent`, `ck_…_percent_range` + [CU] | `422 RESULT_PERCENT_REQUIRED` / `422 INVALID_PROGRESS` |
| RN-03.50 | Fecha de decisión obligatoria (fecha de calendario). Comentarios opcionales (≤ 2000) | [BD] NOT NULL + [CU] | `400` |
| RN-03.51 | El resultado parcial **no** genera ni cambia etapas del pipeline: queda en la etapa Ganado | [CU] | — |
| RN-03.52 | **Modificar el resultado** sin salir de la etapa cerrada (p. ej. `WON` ↔ `PARTIAL`, corregir porcentaje, motivo, fecha o comentarios) con `oportunidades.cerrar` (propia) o `administrar`: inserta historial `CHANGED`. Pasar de `WON`/`PARTIAL` a `LOST` (o al revés) cambia la etapa y por tanto exige **reabrir** y volver a cerrar (RN-03.42) | [CU] | `422 RESULT_STAGE_MISMATCH` |
| RN-03.53 | Todo registro, cambio o anulación inserta `opportunity_result_history` (solo inserción; [BD] `ck_opportunity_result_history_payload`) y una entrada de auditoría `crm.opportunity_result.recorded/changed/cleared` | [BD] + [CU] | — |

Conteos derivados (para Inicio y Reportes, mismas fórmulas, DM-15): oportunidad
**abierta** = etapa con `isClosed = false`; **ganada** = resultado `WON` o
`PARTIAL` (con desglose de parciales); **perdida** = `LOST`.

### C.9 Productos asociados

| ID | Regla | Garantía | Error |
|---|---|---|---|
| RN-03.54 | El maestro (SKU, descripción, familia, unidad base) vive en `products`; la asociación (`project_products`) guarda solo proyecto, oportunidad opcional, producto, cantidad, unidad, regla y factor aplicados, tonelaje, estado y notas. La descripción y la familia se leen del maestro al consultar (no se copian) | [BD] diseño | — |
| RN-03.55 | Solo productos **activos** para asociaciones nuevas; una asociación existente con producto desactivado se conserva y se muestra marcada | [CU] | `422 PRODUCT_INACTIVE` |
| RN-03.56 | La oportunidad, si se indica, debe ser del **mismo** proyecto | [BD] FK compuesta + [CU] | `422 OPPORTUNITY_NOT_IN_PROJECT` |
| RN-03.57 | Cantidad ≥ 0; unidad activa (por defecto la unidad base del producto; se admite cualquier unidad activa, D-03.14) | [BD] `ck_project_products_quantity` + [CU] | `422 INVALID_QUANTITY` |
| RN-03.58 | Tonelaje calculado con `UnitConversionResolver` desde la unidad de la línea a `TON` por precedencia **PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE (tipo del proyecto) > GLOBAL**; sin regla → tonelaje nulo ("sin conversión"); **sin tonelaje manual** en líneas (DM-24) | [BD] `ck_project_products_conversion` + [CU] | — |
| RN-03.59 | Un mismo producto no se repite **activo** en el mismo par (proyecto, oportunidad) — incluido el par con oportunidad nula | [CU] bajo bloqueo consultivo por `(projectId, opportunityId|null, productId)` | `409 PROJECT_PRODUCT_DUPLICATE` |
| RN-03.60 | Estado del catálogo `crm.estado_producto_asociado` (DM-23); solo las líneas con estado `metadata.isActive = true` suman en los totales de la ficha | [CU] | `422 INVALID_CATALOG_VALUE` |
| RN-03.61 | Quitar una asociación = borrado lógico (`deletedAt`) con `proyectos.editar`. Bloqueado si el producto tiene líneas de forecast con cantidad > 0 en la ventana vigente para el proyecto y no queda otra asociación activa del mismo producto | [CU] | `409 PRODUCT_HAS_FORECAST` |
| RN-03.62 | Asociar, editar y quitar se gobiernan con `proyectos.editar` (propio) o `proyectos.administrar` (00 §5.2). Cada operación audita `crm.project_product.*` con `metadata.projectId` | [CU] | `403` |

### C.10 Forecast M+6

| ID | Regla | Garantía | Error |
|---|---|---|---|
| RN-03.63 | **Línea única** por (proyecto, producto, año, mes). El guardado es *upsert* por esa clave: nunca se crea una segunda fila | [BD] `uq_forecast_lines_project_product_period` + [CU] | — |
| RN-03.64 | Dentro de un mismo lote no puede repetirse la clave | [CU] | `422 FORECAST_DUPLICATE_IN_BATCH` |
| RN-03.65 | Cantidad ≥ 0 (4 decimales). "Quitar" una proyección = cantidad 0: la fila se conserva | [BD] `ck_forecast_lines_quantity` + [CU] | `422 INVALID_QUANTITY` |
| RN-03.66 | **Ventana móvil**: períodos M+1 … M+N, con N = `crm.forecast.horizonte_meses` [P] (6) y M = mes en curso en `crm.zona_horaria_negocio` [P], calculada con DEF-G (`forecastWindowMonths`, la misma que usa Inicio K5). La tabla guarda períodos absolutos (año, mes); la ventana es un filtro. Solo los períodos de la ventana son editables; el mes en curso y los pasados son de solo lectura (D-03.5) | [CU] [P] | `422 FORECAST_PERIOD_OUT_OF_WINDOW` |
| RN-03.67 | **Historia**: al cambiar de mes no se borra ni se mueve nada; la línea que era M+1 pasa a ser pasado y sigue consultable en modo histórico | [CU] (nunca `DELETE`) | — |
| RN-03.68 | El producto debe estar **asociado** (asociación activa) al proyecto (DM-25) | [CU] | `422 PRODUCT_NOT_ASSOCIATED` |
| RN-03.69 | Unidad de la línea: por defecto la de la asociación del producto en el proyecto (o la unidad base). Tonelaje calculado con la misma precedencia que RN-03.58; sin regla → tonelaje nulo; sin tonelaje manual (DM-24) | [BD] `ck_forecast_lines_conversion` + [CU] | — |
| RN-03.70 | Asesor de la línea: por defecto el asesor del proyecto; otro exige `forecast.administrar` (DM-25). La **visibilidad sigue al proyecto** (contradicción C11), más las líneas cuyo `ownerId` está en el alcance del usuario | [CU] | `403` |
| RN-03.71 | Editar exige `forecast.editar` y proyecto propio (`projects.owner_id = yo`) o `forecast.administrar` dentro del alcance | [CU] | `403` / `404` |
| RN-03.72 | Guardado en **lote atómico**: todas las líneas o ninguna; máximo 500 líneas por petición. Errores con `details[].field = "lines[i].campo"` | [CU] | `400` / `422` |
| RN-03.73 | **Concurrencia optimista** (D-03.6): cada línea existente puede llevar `expectedUpdatedAt`; si la línea cambió desde entonces, el lote entero se rechaza indicando las líneas en conflicto | [CU] | `409 FORECAST_LINE_STALE` |
| RN-03.74 | **Totales**: por período = suma de `tonnage` de las líneas filtradas de ese período; **acumulado** = suma corrida de M+1 hasta cada período y total de la ventana. Solo toneladas. Cantidades totalizadas **por unidad**. Líneas sin conversión contadas aparte (RN-03.31) | [CU] | — |
| RN-03.75 | "Fecha de actualización" = `updatedAt` de cada línea (y `updatedById`); se muestra por celda y la más reciente por fila | [BD] | — |
| RN-03.76 | Auditoría por línea **cambiada** (`crm.forecast_line.created/updated`, diferencia de cantidad, unidad y tonelaje, `metadata.projectId`); las líneas sin cambios no auditan | [CU] | — |

### C.11 Estimación de la oportunidad: moneda y tipo de cambio (DM-1, DM-36, ADR-024)

Resolución del responsable (2026-10-10): moneda base **USD**, con la capacidad de
capturar la estimación en la moneda del país del proyecto. Contrato de datos: 00 §2.7
y §2.16. Todo total e indicador se expresa en USD sobre `estimated_amount_usd`.

| ID | Regla | Garantía | Error |
|---|---|---|---|
| RN-03.78 | **Monedas admitidas**: `USD` (moneda base, `crm.moneda_base` [P], de solo lectura) o `countries.currency_code` del **país del proyecto** (`projects.country_id`). Si el país usa USD (El Salvador, Ecuador), la única moneda admitida es USD. Cualquier otra moneda, o una moneda inexistente o inactiva en `currencies`, se rechaza. La moneda que el formulario propone por defecto es la del país del proyecto (`/opportunities/form-options?projectId=`, F.2). La comprobación se hace cuando se escribe la estimación (alta o cambio de monto, moneda o fecha); un cambio posterior del país del proyecto no reescribe estimaciones ya guardadas (foto, RN-03.82) | [BD] FK `currency_code → currencies` + [CU] | `422 CURRENCY_NOT_ALLOWED` |
| RN-03.79 | **Resolución del tipo de cambio** con `ExchangeRateReader.findApplicable(currencyCode, opportunityDate)` (puerto de Fase 0, 00 §2.16): en `USD`, `exchangeRate = 1`, `exchangeRateDate` nula y `estimatedAmountUsd = estimatedAmount`; en otra moneda, la fila de `exchange_rates` de esa moneda con **mayor `effective_date` ≤ `opportunityDate`**, cuyo valor (`exchangeRate`, unidades de la moneda por 1 USD) y fecha de vigencia (`exchangeRateDate`) se copian en la oportunidad. Sin fila aplicable → error con `details: { currencyCode, date }`, y no se guarda nada (el usuario puede registrar la estimación en USD) | [BD] `ck_opportunities_usd_identity`, `ck_opportunities_rate_date`, `ck_opportunities_exchange_rate` + [CU] | `422 EXCHANGE_RATE_NOT_FOUND` |
| RN-03.80 | **Conversión**: `estimatedAmountUsd = round(estimatedAmount / exchangeRate, 4, HALF_UP)`, con aritmética decimal en backend (nunca `number` de JavaScript), en la **misma transacción** del alta o edición. La API transporta los cinco campos como cadenas decimales (fechas `YYYY-MM-DD`) | [BD] `ck_opportunities_amount_usd` + [CU] | — |
| RN-03.81 | **Aviso de antigüedad**: si la fecha de vigencia de la tasa aplicada es anterior a `opportunityDate` en más de `crm.tipos_cambio.dias_aviso_antiguedad` [P] días (31 por defecto), la estimación **se guarda** y la respuesta de la mutación incluye `warnings: [{ code: "EXCHANGE_RATE_STALE", message, details: { currencyCode, exchangeRateDate, referenceDate, ageDays, thresholdDays } }]`. Es un aviso no bloqueante: no es un error ni cambia el status (`201`/`200`) | [CU] [P] | — (aviso `EXCHANGE_RATE_STALE`) |
| RN-03.82 | **Foto y recálculo**: el tipo de cambio y el equivalente en USD se recalculan **solo** cuando cambian `estimatedAmount`, `currencyCode` u `opportunityDate`; cualquier otra edición (etapa, resultado, siguiente acción, descripción, asesor, tonelaje) conserva la foto. Corregir o añadir después una tasa en `exchange_rates` no altera estimaciones guardadas ni totales históricos; para revaluar se edita el monto, la moneda o la fecha. Enviar `estimatedAmount: null` y `currencyCode: null` borra los cinco campos. `exchangeRate`, `exchangeRateDate` y `estimatedAmountUsd` **nunca** se aceptan del cliente (`forbidNonWhitelisted` → `400 VALIDATION_FAILED`). La auditoría `crm.opportunity.updated` registra la diferencia de los cinco campos cuando se recalculan | [CU] | `400 VALIDATION_FAILED` |
| RN-03.83 | **Presentación**: toda lista o detalle que muestra un monto concreto (sección 4 de la ficha, lista y tablero del pipeline, detalle de oportunidad) enseña el **monto original con su moneda** y el **equivalente en USD** (con la tasa y su fecha en el detalle). Todo total o agregado de montos se expresa en USD sobre `estimated_amount_usd`; nunca se suman monedas distintas. El orden por monto usa el equivalente en USD (`sortBy=estimatedAmountUsd`) | [CU] | — |

---

## D. Modelo de datos utilizado

Todo según [00 §2](00-modelo-de-datos.md#2-entidades-nuevas). **Ninguna tabla
nueva**; ningún modelo Prisma redefinido.

### D.1 Entidades propias del módulo (escribe en ellas)

| Entidad (tabla) | 00 | Uso en el módulo |
|---|---|---|
| `Project` (`projects`) | §2.6 | Proyecto, clasificación, fase vigente, duplicado, `lastActivityAt`, borrado lógico |
| `ProjectPhaseHistory` (`project_phase_history`) | §2.6 | Historial de fase (solo inserción) |
| `Opportunity` (`opportunities`) | §2.7 | Oportunidad, etapa vigente, estimación (`estimatedAmount`, `currencyCode`, `exchangeRate`, `exchangeRateDate`, `estimatedAmountUsd`, `estimatedTonnage`; C.11), siguiente acción, `closedAt`, borrado lógico |
| `OpportunityStageHistory` (`opportunity_stage_history`) | §2.7 | Historial de etapas (solo inserción) |
| `OpportunityResult` (`opportunity_results`) | §2.7 | Resultado vigente 0..1 |
| `OpportunityResultHistory` (`opportunity_result_history`) | §2.7 | Versiones del resultado (solo inserción) |
| `ProjectProduct` (`project_products`) | §2.8 | Productos asociados |
| `ForecastLine` (`forecast_lines`) | §2.9 | Forecast M+6 |
| `Attachment` (`attachments`, columna `project_id`) + `StoredFile` | §2.11 | Adjuntos del proyecto, siempre a través de `AttachmentsService` (02 F.6.5) con `owner = { type: 'project', id }`; binario en `FileStorage` / `LocalFileSystemStorage` (ADR-021, 00 §2.11) |

### D.2 Entidades compartidas (solo lectura, salvo lo indicado)

| Entidad | Dueño | Uso |
|---|---|---|
| `Customer` | Módulo 2 | Cliente del proyecto; validación RN-03.2 vía `CustomerReferenceGuard`; nombre en listados |
| `Country` | Fase 0 | País del proyecto; `currencyCode` = moneda local admitida en la estimación (RN-03.78) |
| `Currency`, `ExchangeRate` | Fase 0 (semilla) / Módulo 7 (mantenimiento, F-46) | Monedas admitidas y tipo de cambio aplicable, solo lectura a través de `ExchangeRateReader` (00 §2.16, ADR-024). El módulo no escribe en ellas |
| `User`, `TeamMember`, `Team` | Plantilla / Módulo 7 | Asesor responsable, equipo principal (vista de equipo), alcance `TEAM` |
| `Product`, `ProductFamily`, `UnitOfMeasure`, `UnitConversionRule` | Fase 0 / Módulo 7 (DM-23) | Maestro de productos y conversión (solo lectura aquí) |
| `Catalog`, `CatalogItem` | Plantilla / Módulo 7 | Listas de formulario (§D.4) |
| `SystemParameter` | Plantilla / Módulo 7 | Parámetros (§D.5) |
| `Sequence` | Plantilla | Folios `crm.proyecto`, `crm.oportunidad` (escribe `currentValue` vía `SequenceGenerator`) |
| `AuditLog` | Plantilla | Escribe auditoría; lee entradas para el historial de la ficha |
| `Visit`, `Activity`, vista `crm_interactions_v` | Módulo 4 | Solo para bloqueos (RN-03.10, RN-03.12, RN-03.45) y la sección de seguimiento (consulta al Módulo 4) |

### D.3 Claves y relaciones

```text
Customer 1 ── N Project                (projects.customer_id, Restrict)
User     1 ── N Project                (projects.owner_id = asesor responsable; dueño OWN)
Project  1 ── N ProjectPhaseHistory
Project  1 ── N Opportunity            (uq_opportunities_id_project → destino de FK compuestas)
Opportunity 1 ── N OpportunityStageHistory
Opportunity 1 ── 0..1 OpportunityResult (opportunity_id @unique)
Opportunity 1 ── N OpportunityResultHistory
Project  1 ── N ProjectProduct ── N..1 Product
Opportunity 0..1 ── N ProjectProduct   (FK compuesta (opportunity_id, project_id) → opportunities(id, project_id))
UnitConversionRule 0..1 ── N ProjectProduct / ForecastLine / Project
                                       (FK compuesta (conversion_rule_id, unit_id) → (id, from_unit_id))
Project  1 ── N ForecastLine ── N..1 Product ; ForecastLine N..1 User (owner)
Project  0..1 ── N Project             (duplicated_from_id, SetNull)
Project  1 ── N Attachment             (attachments.project_id)
Currency 1 ── N Opportunity            (opportunities.currency_code, Restrict; tasa copiada como foto, sin FK a exchange_rates)
Project  1 ── N Visit / Activity       (Módulo 4; FK compuesta (project_id, customer_id) → projects(id, customer_id))
```

Identificadores públicos: **UUID** en toda la API; códigos humanos (`PRY-…`,
`OPO-…`) solo para mostrar y buscar.

### D.4 Catálogos utilizados

| `Catalog.key` | Columna | Semántica que usa el módulo (`metadata`) |
|---|---|---|
| `crm.tipo_proyecto` | `projects.project_type_id`, ámbito `PROJECT_TYPE` de reglas | — |
| `crm.sector_proyecto` | `projects.sector_id` | — |
| `crm.fase_cliente` | `projects.phase_id`, `project_phase_history` | `order`, `isFinal`, `defaultProgress?` |
| `crm.etapa_oportunidad` | `opportunities.stage_id`, `opportunity_stage_history` | `order`, `isClosed`, `outcome`, `inFunnel` |
| `crm.resultado_oportunidad` | Etiquetas de `OpportunityOutcome` (conjunto cerrado) | `requiresReason`, `requiresAwardedPercent`, `stageOutcome` |
| `crm.motivo_resultado` | `opportunity_results.reason_id` | `appliesTo` |
| `crm.estado_producto_asociado` | `project_products.status_id` | `isActive` (suma en totales) |

El código nunca compara etiquetas ni UUID: pregunta la semántica (00 §3.3).

### D.5 Parámetros utilizados

| `key` | Regla |
|---|---|
| `crm.campos_obligatorios` (`project`) | RN-03.3 |
| `crm.valores_por_defecto` (`project.phaseId`, `opportunity.stageId`) | RN-03.7, RN-03.39 |
| `crm.proyectos.reglas_avance` | RN-03.34 |
| `crm.oportunidades.transiciones_etapa` | RN-03.40 (DM-6) |
| `crm.moneda_base` | RN-03.78, RN-03.83 (DM-36): moneda base `USD`, de solo lectura; sustituye a `crm.moneda_por_defecto` |
| `crm.tipos_cambio.dias_aviso_antiguedad` | RN-03.81 (aviso `EXCHANGE_RATE_STALE`) |
| `crm.forecast.horizonte_meses` | RN-03.66 |
| `crm.forecast.unidad_tonelaje` | RN-03.27, RN-03.58, RN-03.69 |
| `crm.zona_horaria_negocio` | Ventana del forecast, "hoy" por defecto |
| `crm.adjuntos.max_mb`, `crm.adjuntos.tipos_permitidos` | Adjuntos (DM-8 resuelta, ADR-021): 10 MB; PDF, JPEG, PNG, `.docx`, `.xlsx` |

### D.6 Restricciones de integridad de las que depende el módulo

Todas definidas en 00; el módulo **no** añade SQL. Las pruebas de integración de
§J verifican cada una contra PostgreSQL:

- `projects`: `ck_projects_phase_progress`, `ck_projects_estimated_dates`, `ck_projects_quantity`, `ck_projects_tonnage`, `ck_projects_conversion`, `ck_projects_not_self_duplicate`; FK compuesta de conversión; `uq_projects_id_customer`; `code @unique`.
- `project_phase_history`: `ck_project_phase_history_progress`.
- `opportunities`: `ck_opportunities_amount`, `ck_opportunities_amount_set`, `ck_opportunities_exchange_rate`, `ck_opportunities_amount_usd`, `ck_opportunities_usd_identity`, `ck_opportunities_rate_date`, `ck_opportunities_tonnage`; FK `currency_code → currencies`; `uq_opportunities_id_project`.
- `opportunity_results`: `ck_opportunity_results_lost_reason`, `ck_opportunity_results_partial_percent`, `ck_opportunity_results_percent_range`; `opportunity_id @unique`.
- `opportunity_result_history`: `ck_opportunity_result_history_payload`, `ck_opportunity_result_history_percent`.
- `project_products`: `ck_project_products_quantity`, `ck_project_products_tonnage`, `ck_project_products_conversion`; FK compuestas de oportunidad y de conversión.
- `forecast_lines`: `uq_forecast_lines_project_product_period`, `ck_forecast_lines_month`, `ck_forecast_lines_year`, `ck_forecast_lines_quantity`, `ck_forecast_lines_tonnage`, `ck_forecast_lines_conversion`; FK compuesta de conversión.
- `attachments`: `ck_attachments_single_owner`.

Reglas que la base **no** puede expresar y quedan en el caso de uso:
pertenencia del elemento a su catálogo (00 §3.5), transiciones de etapa,
etapa ↔ resultado, unicidad de producto activo por par (proyecto, oportunidad),
destino `TON` de la regla, ventana del forecast, producto asociado en el
forecast, moneda admitida según el país del proyecto (RN-03.78) y resolución del
tipo de cambio vigente (RN-03.79).

---

## E. Pantallas y componentes

Convenciones (frontend-react, design-system, README de `features/admin`):
React + MUI v6, TanStack Query, React Hook Form + Zod, cliente `httpClient`,
mensajes con `describeApiError`, filtros/paginación/orden en la URL y en el
servidor, mobile-first (tablas → tarjetas bajo `sm`), sin hex/duraciones/píxeles
a mano (tokens). **Cuatro estados en cada pantalla y cada sección:** cargando
(esqueletos), vacío (mensaje + acción si hay permiso), error (mensaje +
reintentar + `correlationId`), sin permiso (`RequirePermission` →
`AccessDeniedPage`; secciones sin permiso se ocultan o muestran "No tienes
acceso a esta información").

### E.1 Rutas y menú

| Ruta | Pantalla | Permiso de la ruta | Opción de menú (00 §5.3) |
|---|---|---|---|
| `/proyectos` | Búsqueda de proyectos | `proyectos.ver` | `proyectos-buscar` |
| `/proyectos/nuevo` | Alta de proyecto | `proyectos.crear` | — (botón en la búsqueda) |
| `/proyectos/:projectId` | Ficha del proyecto (`?seccion=` para abrir una sección) | `proyectos.ver` | — (ruta hija) |
| `/proyectos/equipo` | Proyectos del equipo | `proyectos.ver` | `proyectos-equipo` |
| `/proyectos/oportunidades` | Pipeline de oportunidades | `oportunidades.ver` | `proyectos-oportunidades` |
| `/proyectos/oportunidades/:opportunityId` | Detalle de oportunidad | `oportunidades.ver` | — (ruta hija; destino de alertas de Inicio) |
| `/proyectos/forecast` | Forecast M+6 | `forecast.ver` | `proyectos-forecast` |

El menú **no** se declara en el frontend: sale de `GET /me/menu` (ADR-018). Las
siete rutas (también `/proyectos/nuevo` y las parametrizadas) se registran en
`app-routes.registry.json` porque la prueba del router lo exige; el servicio de
opciones de menú rechaza destinos con `:` (D-02.12, entregado por el Módulo 2).
Las rutas se declaran en `frontend/src/features/crm/crm-routes.ts` (D-02.11).

**Filtros aceptados en la URL** (destinos de Inicio, 01 E.3, y de Clientes):
`/proyectos?active=true|false&customerId=&ownerId=&phaseId=&stageId=&commercialStatus=…`
y `/proyectos/oportunidades?status=OPEN|CLOSED&outcome=WON,PARTIAL&decisionFrom=AAAA-MM-DD&decisionTo=AAAA-MM-DD&stageId=&ownerId=`;
`/proyectos/forecast` sin filtros abre la ventana por defecto. Los nombres son los
de la API (F.1, F.2), de modo que la pantalla los pasa tal cual.

### E.2 Búsqueda de proyectos (`/proyectos`) — F-13

- **Encabezado** `PageHeader` "Proyectos" con botón "Nuevo proyecto" (si `proyectos.crear`).
- **Barra de filtros** (`ListToolbar`): búsqueda por nombre o código; selectores de cliente (autocompletar contra Módulo 2), país, asesor (`GET /projects/owner-options`), tipo de proyecto, fase, etapa de oportunidad, estado comercial y situación activo/finalizado (`GET /projects/form-options`); campo de texto de ciudad; rango de fechas con selector de campo de fecha. Chips de filtros activos con "Limpiar".
- **Tabla** (`DataTable`): Código · Nombre · Cliente · País / ciudad · Asesor · Tipo · Fase (chip + % de avance) · Estado comercial · Decisión estimada · Última actualización. Ordenables: código, nombre, cliente, decisión estimada, última actualización, creación. En móvil: tarjeta con nombre (primaria), código, cliente, fase y estado.
- **Navegación:** clic en la fila → `/proyectos/:id`. La URL conserva filtros, página y orden.
- **Estados:** carga, vacío ("No hay proyectos que coincidan con los filtros" / "Aún no hay proyectos" + "Nuevo proyecto"), error con reintento, sin permiso.

### E.3 Alta de proyecto (`/proyectos/nuevo`) — F-10

Formulario en `FormSection`s:

1. **Datos generales:** nombre*, cliente* (autocompletar; muestra "Cliente inactivo" deshabilitado), país* (por defecto el del cliente), ciudad o ubicación, dirección, descripción.
2. **Fechas:** inicio estimado, fin estimado (validación cliente fin ≥ inicio), decisión estimada.
3. **Responsable:** asesor* (por defecto el usuario; editable solo con `proyectos.administrar`). Código: generado (campo visible solo con `proyectos.administrar`, opcional).
4. **Adjuntos:** zona de archivos en cola que se suben **después** del alta (dos pasos: `POST /projects` y luego `POST /projects/{id}/attachments` por archivo). Valida en cliente tamaño (`crm.adjuntos.max_mb`) y tipo (lista de `crm.adjuntos.tipos_permitidos`) como ayuda; la decisión es del servidor (`413` / `422 ATTACHMENT_TYPE_NOT_ALLOWED`, ADR-021). Si falla la subida de un archivo, el proyecto queda creado y la ficha lo indica para reintentar desde la sección Adjuntos.

Obligatorios adicionales: el formulario los lee de `GET /projects/form-options`
(`requiredFields` = base + `crm.campos_obligatorios.project`) y marca los campos;
el cliente se elige con `CustomerPicker` exportado por `features/crm/customers`
(02 E.7), que oculta o marca los clientes inactivos.
Al guardar: `POST /projects` → navega a la ficha con aviso "Proyecto PRY-… creado".
Errores de servidor mapeados a campos (`details[].field`). Estados: envío
(botón con progreso), error general, sin permiso.

### E.4 Ficha del proyecto (`/proyectos/:projectId`) — F-11

**Cabecera:** código, nombre, cliente (enlace a la ficha del cliente, si
`clientes.ver`), chip de fase con %, chip de estado comercial, asesor, última
actualización. Acciones (según `capabilities`): Editar, Duplicar, Eliminar
(`ConfirmDialog destructive`, muestra los bloqueos de `409`).

**Navegación entre secciones:** pestañas desplazables en escritorio
(`?seccion=general|clasificacion|fase|oportunidades|resultados|productos|forecast|seguimiento|adjuntos|historial`);
en móvil, acordeón vertical. Cada sección carga sus datos **bajo demanda** y
tiene sus propios cuatro estados, de modo que el fallo de una no rompe la ficha.

| Sección | Componente | Contenido y operaciones | Vacío | Sin permiso de edición |
|---|---|---|---|---|
| 1 General | `ProjectGeneralSection` | Datos de B.2 #1; "Proyecto duplicado de PRY-…" con enlace; diálogo de edición (`PATCH /projects/{id}`) | — | Solo lectura, sin botón Editar |
| 2 Clasificación | `ProjectClassificationSection` | Tipo, sector, unidad, cantidad, modo (`Por regla`/`Manual`/`Sin estimación`), regla aplicada (ámbito y factor), tonelaje. Diálogo con **vista previa** de la regla (`GET /unit-conversions/resolve`) antes de guardar; aviso si no hay regla aplicable | "Sin clasificar" + "Clasificar" | Solo lectura |
| 3 Fase | `ProjectPhaseSection` | Indicador de pasos con las fases del catálogo (orden `metadata.order`), barra de % (con texto, accesible), fecha y comentario; diálogo "Actualizar fase" (fase, %, comentario; propone `defaultProgress`; muestra la regla de avance); historial en línea de tiempo | — (siempre hay fase) | Solo lectura |
| 4 Oportunidades | `ProjectOpportunitiesSection` | Tabla: código, etapa (chip), fecha, asesor, estimación (monto original + moneda, equivalente en USD y t; RN-03.83), siguiente acción y fecha (aviso si abierta sin siguiente acción). Acciones: Nueva oportunidad, Editar, Cambiar etapa (`StageChangeDialog`), Ver detalle | "Sin oportunidades" + "Nueva oportunidad" | Sin acciones |
| 5 Resultados | `ProjectResultsSection` | Resumen (ganadas, parciales, perdidas) y tabla de oportunidades cerradas: resultado, motivo, % adjudicado, fecha de decisión, comentarios; historial de resultado desplegable; acción "Modificar resultado" | "Ninguna oportunidad tiene resultado" | Sin acciones |
| 6 Productos | `ProjectProductsSection` | Tabla: SKU, descripción, familia, unidad, cantidad, tonelaje (o "Sin conversión" con icono y ayuda), estado, oportunidad. Pie: **total en toneladas** (solo estados activos) y **cantidades por unidad**; contador de líneas sin conversión. Acciones: Asociar producto (`ProductPicker` + formulario), Editar, Quitar | "Sin productos asociados" + "Asociar producto" | Sin acciones |
| 7 Forecast | `ForecastMatrix` filtrada por `projectId` | La misma matriz de E.7, sin el filtro de proyecto | "Sin forecast. Asocia productos para proyectar" | Celdas de solo lectura |
| 8 Seguimiento | `ProjectFollowUpSection` (contenedor) que embebe `CommercialActivitySection projectId` del Módulo 4 (04 E.11) | Datos del Módulo 4 (§F.4): última interacción, próxima acción, responsable, fecha, notas, adjuntos, próximas visitas/actividades e interacciones con enlace al registro de origen. Botones `NewActivityButton` (`customerId`, `projectId`) y `PlanVisitButton` (`customerId`, `projectId`) del Módulo 4 | Lo pinta el componente del Módulo 4 | Los botones del Módulo 4 se ocultan según sus permisos (`actividades.crear`, `visitas.crear`) |
| 9 Adjuntos | `AttachmentsSection` de `features/crm/common` (02) con `owner = { type: 'project', id }` | Lista (nombre, tipo, tamaño, subido por, fecha, descripción), descargar, subir, eliminar | "Sin adjuntos" | Sin subir/eliminar |
| 10 Historial | `ProjectHistorySection` | Línea de tiempo paginada (más reciente primero): tipo de evento, campo, antes → después, usuario, fecha; filtro por tipo (fase, etapa, resultado, datos, productos, forecast) | "Sin cambios registrados" | — |

**Disponibilidad del Módulo 4** (patrón D-02.10, `use-module-availability`):
si `GET /me/menu` contiene alguna opción del módulo `actividad-comercial`, la
sección 8 monta `CommercialActivitySection`; si no, y el usuario tiene
`actividades.ver` o `visitas.ver`, muestra el estado informativo "El seguimiento
comercial estará disponible con el módulo de Actividad comercial" **sin**
llamar a endpoints inexistentes; sin ninguno de esos permisos, la sección se
oculta (§G.3). Hasta que exista el Módulo 4, `ProjectFollowUpSection` no importa
nada de `features/crm/commercial-activity` (la importación la añade el Módulo 4
al entregar sus puntos de entrada). `AttachmentsSection` funciona completa
(DM-8 resuelta, ADR-021): la descarga abre `GET …/attachments/{attachmentId}/content`,
que transmite el archivo como `attachment`; no hay vista previa en línea.

En la ficha y en el detalle de oportunidad también aparece `NewActivityButton`
(`customerId`, `projectId`, `opportunityId`) cuando el Módulo 4 está disponible.

### E.5 Diálogo "Duplicar proyecto" — F-12

`DuplicateProjectDialog` (desde la cabecera, si `capabilities.canDuplicate`):

- **Confirmar o cambiar (obligatorio):** nombre nuevo (vacío al abrir, con sugerencia "Copia de …"), cliente, fechas (inicio, fin, decisión), asesor (editable solo con `proyectos.administrar`), código manual (solo con `proyectos.administrar`).
- **Qué copiar** (casillas): "Ubicación (país, ciudad, dirección)" ✔, "Descripción" ✔, "Clasificación" ✔, "Productos asociados (sin oportunidad, estado inicial)" ☐.
- **Nota fija** con la lista de lo que **no** se copia (RN-03.23).
- Al confirmar: `POST /projects/{id}/duplicate` → navega a la ficha nueva.

### E.6 Proyectos del equipo (`/proyectos/equipo`) — F-14

- Encabezado con el **alcance efectivo** del usuario en texto ("Ves tus proyectos" / "Ves los proyectos de tus equipos" / "Ves los proyectos de Guatemala" / "Ves todos los proyectos").
- Filtros: equipo (`GET /projects/team-options`: solo equipos dentro del alcance), responsable (`owner-options`), fase, país, última actualización (desde/hasta), búsqueda.
- Tabla: Proyecto (código + nombre) · Cliente · Responsable · Equipo (equipo principal del responsable) · Estado o fase (chip + %) · Estado comercial · Última actualización (relativa + fecha) · **indicador "Solo lectura"** cuando `canEdit = false`. Orden por defecto: última actualización descendente.
- Clic → ficha (en solo lectura si no hay permiso de edición).
- Estados: carga, vacío por perfil ("Tu equipo aún no tiene proyectos"), error, sin permiso.

### E.7 Pipeline de oportunidades (`/proyectos/oportunidades`) — F-17, F-18

- **Vista lista** (por defecto): filtros etapa, asesor, proyecto, cliente, abiertas/cerradas, resultado, rango de fechas (de la oportunidad o de decisión), búsqueda por código; columnas código · proyecto · cliente · etapa · fecha · asesor · estimación (monto original + moneda y equivalente en USD; orden por el equivalente en USD) · siguiente acción · resultado.
- **Vista tablero**: una columna por etapa activa (orden `metadata.order`), cabecera con **conteo**, tarjetas (código, proyecto, cliente, estimación —monto original + moneda y equivalente en USD—, asesor, siguiente acción); "Ver más" por columna (paginación por etapa). El cambio de etapa se hace con la acción "Cambiar etapa" de la tarjeta (sin arrastrar: arrastrar exigiría una librería nueva y ADR).
- **`StageChangeDialog`**: etapas destino permitidas (las calcula el backend, `allowedTransitions` en el detalle); comentario; si el destino es cerrado, **`ResultForm`** embebido: resultado (opciones filtradas por el `outcome` de la etapa: Ganado → Ganado/Parcial; Perdido → Perdido), motivo (obligatorio si Perdido; filtrado por `appliesTo`), % adjudicado (obligatorio si Parcial, 0–100), fecha de decisión*, comentarios. Reabrir: visible solo con `oportunidades.administrar`, con comentario obligatorio y aviso de que se anula el resultado.
- **`OpportunityFormDialog`** (alta y edición): etapa inicial, fecha, asesor, **estimación** (monto con `DecimalField` + selector de moneda con solo las monedas admitidas para el proyecto, de `GET /opportunities/form-options?projectId=`, preseleccionada la del país del proyecto; RN-03.78), tonelaje estimado, descripción, siguiente acción y fecha. El formulario **no** calcula la conversión: muestra el texto "El equivalente en USD se calcula al guardar con el tipo de cambio vigente a la fecha de la oportunidad". Tras guardar, si la respuesta trae `warnings` con `EXCHANGE_RATE_STALE`, muestra un aviso no bloqueante con la fecha de la tasa aplicada; `422 EXCHANGE_RATE_NOT_FOUND` se pinta bajo el selector de moneda sugiriendo registrar en USD; `422 CURRENCY_NOT_ALLOWED`, bajo el mismo selector.
- **Detalle `/proyectos/oportunidades/:id`**: datos, estimación (monto original + moneda, tipo de cambio aplicado y su fecha de vigencia, equivalente en USD; tonelaje), edición, historial de etapas (línea de tiempo), resultado vigente e historial, productos asociados a la oportunidad, enlace al proyecto.
- Estados: los cuatro, en lista, tablero (por columna) y detalle.

### E.8 Forecast M+6 (`/proyectos/forecast`) — F-20

**Filtros:** proyecto, producto, asesor, mes (uno o varios períodos de la
ventana), búsqueda; conmutador **"Ventana M+6 / Historial"** (historial: rango
`desde–hasta` de meses pasados, solo lectura).

**Matriz** (`ForecastMatrix`), tabla con contenedor de desplazamiento horizontal
y primeras columnas fijas:

| Proyecto | Producto (SKU · descripción) | Unidad | M+1 (ene 2027) | … | M+6 (jun 2027) | Total fila |
|---|---|---|---|---|---|---|
| PRY-2026-00042 | VAR-3 Varilla #3 | VAR | `[ 120 ]` 0,40 t | … | `[ 0 ]` — | 480 VAR · 1,61 t |

- **Filas** = pares (proyecto, producto) con asociación activa dentro de los filtros, más los pares con líneas en la ventana; agrupadas por proyecto con subtotal en toneladas.
- **Celdas editables** (campo numérico, `inputMode="decimal"`, separador decimal local, 4 decimales): cantidad; debajo, tonelaje calculado o "—" con icono "Sin conversión" y ayuda; la vista previa del tonelaje usa el factor que devuelve el backend en la fila (`conversion.factor`), nunca un factor del frontend. Celdas de solo lectura (sin permiso, fuera de ventana, modo historial) con estilo deshabilitado.
- **Unidad** por fila: selector (por defecto la de la asociación); cambiarla se aplica a todas las celdas editables de la fila.
- **Fecha de actualización:** al pasar o enfocar una celda, "Actualizado el … por …"; columna de fila con la más reciente.
- **Pie de la matriz:** fila "**Total toneladas**" por período; fila "**Acumulado**" (suma corrida M+1…M+k) y celda final con el total de la ventana; desplegable "Cantidades por unidad" (una fila por unidad, nunca mezcladas); "N líneas sin conversión no suman en toneladas".
- **Edición en borrador:** las celdas modificadas se marcan (token de color de estado), barra fija inferior "**Guardar cambios (n)**" / "Descartar"; validación local (≥ 0, numérico); `PUT /forecast/lines` con solo las celdas cambiadas y su `expectedUpdatedAt`; los errores `lines[i]` se pintan en su celda; `409 FORECAST_LINE_STALE` → aviso "Otro usuario modificó estas celdas" con opción de recargar conservando el resto del borrador. Aviso al abandonar la pantalla con cambios sin guardar.
- **Teclado:** Tab/Shift+Tab recorre celdas; Enter baja a la fila siguiente; Escape revierte la celda.
- **Móvil (< md):** cada fila pasa a tarjeta (proyecto, producto, unidad) con la lista de los seis meses como campos; totales en un panel al final.
- Estados: carga (esqueleto de matriz), vacío ("No hay productos asociados para proyectar con estos filtros"), error, sin permiso; ventana recalculada al cambiar de mes (la cabecera muestra los meses reales).

### E.9 Componentes compartidos del módulo

`ProjectPicker` (autocompletar de proyectos visibles), `ProductPicker` (catálogo
local: SKU, descripción, familia; solo activos), `UnitSelect`,
`CatalogSelect` (lee las opciones de `form-options` del módulo, D-02.1), `OwnerPicker` (`owner-options`), `CustomerPicker` (de 02),
`DecimalField` (cadena decimal, sin `number` flotante), `PhaseChip`,
`StageChip`, `OutcomeChip`, `CommercialStatusChip`, `ConversionBadge`,
`ResultForm`, `StageChangeDialog`, `ForecastMatrix`. Las piezas genéricas
(`DataTable`, `ListToolbar`, `EmptyState`, `ConfirmDialog`, `FormSection`,
`use-table-query-state`) se importan desde su ubicación compartida fuera de
`features/admin` (D-02.11); `AttachmentsSection` desde `features/crm/common` (02).

---

## F. Servicios y contratos

Todo bajo `/api/v1`, autenticado (`Authorization: Bearer`), con el formato de
error de API-STANDARDS §8 (`statusCode`, `code`, `message`, `details`,
`correlationId`). Colecciones: `{ data, pagination: { page, pageSize, totalItems, totalPages } }`,
`pageSize` ≤ 100, `sortBy` contra lista blanca, `sortOrder` ∈ `asc|desc`.
Decimales como cadena (`"12.5000"`); la estimación de una oportunidad viaja como los cinco campos planos de RN-03.38 (`estimatedAmount`, `currencyCode`, `exchangeRate`, `exchangeRateDate`, `estimatedAmountUsd`; DM-36);
fechas de calendario `YYYY-MM-DD`; instantes ISO 8601 UTC. DTOs con
`class-validator`, `whitelist` y `forbidNonWhitelisted`. OpenAPI con
`@ApiTags`, respuestas y errores documentados. Todos los endpoints responden
además `401 UNAUTHENTICATED`, `403 PERMISSION_DENIED` (sin el permiso) y
`429 RATE_LIMIT_EXCEEDED`; los de un recurso concreto, `404 RESOURCE_NOT_FOUND`
si no existe, está eliminado o está **fuera del alcance** (no se revela su
existencia, ADR-008). Los errores de forma del DTO usan `400 VALIDATION_FAILED`
(mismo código que 02); "400" en las tablas significa ese código.

### F.1 Proyectos (operaciones propias)

| Método | Ruta | Permiso | Propósito | Éxito | Errores específicos |
|---|---|---|---|---|---|
| GET | `/projects` | `proyectos.ver` | Buscar (F-13) | 200 `Paginated<ProjectListItemDto>` | 400 (filtro/orden inválido), 422 `INVALID_DATE_RANGE` |
| GET | `/projects/team-view` | `proyectos.ver` | Proyectos del equipo (F-14) | 200 `Paginated<TeamProjectItemDto>` | 400 |
| GET | `/projects/form-options` | `proyectos.ver` | Opciones de formulario y filtros (D-02.1 aplicado al módulo, D-03.1) | 200 `ProjectFormOptionsDto` | — |
| GET | `/projects/owner-options` | `proyectos.ver` | Asesores asignables / filtrables dentro del alcance (`search`, paginación) | 200 `Paginated<OwnerOptionDto { id, displayName, countryId?, primaryTeam? }>` | 400 |
| GET | `/projects/team-options` | `proyectos.ver` | Equipos dentro del alcance del usuario (filtro de la vista de equipo) | 200 `{ data: [{ id, code, name, parentId? }] }` | — |
| POST | `/projects` | `proyectos.crear` | Crear (F-10) | 201 `ProjectDetailDto` + `Location` | 400, 403 `PERMISSION_DENIED` / `FIELD_NOT_EDITABLE` (asesor ajeno o código manual sin `administrar`), 404 (cliente inexistente, eliminado o no visible, vía `CustomerReferenceGuard`), 409 `PROJECT_CODE_TAKEN`, 422 `CUSTOMER_INACTIVE`, `REQUIRED_FIELD_MISSING`, `INVALID_DATE_RANGE`, `INVALID_OWNER`, `UNKNOWN_REFERENCE` |
| GET | `/projects/{id}` | `proyectos.ver` | Ficha (cabecera + general + clasificación + fase vigente + resúmenes + `capabilities`) | 200 `ProjectDetailDto` | 404 |
| PATCH | `/projects/{id}` | `proyectos.editar` (propio) / `proyectos.administrar` | Editar datos generales | 200 `ProjectDetailDto` | 400, 403, 404, 409 `PROJECT_CODE_TAKEN`, `PROJECT_CUSTOMER_LOCKED`, 422 (como en POST) |
| DELETE | `/projects/{id}` | `proyectos.eliminar` (+ alcance) | Eliminación lógica | 204 | 404, 409 `PROJECT_HAS_ACTIVE_CHILDREN` (`details` con los bloqueos) |
| POST | `/projects/{id}/duplicate` | `proyectos.crear` + origen visible | Duplicar (F-12) | 201 `ProjectDetailDto` + `Location` | 400, 403, 404 (origen), 409, 422 (como en POST) |
| PUT | `/projects/{id}/classification` | `proyectos.editar` / `administrar` | Clasificar (F-15) | 200 `ProjectClassificationDto` | 400, 403, 404, 422 `INVALID_CATALOG_VALUE`, `CONVERSION_RULE_NOT_FOUND`, `INVALID_CONVERSION_RULE`, `INVALID_QUANTITY` |
| GET | `/projects/{id}/phase-history` | `proyectos.ver` | Historial de fase | 200 `Paginated<PhaseHistoryItemDto>` | 404 |
| POST | `/projects/{id}/phase-changes` | `proyectos.editar` / `administrar` | Cambiar fase y/o porcentaje (F-16) | 201 `ProjectPhaseDto` | 400, 403, 404, 422 `INVALID_PROGRESS`, `PHASE_PROGRESS_RULE`, `PHASE_UNCHANGED`, `INVALID_CATALOG_VALUE` |
| GET | `/projects/{id}/history` | `proyectos.ver` | Historial de cambios de la ficha | 200 `Paginated<ProjectHistoryEntryDto>` | 404 |
| GET | `/projects/{id}/products` | `proyectos.ver` | Productos asociados + totales | 200 `ProjectProductsDto` (`{ data, pagination, totals }`, ver nota) | 404 |
| POST | `/projects/{id}/products` | `proyectos.editar` / `administrar` | Asociar producto (F-19) | 201 `ProjectProductDto` | 400, 403, 404, 409 `PROJECT_PRODUCT_DUPLICATE`, 422 `PRODUCT_INACTIVE`, `OPPORTUNITY_NOT_IN_PROJECT`, `INVALID_QUANTITY`, `INVALID_CATALOG_VALUE`, `UNKNOWN_REFERENCE` |
| PATCH | `/projects/{id}/products/{projectProductId}` | `proyectos.editar` / `administrar` | Editar asociación | 200 `ProjectProductDto` | como POST |
| DELETE | `/projects/{id}/products/{projectProductId}` | `proyectos.editar` / `administrar` | Quitar asociación (lógico) | 204 | 403, 404, 409 `PRODUCT_HAS_FORECAST` |
| GET | `/projects/{id}/opportunities` | `oportunidades.ver` | Oportunidades del proyecto (sección 4 y selector del Módulo 4); mismos filtros que `GET /opportunities` salvo `projectId` | 200 `Paginated<OpportunityListItemDto>` | 404 (proyecto) |
| GET | `/projects/{id}/attachments` | `proyectos.ver` | Listar adjuntos | 200 `Paginated<AttachmentDto>` | 404 |
| POST | `/projects/{id}/attachments` | `proyectos.editar` / `administrar` | Subir (`multipart/form-data`: `file`, `description?` ≤ 300) al `FileStorage` (ADR-021); tipo detectado por firma, clave `<año>/<mes>/<uuid>` generada | 201 `AttachmentDto` + `Location` | 400, 403, 404, 413 `ATTACHMENT_TOO_LARGE`, 422 `ATTACHMENT_TYPE_NOT_ALLOWED` |
| GET | `/projects/{id}/attachments/{attachmentId}/content` | `proyectos.ver` | Descargar: flujo transmitido por la API tras autorizar (ADR-021, DC-2), con `Content-Type` guardado, `Content-Disposition: attachment` y `X-Content-Type-Options: nosniff`; nunca servido como estático ni con URL firmada | 200 (binario) | 404 |
| DELETE | `/projects/{id}/attachments/{attachmentId}` | `proyectos.editar` / `administrar` | Eliminar (lógico, `attachments` + `stored_files`) | 204 | 403, 404 |

> **Nota de forma (`/projects/{id}/products`, `/forecast/totals`):** la respuesta
> de productos añade `totals` al envoltorio de colección. Añadir una propiedad
> es compatible (API-STANDARDS §13) y evita una segunda petición; los totales se
> calculan sobre **todas** las líneas del proyecto, no solo la página.

**Consulta `GET /projects` (`ProjectQueryDto`):** `search`, `code`,
`customerId`, `countryId`, `city`, `ownerId`, `projectTypeId`, `phaseId`,
`stageId`, `commercialStatus` (repetible: `OPEN_STAGE:<stageId>`, `WON`,
`LOST`, `NO_OPPORTUNITIES`, igual que 05), `active` (`true` = RN-03.15, `false` =
finalizados; omitido = todos), `dateField`, `dateFrom`, `dateTo`, `page`,
`pageSize`, `sortBy` ∈ {`code`, `name`, `customerName`, `estimatedDecisionDate`,
`lastActivityAt`, `createdAt`, `phaseOrder`} (defecto `lastActivityAt desc`), `sortOrder`.

**Contrato para Clientes F-08 (02 F.7, §4.4):** el Módulo 2 llama desde el
frontend a `GET /projects?customerId={id}` con `search`, `phaseId`, `ownerId`,
`commercialStatus`, `page`, `pageSize`, `sortBy`, `sortOrder` (nombres fijados
aquí; 02 se ajusta a ellos). Respuesta: `ProjectListItemDto` (abajo), que
contiene todo lo que pide §4.4 —código, nombre, ubicación (`city`, `country`),
fase (`phase.label`, `phase.progress`), estado comercial
(`commercialStatus.kind/label/stage`), asesor, fecha estimada de decisión— y
`id` para navegar a `/proyectos/:id`. Solo proyectos visibles para el usuario.

**`ProjectFormOptionsDto`:** `countries[]` (con `currencyCode`), `projectTypes[]`, `sectors[]`,
`phases[]` (con `order`, `isFinal`, `defaultProgress`), `stages[]` (con `order`,
`isClosed`, `outcome`), `units[]` (con `dimension`), `productStatuses[]` (con
`isActive`), `requiredFields[]` (base + parámetro), `defaults`
(`phaseId`, `stageId`), `baseCurrencyCode` (`crm.moneda_base`, `USD`; sustituye a
la antigua `defaults.currencyCode`, que leía `crm.moneda_por_defecto`), `progressRules` (de
`crm.proyectos.reglas_avance`), `tonnageUnit`. Solo elementos activos (el valor
desactivado de un registro existente llega en su propio DTO, como en 02).

**Consulta `GET /projects/team-view` (`TeamViewQueryDto`):** `search`,
`teamId`, `ownerId`, `phaseId`, `countryId`, `lastActivityFrom`,
`lastActivityTo`, paginación, `sortBy` ∈ {`lastActivityAt`, `name`, `ownerName`,
`teamName`, `phaseOrder`}.

**DTOs principales** (campos; `?` = nulable):

```text
ProjectListItemDto {
  id, code, name,
  customer: { id, legalName }, country: { id, isoCode, name }, city?,
  owner: { id, displayName },
  projectType?: CatalogRefDto, phase: CatalogRefDto & { progress: "75.00" },
  commercialStatus: { kind: "OPEN_STAGE"|"WON"|"LOST"|"NO_OPPORTUNITIES", label, stage: CatalogRefDto | null },   // RN-03.14, igual que 05
  opportunityCount, estimatedDecisionDate?, lastActivityAt,
  capabilities: { canEdit, canAdminister, canDelete, canDuplicate, canCreateOpportunity, canEditForecast }
}
TeamProjectItemDto = { id, code, name, customer, owner, team?: { id, code, name },
  phase, commercialStatus, lastActivityAt, capabilities }
CatalogRefDto = { id, code, label }

CreateProjectDto {
  name (1..200), customerId (uuid), countryId? (uuid; defecto país del cliente),
  city? (≤120), address? (≤300), description? (≤10000),
  estimatedStartDate?, estimatedEndDate?, estimatedDecisionDate? (YYYY-MM-DD),
  ownerId? (uuid; defecto el usuario), code? (≤30; solo con proyectos.administrar)
}
UpdateProjectDto = Partial<CreateProjectDto>   // PATCH: omitido = sin cambio; null = borrar (campos opcionales)

ProjectDetailDto = ProjectListItemDto + {
  address?, description?, estimatedStartDate?, estimatedEndDate?,
  classification: ProjectClassificationDto,
  phase: ProjectPhaseDto,
  duplicatedFrom?: { id, code, name },        // null si el origen no es visible
  summary: { openOpportunities, wonOpportunities, partialOpportunities, lostOpportunities,
             productLines, attachments },
  createdAt, createdBy?: UserRefDto, updatedAt, updatedBy?: UserRefDto
}

ProjectClassificationDto {
  projectType?: CatalogRefDto, sector?: CatalogRefDto,
  measureUnit?: { id, code, symbol, dimension }, estimatedQuantity?: "1200.0000",
  tonnageMode: "RULE"|"MANUAL"|"NONE",
  conversion?: { ruleId, scope, factor: "0.03500000", toUnit: { id, code } },
  estimatedTonnage?: "42.0000"
}
UpdateClassificationDto {
  projectTypeId?: uuid|null, sectorId?: uuid|null, measureUnitId?: uuid|null,
  estimatedQuantity?: decimal-string|null,
  tonnageMode: "RULE"|"MANUAL"|"NONE",
  manualTonnage?: decimal-string          // solo con MANUAL
}

ProjectPhaseDto { phase: CatalogRefDto & { order, isFinal }, progress, updatedAt, comment? }
CreatePhaseChangeDto { phaseId: uuid, progress?: decimal-string (0..100), comment?: string (≤1000) }
PhaseHistoryItemDto { id, fromPhase?, toPhase, fromProgress?, toProgress, comment?, changedBy: UserRefDto, changedAt }

DuplicateProjectDto {
  name (1..200), customerId?, ownerId?, code?,
  estimatedStartDate?, estimatedEndDate?, estimatedDecisionDate?,
  copy: { location: boolean = true, description: boolean = true,
          classification: boolean = true, products: boolean = false }
}

ProjectHistoryEntryDto {
  id, occurredAt, actor?: UserRefDto,
  kind: "PHASE"|"STAGE"|"RESULT"|"PROJECT_DATA"|"CLASSIFICATION"|"PRODUCT"|"FORECAST"|"ATTACHMENT"|"OPPORTUNITY_DATA",
  subject?: { type: "OPPORTUNITY"|"PROJECT_PRODUCT"|"FORECAST_LINE", id, label },
  changes: [{ field, before?, after? }], comment?
}

ProjectProductDto {
  id, product: { id, sku, description, family: { id, code, name }, isActive },
  opportunity?: { id, code }, quantity, unit: { id, code, symbol, dimension },
  conversion?: { ruleId, scope, factor }, tonnage?, status: CatalogRefDto & { isActive },
  notes?, updatedAt, updatedBy?
}
CreateProjectProductDto { productId, opportunityId?, quantity, unitId?, statusId?, notes? }
UpdateProjectProductDto = Partial<Omit<CreateProjectProductDto, "productId">>
ProjectProductsDto { data: ProjectProductDto[], pagination,
  totals: { tonnage: "123.4500", quantitiesByUnit: [{ unit, quantity }], linesWithoutConversion } }
```

**Historial de la ficha (`/projects/{id}/history`)** une, ordenado por fecha
descendente y paginado en el servidor: `project_phase_history`,
`opportunity_stage_history` y `opportunity_result_history` de sus
oportunidades, y las entradas de `audit_logs` con
`(resourceType, resourceId)` ∈ {(`crm.project`, id), (`crm.opportunity`, ids de
sus oportunidades), (`crm.project_product`, ids de sus asociaciones),
(`crm.forecast_line`, ids de sus líneas), (`crm.attachment`, ids de sus adjuntos)}
(usa `idx_audit_logs_resource`; los ids se resuelven primero, acotados). Filtro
opcional `kind`. Las entradas de auditoría duplicadas de un historial funcional
(p. ej. el cambio de fase) se muestran una sola vez (prevalece el historial
funcional).

### F.2 Oportunidades y resultados (operaciones propias)

| Método | Ruta | Permiso | Propósito | Éxito | Errores específicos |
|---|---|---|---|---|---|
| GET | `/opportunities` | `oportunidades.ver` | Listar/filtrar pipeline | 200 `Paginated<OpportunityListItemDto>` | 400, 422 `INVALID_DATE_RANGE` |
| GET | `/opportunities/form-options` | `oportunidades.ver` | Etapas (con semántica), resultados (etiquetas del conjunto cerrado y `stageOutcome`), motivos (con `appliesTo`), moneda base; con `?projectId=` además las monedas admitidas para ese proyecto y la moneda por defecto (RN-03.78) | 200 `OpportunityFormOptionsDto` | 400 (`projectId` no UUID), 404 (`projectId` no visible) |
| GET | `/opportunities/stage-summary` | `oportunidades.ver` | Conteo por etapa con los mismos filtros (cabeceras del tablero) | 200 `{ stages: [{ stage, count }] }` | 400 |
| POST | `/projects/{projectId}/opportunities` | `oportunidades.crear` + proyecto propio o `oportunidades.administrar` | Crear | 201 `OpportunityMutationResponseDto` (`OpportunityDetailDto` + `warnings?`) + `Location` | 400, 403, 404 (proyecto), 422 `INVALID_INITIAL_STAGE`, `INVALID_CATALOG_VALUE`, `INVALID_OWNER`, `CURRENCY_REQUIRED`, `CURRENCY_NOT_ALLOWED`, `EXCHANGE_RATE_NOT_FOUND` |
| GET | `/opportunities/{id}` | `oportunidades.ver` | Detalle (+ `allowedTransitions`, resultado vigente, `capabilities`) | 200 `OpportunityDetailDto` | 404 |
| PATCH | `/opportunities/{id}` | `oportunidades.editar` (propia) / `administrar` | Editar datos (no etapa); recalcula la estimación solo si cambian monto, moneda o fecha (RN-03.82) | 200 `OpportunityMutationResponseDto` (`OpportunityDetailDto` + `warnings?`) | 400, 403, 404, 422 `CURRENCY_REQUIRED`, `CURRENCY_NOT_ALLOWED`, `EXCHANGE_RATE_NOT_FOUND`, `INVALID_OWNER` |
| POST | `/opportunities/{id}/stage-changes` | `oportunidades.editar` / `administrar`; a cerrada + `oportunidades.cerrar`; reabrir: `oportunidades.administrar` | Cambiar etapa (con resultado si cierra) | 201 `OpportunityDetailDto` | 400, 403, 404, 422 `INVALID_STAGE_TRANSITION`, `STAGE_UNCHANGED`, `RESULT_REQUIRED`, `RESULT_NOT_ALLOWED`, `RESULT_STAGE_MISMATCH`, `RESULT_REASON_REQUIRED`, `RESULT_PERCENT_REQUIRED`, `INVALID_PROGRESS`, `COMMENT_REQUIRED`, `INVALID_CATALOG_VALUE` |
| PUT | `/opportunities/{id}/result` | `oportunidades.cerrar` (propia) / `administrar` | Modificar el resultado vigente sin cambiar de etapa | 200 `OpportunityResultDto` | 400, 403, 404, 409 `OPPORTUNITY_NOT_CLOSED`, 422 (reglas de resultado) |
| GET | `/opportunities/{id}/history` | `oportunidades.ver` | Historial de etapas y de resultados | 200 `{ stages: StageHistoryItemDto[], results: ResultHistoryItemDto[] }` | 404 |
| DELETE | `/opportunities/{id}` | `oportunidades.eliminar` (+ alcance) | Eliminación lógica | 204 | 404, 409 `OPPORTUNITY_CLOSED`, `OPPORTUNITY_HAS_DEPENDENCIES` |

**Consulta `GET /opportunities`:** `search` (código, nombre de proyecto),
`projectId`, `customerId`, `stageId` (repetible), `ownerId`, `status` ∈
`OPEN|CLOSED` (DEF-A), `outcome` (lista separada por comas de `WON|LOST|PARTIAL`),
`decisionFrom`/`decisionTo` (fecha de decisión del resultado, los que usa Inicio
en 01 E.3), `dateField` ∈ `opportunityDate|nextActionDate|updatedAt` con
`dateFrom`/`dateTo`, paginación, `sortBy` ∈ {`code`, `opportunityDate`, `stageOrder`,
`nextActionDate`, `updatedAt`, `estimatedAmountUsd`} (el orden por monto usa siempre el equivalente en USD, RN-03.83).

```text
OpportunityListItemDto {
  id, code, project: { id, code, name }, customer: { id, legalName },
  stage: CatalogRefDto & { order, isClosed, outcome? }, opportunityDate,
  owner: UserRefDto,
  estimatedAmount?: "7750.0000", currencyCode?: "GTQ", exchangeRate?: "7.75000000",   // DM-36: los cinco juntos o ninguno
  exchangeRateDate?: "2026-10-01" (null si USD), estimatedAmountUsd?: "1000.0000",
  estimatedTonnage?,
  nextAction?, nextActionDate?, result?: { outcome, awardedPercent?, decisionDate },
  updatedAt, capabilities: { canEdit, canClose, canReopen, canDelete }
}
OpportunityDetailDto = OpportunityListItemDto + {
  description?, stageChangedAt, closedAt?, result?: OpportunityResultDto,
  allowedTransitions: CatalogRefDto[],       // destinos válidos para este usuario ahora
  productLines: number, createdAt, createdBy?, updatedBy?
}
CreateOpportunityDto { stageId?, opportunityDate?, ownerId?,
  estimatedAmount?: decimal-string (≥0), currencyCode?: char(3) (obligatorio si hay monto; USD o moneda del país del proyecto),
  estimatedTonnage?, description? (≤2000), nextAction? (≤300), nextActionDate? }
  // exchangeRate, exchangeRateDate y estimatedAmountUsd NO se aceptan: los resuelve el servidor (RN-03.79–RN-03.82)
UpdateOpportunityDto = Partial<Omit<CreateOpportunityDto, "stageId">>   // estimatedAmount y currencyCode null = borrar la estimación
OpportunityMutationResponseDto = OpportunityDetailDto + {
  warnings?: [{ code: "EXCHANGE_RATE_STALE", message,
                details: { currencyCode, exchangeRateDate, referenceDate, ageDays, thresholdDays } }]   // RN-03.81, solo en POST/PATCH
}
OpportunityFormOptionsDto {
  stages[], outcomes[], reasons[],
  baseCurrencyCode: "USD",                                   // crm.moneda_base
  currencies?: { allowed: [{ code, name, symbol, decimals }],   // solo con ?projectId=: USD + moneda del país del proyecto (sin repetir)
                 defaultCode }                                // moneda del país del proyecto
}
CreateStageChangeDto { toStageId: uuid, comment?: string (≤1000), result?: OpportunityResultInputDto }
OpportunityResultInputDto { outcome: "WON"|"LOST"|"PARTIAL", reasonId?: uuid,
  awardedPercent?: decimal-string, decisionDate: YYYY-MM-DD, comments?: string (≤2000) }
OpportunityResultDto { outcome, outcomeLabel, reason?: CatalogRefDto, awardedPercent?, decisionDate,
  comments?, recordedBy: UserRefDto, recordedAt, updatedAt, updatedBy? }
StageHistoryItemDto { id, fromStage?, toStage, comment?, changedBy, changedAt }
ResultHistoryItemDto { id, action: "RECORDED"|"CHANGED"|"CLEARED", outcome?, reason?, awardedPercent?,
  decisionDate?, comments?, changedBy, changedAt }
```

**Algoritmo de `stage-changes`** (una transacción, con `SELECT … FOR UPDATE` de
la oportunidad):

1. Cargar oportunidad visible (si no, `404`) y etapa destino (`assertItem('crm.etapa_oportunidad', id, requireActive)`).
2. `destino == actual` → `422 STAGE_UNCHANGED`.
3. Si actual cerrada y destino abierta → reabrir (RN-03.42): exige `administrar` y `comment`; borrar resultado, historial `CLEARED`, `closedAt = null`.
4. Si no, comprobar la transición con la política (RN-03.40/41) → `422 INVALID_STAGE_TRANSITION`.
5. Si destino cerrada: exige `cerrar`; `result` obligatorio (`RESULT_REQUIRED`); validar RN-03.47–50; insertar `opportunity_results` + historial `RECORDED`; `closedAt = ahora`. Si destino abierta y viene `result` → `RESULT_NOT_ALLOWED`.
6. Actualizar `stageId`, `stageChangedAt`; insertar `opportunity_stage_history`; `projects.last_activity_at = ahora`.
7. Auditoría `crm.opportunity.stage_changed` (+ `crm.opportunity_result.*`).

### F.3 Forecast (operaciones propias)

| Método | Ruta | Permiso | Propósito | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/forecast/window` | `forecast.ver` | Períodos de la ventana vigente | 200 `{ timeZone, current: { year, month }, periods: [{ offset, year, month, label }] }` | — |
| GET | `/forecast/rows` | `forecast.ver` | Filas de la matriz (ventana o historial) | 200 `Paginated<ForecastRowDto>` | 400, 422 `FORECAST_PERIOD_OUT_OF_WINDOW` (períodos inválidos), `INVALID_DATE_RANGE` |
| GET | `/forecast/totals` | `forecast.ver` | Totales por período y acumulados con los mismos filtros (sobre todas las filas, no la página) | 200 `ForecastTotalsDto` | 400 |
| PUT | `/forecast/lines` | `forecast.editar` / `forecast.administrar` | Guardado en lote (upsert idempotente) | 200 `ForecastSaveResultDto` | 400, 403, 404 (proyecto no visible), 409 `FORECAST_LINE_STALE`, 422 `INVALID_QUANTITY`, `FORECAST_PERIOD_OUT_OF_WINDOW`, `PRODUCT_NOT_ASSOCIATED`, `FORECAST_DUPLICATE_IN_BATCH`, `INVALID_OWNER`, `UNKNOWN_REFERENCE` |

**Consulta común (`ForecastQueryDto`):** `mode` ∈ `WINDOW|HISTORY` (defecto
`WINDOW`), `projectId`, `productId`, `ownerId`, `periods` (repetible,
`YYYY-MM`, deben pertenecer a la ventana en `WINDOW`), `from`/`to` (`YYYY-MM`,
solo `HISTORY`, máximo 24 meses), `search` (código/nombre de proyecto, SKU),
paginación (`pageSize` ≤ 100 filas), `sortBy` ∈ {`projectCode`, `productSku`,
`updatedAt`}.

```text
ForecastRowDto {
  project: { id, code, name, owner: UserRefDto }, product: { id, sku, description, family },
  unit: { id, code, symbol, dimension },              // unidad propuesta para nuevas celdas
  conversion?: { ruleId, scope, factor },             // regla vigente para la unidad de la fila (vista previa)
  cells: [{ year, month, offset, lineId?, quantity?, unit?, tonnage?, hasConversion,
            owner?: UserRefDto, updatedAt?, updatedBy?: UserRefDto, editable }],
  rowTotals: { tonnage, quantitiesByUnit: [{ unit, quantity }] }, lastUpdatedAt?,
  canEdit
}
ForecastTotalsDto {
  periods: [{ year, month, offset, tonnage, accumulatedTonnage }],
  windowTonnage,                                       // total acumulado de la ventana o rango
  quantitiesByUnit: [{ unit, byPeriod: [{ year, month, quantity }], total }],
  linesWithoutConversion
}
SaveForecastLinesDto { lines: [ (1..500) {
  projectId, productId, year (2000..2100), month (1..12), quantity: decimal-string (≥0),
  unitId?, ownerId?, notes? (≤500), expectedUpdatedAt? (ISO) } ] }
ForecastSaveResultDto { created, updated, unchanged, lines: [ { lineId, projectId, productId, year, month,
  quantity, unit, tonnage?, updatedAt } ] }
```

**Algoritmo de `PUT /forecast/lines`:** calcular la ventana (parámetros) →
validar forma y duplicados en el lote → una transacción: por cada proyecto,
comprobar visibilidad (404) y permiso de edición (403); por cada línea, período
en ventana, asociación activa, unidad activa, asesor (RN-03.70); bloquear las
filas existentes (`FOR UPDATE`) y comparar `expectedUpdatedAt` (409 con
`details: [{ index, lineId, updatedAt }]`); resolver la regla y calcular el
tonelaje; *upsert* por la clave única; actualizar `last_activity_at` de los
proyectos afectados; auditar las líneas cambiadas. Cualquier error revierte el
lote completo. La operación es idempotente: repetir el mismo cuerpo devuelve
`unchanged`.

### F.4 Consultas a otros módulos (no propias)

| Necesidad | Módulo dueño | Contrato que se consume | Si aún no existe |
|---|---|---|---|
| Buscar y validar clientes (selector, RN-03.2) | Módulo 2 (implementado antes) | Frontend: `CustomerPicker` exportado por `features/crm/customers/index.ts` (que usa `GET /api/v1/customers`, `clientes.ver`). Backend: `CustomerReferenceGuard.assertUsableCustomer(customerId, actor, { requireActive })` exportado por `CustomersModule` (02 F.6.3), nunca HTTP interno | No aplica: el orden de implementación lo garantiza |
| Opciones de formulario (catálogos, países, unidades, obligatorios, valores por defecto, asesores, equipos) | Este módulo, por D-02.1 | **No** hay endpoint genérico: `GET /projects/form-options`, `/projects/owner-options`, `/projects/team-options`, `/opportunities/form-options` (F.1, F.2). Construidos con `CatalogReferenceValidator`/lectura de catálogos, `ParameterReader` y `VisibilityScopeResolver` | — |
| Piezas transversales | Fase 0 / Módulo 2 (02 F.6.5) | `SequenceGenerator.next(key, tx)`, `CatalogReferenceValidator.assertItem(...)`, `VisibilityScopeResolver.resolve(principal)`, `ParameterReader.get<T>(key)`, `ExchangeRateReader.findApplicable(currencyCode, date)` (Fase 0), `AttachmentsService` (`owner = { type: 'project', id }`; la autorización sobre el proyecto la decide este módulo), `AuditService.record(...)` | Ya entregadas por el Módulo 2 |
| Predicados de métricas | Módulo 1 (dueño), creados aquí primero (RN-03.77) | `metric-definitions.ts`: DEF-A, DEF-B, DEF-C, DEF-G | Este módulo los crea en la ruta de 01 |
| Productos, familias, unidades y resolución de reglas | Fase 0 (maestro) / Módulo 7 (mantenimiento) | Lectura que expone este módulo (abajo), porque el Módulo 7 aún no existe | — |
| Seguimiento comercial del proyecto (sección 8) | **Módulo 4** | Componente `CommercialActivitySection projectId` y botones `NewActivityButton`/`PlanVisitButton` (04 E.11, `features/crm/commercial-activity/entry-points`), que consumen `GET /api/v1/follow-ups/trace?projectId={id}` → `FollowUpTraceDto { row: FollowUpRowDto (lastInteraction, nextAction, nextActionDate, nextActionSource, responsible, notes, attachmentCount), interactions, upcoming, attachments }` y `GET /api/v1/interactions?projectId=`. Visibilidad y permisos: los del Módulo 4 (`actividades.ver`/`visitas.ver` + alcance). Este módulo no llama a esos endpoints directamente | Estado informativo por disponibilidad (D-02.10, §G.3); ninguna llamada |
| Bloqueos por visitas/actividades (RN-03.10, RN-03.12, RN-03.45) | Módulo 4 (datos) | Consulta de conteo en el adaptador Prisma de este módulo sobre `visits`/`activities` (las tablas existen desde la Fase 0) | Las tablas existen vacías: el conteo es 0 y no bloquea |

**Lectura de maestro de productos expuesta por este módulo** (solo lectura;
el Módulo 7 añadirá las escrituras con `productos.configurar`, DM-23):

| Método | Ruta | Permiso | Propósito |
|---|---|---|---|
| GET | `/products` | `productos.ver` | Buscar en el catálogo local: `search` (SKU, descripción), `familyId`, `isActive` (defecto `true`), paginación → `Paginated<ProductDto { id, sku, description, family, baseUnit, isActive }>` |
| GET | `/product-families` | `productos.ver` | Familias activas (lista sin paginar, catálogo pequeño, como `/parameters`) |
| GET | `/units-of-measure` | `proyectos.ver` | Unidades activas (lista sin paginar) |
| GET | `/unit-conversions/resolve` | `proyectos.ver` | Vista previa de la regla aplicable: `fromUnitId`, `productId?`, `projectTypeId?` → `{ rule?: { id, scope, factor, fromUnit, toUnit } }` (aplica la misma precedencia que el caso de uso; nunca expone reglas inactivas) |

### F.5 Puertos (ADR-004)

| Puerto | Métodos principales |
|---|---|
| `ProjectRepository` | `search(filters, scope, page)`, `searchTeamView(filters, scope, page)`, `findVisibleById(id, scope)`, `create(data, tx)`, `update(id, patch, tx)`, `softDelete(id, tx)`, `countBlockingChildren(id)`, `touchLastActivity(ids, at, tx)`, `insertPhaseChange(…)`, `listPhaseHistory(id, page)`, `listHistory(id, kind?, page)` |
| `OpportunityRepository` | `search`, `stageSummary`, `findVisibleById`, `lockForUpdate`, `create`, `update`, `changeStage`, `upsertResult`, `clearResult`, `insertStageHistory`, `insertResultHistory`, `softDelete`, `countDependencies` |
| `ProjectProductRepository` | `listByProject(id, page)`, `totalsByProject(id)`, `findActiveDuplicate(projectId, opportunityId?, productId)`, `create`, `update`, `softDelete`, `hasForecastInWindow(projectId, productId, window)` |
| `ForecastRepository` | `listRows(filters, scope, window, page)`, `totals(filters, scope, periods)`, `lockLines(keys, tx)`, `upsertLines(lines, tx)` |
| `ProductCatalogReader` | `searchProducts`, `listFamilies`, `listUnits`, `findProduct(id)` |
| Transversales de Fase 0 | `SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`, `UnitConversionResolver`, `ExchangeRateReader.findApplicable(currencyCode, date)` (00 §2.16, ADR-024; estimación de oportunidades, C.11), `AuditService` (existente), `ParameterReader.get<T>(key)` (02 F.6.5) |
| Transversales del Módulo 2 | `AttachmentsService` sobre `FileStorage` (`LocalFileSystemStorage`, ADR-021) |

Los casos de uso reciben un `VisibilityScope` resuelto (no Prisma) y nunca
importan `@prisma/client`.

---

## G. Relaciones e integraciones internas

### G.1 Qué consume

| De | Qué | Identificadores |
|---|---|---|
| Módulo 2 Clientes | Cliente del proyecto (existencia, eliminado, estado activo, visibilidad, país, nombre) | `customers.id` |
| Plantilla / Módulo 7 | Usuarios (asesor), equipos y pertenencia (alcance `TEAM`, equipo principal), roles, permisos, `dataScope` (vía `/me` y el resolvedor) | `users.id`, `teams.id` |
| Fase 0 / Módulo 7 | Catálogos §D.4, parámetros §D.5, países (con su moneda), monedas y tipos de cambio (`ExchangeRateReader`), productos, familias, unidades, reglas de conversión, secuencias | `catalog_items.id` (+ `code` para semántica), `countries.id`, `products.id`, `units_of_measure.id`, `unit_conversion_rules.id` |
| Módulo 4 | Seguimiento e interacciones del proyecto (solo consulta); existencia de visitas/actividades para bloqueos | `projects.id` en `visits.project_id`, `activities.project_id`, `activities.opportunity_id` |

### G.2 Qué proporciona

| A | Qué | Cómo |
|---|---|---|
| Módulo 2 (§4.4 Proyectos del cliente) | Código, nombre, ubicación, fase, estado comercial, asesor, fecha estimada de decisión; buscar, filtrar, ordenar, navegar | `GET /projects?customerId=…` con los filtros y orden de F.1; navegación a `/proyectos/:id`. Respeta la visibilidad del usuario. El Módulo 2 no administra ni duplica proyectos |
| Módulo 4 | Proyectos y oportunidades a los que vincular visitas y actividades; validación "proyecto de este cliente" (FK compuesta) | `GET /projects?customerId=` y `GET /opportunities?projectId=&status=OPEN` para selectores; ids `projects.id`, `opportunities.id`. El Módulo 4 actualiza `projects.last_activity_at` en su propia transacción (00 §2.6) |
| Módulo 1 Inicio | Proyectos activos (RN-03.15), oportunidades abiertas/ganadas/perdidas (C.8), forecast M+6 en toneladas (RN-03.74), alerta "proyecto sin actualizar" (`last_activity_at` + `crm.alertas.proyecto_sin_actualizar_dias`), alerta "oportunidad abierta sin siguiente acción", actividad reciente (`project_phase_history`, `opportunity_stage_history`) | Lectura directa de las tablas por `DashboardReadModel`/`AlertsReadModel` con **las mismas fórmulas** de esta especificación; navegación a `/proyectos?…` con filtros en la URL, `/proyectos/:id?seccion=…` y `/proyectos/oportunidades/:id` |
| Módulo 5 Reportes | Proyectos (§7.1), oportunidades (§7.2, conteos sobre `opportunities`, nunca sobre el `JOIN` con productos; montos agregados en USD sobre `estimated_amount_usd`, DM-36), forecast (§7.3, totales por unidad y en toneladas), embudo (`metadata.inFunnel`, `order`) | `ReportingRepository`; mismas fórmulas (DM-15, DM-16) |
| Módulo 7 | Uso real de catálogos y parámetros que administra | Los elementos usados no se eliminan (FK `Restrict`) |

### G.3 Comportamiento mientras otros módulos no existen

| Dependencia ausente | Comportamiento |
|---|---|
| Módulo 4 (Actividad comercial) | Sección 8 "Seguimiento comercial" con estado informativo (disponibilidad por `/me/menu`, D-02.10), sin llamadas. Los bloqueos por visitas/actividades consultan tablas vacías (no bloquean). Al entregarse, el Módulo 4 monta `CommercialActivitySection`, `NewActivityButton` y `PlanVisitButton` dentro de `ProjectFollowUpSection` y del detalle de oportunidad; este módulo no cambia su API |
| Módulo 1 / Módulo 5 | Nada que hacer: consumen después. Este módulo garantiza `last_activity_at` y las fórmulas documentadas |
| Módulo 7 (mantenimiento de productos, reglas, catálogos) | Productos, familias y reglas se cargan por semilla/script (DM-23, DM-24); catálogos y parámetros se editan con la pantalla genérica existente (PLAN-ADMIN). Si no hay productos cargados, "Asociar producto" muestra "No hay productos en el catálogo" y el forecast queda vacío |
| Almacenamiento de adjuntos (DM-8) | **Resuelto** (ADR-021): `FileStorage` y `AttachmentsService` llegan con el Módulo 2; los endpoints de adjuntos se exponen completos. Sin comportamiento degradado |
| Tipos de cambio sin cargar (00 §8.2: los valores iniciales los entrega el negocio) | Una estimación en moneda local sin tasa aplicable devuelve `422 EXCHANGE_RATE_NOT_FOUND`; la estimación en USD funciona siempre |
| Equipos reales (DM-12) | El alcance `TEAM` funciona con los equipos de demostración; sin equipos, un manager ve solo lo propio |

---

## H. Seguridad

Skills `security`, `authorization`. Deny-by-default; la decisión es **siempre**
del backend; ocultar botones es solo experiencia de usuario.

### H.1 Operaciones y permisos

| Operación | Permiso (`recurso.accion`, 00 §5.2) | Regla de propiedad / alcance (00 §4.3, DM-34) |
|---|---|---|
| Ver proyectos, ficha, historial, vista de equipo | `proyectos.ver` | Registro dentro del alcance |
| Crear proyecto | `proyectos.crear` | Asesor = yo, salvo `proyectos.administrar` |
| Editar datos generales, clasificación, fase, productos asociados, adjuntos | `proyectos.editar` | `owner_id = yo` |
| Editar proyecto ajeno, reasignar asesor, código manual | `proyectos.administrar` | Dentro del alcance |
| Eliminar proyecto | `proyectos.eliminar` | Dentro del alcance (y propio si no tiene `administrar`) |
| Duplicar | `proyectos.crear` + `proyectos.ver` del origen | Origen dentro del alcance |
| Ver oportunidades | `oportunidades.ver` | Oportunidad propia o de un proyecto visible (DM-13) |
| Crear oportunidad | `oportunidades.crear` | Proyecto propio, o `oportunidades.administrar` |
| Editar oportunidad / cambiar a etapa abierta | `oportunidades.editar` | `owner_id = yo`, o `administrar` |
| Cerrar (registrar o modificar resultado) | `oportunidades.cerrar` (+ `editar`) | Propia, o `administrar` |
| Reabrir | `oportunidades.administrar` | Dentro del alcance |
| Eliminar oportunidad | `oportunidades.eliminar` | Dentro del alcance |
| Ver catálogo de productos | `productos.ver` | — (maestro, sin alcance) |
| Ver forecast | `forecast.ver` | Proyecto visible o línea con `owner_id` en el alcance |
| Editar forecast | `forecast.editar` | Proyecto propio |
| Editar forecast ajeno, asesor distinto en la línea | `forecast.administrar` | Dentro del alcance |

Fuera del alcance → `404`; dentro del alcance sin permiso o sin propiedad →
`403 PERMISSION_DENIED`. Cada controlador declara `@RequirePermission(...)` con
el permiso base; la regla de propiedad y la de `administrar` se aplican en el
caso de uso (no en el guard), con prueba de `401`, `403` y `404` por endpoint.

### H.2 Visibilidad por perfil (§5.5 → 00 §4.4, DM-11, DM-13)

| Perfil del alcance | Rol del sistema | `dataScope` | Ve | Edita (con la matriz de 00 §5.4) |
|---|---|---|---|---|
| Asesor comercial | `asesor` | `OWN` | Proyectos con `owner_id = yo` (y sus oportunidades y forecast); oportunidades propias en proyectos ajenos, si las hubiera (DM-13) | Lo propio (`editar`) — sin `administrar` |
| Jefe | `manager` | `TEAM` | Proyectos cuyos asesores son miembros o responsables de mis equipos, **incluidos los subequipos** (DM-12) | Lo propio; lo ajeno del equipo con `administrar` (sembrado en `manager`) |
| Supervisor | `manager` | `TEAM` | Igual que Jefe | Igual que Jefe |
| Responsable de país | `responsable-pais` | `COUNTRY` | Proyectos con `country_id = users.country_id` (DM-14) | Lo propio; lo ajeno del país con `administrar` |
| Administrador | `administrador` | `ORGANIZATION` | Todo | Todo (`*`) |

**"Ver ≠ editar" (§5.5):** la visibilidad la da el alcance y `.ver`; la edición
exige `.editar` + propiedad, o `.administrar`. Un rol propio (creado por el
administrador, ADR-020) con alcance `TEAM` y solo `proyectos.ver`/`editar` ve
los proyectos del equipo **en solo lectura** salvo los suyos: el backend
devuelve `capabilities.canEdit = false` y rechaza el `PATCH` con `403`. D-03.10
resuelta (2026-10-10): el rol `asesor` conserva el alcance `OWN` (DM-11) y no ve
los proyectos de sus compañeros.

### H.3 Otros controles

| Control | Aplicación |
|---|---|
| Validación de entrada | DTOs con lista blanca, `forbidNonWhitelisted`, longitudes máximas, UUID con `ParseUUIDPipe`, decimales por patrón (`^\d{1,15}(\.\d{1,4})?$`; porcentajes `^\d{1,3}(\.\d{1,2})?$`), fechas `YYYY-MM-DD` |
| Inyección | Prisma con parámetros; `sortBy` contra lista blanca; búsquedas con `contains`/`mode: insensitive` o `$queryRaw` con plantilla (nunca `Unsafe`) |
| Asignación masiva | `ownerId`, `code`, `phaseId` solo por sus endpoints/permisos; `lastActivityAt`, `duplicatedFromId`, `conversionFactor`, `tonnage`, `closedAt`, `exchangeRate`, `exchangeRateDate`, `estimatedAmountUsd` nunca se aceptan del cliente |
| Lotes | `PUT /forecast/lines` ≤ 500 líneas; límite de tamaño de cuerpo global; `pageSize` ≤ 100 |
| Concurrencia | Folios con bloqueo de fila; cambio de etapa con `FOR UPDATE`; unicidad de producto asociado con bloqueo consultivo; forecast con `FOR UPDATE` + `expectedUpdatedAt` |
| Datos sensibles | El módulo no maneja PII de contactos. Nombres de usuarios solo como `displayName`. Logs estructurados sin cuerpos de petición ni valores comerciales; correlation ID en todo error |
| Auditoría | Toda mutación relevante (C.1 RN-03.13). Compromiso existente: la fila de auditoría se escribe tras la transacción (PLAN-ADMIN §10); si se resuelve la unidad de trabajo, se adopta |
| Adjuntos (DM-8, ADR-021) | Lista blanca de tipos por firma del contenido y tamaño (`crm.adjuntos.*`, corte en streaming); nombre original saneado solo para mostrar; `storageKey` generado `<año>/<mes>/<uuid>` sin datos del usuario y protegido frente a *path traversal* por el adaptador; descarga solo por la API tras comprobar visibilidad y permiso del proyecto, con `Content-Disposition: attachment` y `nosniff`; nunca servido como estático; sin rutas ni claves de almacenamiento en la respuesta; sin antivirus (mitigación de 00 §2.11) |
| Enumeración | `404` idéntico para inexistente, eliminado y fuera de alcance |
| Rate limiting | El global de la API; `429` documentado |

---

## I. Criterios de aceptación

Formato Given/When/Then. Cada criterio cita su funcionalidad (F-xx) y se
verifica con al menos una prueba de §J.

### F-10 — Crear proyecto

- **AC-03.1 (F-10)** — *Given* un asesor con `proyectos.crear` y un cliente activo visible, *When* envía nombre, cliente, país y fechas coherentes sin asesor, *Then* recibe `201` con `Location`, un UUID, un código `PRY-<año>-<5 dígitos>` consecutivo, asesor = él mismo, fase `DISENO` (por `crm.valores_por_defecto`) con el porcentaje por defecto, una fila en `project_phase_history` con `fromPhaseId` nulo, `createdById` = él, `lastActivityAt` ≈ ahora y una entrada `crm.project.created` en auditoría.
- **AC-03.2 (F-10)** — *Given* un cliente inexistente, eliminado lógicamente o fuera del alcance del usuario, *When* intenta crear el proyecto, *Then* recibe `404 RESOURCE_NOT_FOUND` (vía `CustomerReferenceGuard`, sin revelar si existe) y no se crea nada ni se consume folio; *Given* un cliente con estado `metadata.isActive = false`, *Then* recibe `422 CUSTOMER_INACTIVE`.
- **AC-03.3 (F-10)** — *Given* que falta el nombre (o un campo añadido en `crm.campos_obligatorios.project`), *When* envía el formulario, *Then* recibe `400`/`422 REQUIRED_FIELD_MISSING` con `details[].field` del campo, y la interfaz lo marca bajo el campo.
- **AC-03.4 (F-10)** — *Given* fin estimado anterior al inicio estimado, *When* crea o edita, *Then* recibe `422 INVALID_DATE_RANGE`; una inserción directa en base con esas fechas falla por `ck_projects_estimated_dates`.
- **AC-03.5 (F-10)** — *Given* un asesor sin `proyectos.administrar`, *When* indica como responsable a otro usuario, *Then* recibe `403 FIELD_NOT_EDITABLE`; *Given* un manager con `administrar`, *When* indica un usuario inactivo o fuera de su alcance, *Then* recibe `422 INVALID_OWNER`; con un miembro activo de su equipo, `201`.
- **AC-03.6 (F-10)** — *Given* un usuario sin `proyectos.administrar` que envía `code`, *Then* recibe `403 FIELD_NOT_EDITABLE`; *Given* un administrador que envía un código ya usado, *Then* recibe `409 PROJECT_CODE_TAKEN`.
- **AC-03.7 (F-10, F-11)** — *Given* el almacenamiento de ADR-021 configurado, *When* el usuario adjunta un PDF permitido de tamaño válido al proyecto recién creado, *Then* aparece en la sección de adjuntos con nombre, tamaño, autor y fecha y el binario queda bajo `ATTACHMENTS_STORAGE_PATH` con una clave generada `<año>/<mes>/<uuid>`; un tipo no permitido (detectado por la firma, aunque la extensión diga otra cosa) devuelve `422 ATTACHMENT_TYPE_NOT_ALLOWED` y uno mayor que `crm.adjuntos.max_mb`, `413 ATTACHMENT_TOO_LARGE`; en ambos casos no queda fila ni binario. El alta del proyecto funciona también sin adjuntos.
- **AC-03.8 (F-10)** — *Given* una petición sin token, *Then* `401`; *Given* un usuario sin `proyectos.crear`, *Then* `403` y la ruta `/proyectos/nuevo` muestra "Acceso denegado".

### F-11 — Consultar y editar proyectos

- **AC-03.9 (F-11)** — *Given* un proyecto visible, *When* el usuario abre `/proyectos/:id`, *Then* ve las diez secciones (general, clasificación, fase, oportunidades, resultados, productos, forecast, seguimiento, adjuntos, historial), cada una con su estado de carga, vacío y error independiente; `?seccion=productos` abre directamente esa sección.
- **AC-03.10 (F-11)** — *Given* el asesor responsable con `proyectos.editar`, *When* cambia nombre y dirección, *Then* recibe `200`, `updatedById` = él, `lastActivityAt` se actualiza en la misma transacción y la auditoría registra solo los campos cambiados (`{name: {antes, despues}, address: …}`); un `PATCH` sin cambios no deja registro.
- **AC-03.11 (F-11, F-14)** — *Given* un usuario que ve el proyecto por alcance pero no es su responsable y no tiene `proyectos.administrar`, *When* abre la ficha, *Then* `capabilities.canEdit = false`, no ve botones de edición y un `PATCH` directo devuelve `403`.
- **AC-03.12 (F-11)** — *Given* un proyecto fuera del alcance del usuario (o eliminado, o inexistente), *When* pide `GET`, `PATCH` o cualquier subrecurso, *Then* recibe `404` con el mismo cuerpo en los tres casos.
- **AC-03.13 (F-11)** — *Given* un proyecto con cambios de fase, de etapa de sus oportunidades, de resultado y de datos, *When* abre la sección Historial, *Then* ve una línea de tiempo descendente y paginada con tipo, campo, antes → después, usuario y fecha, sin entradas duplicadas, y puede filtrar por tipo.
- **AC-03.14 (F-11)** — *Given* un usuario con `proyectos.eliminar` y un proyecto sin oportunidades abiertas ni hijos activos, *When* lo elimina, *Then* recibe `204`, el proyecto deja de aparecer en búsqueda, vista de equipo y Clientes §4.4, `GET` responde `404` y sus historiales siguen en base; *Given* oportunidades abiertas, *Then* recibe `409 PROJECT_HAS_ACTIVE_CHILDREN` con el detalle de bloqueos.
- **AC-03.15 (F-11)** — *Given* un proyecto con visitas o actividades vinculadas, *When* se intenta cambiar su cliente, *Then* recibe `409 PROJECT_CUSTOMER_LOCKED`; sin vínculos, el cambio se acepta con un cliente válido.
- **AC-03.16 (F-11)** — *Given* que `GET /me/menu` no trae opciones de `actividad-comercial` y el usuario tiene `actividades.ver`, *When* se abre la sección Seguimiento, *Then* muestra el estado informativo y no se emite ninguna petición a `/follow-ups` ni `/interactions`; sin `actividades.ver` ni `visitas.ver`, la sección no aparece; *Given* el Módulo 4 implementado, *Then* `CommercialActivitySection` muestra última interacción, próxima acción, responsable, fecha, notas, adjuntos y las interacciones con enlace al registro de origen, y los botones de nueva actividad y planificar visita llevan el cliente y el proyecto preseleccionados.
- **AC-03.95 (F-10, F-11)** — *Given* un adjunto de un proyecto visible, *When* el usuario con `proyectos.ver` pide `GET /projects/{id}/attachments/{attachmentId}/content`, *Then* recibe `200` con el `Content-Type` guardado, `Content-Disposition: attachment` (nombre saneado) y `X-Content-Type-Options: nosniff`, y ninguna respuesta de la API contiene la ruta ni la clave de almacenamiento; *Given* un proyecto fuera del alcance, un adjunto de otro proyecto o un adjunto eliminado, *Then* `404`; no existe ninguna URL estática que sirva el archivo.

### F-12 — Duplicar proyecto

- **AC-03.17 (F-12)** — *Given* un proyecto visible y un usuario con `proyectos.crear`, *When* duplica con nombre nuevo y las casillas por defecto, *Then* se crea un proyecto con UUID y código nuevos, `duplicatedFromId` = origen, país, ciudad, dirección, descripción y clasificación copiados, tonelaje recalculado con la regla vigente, y la auditoría `crm.project.duplicated` con el origen.
- **AC-03.18 (F-12)** — *Given* un origen con oportunidades, resultados, historial de fase, forecast, adjuntos y visitas/actividades, *When* se duplica, *Then* el nuevo proyecto tiene 0 oportunidades, 0 resultados, una única fila de historial de fase (la inicial, fase por defecto), 0 líneas de forecast, 0 adjuntos, 0 visitas/actividades y ninguna entrada de auditoría heredada.
- **AC-03.19 (F-12)** — *Given* la casilla "Productos asociados" marcada, *When* se duplica, *Then* se copian solo las asociaciones activas, todas con estado inicial `PROPUESTO`, sin oportunidad, con la misma cantidad y unidad y tonelaje recalculado; desmarcada, no se copia ninguna.
- **AC-03.20 (F-12)** — *Given* el diálogo de duplicado, *When* el nombre está vacío, *Then* no se puede confirmar (`400` si se fuerza); *When* un usuario sin `administrar` cambia el asesor, *Then* `403`; *When* el cliente elegido no existe o no es visible, *Then* `404`; inactivo, `422 CUSTOMER_INACTIVE`; *When* el origen no es visible, *Then* `404`.

### F-13 — Buscar proyectos

- **AC-03.21 (F-13)** — *Given* proyectos variados, *When* el usuario combina cualquier subconjunto de los filtros nombre, código, cliente, país, ciudad, asesor, tipo, fase, etapa y fechas, *Then* solo obtiene los proyectos que cumplen **todos** los filtros, y cada filtro por separado funciona.
- **AC-03.22 (F-13)** — *Given* un proyecto con dos oportunidades en `COTIZANDO`, *When* se filtra por esa etapa, *Then* el proyecto aparece **una sola vez** y `totalItems` lo cuenta una vez.
- **AC-03.23 (F-13)** — *Given* `sortBy` fuera de la lista blanca o `pageSize = 101`, *Then* `400`; *Given* `sortBy=estimatedDecisionDate&sortOrder=asc`, *Then* el orden es correcto y estable (desempate por `id`); la paginación devuelve `{ data, pagination }` coherente.
- **AC-03.24 (F-13)** — *Given* usuarios de cada alcance, *When* buscan sin filtros, *Then* cada uno obtiene exactamente los proyectos de su alcance y un filtro por asesor ajeno fuera del alcance devuelve vacío.
- **AC-03.25 (F-13)** — *Given* una búsqueda filtrada, *When* el usuario recarga o comparte la URL, *Then* se restauran filtros, orden y página; clic en una fila abre la ficha.

### F-14 — Visualización de proyectos del equipo

- **AC-03.26 (F-14)** — *Given* un asesor (`OWN`), un manager (`TEAM`, con subequipos), un responsable de país (`COUNTRY`) y un administrador, *When* abren `/proyectos/equipo`, *Then* el asesor ve solo los suyos; el manager, los de los miembros y responsables de sus equipos y subequipos; el responsable de país, los de su país; el administrador, todos; y el encabezado describe ese alcance.
- **AC-03.27 (F-14)** — *Given* la vista de equipo, *Then* cada fila muestra proyecto, cliente, responsable, equipo (equipo principal del responsable), fase con porcentaje, estado comercial y última actualización (`lastActivityAt`), ordenadas por última actualización descendente.
- **AC-03.28 (F-14)** — *Given* un usuario con alcance `TEAM` y `proyectos.ver` + `proyectos.editar` pero sin `proyectos.administrar`, *When* consulta la vista, *Then* ve los proyectos de su equipo, los ajenos con indicador "Solo lectura" (`canEdit = false`), y un `PATCH` a uno ajeno devuelve `403`.
- **AC-03.29 (F-14)** — *Given* un filtro por un equipo fuera del alcance, *Then* el resultado es vacío (no `403` ni datos ajenos); el selector de equipos solo ofrece equipos del alcance.

### F-15 — Clasificación de proyectos

- **AC-03.30 (F-15)** — *Given* el formulario de clasificación, *Then* tipo y sector se cargan desde `crm.tipo_proyecto` y `crm.sector_proyecto` y las unidades desde `units_of_measure` (sin listas en el código); *When* se envía un elemento inactivo o de otro catálogo, *Then* `422 INVALID_CATALOG_VALUE`.
- **AC-03.31 (F-15)** — *Given* reglas `M2→TON` GLOBAL (factor a) y `M2→TON` para el tipo `VIVIENDA` (factor b), *When* se clasifica un proyecto `VIVIENDA` en `M2` con cantidad q en modo `RULE`, *Then* se aplica la regla de tipo (precedencia), se guardan `conversionRuleId` y `conversionFactor = b` y `estimatedTonnage = round(q × b, 4)`; para otro tipo se aplica la GLOBAL.
- **AC-03.32 (F-15)** — *Given* una unidad sin regla aplicable hacia `TON`, *When* se elige modo `RULE`, *Then* `422 CONVERSION_RULE_NOT_FOUND`; *Given* una regla inactiva o que convierte hacia una unidad distinta de `crm.forecast.unidad_tonelaje`, *Then* no se aplica (`CONVERSION_RULE_NOT_FOUND` / `INVALID_CONVERSION_RULE`); una inserción directa con regla de otra unidad origen falla por la FK compuesta.
- **AC-03.33 (F-15)** — *Given* el modo `MANUAL` con tonelaje 50, *Then* se guarda `estimatedTonnage = 50` con `conversionRuleId` y `conversionFactor` nulos; *Given* `NONE`, tonelaje y regla nulos.
- **AC-03.34 (F-15)** — *Given* un proyecto clasificado con factor b, *When* el administrador cambia el factor de la regla, *Then* el tonelaje guardado del proyecto no cambia hasta que se vuelva a guardar la clasificación.
- **AC-03.35 (F-15)** — *Given* el código del frontend, *Then* no contiene factores de conversión: la vista previa usa `GET /unit-conversions/resolve` y el valor definitivo lo calcula el backend (revisión de código + prueba de componente con respuesta simulada).

### F-16 — Fase del cliente

- **AC-03.36 (F-16)** — *Given* un proyecto en `DISENO` 10 %, *When* el responsable cambia a `COTIZACION` 30 % con comentario, *Then* la ficha muestra la nueva fase, 30 %, `phaseUpdatedAt` = ahora y el comentario; `project_phase_history` gana una fila con fase y porcentaje anterior y nuevo, comentario, usuario y fecha.
- **AC-03.37 (F-16)** — *Given* porcentaje -1 o 100.01, *Then* `422 INVALID_PROGRESS`; una actualización directa en base fuera de 0–100 falla por `ck_projects_phase_progress`.
- **AC-03.38 (F-16)** — *Given* `crm.proyectos.reglas_avance = {"FINALIZADO":{"progresoMinimo":100}}`, *When* se pasa a `FINALIZADO` con 90 %, *Then* `422 PHASE_PROGRESS_RULE`; con 100 %, `201`. *When* el administrador cambia el parámetro, *Then* la nueva regla rige sin desplegar.
- **AC-03.39 (F-16, F-17)** — *Given* un proyecto en `CONSTRUCCION` con una oportunidad `COTIZANDO`, *When* la oportunidad pasa a `GANADO` (o a cualquier etapa), *Then* la fase y el porcentaje del proyecto no cambian; *Given* un proyecto en `FINALIZADO`, *Then* se pueden crear, editar y cerrar oportunidades en él.
- **AC-03.40 (F-16)** — *Given* varios cambios de fase (incluido un retroceso y un cambio solo de porcentaje), *When* se consulta el historial, *Then* aparecen todos en orden cronológico; un cambio sin diferencias devuelve `422 PHASE_UNCHANGED`.

### F-17 — Oportunidades comerciales

- **AC-03.41 (F-17)** — *Given* un proyecto propio, *When* el asesor crea una oportunidad sin etapa, *Then* recibe `201` con código `OPO-<año>-<5 dígitos>`, etapa `CONTACTADO` (parámetro), fecha = hoy en la zona de negocio, asesor = él, y una fila de historial de etapa con origen nulo; el proyecto actualiza `lastActivityAt`.
- **AC-03.42 (F-17)** — *Given* una etapa cerrada (`GANADO`) como etapa inicial, *Then* `422 INVALID_INITIAL_STAGE`.
- **AC-03.43 (F-17)** — *Given* una oportunidad propia, *When* edita estimación, siguiente acción y fecha, *Then* `200` y auditoría de los campos cambiados; un monto sin moneda devuelve `422 CURRENCY_REQUIRED` (el servidor no aplica moneda por defecto: la propone el formulario, RN-03.78); un monto o tonelaje negativo, `400`/`422` y falla en base por `ck_opportunities_amount`/`_tonnage`.
- **AC-03.44 (F-17)** — *Given* el parámetro de transiciones por defecto, *When* se pide `CONTACTADO → COTIZANDO`, *Then* `201` e historial; *When* se pide `PERDIDO → COTIZANDO` sin `administrar`, *Then* `403`/`422 INVALID_STAGE_TRANSITION`; *When* se pide la misma etapa, *Then* `422 STAGE_UNCHANGED`.
- **AC-03.45 (F-17)** — *Given* que el administrador quita `GANADO` de los destinos de `CONTACTADO` en `crm.oportunidades.transiciones_etapa`, *When* se pide `CONTACTADO → GANADO`, *Then* `422 INVALID_STAGE_TRANSITION` sin redesplegar, y `allowedTransitions` del detalle ya no lo ofrece; *Given* una etapa nueva `NEGOCIANDO` abierta no listada en el mapa, *Then* desde ella se puede ir a cualquier etapa activa (regla de respaldo).
- **AC-03.46 (F-17)** — *Given* oportunidades de varios asesores y etapas, *When* se filtra por etapa y asesor, *Then* solo aparecen las que cumplen ambos; el tablero muestra una columna por etapa activa ordenada por `metadata.order` con el conteo correcto (`/opportunities/stage-summary`).
- **AC-03.47 (F-17)** — *Given* tres cambios de etapa, *When* se consulta el historial de la oportunidad, *Then* hay cuatro filas (alta + tres cambios) con origen, destino, comentario, usuario y fecha.
- **AC-03.48 (F-17)** — *Given* un proyecto, *When* se crean tres oportunidades, *Then* las tres aparecen en la sección Oportunidades de la ficha con etapas independientes.
- **AC-03.49 (F-17, F-18)** — *Given* una oportunidad `GANADO` con resultado, *When* un usuario con `oportunidades.administrar` la reabre a `COTIZANDO` con comentario, *Then* el resultado vigente desaparece, el historial de resultado registra `CLEARED`, `closedAt` queda nulo y la etapa cambia; sin comentario, `422 COMMENT_REQUIRED`; sin `administrar`, `403`.
- **AC-03.50 (F-17)** — *Given* una oportunidad abierta sin productos activos ni actividades abiertas, *When* se elimina con `oportunidades.eliminar`, *Then* `204` y desaparece de listas y conteos; *Given* una oportunidad cerrada, *Then* `409 OPPORTUNITY_CLOSED`; *Given* productos asociados activos, *Then* `409 OPPORTUNITY_HAS_DEPENDENCIES`.
- **AC-03.87 (F-17)** — *Given* un proyecto de Guatemala y una tasa `GTQ` de 7,75 con vigencia 2026-10-01, *When* el asesor crea una oportunidad con fecha 2026-10-10, `estimatedAmount = "7750"` y `currencyCode = "GTQ"`, *Then* recibe `201` con `currencyCode = "GTQ"`, `exchangeRate = "7.75000000"`, `exchangeRateDate = "2026-10-01"`, `estimatedAmountUsd = "1000.0000"` y sin `warnings`; *When* la crea con `currencyCode = "USD"`, *Then* `exchangeRate = "1.00000000"`, `exchangeRateDate` nula y `estimatedAmountUsd` igual al monto.
- **AC-03.88 (F-17)** — *Given* un proyecto de Guatemala, *When* se envía una estimación en `HNL` (o en una moneda inexistente), *Then* `422 CURRENCY_NOT_ALLOWED` y no se guarda nada; *Given* un proyecto de El Salvador (moneda del país `USD`), *When* se envía `GTQ`, *Then* `422 CURRENCY_NOT_ALLOWED` y solo se admite `USD`.
- **AC-03.89 (F-17)** — *Given* que no existe ninguna tasa `GTQ` con vigencia ≤ la fecha de la oportunidad, *When* se crea o edita la estimación en `GTQ`, *Then* `422 EXCHANGE_RATE_NOT_FOUND` con `details.currencyCode` y `details.date`, la oportunidad no se crea (ni se modifica) y la misma estimación en `USD` se acepta.
- **AC-03.90 (F-17)** — *Given* `crm.tipos_cambio.dias_aviso_antiguedad = 31` y una tasa `GTQ` vigente desde hace 45 días respecto a la fecha de la oportunidad, *When* se guarda la estimación, *Then* `201`/`200` con los cinco campos guardados y `warnings: [{ code: "EXCHANGE_RATE_STALE", details: { ageDays: 45, thresholdDays: 31, … } }]`, y el formulario muestra un aviso no bloqueante; con una tasa de hace 10 días, sin `warnings`.
- **AC-03.91 (F-17)** — *Given* una oportunidad guardada en `GTQ` con tasa 7,75, *When* se añade después una tasa nueva 7,80 con vigencia anterior a su fecha o se corrige la fila aplicada, *Then* la oportunidad conserva `exchangeRate`, `exchangeRateDate` y `estimatedAmountUsd`; *When* se edita solo la siguiente acción, la descripción o la etapa, *Then* la foto no cambia; *When* se edita el monto, la moneda o la fecha de la oportunidad, *Then* se vuelve a resolver la tasa y a calcular el equivalente, y la auditoría registra la diferencia.
- **AC-03.92 (F-17)** — *Given* un cuerpo que incluye `exchangeRate`, `exchangeRateDate` o `estimatedAmountUsd`, *When* se crea o edita la oportunidad, *Then* `400 VALIDATION_FAILED` (`forbidNonWhitelisted`); *Given* `estimatedAmount` y `currencyCode` a `null` en un `PATCH`, *Then* se borran los cinco campos; una inserción directa en base con monto sin equivalente en USD, o en USD con tasa distinta de 1, falla por `ck_opportunities_amount_set` / `ck_opportunities_usd_identity`.
- **AC-03.93 (F-17)** — *Given* un proyecto visible de Guatemala, *When* el formulario pide `GET /opportunities/form-options?projectId={id}`, *Then* `currencies.allowed` contiene exactamente `GTQ` y `USD` y `currencies.defaultCode = "GTQ"`, y el formulario de nueva oportunidad preselecciona `GTQ`; *Given* un proyecto de Ecuador, *Then* `allowed` es solo `USD` y `defaultCode = "USD"`; *Given* un proyecto no visible, *Then* `404`; sin `projectId`, la respuesta trae `baseCurrencyCode = "USD"` y no trae `currencies`.
- **AC-03.94 (F-17, F-11)** — *Given* oportunidades en `GTQ` y en `USD`, *When* se ven en la sección Oportunidades de la ficha, en la lista y en el tablero del pipeline y en el detalle, *Then* cada una muestra el monto original con su moneda y el equivalente en USD (el detalle muestra además la tasa y su fecha); *When* se ordena por `sortBy=estimatedAmountUsd`, *Then* el orden sigue el equivalente en USD, no el monto original.

### F-18 — Resultado de oportunidades

- **AC-03.51 (F-18)** — *Given* una oportunidad abierta, *When* pasa a `GANADO` sin resultado, *Then* `422 RESULT_REQUIRED`; con resultado `LOST`, `422 RESULT_STAGE_MISMATCH`; con `WON` o `PARTIAL`, `201`. *When* pasa a `PERDIDO` con `LOST` y motivo, `201`. *When* se envía resultado a una etapa abierta, `422 RESULT_NOT_ALLOWED`.
- **AC-03.52 (F-18)** — *Given* resultado `LOST` sin motivo, *Then* `422 RESULT_REASON_REQUIRED`; una inserción directa en `opportunity_results` con `LOST` y `reason_id` nulo falla por `ck_opportunity_results_lost_reason`.
- **AC-03.53 (F-18)** — *Given* resultado `PARTIAL` sin porcentaje, *Then* `422 RESULT_PERCENT_REQUIRED`; con 120 %, `422 INVALID_PROGRESS`; ambos casos fallan también en base (`ck_…_partial_percent`, `ck_…_percent_range`).
- **AC-03.54 (F-18)** — *Given* un resultado sin fecha de decisión, *Then* `400`; con fecha, se guarda como fecha de calendario sin desplazamiento por zona horaria.
- **AC-03.55 (F-18)** — *Given* una oportunidad cerrada como `PARTIAL` 60 %, *Then* su etapa es `GANADO`, el historial de etapas tiene una sola fila nueva (el cierre) y no aparece ninguna etapa "Parcial"; Inicio/Reportes la cuentan como ganada con desglose de parcial.
- **AC-03.56 (F-18)** — *Given* una oportunidad `GANADO` + `WON`, *When* el responsable con `cerrar` cambia el resultado a `PARTIAL` 70 % con `PUT /result`, *Then* `200`, historial `CHANGED` y auditoría `crm.opportunity_result.changed`; *When* intenta cambiar a `LOST` por `PUT`, *Then* `422 RESULT_STAGE_MISMATCH`; *When* la oportunidad está abierta, *Then* `409 OPPORTUNITY_NOT_CLOSED`.
- **AC-03.57 (F-18)** — *Given* un motivo de otro catálogo, inactivo o cuyo `appliesTo` no incluye el resultado, *Then* `422 INVALID_CATALOG_VALUE`; el selector del formulario solo ofrece motivos aplicables.
- **AC-03.58 (F-18)** — *Given* un usuario con `oportunidades.editar` pero sin `oportunidades.cerrar`, *When* intenta pasar a una etapa cerrada o modificar el resultado, *Then* `403` y la interfaz no le ofrece etapas cerradas.

### F-19 — Productos asociados

- **AC-03.59 (F-19)** — *Given* el catálogo local, *When* el usuario busca por parte del SKU o de la descripción y filtra por familia, *Then* obtiene solo productos activos coincidentes, paginados, con SKU, descripción, familia y unidad base.
- **AC-03.60 (F-19)** — *Given* un proyecto propio, *When* asocia un producto con cantidad y estado, con y sin oportunidad del mismo proyecto, *Then* `201` en ambos casos; *When* indica una oportunidad de otro proyecto, *Then* `422 OPPORTUNITY_NOT_IN_PROJECT` (y la base lo impide por la FK compuesta).
- **AC-03.61 (F-19)** — *Given* reglas `VAR→TON` por producto, `M→TON` por familia y GLOBAL, *When* se asocia, *Then* el tonelaje usa la regla de mayor precedencia (PRODUCT > FAMILY > PROJECT_TYPE > GLOBAL), guarda regla y factor y `tonnage = round(cantidad × factor, 4)`.
- **AC-03.62 (F-19)** — *Given* una unidad sin regla aplicable, *When* se asocia, *Then* se guarda con tonelaje, regla y factor nulos, la ficha muestra "Sin conversión" y la línea no suma en el total de toneladas.
- **AC-03.63 (F-19)** — *Given* un producto ya asociado activo al proyecto sin oportunidad, *When* se vuelve a asociar sin oportunidad, *Then* `409 PROJECT_PRODUCT_DUPLICATE`; asociado a una oportunidad distinta, se acepta. Dos peticiones simultáneas idénticas dejan una sola asociación.
- **AC-03.64 (F-19)** — *Given* cantidad negativa, *Then* `422 INVALID_QUANTITY` (y `ck_project_products_quantity` en base); *Given* un producto inactivo, *Then* `422 PRODUCT_INACTIVE`.
- **AC-03.65 (F-19)** — *Given* una asociación, *When* se edita cantidad, unidad, estado u oportunidad, *Then* el tonelaje se recalcula con la regla vigente, se audita la diferencia y se actualiza `lastActivityAt`.
- **AC-03.66 (F-19)** — *Given* una asociación sin forecast en la ventana, *When* se quita, *Then* `204` y desaparece de la ficha (queda en base con `deletedAt`); *Given* forecast > 0 en la ventana para ese producto y ninguna otra asociación activa, *Then* `409 PRODUCT_HAS_FORECAST`.
- **AC-03.67 (F-19)** — *Given* líneas en `PROPUESTO` (activo), `DESCARTADO` (inactivo) y una sin conversión, en `VAR` y `KG`, *When* se abre la sección Productos, *Then* el total en toneladas suma solo las activas con tonelaje, las cantidades se muestran por unidad (VAR y KG por separado) y se indica cuántas líneas no tienen conversión.
- **AC-03.68 (F-19)** — *Given* una asociación, *When* se edita, *Then* la tabla `products` no cambia; *When* el maestro cambia la descripción del producto, *Then* la ficha muestra la descripción nueva (no hay copia en la asociación).

### F-20 — Forecast comercial M+6

- **AC-03.69 (F-20)** — *Given* la zona `America/Guatemala` y la fecha 2026-12-15, *When* se abre el forecast, *Then* la ventana es enero–junio de 2027 (M+1…M+6) y las filas son los pares proyecto-producto con asociación activa visibles; *Given* el 2026-12-31 23:30 hora de Guatemala (ya 1 de enero en UTC), *Then* la ventana sigue siendo enero–junio de 2027.
- **AC-03.70 (F-20)** — *Given* una celda vacía, *When* se guarda una cantidad, *Then* se crea la línea; *When* se vuelve a guardar otra cantidad en la misma celda, *Then* se actualiza la misma línea (no hay segunda fila); una inserción directa duplicada falla por `uq_forecast_lines_project_product_period`.
- **AC-03.71 (F-20)** — *Given* un lote con una línea negativa entre otras válidas, *Then* `422 INVALID_QUANTITY` con `details[].field = "lines[i].quantity"` y **ninguna** línea del lote se guarda; la celda queda marcada en la matriz.
- **AC-03.72 (F-20)** — *Given* una línea del mes en curso o de un mes pasado, o posterior a M+6, *Then* `422 FORECAST_PERIOD_OUT_OF_WINDOW`; en la interfaz esas celdas son de solo lectura.
- **AC-03.73 (F-20)** — *Given* una regla aplicable, *Then* cada línea guarda regla, factor y tonelaje calculado; sin regla, tonelaje nulo y la celda indica "Sin conversión".
- **AC-03.74 (F-20)** — *Given* líneas en TON, KG (con regla) y VAR sin regla, *When* se consultan los totales, *Then* el total por período y el acumulado (corrido y de la ventana) son sumas de toneladas solamente, las cantidades aparecen agrupadas por unidad sin mezclarse y se informa el número de líneas sin conversión.
- **AC-03.75 (F-20)** — *Given* los filtros proyecto, producto, asesor y mes (individuales y combinados), *Then* filas **y** totales reflejan exactamente el subconjunto filtrado.
- **AC-03.76 (F-20)** — *Given* una línea guardada, *Then* la celda muestra su fecha de actualización y el usuario que la modificó, y la fila su fecha más reciente.
- **AC-03.77 (F-20)** — *Given* líneas en noviembre de 2026 guardadas en octubre, *When* se consulta en diciembre, *Then* noviembre ya no está en la ventana ni es editable, pero la línea sigue en base y aparece en modo Historial con su cantidad y fecha.
- **AC-03.78 (F-20)** — *Given* un producto no asociado (o con la asociación quitada) al proyecto, *When* se intenta guardar forecast, *Then* `422 PRODUCT_NOT_ASSOCIATED`.
- **AC-03.79 (F-20)** — *Given* un usuario sin `forecast.administrar`, *When* envía `ownerId` distinto del asesor del proyecto o edita el forecast de un proyecto ajeno visible, *Then* `403`; con `administrar` dentro del alcance, `200`.
- **AC-03.80 (F-20)** — *Given* un lote con 3 líneas cambiadas y 2 iguales a lo guardado, *Then* la respuesta informa `updated/created = 3`, `unchanged = 2` y hay exactamente 3 entradas `crm.forecast_line.*` en auditoría.
- **AC-03.81 (F-20, F-11)** — *Given* la ficha de un proyecto, *When* se abre la sección Forecast, *Then* muestra la matriz solo de ese proyecto con los mismos totales y reglas que la pantalla general.
- **AC-03.82 (F-20)** — *Given* dos usuarios con la misma celda abierta, *When* el segundo guarda con un `expectedUpdatedAt` anterior al guardado del primero, *Then* `409 FORECAST_LINE_STALE` con las líneas en conflicto y nada del lote se guarda.
- **AC-03.83 (F-20)** — *Given* un proyecto fuera del alcance, *Then* sus filas no aparecen y un `PUT` con su `projectId` devuelve `404`.

### Transversales

- **AC-03.84 (F-10…F-20)** — *Given* un usuario con `proyectos.ver` y sin `forecast.ver`, *When* carga el menú, *Then* `GET /me/menu` le da "Proyectos" y "Proyectos del equipo" pero no "Forecast M+6", y la URL `/proyectos/forecast` muestra "Acceso denegado"; las cuatro rutas estáticas están en `app-routes.registry.json` y la prueba de registro pasa.
- **AC-03.85 (F-11, F-15…F-20)** — *Given* cualquier mutación del módulo sobre un proyecto o algo suyo, *Then* `projects.last_activity_at` se actualiza en la misma transacción; si la mutación falla, no cambia.
- **AC-03.86 (F-13; ∫ F-08, F-02)** — *Given* un cliente con proyectos en fases y estados comerciales distintos, *When* el Módulo 2 llama a `GET /projects?customerId={id}&commercialStatus=WON&sortBy=estimatedDecisionDate`, *Then* recibe solo los proyectos visibles de ese cliente con código, nombre, ciudad, país, fase con porcentaje, `commercialStatus { kind, label, stage }`, asesor y fecha estimada de decisión; *When* Inicio navega a `/proyectos?active=true` o a `/proyectos/oportunidades?status=OPEN` / `?outcome=WON,PARTIAL&decisionFrom=…&decisionTo=…`, *Then* las pantallas aplican esos filtros y los conteos coinciden con los de las tarjetas (mismos predicados DEF-A/DEF-B, RN-03.77).

---

## J. Pruebas funcionales

Niveles (TESTING.md, ADR-013): **U** = unitaria backend (Jest, puro, sin base);
**I** = integración backend contra PostgreSQL efímero (`backend/test/*.e2e.spec.ts`,
`supertest`, `test-app.ts`); **D** = restricción de base (I, inserción directa con
`$executeRaw` en la prueba); **C** = componente frontend (Vitest + RTL,
`renderWithProviders`, `mockApi`); **E** = E2E Playwright. Tipo: **+** positivo,
**−** negativo, **∫** integración entre módulos o capas.

| ID | Nivel | Tipo | Caso | AC |
|---|---|---|---|---|
| PF-03.1 | I | + | Alta mínima: 201, `Location`, código con formato y consecutivo, fase por defecto, historial inicial, auditoría | AC-03.1 |
| PF-03.2 | I | ∫ | Dos altas concurrentes obtienen códigos distintos y consecutivos (bloqueo de secuencia) | AC-03.1 |
| PF-03.3 | I | − | Cliente inexistente / eliminado / fuera de alcance → 404 idéntico (`CustomerReferenceGuard`); secuencia sin consumir | AC-03.2 |
| PF-03.4 | I | − | Cliente con estado inactivo → 422 `CUSTOMER_INACTIVE` | AC-03.2 |
| PF-03.5 | I | − | Sin nombre → 400; campo añadido en `crm.campos_obligatorios` ausente → 422 `REQUIRED_FIELD_MISSING` | AC-03.3 |
| PF-03.6 | C | − | Formulario marca obligatorios leídos del contrato de ajustes y pinta `details[].field` del servidor | AC-03.3 |
| PF-03.7 | U | − | Validador de fechas: fin < inicio inválido; decisión sin restricción | AC-03.4 |
| PF-03.8 | D | − | Inserción con fin < inicio viola `ck_projects_estimated_dates` | AC-03.4 |
| PF-03.9 | I | − | Asesor ajeno sin `administrar` → 403 `FIELD_NOT_EDITABLE`; usuario inactivo/fuera de alcance → 422 `INVALID_OWNER`; miembro del equipo con `administrar` → 201 | AC-03.5 |
| PF-03.10 | I | − | `code` sin `administrar` → 403 `FIELD_NOT_EDITABLE`; código repetido → 409 | AC-03.6 |
| PF-03.11 | I | + | Subir, listar, descargar y eliminar (lógico) un adjunto con `LocalFileSystemStorage` sobre una carpeta temporal; tipo no admitido por firma → 422 `ATTACHMENT_TYPE_NOT_ALLOWED`; exceso de tamaño → 413 `ATTACHMENT_TOO_LARGE`; sin fila ni binario residual | AC-03.7 |
| PF-03.12 | C | + | Alta con archivos en cola: se suben tras el `201` del proyecto; validación local de tamaño y tipo; `413`/`422` del servidor pintados por archivo; sin archivos el alta funciona igual | AC-03.7 |
| PF-03.13 | I | − | `POST /projects` sin token → 401; sin `proyectos.crear` → 403 | AC-03.8 |
| PF-03.14 | C | + | Ficha: diez secciones, `?seccion=` abre la sección, error en una sección no afecta a las demás | AC-03.9 |
| PF-03.15 | I | + | `PATCH` por el responsable: 200, `updatedById`, `lastActivityAt`, auditoría con solo los campos cambiados; `PATCH` sin cambios sin auditoría | AC-03.10 |
| PF-03.16 | I | − | Usuario con alcance pero no responsable ni `administrar` → `canEdit=false` y `PATCH` 403 | AC-03.11 |
| PF-03.17 | C | − | Con `canEdit=false` no se muestran acciones de edición en ninguna sección | AC-03.11 |
| PF-03.18 | I | − | Inexistente, eliminado y fuera de alcance → 404 idéntico en `GET`, `PATCH` y subrecursos | AC-03.12 |
| PF-03.19 | I | + | Historial combina fase, etapa, resultado y auditoría de hijos; orden, paginación, filtro `kind`, sin duplicados | AC-03.13 |
| PF-03.20 | I | + | Eliminar sin hijos activos: 204, fuera de búsqueda y de `?customerId=`, historiales conservados | AC-03.14 |
| PF-03.21 | I | − | Eliminar con oportunidad abierta → 409 con detalle; sin `proyectos.eliminar` → 403 | AC-03.14 |
| PF-03.22 | I | ∫ | Cambiar cliente con una visita vinculada (insertada por fixture) → 409 `PROJECT_CUSTOMER_LOCKED`; sin vínculos → 200 | AC-03.15 |
| PF-03.23 | C | ∫ | Sección Seguimiento sin opciones de `actividad-comercial` en el menú: estado informativo y cero peticiones; sin permisos, sección oculta | AC-03.16 |
| PF-03.24 | C | ∫ | (Con Módulo 4) la sección monta `CommercialActivitySection projectId` y los botones con cliente/proyecto preseleccionados | AC-03.16 |
| PF-03.25 | U | + | Plan de duplicado: matriz de copiados/no copiados según opciones | AC-03.17, AC-03.18 |
| PF-03.26 | I | + | Duplicar con opciones por defecto: código nuevo, `duplicatedFromId`, datos copiados, tonelaje recalculado, auditoría | AC-03.17 |
| PF-03.27 | I | − | Origen completo (oportunidades, resultados, forecast, fase avanzada, visitas, actividades): el duplicado no hereda nada de RN-03.23 | AC-03.18 |
| PF-03.28 | I | + | Duplicar con productos: solo activos, estado inicial, sin oportunidad, tonelaje recalculado; sin la opción, ninguno | AC-03.19 |
| PF-03.29 | I | − | Nombre vacío → 400; asesor ajeno sin `administrar` → 403; cliente inválido → 422; origen no visible → 404 | AC-03.20 |
| PF-03.30 | I | + | Cada filtro de búsqueda por separado y una combinación de todos | AC-03.21 |
| PF-03.31 | I | − | Filtro por etapa con dos oportunidades en la misma etapa: el proyecto aparece una vez y `totalItems` correcto | AC-03.22 |
| PF-03.32 | I | − | `sortBy` no permitido → 400; `pageSize=101` → 400; `dateFrom > dateTo` → 422 | AC-03.23 |
| PF-03.33 | I | + | Orden por cada campo de la lista blanca, estable con desempate | AC-03.23 |
| PF-03.34 | I | ∫ | Mismos datos, cuatro usuarios (OWN, TEAM con subequipo, COUNTRY, ORGANIZATION): conjuntos exactos | AC-03.24, AC-03.26 |
| PF-03.35 | C | + | Filtros, orden y página persisten en la URL y se restauran al recargar | AC-03.25 |
| PF-03.36 | I | + | Vista de equipo: columnas, equipo principal del responsable, orden por última actualización | AC-03.27 |
| PF-03.37 | I | − | Rol propio TEAM sin `administrar`: ve ajenos con `canEdit=false`; `PATCH` ajeno → 403 | AC-03.28 |
| PF-03.38 | I | − | Filtro por equipo fuera de alcance → vacío; `/projects/team-options` solo devuelve equipos del alcance | AC-03.29 |
| PF-03.39 | C | + | Vista de equipo muestra el texto del alcance y el indicador "Solo lectura" | AC-03.26, AC-03.28 |
| PF-03.40 | I | − | Clasificación con elemento de otro catálogo o inactivo → 422 `INVALID_CATALOG_VALUE` (por cada columna: tipo, sector) | AC-03.30 |
| PF-03.41 | U | + | `UnitConversionResolver` (uso del módulo): precedencia PROJECT_TYPE > GLOBAL para proyecto; PRODUCT > FAMILY > PROJECT_TYPE > GLOBAL para líneas; ignora inactivas | AC-03.31, AC-03.61 |
| PF-03.42 | U | + | Cálculo decimal: `round(q × f, 4, HALF_UP)` con casos límite (factores de 8 decimales, cantidades grandes) sin flotantes | AC-03.31, AC-03.61 |
| PF-03.43 | I | + | Clasificación `RULE`: regla de tipo aplicada, foto del factor, tonelaje | AC-03.31 |
| PF-03.44 | I | − | Sin regla → 422 `CONVERSION_RULE_NOT_FOUND`; regla hacia unidad ≠ `TON` → no aplicable | AC-03.32 |
| PF-03.45 | D | − | Proyecto con regla de otra unidad origen viola la FK compuesta; `ck_projects_conversion` sin cantidad | AC-03.32 |
| PF-03.46 | I | + | Modos `MANUAL` y `NONE` | AC-03.33 |
| PF-03.47 | I | ∫ | Cambiar el factor de la regla no altera el proyecto hasta volver a guardar | AC-03.34 |
| PF-03.48 | C | + | El diálogo de clasificación muestra la vista previa de `resolve` y no calcula con factores propios | AC-03.35 |
| PF-03.49 | I | + | Cambio de fase con comentario: ficha y fila de historial completas | AC-03.36 |
| PF-03.50 | I | − | Porcentaje -1 / 100.01 → 422 `INVALID_PROGRESS` | AC-03.37 |
| PF-03.51 | D | − | `UPDATE projects SET phase_progress = 101` viola `ck_projects_phase_progress` | AC-03.37 |
| PF-03.52 | U | − | Reglas de avance: `FINALIZADO` < 100 inválido; parámetro vacío no restringe | AC-03.38 |
| PF-03.53 | I | ∫ | Cambiar `crm.proyectos.reglas_avance` por API de parámetros y verificar la nueva regla sin reiniciar | AC-03.38 |
| PF-03.54 | I | ∫ | Independencia: cambios de etapa y resultado no tocan `phase_id`/`phase_progress`; proyecto `FINALIZADO` admite crear y cerrar oportunidades | AC-03.39 |
| PF-03.55 | I | − | Retroceso y cambio solo de porcentaje registrados; cambio sin diferencias → 422 `PHASE_UNCHANGED` | AC-03.40 |
| PF-03.56 | I | + | Crear oportunidad: código, etapa por defecto, fecha de negocio, historial inicial, `lastActivityAt` del proyecto | AC-03.41 |
| PF-03.57 | I | − | Etapa inicial cerrada → 422 `INVALID_INITIAL_STAGE`; proyecto ajeno sin `administrar` → 403 | AC-03.42 |
| PF-03.58 | I | − | Monto sin moneda → 422 `CURRENCY_REQUIRED` (sin moneda por defecto en el servidor); negativos → 400/422 | AC-03.43 |
| PF-03.59 | D | − | `ck_opportunities_amount`, `ck_opportunities_amount_set`, `ck_opportunities_exchange_rate`, `ck_opportunities_amount_usd`, `ck_opportunities_usd_identity`, `ck_opportunities_rate_date`, `ck_opportunities_tonnage`; FK `currency_code → currencies` | AC-03.43, AC-03.92 |
| PF-03.60 | U | + | Política de transiciones: mapa por defecto, transición no listada, misma etapa, regla de respaldo para etapas no listadas, destinos inactivos ignorados, reapertura | AC-03.44, AC-03.45, AC-03.49 |
| PF-03.61 | I | + | Transiciones permitidas y prohibidas con el parámetro por defecto | AC-03.44 |
| PF-03.62 | I | ∫ | Modificar el parámetro de transiciones y comprobar efecto inmediato y `allowedTransitions` | AC-03.45 |
| PF-03.63 | I | + | Filtros por etapa y asesor; `stage-summary` coincide con los conteos de la lista | AC-03.46 |
| PF-03.64 | C | + | Tablero: columnas por `metadata.order`, conteos, "Ver más", `StageChangeDialog` solo con destinos permitidos | AC-03.46 |
| PF-03.65 | I | + | Historial de etapas completo tras tres cambios | AC-03.47 |
| PF-03.66 | I | + | Tres oportunidades en un proyecto con etapas independientes | AC-03.48 |
| PF-03.67 | I | + | Reabrir con `administrar` y comentario: resultado borrado, `CLEARED`, `closedAt` nulo | AC-03.49 |
| PF-03.68 | I | − | Reabrir sin comentario → 422 `COMMENT_REQUIRED`; sin `administrar` → 403 | AC-03.49 |
| PF-03.69 | I | − | Eliminar cerrada → 409; con productos activos → 409; abierta libre → 204 y fuera de conteos | AC-03.50 |
| PF-03.70 | U | + | Reglas de resultado: correspondencia etapa↔resultado, motivo, porcentaje, `appliesTo` | AC-03.51–AC-03.53, AC-03.57 |
| PF-03.71 | I | − | Cierre sin resultado / resultado incompatible / resultado en etapa abierta → 422 con el código correcto | AC-03.51 |
| PF-03.72 | I | − | `LOST` sin motivo → 422; `PARTIAL` sin % → 422; % 120 → 422 | AC-03.52, AC-03.53 |
| PF-03.73 | D | − | `ck_opportunity_results_lost_reason`, `_partial_percent`, `_percent_range`, `ck_opportunity_result_history_payload` | AC-03.52, AC-03.53 |
| PF-03.74 | I | − | Resultado sin fecha → 400; fecha guardada sin desplazamiento de zona | AC-03.54 |
| PF-03.75 | I | + | Cierre `PARTIAL`: etapa `GANADO`, una sola fila nueva de historial de etapa | AC-03.55 |
| PF-03.76 | I | + | `PUT /result` WON→PARTIAL: `CHANGED` + auditoría; a `LOST` → 422; en abierta → 409 | AC-03.56 |
| PF-03.77 | I | − | Motivo de otro catálogo, inactivo o no aplicable → 422 | AC-03.57 |
| PF-03.78 | I | − | Sin `oportunidades.cerrar` → 403 al cerrar y al modificar resultado | AC-03.58 |
| PF-03.79 | C | + | `ResultForm`: opciones filtradas por la etapa, campos condicionales (motivo, %), validación 0–100 | AC-03.51–AC-03.53, AC-03.58 |
| PF-03.80 | I | + | `GET /products`: búsqueda por SKU/descripción, familia, solo activos, paginado | AC-03.59 |
| PF-03.81 | I | + | Asociar con y sin oportunidad del proyecto | AC-03.60 |
| PF-03.82 | I | − | Oportunidad de otro proyecto → 422; FK compuesta en base (D) | AC-03.60 |
| PF-03.83 | I | + | Tonelaje con la regla de mayor precedencia | AC-03.61 |
| PF-03.84 | I | + | Sin regla: tonelaje nulo, "sin conversión", fuera del total | AC-03.62 |
| PF-03.85 | D | − | `ck_project_products_conversion`: tonelaje sin regla y regla sin tonelaje fallan | AC-03.62 |
| PF-03.86 | I | − | Duplicado activo → 409; peticiones concurrentes → una sola asociación | AC-03.63 |
| PF-03.87 | I | − | Cantidad negativa → 422 (+ D); producto inactivo → 422 | AC-03.64 |
| PF-03.88 | I | + | Editar asociación recalcula, audita y toca `lastActivityAt` | AC-03.65 |
| PF-03.89 | I | − | Quitar con forecast en ventana → 409; sin forecast → 204 con `deletedAt` | AC-03.66 |
| PF-03.90 | U | + | Totales de productos: solo estados activos, cantidades por unidad, conteo sin conversión | AC-03.67 |
| PF-03.91 | I | ∫ | Editar asociación no modifica `products`; cambio de descripción del maestro visible en la ficha | AC-03.68 |
| PF-03.92 | U | + | Ventana: diciembre → enero–junio del año siguiente; límite de medianoche en `America/Guatemala` frente a UTC; horizonte parametrizable | AC-03.69 |
| PF-03.93 | I | + | Filas de la matriz = asociaciones activas visibles ∪ pares con líneas | AC-03.69 |
| PF-03.94 | I | + | Upsert: crear y actualizar la misma celda sin segunda fila; repetir el lote → `unchanged` | AC-03.70 |
| PF-03.95 | D | − | Inserción duplicada viola `uq_forecast_lines_project_product_period`; `ck_forecast_lines_*` (mes, año, cantidad, conversión) | AC-03.70, AC-03.71 |
| PF-03.96 | I | − | Lote con una negativa → 422 con índice y nada guardado; clave repetida en el lote → 422 `FORECAST_DUPLICATE_IN_BATCH`; 501 líneas → 400 | AC-03.71 |
| PF-03.97 | I | − | Mes en curso, pasado y M+7 → 422 `FORECAST_PERIOD_OUT_OF_WINDOW` | AC-03.72 |
| PF-03.98 | I | + | Tonelaje por línea con y sin regla | AC-03.73 |
| PF-03.99 | U | + | Totales del forecast: por período, acumulado corrido, total ventana, cantidades por unidad, líneas sin conversión | AC-03.74 |
| PF-03.100 | I | + | Totales y filas con cada filtro y con combinaciones | AC-03.74, AC-03.75 |
| PF-03.101 | C | + | Matriz: celdas sucias, guardar solo lo cambiado, errores `lines[i]` en su celda, solo lectura fuera de ventana, pie de totales, aviso al salir con cambios | AC-03.71, AC-03.72, AC-03.74, AC-03.76 |
| PF-03.102 | I | + | `updatedAt`/`updatedBy` por celda y `lastUpdatedAt` por fila | AC-03.76 |
| PF-03.103 | I | ∫ | Historia: con reloj simulado, líneas de un mes que sale de la ventana siguen en base y en `mode=HISTORY`, no editables | AC-03.77 |
| PF-03.104 | I | − | Producto no asociado → 422 `PRODUCT_NOT_ASSOCIATED` | AC-03.78 |
| PF-03.105 | I | − | `ownerId` distinto sin `forecast.administrar` → 403; proyecto ajeno sin `administrar` → 403; con `administrar` → 200 | AC-03.79 |
| PF-03.106 | I | + | Auditoría solo de líneas cambiadas; contadores `created/updated/unchanged` | AC-03.80 |
| PF-03.107 | C | ∫ | Sección Forecast de la ficha reutiliza `ForecastMatrix` filtrada por proyecto | AC-03.81 |
| PF-03.108 | I | − | Concurrencia: `expectedUpdatedAt` antiguo → 409 `FORECAST_LINE_STALE`, nada guardado | AC-03.82 |
| PF-03.109 | I | − | Proyecto fuera de alcance: filas ocultas, `PUT` → 404 | AC-03.83 |
| PF-03.110 | C | + | Rutas protegidas con el permiso de su opción; registro de rutas en verde (`route-registry.spec.ts`) | AC-03.84 |
| PF-03.111 | I | ∫ | `GET /me/menu` con distintos roles muestra las opciones del módulo según permiso | AC-03.84 |
| PF-03.112 | I | ∫ | Cada mutación del módulo actualiza `last_activity_at`; una mutación fallida (422) no lo cambia | AC-03.85 |
| PF-03.113 | I | − | Para cada endpoint de §F: 401 sin token y 403 sin el permiso base (prueba parametrizada) | AC-03.8, AC-03.11 |
| PF-03.114 | E | ∫ | Recorrido asesor: crear proyecto → clasificar → cambiar fase → crear oportunidad → asociar producto → cargar forecast M+1…M+3 → cerrar oportunidad como Parcial 60 % → ver historial | AC-03.1, AC-03.31, AC-03.36, AC-03.41, AC-03.60, AC-03.70, AC-03.55, AC-03.13 |
| PF-03.115 | E | ∫ | Recorrido manager: vista de equipo → ficha de un proyecto de un miembro → reasignar asesor (con `administrar`) → duplicar proyecto con productos | AC-03.26, AC-03.17, AC-03.19 |
| PF-03.116 | E | − | Asesor sin acceso a proyectos ajenos: URL directa a un proyecto ajeno → pantalla "no encontrado"; sin `forecast.ver` no ve la opción ni la ruta | AC-03.12, AC-03.84 |
| PF-03.117 | E | ∫ | Desde la ficha del cliente (Módulo 2) navegar a un proyecto de la sección "Proyectos asociados" | AC-03.25 (∫ F-08) |
| PF-03.118 | I | ∫ | Contrato F-08: `GET /projects?customerId=` con `search`, `phaseId`, `ownerId`, `commercialStatus`, `active`, orden y paginación; forma de `ProjectListItemDto`; visibilidad | AC-03.86 |
| PF-03.119 | U | + | `metric-definitions.ts`: DEF-A, DEF-B (todas las combinaciones de abiertas/WON/PARTIAL/LOST/sin oportunidades), DEF-G (cambio de año) | AC-03.86, AC-03.69 |
| PF-03.120 | C | ∫ | `/proyectos/oportunidades?status=OPEN&outcome=WON,PARTIAL&decisionFrom=&decisionTo=` y `/proyectos?active=true` inicializan los filtros desde la URL | AC-03.86 |
| PF-03.121 | U | + | `opportunity-estimate.ts`: `round(monto / tasa, 4, HALF_UP)` con aritmética decimal (tasas de 8 decimales, montos grandes, casos de redondeo .5), identidad en USD (tasa 1, fecha nula), monedas admitidas por país (incluido país con moneda USD) | AC-03.87, AC-03.88 |
| PF-03.122 | I | + | Alta en `GTQ` y en `USD`: los cinco campos guardados y devueltos, tasa = la de mayor vigencia ≤ fecha de la oportunidad (con varias filas sembradas) | AC-03.87 |
| PF-03.123 | I | − | `HNL` en proyecto de Guatemala y `GTQ` en proyecto de El Salvador → 422 `CURRENCY_NOT_ALLOWED`; nada guardado | AC-03.88 |
| PF-03.124 | I | − | Sin tasa ≤ fecha → 422 `EXCHANGE_RATE_NOT_FOUND` con `details`; en alta no se crea la oportunidad ni su historial, en edición no cambia nada; la misma estimación en USD → 201 | AC-03.89 |
| PF-03.125 | I | + | Tasa con antigüedad mayor que `crm.tipos_cambio.dias_aviso_antiguedad` → guardada con `warnings` `EXCHANGE_RATE_STALE`; dentro del umbral, sin `warnings`; cambiar el parámetro por la API de parámetros cambia el resultado sin reiniciar | AC-03.90 |
| PF-03.126 | U | + | Política de recálculo: solo cambios de `estimatedAmount`, `currencyCode` u `opportunityDate` disparan la resolución; el resto conserva la foto | AC-03.91 |
| PF-03.127 | I | ∫ | Foto: añadir o corregir una tasa en `exchange_rates` no altera oportunidades guardadas; editar siguiente acción o etapa no recalcula; editar la fecha recalcula y audita la diferencia | AC-03.91 |
| PF-03.128 | I | − | Cuerpo con `exchangeRate`/`exchangeRateDate`/`estimatedAmountUsd` → 400 `VALIDATION_FAILED`; `PATCH` con monto y moneda nulos borra los cinco campos | AC-03.92 |
| PF-03.129 | I | + | `GET /opportunities/form-options?projectId=` para proyectos de Guatemala (`GTQ`, `USD`; defecto `GTQ`) y Ecuador (`USD`); proyecto no visible → 404; sin `projectId`, solo `baseCurrencyCode` | AC-03.93 |
| PF-03.130 | C | + | `OpportunityFormDialog`: preselecciona la moneda por defecto del proyecto, ofrece solo las admitidas, no calcula la conversión, muestra el aviso `EXCHANGE_RATE_STALE` y pinta `EXCHANGE_RATE_NOT_FOUND` / `CURRENCY_NOT_ALLOWED` bajo el selector de moneda | AC-03.90, AC-03.93 |
| PF-03.131 | C | + | Sección Oportunidades, lista, tablero y detalle muestran monto original + moneda y equivalente en USD (detalle: tasa y fecha) | AC-03.94 |
| PF-03.132 | I | + | `sortBy=estimatedAmountUsd` ordena por el equivalente en USD con oportunidades en `GTQ` y `USD` mezcladas | AC-03.94 |
| PF-03.133 | I | − | Descarga de adjunto: cabeceras `Content-Disposition: attachment` y `nosniff`, sin clave de almacenamiento en ninguna respuesta; proyecto fuera de alcance, adjunto de otro proyecto o eliminado → 404 | AC-03.95 |

---

## K. Dependencias y orden

### K.1 Necesita para funcionar (bloqueantes)

| # | Dependencia | Estado | Si falta |
|---|---|---|---|
| 1 | **Fase 0**: migraciones 1–5 de 00 §9 (`DataScope.COUNTRY`, países, productos/unidades/reglas, clientes, proyectos/oportunidades/forecast + CHECK) | Pendiente | Bloquea todo |
| 2 | **Fase 0**: puertos transversales `SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`, `UnitConversionResolver`, `ExchangeRateReader` (ADR-024); registro de semántica de catálogos | **Entregado** (2026-10-11): los tres primeros con la Fase 0 y el Módulo 2; `UnitConversionResolver` y `ExchangeRateReader` (+ `CurrencyConversionService`) en la etapa E1 de este módulo (ver "Precisiones de implementación") | Bloquea todo |
| 3 | **Fase 0**: semilla esencial (catálogos §D.4, parámetros §D.5 —incluidos `crm.moneda_base` y `crm.tipos_cambio.dias_aviso_antiguedad`—, monedas, países con su moneda, tipos de cambio iniciales —valores entregados por el negocio, 00 §8.2—, secuencias `crm.proyecto`/`crm.oportunidad`, unidades y reglas genéricas, permisos `proyectos.*`, `oportunidades.*`, `productos.ver`, `forecast.*`, acciones `cerrar`/`administrar`, roles `asesor`/`manager`/`responsable-pais`) | Pendiente | Bloquea todo |
| 4 | **Módulo 2** implementado (clientes visibles, `CustomerRepository` de lectura, selector) | Previo en el orden §11 | Sin clientes no hay proyectos |
| 5 | DM-12 resuelta (alcance `TEAM` y equipos) | Bloqueante antes de Clientes (00) | La vista de equipo funciona con lo propio |
| 6 | Piezas del Módulo 2: D-02.11 (componentes compartidos fuera de `features/admin`, área `features/crm`), D-02.12 (registro de rutas con parámetro), D-02.10 (`use-module-availability`), `CustomerReferenceGuard`, `AttachmentsService` sobre `FileStorage` (ADR-021), `ParameterReader` | Entregadas con el Módulo 2 | Si alguna faltara, se construye al inicio de este módulo **en su ubicación transversal** según 02, nunca dentro de `projects` |
| 7 | Demo: familias, productos, reglas de demo, equipos y usuarios de demostración (00 §8.3) | Fase 0 | Sin productos no hay asociaciones ni forecast (comportamiento vacío correcto) |

### K.2 No bloqueantes

- **DM-8** (adjuntos): **resuelta** (ADR-021); ya no bloquea nada. Los adjuntos de F-10/F-11 se implementan completos.
- **Tipos de cambio reales** (00 §8.2): los entrega el negocio antes del primer despliegue; sin ellos solo se pueden registrar estimaciones en USD (`EXCHANGE_RATE_NOT_FOUND` en moneda local).
- **DM-23 / DM-24** (catálogo real de productos y factores): el módulo funciona con datos de demo; los reales son datos.

### K.3 Orden interno de implementación

Cada paso deja el repositorio en verde (build, typecheck, lint, tests).

1. **Base del módulo:** `projects`, `opportunities`, `forecast`, `products` (lectura) como módulos Nest vacíos con sus puertos; rutas y registro del frontend con `UnderConstruction`; opciones de menú en la semilla (DM-32) con el paso que entrega cada pantalla.
2. **Proyecto** (F-10, F-11 general, F-13): alta, ficha general, edición, eliminación, búsqueda, historial (parcial), `lastActivityAt`.
3. **Fase del cliente** (F-16).
4. **Clasificación** (F-15) + lectura de unidades y `resolve`.
5. **Vista de equipo** (F-14).
6. **Oportunidades** (F-17) con política de transiciones y estimación con moneda y tipo de cambio (C.11).
7. **Resultados** (F-18) dentro de `stage-changes` y `PUT /result`.
8. **Productos asociados** (F-19) + lectura de productos y familias.
9. **Forecast** (F-20): ventana, filas, totales, guardado en lote, matriz.
10. **Duplicado** (F-12) (necesita clasificación y productos).
11. **Ficha completa** (secciones 5, 7, 8 —estado informativo por disponibilidad—, 9 —`AttachmentsSection` completa, ADR-021—, 10 completo).
12. **E2E, OpenAPI, documentación**, actualización de la matriz (`en desarrollo` → `completada` solo con pruebas en verde).

### K.4 Dependencias futuras (quién depende de este módulo)

| Módulo | Qué necesitará |
|---|---|
| 4 Actividad comercial | `GET /projects?customerId=`, `GET /projects/{id}/opportunities?status=OPEN`; actualizar `last_activity_at` (RN-04.11); montar `CommercialActivitySection`, `NewActivityButton`, `PlanVisitButton` en la ficha |
| 1 Inicio | Fórmulas RN-03.14/15, C.8, RN-03.74; rutas con filtros en URL; `/proyectos/oportunidades/:id` |
| 5 Reportes | Mismas fórmulas; montos en USD sobre `estimated_amount_usd` y columnas de exportación (monto original, moneda, tasa, fecha de la tasa, monto USD); navegación a fichas |
| 6 Integraciones | Ninguna directa |
| 7 Administración | Mantenimiento de productos, familias, unidades y reglas (DM-23) usando las mismas tablas; las lecturas de §F.4 siguen vigentes |

---

## L. Archivos de código a implementar

Rutas reales del repositorio; convenciones de `backend/src/modules/catalogs` (módulo
con `controller`, `service`, `dto/`, `ports/` y adaptador Prisma en
`infrastructure/database/prisma/repositories/`) y de `frontend/src/features/admin`
(carpeta por área, `*.api.ts`, `*.queries.ts`, `*.schemas.ts`,
`*.permissions.ts`, `components/`, rutas con `React.lazy`). Sub-áreas backend
según 00 §11 (`ProjectRepository`, `OpportunityRepository`,
`ProjectProductRepository`, `ForecastRepository`).

### L.1 Backend — nuevos

```text
backend/src/modules/projects/
  projects.module.ts
  projects.controller.ts                 /projects, /projects/team-view, /projects/{id}, duplicate, history
  project-phase.controller.ts            /projects/{id}/phase-changes, /phase-history
  project-classification.controller.ts   /projects/{id}/classification
  project-products.controller.ts         /projects/{id}/products
  project-attachments.controller.ts      /projects/{id}/attachments → AttachmentsService (owner project; FileStorage, ADR-021)
  project-options.controller.ts          /projects/form-options, /owner-options, /team-options
  projects.service.ts (+ .spec.ts)       alta, edición, eliminación, búsqueda, vista de equipo
  project-duplication.service.ts (+ .spec.ts)
  project-phase.service.ts (+ .spec.ts)
  project-classification.service.ts (+ .spec.ts)
  project-products.service.ts (+ .spec.ts)
  project-history.service.ts (+ .spec.ts)
  project-options.service.ts (+ .spec.ts)
  project-rules.ts (+ .spec.ts)          fechas, obligatorios (parámetro), asesor asignable
  phase-rules.ts (+ .spec.ts)            rango, reglas de avance, sin cambios
  duplication-plan.ts (+ .spec.ts)       qué se copia (RN-03.20–23)
  project-capabilities.ts (+ .spec.ts)   canEdit/canAdminister/… (DM-34)
  product-totals.ts (+ .spec.ts)         RN-03.60, RN-03.31
  dto/project.dto.ts  dto/project-query.dto.ts  dto/team-view.dto.ts
  dto/project-phase.dto.ts  dto/project-classification.dto.ts
  dto/project-product.dto.ts  dto/duplicate-project.dto.ts
  dto/project-history.dto.ts  dto/project-options.dto.ts
  ports/projects.repository.port.ts  ports/project-products.repository.port.ts

backend/src/modules/opportunities/
  opportunities.module.ts
  opportunities.controller.ts            /opportunities…, /projects/{projectId}/opportunities
  opportunities.service.ts (+ .spec.ts)
  stage-transition-policy.ts (+ .spec.ts)   RN-03.40–43 (mapa + respaldo + reabrir)
  opportunity-result-rules.ts (+ .spec.ts)  RN-03.46–52
  opportunity-estimate.ts (+ .spec.ts)      RN-03.78–83 (monedas admitidas, conversión, aviso de antigüedad, recálculo) sobre ExchangeRateReader
  dto/opportunity.dto.ts  dto/opportunity-query.dto.ts
  dto/stage-change.dto.ts  dto/opportunity-result.dto.ts
  ports/opportunities.repository.port.ts

backend/src/modules/forecast/
  forecast.module.ts
  forecast.controller.ts                 /forecast/window, /rows, /totals, /lines
  forecast.service.ts (+ .spec.ts)
  forecast-window.ts (+ .spec.ts)        editabilidad y validación de períodos sobre DEF-G (forecastWindowMonths)
  forecast-totals.ts (+ .spec.ts)        por período, acumulado, por unidad
  forecast-batch-validator.ts (+ .spec.ts)
  dto/forecast.dto.ts
  ports/forecast.repository.port.ts

backend/src/modules/products/            solo lectura en este módulo (escrituras: Módulo 7, DM-23)
  products.module.ts
  products.controller.ts                 /products, /product-families, /units-of-measure, /unit-conversions/resolve
  products.service.ts (+ .spec.ts)
  dto/product.dto.ts
  ports/product-catalog.reader.port.ts

backend/src/infrastructure/database/prisma/repositories/
  prisma-projects.repository.ts
  prisma-project-products.repository.ts
  prisma-opportunities.repository.ts
  prisma-forecast.repository.ts
  prisma-product-catalog.repository.ts
```

```text
backend/src/modules/commercial-metrics/metric-definitions.ts (+ .spec.ts)
  Creado aquí con DEF-A (abierta/cerrada), DEF-B (estado comercial), DEF-C
  (última actualización) y DEF-G (ventana de forecast), puros y sin Prisma, en la
  ruta que fija 01 §L; el Módulo 1 lo completa (RN-03.77). Solo el archivo de
  predicados: `CommercialMetricsService` y su módulo los entrega el Módulo 1.
```

No se crean endpoints genéricos de referencia (D-02.1): las opciones son de
este módulo (`project-options`, `/opportunities/form-options`). `AttachmentsService`,
`CustomerReferenceGuard`, `SequenceGenerator`, `CatalogReferenceValidator`,
`VisibilityScopeResolver` y `ParameterReader` se importan (02 F.6.5); no se
reimplementan.


### L.2 Backend — modificados

| Archivo | Cambio |
|---|---|
| `backend/src/app.module.ts` | Importar `ProjectsModule`, `OpportunitiesModule`, `ForecastModule`, `ProductsModule` |
| `backend/src/modules/access/app-routes.registry.json` | Las 7 rutas de E.1, incluidas `/proyectos/nuevo`, `/proyectos/:projectId` y `/proyectos/oportunidades/:opportunityId` (D-02.12; el servicio de opciones de menú ya rechaza destinos con `:`) |
| `backend/src/app.module.ts` / `ProjectsModule` | Importa `CustomersModule` (exporta `CustomerReferenceGuard`), `AttachmentsModule`, `ParametersModule`, `CatalogsModule`, `AccessModule`, `AuditModule` |
| `backend/prisma/seed/access-catalog.ts` | Módulo `proyectos` (si la Fase 0 no lo sembró) y las 4 opciones `proyectos-buscar`, `proyectos-equipo`, `proyectos-oportunidades`, `proyectos-forecast` con su `requiredPermission` (00 §5.3, DM-32) |
| `backend/src/modules/audit/…` | Ninguno obligatorio; si se adopta la unidad de trabajo (PLAN-ADMIN §10), se usa |
| `backend/prisma/seed/demo/*` (Fase 0) | Verificar que la demo cubre proyectos con fases, duplicado, oportunidades abiertas/ganadas/perdidas/parciales, productos con y sin conversión, forecast M+1…M+6 y 3 meses pasados (00 §8.3); completar si falta |

No se modifica `schema.prisma` ni se crean migraciones en este módulo (todo
llega con la Fase 0). Si la implementación descubre que falta un índice para un
filtro, va en una migración **aditiva** documentada aquí y en 00.

### L.3 Frontend — nuevos (área `frontend/src/features/crm/`, D-02.11)

Mismo patrón que `features/crm/customers/` (02 §L): un submódulo por carpeta,
rutas agregadas en `crm-routes.ts`, piezas comunes del CRM en
`features/crm/common/`, barril público `index.ts` para otros módulos.

```text
frontend/src/features/crm/projects/
  index.ts                               barril público: ProjectPicker, OpportunityPicker, tipos (para el Módulo 4)
  projects.permissions.ts                proyectos.*, oportunidades.*, forecast.*, productos.ver (nombres exactos del catálogo)
  ProjectsSearchPage.tsx (+ .spec.tsx)
  ProjectCreatePage.tsx (+ .spec.tsx)
  ProjectDetailPage.tsx (+ .spec.tsx)
  TeamProjectsPage.tsx (+ .spec.tsx)
  projects.api.ts  projects.queries.ts  projects.schemas.ts (+ .spec.ts)  projects.errors.ts
  project-format.ts (+ .spec.ts)         estado comercial, fase, ubicación
  capabilities.ts
  components/ProjectFilters.tsx  ProjectFormFields.tsx  DuplicateProjectDialog.tsx (+ .spec.tsx)
  components/EditProjectDialog.tsx  DeleteProjectDialog.tsx  ProjectPicker.tsx  OwnerPicker.tsx
  components/PhaseChip.tsx  CommercialStatusChip.tsx  ConversionBadge.tsx  UnitSelect.tsx  ProductPicker.tsx
  sections/ProjectGeneralSection.tsx  ProjectClassificationSection.tsx (+ .spec.tsx)
  sections/ProjectPhaseSection.tsx (+ .spec.tsx)  ProjectOpportunitiesSection.tsx
  sections/ProjectResultsSection.tsx  ProjectProductsSection.tsx (+ .spec.tsx)
  sections/ProjectForecastSection.tsx  ProjectFollowUpSection.tsx (+ .spec.tsx)  ProjectHistorySection.tsx (+ .spec.tsx)
  products/project-products.api.ts  project-products.queries.ts  project-products.schemas.ts
  products/ProjectProductFormDialog.tsx (+ .spec.tsx)

frontend/src/features/crm/opportunities/
  OpportunitiesPage.tsx (+ .spec.tsx)          lista + tablero
  OpportunityDetailPage.tsx (+ .spec.tsx)
  opportunities.api.ts  opportunities.queries.ts  opportunities.schemas.ts (+ .spec.ts)  opportunities.errors.ts
  components/OpportunityBoard.tsx  OpportunityFormDialog.tsx  StageChip.tsx  OutcomeChip.tsx
  components/StageChangeDialog.tsx (+ .spec.tsx)  ResultForm.tsx (+ .spec.tsx)

frontend/src/features/crm/forecast/
  ForecastPage.tsx (+ .spec.tsx)
  forecast.api.ts  forecast.queries.ts
  forecast-draft.ts (+ .spec.ts)               borrador de celdas, cambios, expectedUpdatedAt
  components/ForecastMatrix.tsx (+ .spec.tsx)  ForecastFilters.tsx  ForecastTotalsFooter.tsx  ForecastMobileList.tsx

frontend/src/features/crm/common/
  decimal.ts (+ .spec.ts)                      cadenas decimales y porcentajes sin float (si 02 no lo creó)
  DecimalField.tsx (+ .spec.tsx)
```

`AttachmentsSection`, `use-module-availability` y `CustomerPicker` ya existen
(02); se reutilizan, no se duplican. `OpportunityDetailPage` importa
`ForecastMatrix` y secciones desde su submódulo hermano solo a través de los
barriles `index.ts` (regla de 02 para dependencias entre submódulos).

### L.4 Frontend — modificados

| Archivo | Cambio |
|---|---|
| `frontend/src/features/crm/crm-routes.ts` (de 02) | Las 7 rutas de E.1 con `path`, `permission` y página lazy |
| `frontend/src/routes/route-paths.ts` | `ROUTE_PATHS.crm.projects = { search, create, detail, team, opportunities, opportunityDetail, forecast }` (según la forma que haya fijado 02) |
| `frontend/src/features/crm/README.md` | Sección del submódulo Proyectos |
| `frontend/src/components/layout/MaterialSymbol.tsx` | Icono `apartment` (módulo) y los que usen las opciones |
| `frontend/src/test/api-mocks.ts` | Fixtures de proyectos, oportunidades, productos y forecast |

`app-routes.tsx` no cambia si 02 ya incorporó `CRM_ROUTES`; el registro de rutas
y la prueba de router siguen D-02.12 (sin tocar `route-tree.ts`).

### L.5 Pruebas

```text
backend/test/projects.e2e.spec.ts                 alta, ficha, edición, eliminación, búsqueda, historial, 401/403/404
backend/test/projects-team-view.e2e.spec.ts       alcances OWN/TEAM/COUNTRY/ORGANIZATION, ver ≠ editar
backend/test/project-duplication.e2e.spec.ts
backend/test/project-phase.e2e.spec.ts
backend/test/project-classification.e2e.spec.ts
backend/test/project-products.e2e.spec.ts
backend/test/opportunities.e2e.spec.ts            alta, edición, transiciones, reabrir, eliminación
backend/test/opportunity-results.e2e.spec.ts
backend/test/forecast.e2e.spec.ts                 ventana (reloj simulado), lote, concurrencia, totales, historia
backend/test/products-catalog.e2e.spec.ts         lecturas y resolve
backend/test/projects-db-constraints.e2e.spec.ts  cada CHECK, FK compuesta y único de §D.6
backend/test/support/crm-fixtures.ts              fábrica de clientes, usuarios con alcance, proyectos, reglas
frontend/tests/e2e/projects.e2e.spec.ts           PF-03.114, PF-03.115, PF-03.116
frontend/tests/e2e/forecast.e2e.spec.ts           carga y guardado de la matriz
```

Unitarias junto al código (`*.spec.ts`), según §L.1 y §L.3.

### L.6 Documentación al cerrar

`docs/api/README.md` (endpoints, códigos de error nuevos y el aviso `EXCHANGE_RATE_STALE`), OpenAPI generado,
`CHANGELOG.md`, `docs/database/data-model.md` (sin cambios de esquema; solo
reglas de uso si aplica), `matriz-trazabilidad.md` (F-10…F-20) y este archivo
(sección de desviaciones, como PLAN-ADMIN §10).

**Códigos de error nuevos del módulo:**
`REQUIRED_FIELD_MISSING`, `INVALID_DATE_RANGE`, `INVALID_OWNER`,
`PROJECT_CODE_TAKEN` (409), `PROJECT_CUSTOMER_LOCKED` (409),
`PROJECT_HAS_ACTIVE_CHILDREN` (409), `CONVERSION_RULE_NOT_FOUND`,
`INVALID_CONVERSION_RULE`, `INVALID_QUANTITY`, `INVALID_PROGRESS`,
`PHASE_PROGRESS_RULE`, `PHASE_UNCHANGED`, `INVALID_INITIAL_STAGE`,
`INVALID_STAGE_TRANSITION`, `STAGE_UNCHANGED`, `COMMENT_REQUIRED`,
`CURRENCY_REQUIRED`, `RESULT_REQUIRED`, `RESULT_NOT_ALLOWED`,
`RESULT_STAGE_MISMATCH`, `RESULT_REASON_REQUIRED`, `RESULT_PERCENT_REQUIRED`,
`OPPORTUNITY_NOT_CLOSED` (409), `OPPORTUNITY_CLOSED` (409),
`OPPORTUNITY_HAS_DEPENDENCIES` (409), `PRODUCT_INACTIVE`,
`OPPORTUNITY_NOT_IN_PROJECT`, `PROJECT_PRODUCT_DUPLICATE` (409),
`PRODUCT_HAS_FORECAST` (409), `FORECAST_PERIOD_OUT_OF_WINDOW`,
`PRODUCT_NOT_ASSOCIATED`, `FORECAST_DUPLICATE_IN_BATCH`,
`FORECAST_LINE_STALE` (409), `CURRENCY_NOT_ALLOWED`, `EXCHANGE_RATE_NOT_FOUND`
(DM-36), `ATTACHMENT_TYPE_NOT_ALLOWED`, `ATTACHMENT_TOO_LARGE` (413, DC-4). Sin marca = `422`.
Aviso no bloqueante (no es error; viaja en `warnings` con `200`/`201`):
`EXCHANGE_RATE_STALE`. Reutilizados: `RESOURCE_NOT_FOUND`,
`PERMISSION_DENIED`, `UNAUTHENTICATED`, `VALIDATION_FAILED` (400), `UNKNOWN_REFERENCE`, `CUSTOMER_INACTIVE` y `FIELD_NOT_EDITABLE` (403) de 02,
`INVALID_CATALOG_VALUE` (Fase 0). Cada uno con mensaje en español en
`describeApiError` (overrides por área).

---

## Decisiones del módulo (resueltas el 2026-10-10)

Todas las decisiones de esta sección quedaron resueltas por el responsable de
negocio el 2026-10-10: las marcadas **Respuesta del responsable** con su
respuesta expresa y el resto con el valor recomendado, que quedó aprobado. Se
conservan los identificadores.

### Decisiones de 00 que este módulo aplica

| DM | Tema | Cómo se aplica aquí (valor final) |
|---|---|---|
| DM-1 | Estimación de la oportunidad | **Resuelta (2026-10-10).** **Respuesta del responsable:** monto en USD o en la moneda del país del proyecto + foto del tipo de cambio + equivalente en USD, y tonelaje opcional (RN-03.38, C.11). Sin `crm.moneda_por_defecto`: la sustituye `crm.moneda_base` (`USD`); la moneda por defecto del formulario es la del país del proyecto |
| DM-6 | Transiciones de etapa | **Resuelta (2026-10-10).** Parámetro configurable con el valor recomendado, regla de respaldo y reapertura con `administrar` (RN-03.40–42) |
| DM-8 | Almacenamiento de adjuntos | **Resuelta (2026-10-10).** **Respuesta del responsable:** carpeta mapeada a un almacenamiento del servidor (`FileStorage` + `LocalFileSystemStorage`, ADR-021). Los adjuntos de F-10/F-11 quedan **desbloqueados**: rutas por dueño con `/content` (DC-2), `413` por tamaño y `422 ATTACHMENT_TYPE_NOT_ALLOWED` por tipo (DC-4) |
| DM-10 | `TERRITORY` → `COUNTRY` | **Resuelta (2026-10-10).** Valor recomendado aprobado: el perfil Responsable de país usa `DataScope.COUNTRY` (addendum ADR-018; H.2) |
| DM-11 | Roles y perfiles de §5.5 | **Resuelta (2026-10-10).** Roles de sistema con permisos fijos. Asesor→`asesor` (alcance `OWN`), Jefe/Supervisor→`manager`, Responsable de país→`responsable-pais`, Administrador→`administrador` (H.2) |
| DM-12 | Alcance TEAM | **Resuelta (2026-10-10).** Miembros + responsables + subequipos; equipo = equipo principal del asesor, sin foto histórica |
| DM-13 | Herencia de visibilidad | **Resuelta (2026-10-10).** Oportunidades y forecast heredan la visibilidad del proyecto; cliente visible si se ve un proyecto suyo |
| DM-14 | País por usuario | **Resuelta (2026-10-10).** Un país (`users.country_id`) |
| DM-15 | Etapa ↔ resultado | **Resuelta (2026-10-10).** Se registran juntos; Parcial bajo Ganado; ganadas = WON + PARTIAL (C.8) |
| DM-16 | Proyecto activo, estado comercial, última actualización, fecha de decisión | **Resuelta (2026-10-10).** RN-03.14, RN-03.15, RN-03.9, RN-03.4 |
| DM-17 | Código de proyecto | **Resuelta (2026-10-10).** Generado; manual/editable solo con `proyectos.administrar` |
| DM-19 | Ciudad | **Resuelta (2026-10-10).** Texto libre |
| DM-23 | Catálogo de productos y estados del producto asociado | **Resuelta (2026-10-10).** Lectura aquí; mantenimiento en Módulo 7; estados `PROPUESTO/COTIZADO/ADJUDICADO/DESCARTADO` |
| DM-24 | Factores y tonelaje manual | **Resuelta (2026-10-10).** Tonelaje manual solo en el proyecto; nunca en líneas |
| DM-25 | Forecast: asociación, asesor, meses pasados | **Resuelta (2026-10-10).** Producto asociado obligatorio; asesor = el del proyecto salvo `forecast.administrar`; pasados de solo lectura |
| DM-31 | Fechas `date` | **Resuelta (2026-10-10).** Todas las fechas de calendario del módulo |
| DM-32 | Siembra del menú | **Resuelta (2026-10-10).** Opciones y rutas con este módulo |
| DM-33 | Eliminación | **Resuelta (2026-10-10).** Lógica, bloqueada con hijos activos (RN-03.12, RN-03.45) |
| DM-34 | `editar` vs `administrar` | **Resuelta (2026-10-10).** Propios vs ajenos dentro del alcance (H.1) |
| DM-35 | "Fecha" de la oportunidad | **Resuelta (2026-10-10).** Fecha de identificación; es además la fecha de referencia del tipo de cambio (RN-03.79) |
| DM-36 | Moneda base y tipos de cambio *(nueva, 2026-10-10)* | **Resuelta (2026-10-10).** **Respuesta del responsable:** moneda base USD; estimación en USD o en la moneda del país del proyecto (`422 CURRENCY_NOT_ALLOWED`), tasa = la de mayor vigencia ≤ fecha de la oportunidad vía `ExchangeRateReader` (`422 EXCHANGE_RATE_NOT_FOUND`), aviso `EXCHANGE_RATE_STALE` (31 días), foto recalculada solo si cambian monto, moneda o fecha; totales en USD (C.11, ADR-024) |

### Decisiones nuevas del módulo

| # | Pregunta | Valor final (resuelta 2026-10-10: valor recomendado aprobado) | Impacto si cambia |
|---|---|---|---|
| **D-03.1** | Opciones de formulario para usuarios no administradores (`/catalogs`, `/users`, `/teams`, `/parameters` exigen permisos de administración). Aplicación de **D-02.1** a este módulo | **Resuelta (2026-10-10).** Endpoints de opciones **del módulo**, con el permiso de ver del módulo: `GET /projects/form-options`, `/projects/owner-options`, `/projects/team-options` (`proyectos.ver`) y `/opportunities/form-options` (`oportunidades.ver`); unidades y productos por `/units-of-measure` y `/products` (F.4). Sin endpoint genérico | Si D-02.1 cambia a un endpoint genérico, estos se sustituyen por él (contrato público; se ajustan los `*.api.ts`) |
| **D-03.2** | Rutas con parámetro frente al registro de rutas (PLAN-ADMIN D6). Aplicación de **D-02.12** | **Resuelta (2026-10-10).** Se registran las 7 rutas (incluidas `/proyectos/nuevo`, `/proyectos/:projectId`, `/proyectos/oportunidades/:opportunityId`); el servicio de opciones de menú rechaza destinos con `:` (lo entrega 02) | Si D-02.12 cambia a excluir rutas con parámetro del cotejo, solo se quitan del registro |
| **D-03.3** | Ubicación del frontend y de los componentes compartidos. Aplicación de **D-02.11** | **Resuelta (2026-10-10).** Submódulos `frontend/src/features/crm/{projects,opportunities,forecast}/`, rutas en `crm-routes.ts`; genéricos importados de su ubicación compartida fuera de `features/admin` | Sigue a D-02.11 si cambia |
| **D-03.4** | ¿Un cliente inactivo (estado con `isActive = false`) admite proyectos nuevos? ¿Y un prospecto? | **Resuelta (2026-10-10).** Inactivo no (`422 CUSTOMER_INACTIVE`); prospecto sí. Se alinea con D-02.16 (`requireActive` de `CustomerReferenceGuard`) | Solo caso de uso; si D-02.16 cambia, este también |
| **D-03.5** | ¿El mes en curso (M) es editable en el forecast? | **Resuelta (2026-10-10).** No: ventana editable M+1…M+6 (literal del alcance); M y pasados de solo lectura | Solo `forecast-window.ts` y pruebas |
| **D-03.6** | Concurrencia en la matriz de forecast (dos personas editando el mismo proyecto) | **Resuelta (2026-10-10).** Optimista por línea con `expectedUpdatedAt` y `409 FORECAST_LINE_STALE` | Sin control: "gana el último" sin aviso |
| **D-03.7** | ¿Se puede crear una oportunidad directamente en etapa cerrada (p. ej. registrar una venta ya ganada)? | **Resuelta (2026-10-10).** No (`INVALID_INITIAL_STAGE`); se crea abierta y se cierra a continuación | Permitirlo exigiría el resultado en el alta |
| **D-03.8** | Reapertura de oportunidades: destino, permiso y justificación | **Resuelta (2026-10-10).** Cualquier etapa abierta activa, con `oportunidades.administrar` y comentario obligatorio; anula el resultado (historial `CLEARED`) | Solo política de transiciones |
| **D-03.9** | Duplicar: ¿se copian adjuntos? ¿productos por defecto? | **Resuelta (2026-10-10).** Adjuntos nunca; productos solo si se marca (desmarcado) | Copiar adjuntos duplicaría binarios en el almacenamiento de ADR-021 |
| **D-03.10** | ¿El asesor ve en "Proyectos del equipo" los proyectos de sus compañeros en solo lectura? | **Resuelta (2026-10-10).** No: el asesor tiene alcance `OWN` (00 §4.4, DM-11 aprobada); la vista le muestra los suyos | Si sí: dar `dataScope = TEAM` al rol `asesor`; DM-34 ya garantiza que solo edita los propios. Solo semilla y pruebas |
| **D-03.11** | Cambio de cliente de un proyecto existente | **Resuelta (2026-10-10).** Permitido con `proyectos.editar`/`administrar` solo sin visitas ni actividades vinculadas (`409 PROJECT_CUSTOMER_LOCKED`) | Prohibirlo siempre simplifica; permitirlo con vínculos rompería la historia (la base lo impide) |
| **D-03.12** | ¿Se pueden eliminar oportunidades cerradas? | **Resuelta (2026-10-10).** No (`409 OPPORTUNITY_CLOSED`): conservan el resultado para reportes | Permitirlo alteraría conteos históricos |
| **D-03.13** | Redondeo del tonelaje calculado | **Resuelta (2026-10-10).** 4 decimales, `HALF_UP`, aritmética decimal en backend | Afecta a totales de Inicio y Reportes (deben usar el valor guardado, nunca recalcular) |
| **D-03.14** | Unidades admitidas en una asociación o línea de forecast | **Resuelta (2026-10-10).** Cualquier unidad activa; si no hay regla, sin tonelaje | Restringir a la dimensión de la unidad base del producto añade una validación |
| **D-03.15** | ¿Se permite retroceder de fase (p. ej. de Construcción a Cotización)? | **Resuelta (2026-10-10).** Sí, queda en el historial | Prohibirlo añade una regla con `metadata.order` |
| **D-03.16** | ¿A quién se puede asignar como asesor responsable? | **Resuelta (2026-10-10).** Usuario `ACTIVE`, con rol del CRM, dentro del alcance de quien asigna | Ampliarlo (cualquier usuario) cambia `INVALID_OWNER` |

---

## Precisiones de implementación (2026-10-11)

Huecos técnicos resueltos al implementar (AGENTS.md §9.3, §9.10). Ninguno cambia el esquema,
una regla de negocio ni un permiso.

### E1 — Piezas transversales del backend

**Ubicación y contratos** (firmas en el código; resumen para E2):

| Pieza | Ubicación | Qué ofrece |
|---|---|---|
| Aritmética decimal | `backend/src/common/decimal.ts` | `roundDecimal`, `multiplyDecimal`, `divideDecimal`, `sumDecimals`, `compareDecimal`, `isDecimalString`, `isZeroDecimal`. `BigInt`, `HALF_UP`, escala fija en el resultado (addendum de ADR-024). Montos y tonelajes con 4 decimales; tasas y factores con 8 |
| Fechas de calendario | `backend/src/common/calendar-date.ts` | `CalendarDate` (`YYYY-MM-DD`), `isCalendarDate`, `fromCalendarDate`/`toCalendarDate` (medianoche UTC para `@db.Date`), `calendarDaysBetween`, `calendarDateIn(now, zona)` ("hoy" del negocio, RN-03.38) |
| Avisos no bloqueantes | `backend/src/common/warnings.ts` | `ApplicationWarning { code, message, details }` (forma de `warnings[]`, RN-03.81) |
| Monedas y tipos de cambio | `backend/src/modules/exchange-rates/` (`ExchangeRatesModule` exporta `CurrencyConversionService`) | Puerto `ExchangeRateReader` (`EXCHANGE_RATE_READER`) + adaptador `prisma-exchange-rate-reader.repository.ts`. Servicio: `allowedCurrencies(countryId)`, `assertCurrencyAllowed(code, countryId)`, `findApplicable(code, date)` (sin lanzar, para Reportes), `convertToBase({ amount, currencyCode, referenceDate, countryId })` (los cinco campos + `warnings`) |
| Conversión a toneladas | `backend/src/modules/unit-conversions/` (`UnitConversionsModule` exporta `UnitConversionResolver`) | Puerto `UnitConversionReader` (`UNIT_CONVERSION_READER`) + adaptador `prisma-unit-conversions.repository.ts`. `resolve(lookup)` → regla o `null`; `require(lookup)` → `422 CONVERSION_RULE_NOT_FOUND`; `assertApplicable(ruleId, lookup)` → `422 INVALID_CONVERSION_RULE`; `tonnageFor(cantidad, regla)`; `tonnageUnit()` |
| Predicados de métricas | `backend/src/modules/commercial-metrics/metric-definitions.ts` | DEF-A (`isClosedStage`, `isOpenStage`, `openStageIds`, `closedStageIds`), resultado (`isWonOutcome`, `isLostOutcome`), RN-03.15 (`isFinalPhase`, `nonFinalPhaseIds`, `finalPhaseIds`, `isActiveProject`), DEF-B (`commercialStatus`), DEF-C (`projectLastUpdate`, `PROJECT_LAST_UPDATE_FIELD`), DEF-G (`businessMonth`, `forecastWindowMonths`, `isInForecastWindow`, `addMonths`, `compareYearMonth`) |

**Decisiones técnicas:**

1. **"`ExchangeRateReader.findApplicable`" se reparte en puerto y servicio** (addendum de ADR-024):
   el puerto lee la fila de mayor vigencia ≤ fecha; la identidad de USD, las monedas admitidas, la
   conversión, el aviso y los `422` los aplica `CurrencyConversionService`.
2. **Forma de `details`** (API-STANDARDS: `details` es siempre una lista; donde RN-03.79 dice
   `details: { currencyCode, date }` se lee `details[0]`):
   - `CURRENCY_NOT_ALLOWED`: `[{ field, code, currencyCode, allowedCurrencyCodes[] }]`.
   - `EXCHANGE_RATE_NOT_FOUND`: `[{ field, code, currencyCode, date }]`.
   - `CONVERSION_RULE_NOT_FOUND`: `[{ field, code, fromUnitId, toUnitCode }]`.
   - `INVALID_CONVERSION_RULE`: `[{ field, code, ruleId, reasons[] }]`, con `reasons` ∈
     `NOT_FOUND`, `INACTIVE`, `FROM_UNIT_MISMATCH`, `TO_UNIT_MISMATCH`, `SCOPE_NOT_APPLICABLE`,
     `NON_POSITIVE_FACTOR`, `IDENTITY_FACTOR_NOT_ONE`.
   - Aviso `EXCHANGE_RATE_STALE`: `details` es un objeto (`{ currencyCode, exchangeRateDate,
     referenceDate, ageDays, thresholdDays }`), como fija F.2.
3. **Moneda del país inexistente o inactiva** (RN-03.78, opción más restrictiva): no se admite;
   solo queda USD, que es también la moneda propuesta (`defaultCurrencyCode`). La base se exige
   igualmente existente y activa.
4. **"Más de N días"** (RN-03.81): avisa si `ageDays > crm.tipos_cambio.dias_aviso_antiguedad`
   (con 31: 31 días no avisa, 32 sí). La moneda base nunca avisa.
5. **Identidad `TON → TON`**: es la regla `GLOBAL` de la semilla esencial y se resuelve como
   cualquier otra; no se sintetiza (el `CHECK` "tonelaje ⇔ regla" exige una regla real).
6. **Unidad de tonelaje rota**: si el código de `crm.forecast.unidad_tonelaje` no existe en
   `units_of_measure`, el resolver lanza `TonnageUnitUnavailableError` (fallo de configuración →
   `500`, mismo criterio que `SequenceNotFoundError`). Una unidad destino desactivada no bloquea
   (sus reglas siguen vigentes); RN-07.33 impide llegar a ambos casos por la API.
7. **`INVALID_CONVERSION_RULE` frente a `CONVERSION_RULE_NOT_FOUND`**: el resolver nunca devuelve una
   regla no aplicable, así que en modo `RULE` una regla inactiva o hacia otra unidad se traduce en
   `CONVERSION_RULE_NOT_FOUND`; `INVALID_CONVERSION_RULE` es para una regla concreta que se valida
   con `assertApplicable` (p. ej. una foto que se vuelve a validar).
8. **RN-07.33 implementada** (pendiente desde la Fase 0): `PATCH /parameters/crm.forecast.unidad_tonelaje`
   exige unidad existente, activa, de dimensión `MASS` y con regla identidad `GLOBAL` activa. Si no →
   `422 INVALID_PARAMETER_VALUE` con una incidencia por motivo
   (`details[]: { field: "value", issue, reason, unitCode, key }`, `reason` ∈ `UNIT_NOT_FOUND`,
   `UNIT_INACTIVE`, `UNIT_NOT_MASS`, `IDENTITY_RULE_MISSING`). Lo valida `ParametersService` con
   `UnitConversionResolver.tonnageUnitCandidateIssues`.
9. **DEF-B**: empate de `metadata.order` entre etapas abiertas → gana el `code` menor (determinista);
   una oportunidad cerrada sin resultado (no debería existir, RN-03.46) cuenta como no ganada;
   las etiquetas fijas son `Ganado`, `Perdido` y `Sin oportunidades` (`COMMERCIAL_STATUS_LABELS`).
   `metric-definitions.ts` incluye además "proyecto activo" (RN-03.15), porque RN-03.77 prohíbe
   consultar `isFinal` fuera de él. Los totales del forecast (RN-03.74) no son un predicado:
   los calcula `forecast-totals.ts` (E2) con `sumDecimals`.
10. **Semilla demo**: las líneas (productos asociados y forecast) aplicaban `PRODUCT > FAMILY > GLOBAL`
    sin `PROJECT_TYPE`, en contra de RN-03.58. Ahora usan la misma precedencia que el resolver:
    las mallas (m²) de los proyectos `VIVIENDA` (P1, P4) toman la regla por tipo y la del proyecto
    industrial P8 sigue "sin conversión" (`seeds.e2e.spec.ts` actualizado). El resto de §L.2 ya
    estaba cubierto: fases `DISENO`…`FINALIZADO`, duplicado P6 ← P5, oportunidades abiertas,
    ganadas, perdidas y parcial (y una con resultado cambiado), productos con y sin conversión,
    forecast M−3…M+6 y tasas demo de M−2, M−1 y M. Con tasas mensuales ninguna oportunidad demo
    dispara `EXCHANGE_RATE_STALE`; se ve creando una estimación en GTQ con fecha posterior en más
    de 31 días al día 1 del mes en curso.

---

### E1 — Base del frontend

- **Entrada decimal (es-GT):** el punto es el separador decimal; la coma solo se admite como
  separador de miles bien colocado. `1,5` es un error de formato, nunca `15`. La validación no
  redondea. Los montos se muestran con el código ISO (`GTQ 1,234.50`). Helpers en
  `frontend/src/features/crm/common/decimal.ts` (`BigInt`, sin `number`) y `DecimalField`.
- **Fechas de calendario** (`YYYY-MM-DD`): nunca se interpretan con `new Date(string)` (en UTC-6
  muestra el día anterior); se usa `formatCalendarDate`.
- La sección de proyectos de la ficha del cliente puede ordenar por `phaseOrder`; su orden por
  defecto sigue siendo `name asc`.
- **Filtros repetibles** (p. ej. `commercialStatus`): se envían separados por comas
  (`commercialStatus=OPEN_STAGE,WON`), igual que `outcome=WON,PARTIAL`; el backend los acepta así.
- Las páginas provisionales de E1 usan `PendingPage`; E3 sustituye su contenido.

## Filas para la matriz

Estado de F-10 … F-20: `especificada` (ninguna bloqueada; DM-8 resuelta por ADR-021).

| F-xx | Entidades | Dependencias | Criterios | Pruebas |
|---|---|---|---|---|
| F-10 | `projects`, `project_phase_history`, `sequences`, `customers`, `countries`, `users`, `catalog_items` (`crm.fase_cliente`), `system_parameters`, `attachments`/`stored_files`, `audit_logs` | Fase 0 (migraciones, semillas, `SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`), Módulo 2 (`CustomerReferenceGuard`, `CustomerPicker`, `AttachmentsService` sobre `FileStorage`, `ParameterReader`), D-03.1 (= D-02.1), D-03.4, D-03.16; adjuntos: DM-8 resuelta (ADR-021) | AC-03.1 – AC-03.8, AC-03.95 | PF-03.1 – PF-03.13, PF-03.113, PF-03.114, PF-03.133 |
| F-11 | `projects`, `project_phase_history`, `opportunities`, `opportunity_stage_history`, `opportunity_results`, `opportunity_result_history`, `project_products`, `forecast_lines`, `attachments`, `audit_logs`, `visits`/`activities` (bloqueos) | F-10, Módulo 4 (`CommercialActivitySection`, `NewActivityButton`, `PlanVisitButton`; disponibilidad D-02.10), DM-8 (ADR-021), DM-16, DM-33, DM-34, D-03.2 (= D-02.12), D-03.11 | AC-03.9 – AC-03.16, AC-03.81, AC-03.85, AC-03.94, AC-03.95 | PF-03.14 – PF-03.24, PF-03.107, PF-03.112, PF-03.113, PF-03.131, PF-03.133 |
| F-12 | `projects`, `project_phase_history`, `project_products`, `unit_conversion_rules`, `audit_logs` | F-10, F-15, F-19, DM-17, D-03.9 | AC-03.17 – AC-03.20 | PF-03.25 – PF-03.29, PF-03.115 |
| F-13 | `projects`, `customers`, `countries`, `users`, `opportunities`, `catalog_items` | F-10, Fase 0 (`VisibilityScopeResolver`), D-03.1, D-03.3 (= D-02.11), `metric-definitions.ts` (DEF-A/B) | AC-03.21 – AC-03.25, AC-03.86 | PF-03.30 – PF-03.35, PF-03.117 – PF-03.120 |
| F-14 | `projects`, `users`, `team_members`, `teams`, `roles` (`dataScope`: `OWN`, `TEAM`, `COUNTRY`, `ORGANIZATION`) | F-10, DM-10 (`COUNTRY`), DM-11 (asesor `OWN`), DM-12, DM-13, DM-34, D-03.10 | AC-03.26 – AC-03.29 | PF-03.34, PF-03.36 – PF-03.39, PF-03.115 |
| F-15 | `projects`, `catalog_items` (`crm.tipo_proyecto`, `crm.sector_proyecto`), `units_of_measure`, `unit_conversion_rules` | Fase 0 (`UnitConversionResolver`, reglas genéricas), DM-24, D-03.13 | AC-03.30 – AC-03.35 | PF-03.40 – PF-03.48 |
| F-16 | `projects`, `project_phase_history`, `catalog_items` (`crm.fase_cliente`), `system_parameters` (`crm.proyectos.reglas_avance`) | F-10, D-03.15 | AC-03.36 – AC-03.40 | PF-03.49 – PF-03.55 |
| F-17 | `opportunities`, `opportunity_stage_history`, `catalog_items` (`crm.etapa_oportunidad`), `sequences`, `countries` (`currency_code`), `currencies`, `exchange_rates` (lectura), `system_parameters` (`crm.oportunidades.transiciones_etapa`, `crm.valores_por_defecto`, `crm.moneda_base`, `crm.tipos_cambio.dias_aviso_antiguedad`) | F-10, Fase 0 (`ExchangeRateReader`, semilla de monedas y tipos de cambio), DM-1, DM-6, DM-33, DM-35, DM-36 (ADR-024), D-03.7, D-03.8, D-03.12 | AC-03.41 – AC-03.50, AC-03.87 – AC-03.94 | PF-03.56 – PF-03.69, PF-03.121 – PF-03.132 |
| F-18 | `opportunity_results`, `opportunity_result_history`, `opportunities`, `catalog_items` (`crm.resultado_oportunidad`, `crm.motivo_resultado`) | F-17, DM-15 (parcial cuenta como ganada), D-03.8 | AC-03.51 – AC-03.58 | PF-03.70 – PF-03.79 |
| F-19 | `project_products`, `products`, `product_families`, `units_of_measure`, `unit_conversion_rules`, `catalog_items` (`crm.estado_producto_asociado`) | F-10, F-17, Fase 0 (maestro y reglas), DM-23, DM-24, D-03.13, D-03.14 | AC-03.59 – AC-03.68 | PF-03.80 – PF-03.91 |
| F-20 | `forecast_lines`, `project_products`, `products`, `units_of_measure`, `unit_conversion_rules`, `users`, `system_parameters` (`crm.forecast.*`, `crm.zona_horaria_negocio`) | F-19, DM-24, DM-25, D-03.5, D-03.6, D-03.13 | AC-03.69 – AC-03.83 | PF-03.92 – PF-03.109, PF-03.114 |

Transversales del módulo: AC-03.84 / PF-03.110, PF-03.111, PF-03.116 (menú y
rutas), AC-03.85 / PF-03.112 (`last_activity_at`) y AC-03.86 / PF-03.118 – PF-03.120
(contrato F-08 con Clientes, filtros de navegación de Inicio y predicados compartidos).
