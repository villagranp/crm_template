# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **CRM — integración de los Módulos 3 y 4** (`04-actividad-comercial.md`, «Precisiones de
  implementación (2026-10-13)»; sin cambios de contrato):
  - Backend: el bloqueo del proyecto vinculado y `projects.last_activity_at` de visitas y
    actividades usan el repositorio de proyectos del Módulo 3 (`LinkedProjectsService` sobre
    `PROJECTS_REPOSITORY`: `lockProject(id, 'UPDATE')` antes de validar, `touchLastActivity`);
    ya no hay una segunda escritura de `last_activity_at`. `CommercialLinkReader` se conserva
    solo para validar proyecto y oportunidad (03 no publica una guardia que distinga referencia
    desconocida de eliminada). La guarda de cliente recibe los alcances resueltos antes de la
    transacción.
  - Frontend: la ficha del proyecto monta en «Seguimiento comercial» la sección del Módulo 4
    con «Nueva actividad» y «Planificar visita»; el detalle de una oportunidad abierta ofrece
    «Nueva actividad» con cliente, proyecto y oportunidad. Los formularios usan `ProjectPicker`
    y `OpportunityPicker` de 03 y la preselección se resuelve con `GET /projects/{id}` y
    `GET /opportunities/{id}`. Seguimiento, historial y visitas ofrecen el filtro «Proyecto»
    (y el historial, «Oportunidad»).
  - E2E PF-04.58 sin simulación del Módulo 3: parte de la ficha real del proyecto.

### Fixed
- **CRM Módulo 4 — revisión de código** (`04-actividad-comercial.md`, "Precisiones de implementación"):
  - Concurrencia (RN-04.2): alta y edición de visitas y actividades bloquean el proyecto vinculado
    **antes** de validarlo; antes, una eliminación concurrente del proyecto podía dejar un registro
    nuevo vinculado a un proyecto eliminado (prueba de integración con dos transacciones).
  - Contrato (aditivo): los `form-options` de visitas y actividades publican `timeZone`,
    `businessTimeZone` y `attachments`; `owner-options` acepta `id` repetible para resolver
    nombres con el mismo filtro de alcance; `VisitEventDto.canAttachFiles` (D-04.18, misma regla
    que la subida). `TraceAttachmentDto.contentPath` pasa a ser relativa a la base de la API.
    Agenda, calendario, historial, seguimiento y listas de adjuntos ya no anuncian `search` y
    responden `400` si llega (antes se ignoraba).
  - Frontend: fechas, entradas `datetime-local`, límites de día y rejilla del calendario en la zona
    del usuario y "hoy" en la de negocio (RN-04.9, D-04.17, conversión con `Intl` segura ante
    cambios de horario); límites de adjuntos comprobados antes de subir en todas las pantallas;
    el chip del asesor muestra su nombre tras recargar; los borradores de filtros ya no se borran
    al recargar la lista; subir o eliminar adjuntos refresca los contadores del módulo
    (`AttachmentsSection onChanged`, aditivo); eliminar una actividad sale del detalle sin `404`
    intermedio; un fallo de las opciones del listado de actividades se avisa con "Reintentar";
    "Adjuntar archivos al evento" sigue a `canAttachFiles`; `search` nunca se envía a esas
    colecciones; `lineHeight` del calendario desde la tipografía del tema. `httpClient` envía una
    lista en `query` como parámetro repetible. E2E PF-04.59: la espera del detalle de la visita
    acepta solo un UUID (la página también pide `/visits/form-options`).
- **Observabilidad — status de `http_request`** (`RequestLoggingInterceptor`): un
  `ApplicationError` (401, 403, 404, 409, 422…) se registraba con `statusCode: 500` porque el
  interceptor lo deducía de una propiedad `status` que esas excepciones no tienen; el cliente
  recibía el status correcto y no había `unhandled_exception`, así que el log mostraba 500
  inexistentes (p. ej. cada `POST /auth/refresh` sin cookie). Ahora el interceptor y
  `AllExceptionsFilter` comparten la misma regla (`httpStatusOf`), con su prueba de regresión.
- **E2E — esperas tras el login** (`auth-local`, `crm-customers`): las pruebas esperan la
  respuesta real del login, del cambio de contraseña y de `GET /me/menu` antes de mirar la
  pantalla; con varios navegadores arrancando, el login superaba los 5 s de `expect`.
- **CRM Módulo 3 — revisión de código del backend** (`03-proyectos.md`, "Precisiones", Revisión E5):
  - Concurrencia: proyectos, productos asociados, oportunidades (edición, etapa, resultado,
    eliminación) y forecast deciden política, plan de la estimación, rango de fechas y cambios sobre
    la fila **bloqueada**, no sobre la lectura previa. Un PATCH ya no pisa con valores viejos lo que
    otra petición guardó (estimación de la oportunidad, cantidad de un producto asociado); un
    producto quitado mientras se editaba responde `404` y unas fechas cambiadas a la vez `422
    INVALID_DATE_RANGE` (antes `500`); el antiguo asesor sin `administrar` recibe `403`.
  - Sin conexiones extra del pool dentro de transacciones con bloqueos: `CustomerReferenceGuard`
    recibe los alcances resueltos antes (`accessScopes`; con `tx` son obligatorios por tipo) y la
    unidad de tonelaje se lee antes de la transacción (`UnitConversionResolver.resolve(lookup, tx,
    tonnageUnit)`).
  - Forecast: las reglas de una página o de un lote se resuelven en una sola tanda
    (`UnitConversionResolver.resolveMany`, mismos resultados); las celdas de un producto sin
    asociación activa ya no son editables (`hasActiveAssociation`).
  - Reloj del negocio único (`BUSINESS_CLOCK`, alias `FORECAST_CLOCK`) para el forecast, la
    eliminación del proyecto y la de un producto asociado.
  - UUID normalizados a minúsculas en los DTO del CRM (`toLowerCaseUuid`) y comparados sin
    distinguir mayúsculas.
  - Rutas de campo del `400 VALIDATION_FAILED` con índices entre corchetes (`lines[0].quantity`),
    como los `422` (**cambio de contrato menor**: antes `lines.0.quantity`).
  - Duplicar sin `ownerId`: si el asesor del origen no es asignable por el actor, el duplicado
    queda a nombre del actor (antes `422 INVALID_OWNER`). Se quitó el bloqueo consultivo
    redundante de los productos asociados (los serializa el `FOR UPDATE` del proyecto).
- Ficha del cliente: la fecha estimada de decisión de sus proyectos se mostraba un día antes en
  UTC-6; sus tipos siguen ahora el contrato 03 F.1 (`progress` como cadena decimal).
- **CRM Módulo 2 — revisión de código** (`02-clientes-cuentas.md`, "Precisiones de implementación"):
  - Seguridad: cada operación sobre un cliente usa el alcance de **su** permiso (editar ajenos,
    campos reservados y contactos → `clientes.administrar`; eliminar/restaurar →
    `clientes.eliminar`), no el de `clientes.ver`; con roles combinados ya no se administra un
    cliente solo visible por un rol de lectura. Las `capabilities` salen del mismo cálculo.
    `VisibilityScopeResolver.resolveMany` resuelve varios permisos con una lectura.
  - Concurrencia: "como máximo un principal activo" (RN-02.26) con la fila del cliente bloqueada
    y escrituras condicionales; eliminación de cliente y de contacto sin TOCTOU (conteo y borrado
    en la misma transacción con bloqueo); `CustomerReferenceGuard` con `tx` toma `FOR SHARE`.
  - Adjuntos: la autorización se decide antes de leer el `multipart` (guard) y el corte de tamaño
    usa el `crm.adjuntos.max_mb` vigente en cada petición.
  - Auditoría: los comentarios del contacto se enmascaran (DM-29). Edición sin
    `clientes.administrar`: un código igual normalizado conserva el valor guardado. Alta y edición
    leen alcances y parámetros antes de abrir su transacción. `VALIDATION_FAILED` detectado por un
    servicio responde `400` (`RequestValidationError`). OpenAPI documenta el `400` de los
    endpoints con UUID en la ruta. Frontend: eliminar un cliente quita su ficha de la caché.
  - NGINX: una sola cabecera `Cache-Control: no-store` en las respuestas de la API.

### Added
- **CRM Módulo 1 — Inicio / Panel de control (F-01…F-04)** (`01-inicio-dashboard.md`):
  - API `GET /dashboard/*`: indicadores K1–K9 (proyectos activos, oportunidades abiertas,
    ganadas y perdidas, forecast M+6, visitas, actividades pendientes y vencidas, metas),
    próximas visitas, actividad reciente, alertas AL-1…AL-4 y su resumen. Cada bloque con el
    permiso y el alcance de su fuente; alertas calculadas con `crm.alertas.*` en cada consulta.
  - `CommercialMetricsModule` / `CommercialMetricsService`: fuente única de las fórmulas
    KPI-01…KPI-10 y DEF-A…G, contrato compartido con Reportes (Módulo 5); `commercial-period.ts`.
  - Visitas y actividades de Inicio con la visibilidad del Módulo 4 (`commercialVisibilitySql`: directa
    + herencia por proyecto con `proyectos.ver`) y `@RequireAnyPermission` del Módulo 4.
  - Panel `/` con tarjetas de indicadores, bandeja de alertas, próximas visitas, actividad
    reciente y accesos rápidos; token `priorityTones` (color por peso de `crm.prioridad`).
- **CRM Módulo 4 — Actividad comercial, completado** (F-21…F-33, `matriz-trazabilidad.md`):
  backend, frontend y E2E en verde. Pendiente al integrar el Módulo 3: montar los puntos de
  entrada de E.11 en la ficha del proyecto y quitar la simulación del 03 en PF-04.58.
- **CRM Módulo 4 — Actividad comercial, backend** (`backend/src/modules/commercial-activity/`,
  `docs/api/README.md`): decorador `@RequireAnyPermission` (addendum ADR-008); actividades
  (alta con gestión ya realizada, edición, completar, cancelar, eliminación lógica, bandeja de
  pendientes); visitas (planificar con aviso de conflicto horario, editar, registrar y corregir
  realización, confirmar solo por el dueño, reprogramar, cancelar, historial de eventos); agenda
  y calendario, historial de interacciones sobre `crm_interactions_v`, seguimiento por cliente y
  por proyecto; adjuntos por dueño (visita, evento, actividad); `form-options` y `owner-options`;
  `CommercialActivityUsageQuery` para los módulos 2 y 3; rutas y opciones de menú `actividad-*`.
  Sin cambios de esquema. Proyecto y oportunidad se validan con un puerto propio sobre las tablas
  de Fase 0 mientras el Módulo 3 no esté integrado.
- **CRM Módulo 4 — Actividad comercial, E2E** (`frontend/tests/e2e/crm-commercial-activity.e2e.spec.ts`,
  PF-04.58–61; TESTING.md «E2E de Actividad comercial»): llamada «ya realizada» desde el proyecto
  (Módulo 3 simulado en el navegador), visita con aviso de conflicto, reprogramación, registro y
  confirmación, permisos recortados y bandeja. `e2e-stack.ts activate` imprime los datos demo del
  recorrido y crea los dos usuarios recortados de PF-04.60.
- **CRM Módulo 4 — Actividad comercial, frontend (primera mitad)**
  (`frontend/src/features/crm/commercial-activity/`, `04-actividad-comercial.md` "Precisiones"):
  listado de actividades con filtros en la URL, alta con preselección por query string, campos
  por tipo según `metadata.fields`, "Ya realizada" y archivos, detalle con edición, completar,
  cancelar y eliminar según `allowedActions`, bandeja de pendientes con pestañas y contadores,
  piezas comunes (`StatusChip`, `DueBadge`, `CustomerProjectFields`, `ParticipantsField`,
  `AttachmentsPanel`, `InteractionTimeline`, `date-time.ts`) y puntos de entrada
  (`NewActivityButton`, `PlanVisitButton`, `CommercialActivitySection`) integrados en la ficha
  del cliente. Iconos del módulo en `MaterialSymbol`. `AttachmentsSection` gana `canDelete`.
- **CRM Módulo 4 — Actividad comercial, frontend (segunda mitad)**
  (`frontend/src/features/crm/commercial-activity/`, `04-actividad-comercial.md` "Precisiones"):
  - Visitas (E.6–E.8): listado con filtros en la URL (rango, estado, asesor, cliente, país, "sin
    registrar", "pendientes de confirmar"), planificar con preselección por query string, aviso de
    conflicto horario con *debounce* que nunca bloquea "Guardar", aviso de fecha pasada y
    recordatorio en minutos u horas; detalle con Planificación, Realización, Confirmación,
    Historial de eventos y Adjuntos, y diálogos Editar planificación, Registrar realizada /
    Corregir realización, Confirmar (solo con `CONFIRM` en `allowedActions`), Reprogramar y
    Cancelar. Los archivos de cada operación se suben a su evento (D-04.18).
  - Agenda (E.2): calendario propio sin librería (D-04.1) con vistas Mes, Semana y Día,
    `calendar-grid.ts`, vista Día con tira de días en móvil, listado conmutable (`view=`), filtros
    en la URL con chips, panel de resumen con "Ver detalle" y "Completar", y aviso de `truncated`.
  - Seguimiento (E.4) por cliente o por proyecto con `FollowUpTraceDrawer` (línea de tiempo,
    próximas visitas y actividades, adjuntos descargables) e historial de interacciones (E.5) con
    línea de tiempo o tabla, filtros y orden invertible.
  - Piezas comunes nuevas: `CountrySelect`/`useCountryOptions`, `AttachmentCount`,
    `NextActionDate`. Se elimina el marcador provisional `CommercialActivityPendingPage`.
- **CRM Módulo 3 — pantallas:** búsqueda, alta, ficha (general, clasificación, fase, productos
  asociados con totales, oportunidades, resultados, forecast, seguimiento, historial y adjuntos),
  edición, duplicado, eliminación y vista de equipo de proyectos; pipeline de oportunidades en lista
  y tablero, ficha de la oportunidad, diálogos de oportunidad, cambio de etapa y resultado; matriz del
  forecast M+6 con borrador, conflictos y vista móvil. `ProjectPicker`, `OpportunityPicker` y
  `ForecastMatrix` en sus barriles; `UnsavedChangesGuard` e `invalidateCrmCaches` en `crm/common`.
- E2E de Proyectos y Forecast (`TESTING.md` §"E2E de Proyectos").
- **CRM Módulo 3 — backend de Oportunidades y Forecast (E2b, F-17, F-18, F-20):** módulos
  `opportunities` y `forecast`. Endpoints `/opportunities` (pipeline con filtros DEF-A, resultado y
  fecha de decisión; orden por equivalente en USD), `/opportunities/form-options` (monedas admitidas
  por proyecto), `/opportunities/stage-summary`, detalle con `allowedTransitions` y `capabilities`,
  edición con foto del tipo de cambio y aviso `EXCHANGE_RATE_STALE` en `warnings[]`,
  `/stage-changes` (transiciones por parámetro, regla de respaldo, cierre con resultado y
  reapertura), `PUT /result`, `/history`, eliminación lógica, y
  `/projects/{projectId}/opportunities` (lista y alta); `/forecast/window`, `/forecast/rows`,
  `/forecast/totals` y `PUT /forecast/lines` (lote atómico con concurrencia optimista).
  Códigos nuevos `INVALID_INITIAL_STAGE`, `INVALID_STAGE_TRANSITION`, `STAGE_UNCHANGED`,
  `COMMENT_REQUIRED`, `CURRENCY_REQUIRED`, `RESULT_REQUIRED`, `RESULT_NOT_ALLOWED`,
  `RESULT_STAGE_MISMATCH`, `RESULT_REASON_REQUIRED`, `RESULT_PERCENT_REQUIRED`,
  `RESULT_PERCENT_NOT_ALLOWED`, `OPPORTUNITY_NOT_CLOSED`, `OPPORTUNITY_CLOSED`,
  `OPPORTUNITY_HAS_DEPENDENCIES`, `FORECAST_PERIOD_OUT_OF_WINDOW`, `FORECAST_DUPLICATE_IN_BATCH`,
  `PRODUCT_NOT_ASSOCIATED`, `FORECAST_LINE_STALE` (`docs/api/README.md`). `ProjectsModule` exporta
  además `PROJECTS_REPOSITORY`; `createTestContext` admite `configure` para sustituir proveedores
  en pruebas. Sin cambios de esquema.
- **CRM Módulo 3 — backend de Proyectos (E2a, F-10…F-16 y F-19):** módulos `projects` y
  `products` (solo lectura). Endpoints `/projects` (búsqueda con estado comercial DEF-B y filtros
  repetibles por comas, `team-view`, `form-options`, `owner-options`, `team-options`, alta, ficha,
  edición, eliminación lógica con bloqueos, duplicado, historial), `/projects/{id}/phase-history`,
  `/phase-changes`, `/classification`, `/products` y `/attachments`, y `/products`,
  `/product-families`, `/units-of-measure`, `/unit-conversions/resolve`. Códigos nuevos
  `PROJECT_CODE_TAKEN`, `PROJECT_CUSTOMER_LOCKED`, `PROJECT_HAS_ACTIVE_CHILDREN`,
  `PROJECT_PRODUCT_DUPLICATE`, `PRODUCT_HAS_FORECAST`, `INVALID_DATE_RANGE`, `INVALID_OWNER`,
  `INVALID_QUANTITY`, `INVALID_PROGRESS`, `PHASE_PROGRESS_RULE`, `PHASE_UNCHANGED`,
  `PRODUCT_INACTIVE`, `OPPORTUNITY_NOT_IN_PROJECT` (`docs/api/README.md`). Sin cambios de esquema.
- **CRM Módulo 3 — base del frontend:** las 7 rutas de Proyectos con páginas provisionales
  (`PendingPage`), helpers decimales sin `float` (`decimal.ts`, `DecimalField`) e iconos de menú
  `apartment`, `handshake` y `trending_up`.
- **CRM Módulo 3 — piezas transversales del backend (E1)** (`03-proyectos.md` §K.1.2, "Precisiones
  de implementación (2026-10-11)"):
  - `ExchangeRatesModule` (`backend/src/modules/exchange-rates/`): puerto `ExchangeRateReader` +
    adaptador Prisma y `CurrencyConversionService` (monedas admitidas por país, tasa vigente "mayor
    vigencia ≤ fecha", conversión a USD con 4 decimales HALF_UP, aviso `EXCHANGE_RATE_STALE`,
    `422 CURRENCY_NOT_ALLOWED` / `EXCHANGE_RATE_NOT_FOUND`). ADR-024, 00 §2.16.
  - `UnitConversionsModule` (`backend/src/modules/unit-conversions/`): puerto `UnitConversionReader`
    + adaptador Prisma y `UnitConversionResolver` (precedencia de línea y de proyecto, identidad,
    `422 CONVERSION_RULE_NOT_FOUND` / `INVALID_CONVERSION_RULE`, tonelaje exacto). 00 §2.3.
  - `backend/src/modules/commercial-metrics/metric-definitions.ts`: predicados puros DEF-A, DEF-B,
    DEF-C, DEF-G y "proyecto activo" (RN-03.77).
  - Utilidades comunes: `common/decimal.ts` (aritmética decimal exacta con `BigInt`, addendum de
    ADR-024), `common/calendar-date.ts` (fechas `YYYY-MM-DD`) y `common/warnings.ts`.
  - Suite de integración `backend/test/crm-conversions-rates.e2e.spec.ts`.
- **CRM Módulo 2 — Clientes / Cuentas, frontend** (`frontend/src/features/crm/customers/`):
  búsqueda con filtros y estado en la URL, alta con aviso de duplicados y archivos que se suben
  tras crear, ficha con edición según `capabilities`, baja y restauración, contactos con
  contacto principal, adjuntos, proyectos del cliente (informativo hasta el Módulo 3) y
  `CustomerPicker` reutilizable. Opciones aditivas: `DataTable` `onRowClick`/`getRowLabel`,
  `useTableQueryState({ paramPrefix })`, `AttachmentsSection takeInitialFiles`.
- **CRM Módulo 2 — Clientes / Cuentas, backend** (`02-clientes-cuentas.md` §K.3 pasos 2–7;
  F-05…F-09 `completada`; F-08 se completó con el contrato del Módulo 3):
  - Endpoints F1–F8 (`/customers`: búsqueda con filtros combinables y búsqueda libre
    normalizada, `form-options`, `sales-owner-options`, ficha con `access` y `capabilities`,
    alta con `crmCode` de `crm.cliente`, edición con campos reservados, desactivación por
    estado, eliminación lógica con bloqueo por dependencias y restauración), F9–F16
    (contactos y contacto principal) y F17–F20 (adjuntos del cliente por dueño, ADR-021),
    todos con OpenAPI y `@RequirePermission`.
  - Visibilidad de clientes (H.1): alcance OWN/TEAM (con subequipos)/COUNTRY/ORGANIZATION
    más herencia por proyecto visible (`access = INHERITED`, solo lectura); fuera del
    alcance → `404`. Predicado exportado (`customerVisibilitySql`, `customerVisibilityWhere`)
    para Inicio y Reportes (D-02.12).
  - Servicios reutilizables exportados por `CustomersModule`: `CustomerValidationService`
    (todas las incidencias por campo, modos `BY_ID` y `BY_NATURAL_KEY`),
    `CustomerCreationService` (único camino de alta, `source = UI | IMPORT`),
    `CustomerReferenceGuard` (`assertUsableCustomer`, `assertContactOfCustomer`) y
    `CustomerActorResolver`; funciones puras de normalización (RN-02.17) y de reglas de
    duplicado (F.6.4).
  - Reglas: obligatorios de `crm.campos_obligatorios`, valores de `crm.valores_por_defecto`,
    formatos de teléfono y NIT por país, código de cliente único por país o global
    (`crm.clientes.unicidad_codigo`, bloqueo consultivo), avisos de duplicado con
    confirmación explícita (`acknowledgedDuplicateIds`; NIT repetido = aviso `TAX_ID`, nunca
    bloquea), `FORMULA_NOT_ALLOWED` (D-06.11), auditoría `crm.customer.*`, `crm.contact.*`
    con datos personales enmascarados (DM-29).
  - Códigos de error nuevos: `FIELD_NOT_EDITABLE` (403), `CUSTOMER_CODE_TAKEN`,
    `POSSIBLE_DUPLICATE`, `DUPLICATE_BLOCKED`, `CUSTOMER_HAS_DEPENDENCIES`,
    `CUSTOMER_NOT_DELETED`, `CONTACT_EMAIL_TAKEN`, `CONTACT_HAS_HISTORY`,
    `CONTACT_NOT_DELETED` (409), `REQUIRED_FIELD_MISSING`, `INVALID_COUNTRY`,
    `INVALID_SALES_OWNER`, `INVALID_PHONE_FORMAT`, `INVALID_TAX_ID_FORMAT`,
    `FORMULA_NOT_ALLOWED`, `CONTACT_INACTIVE`, `INVALID_CONTACT`, `CUSTOMER_INACTIVE` (422).
    `AccessDeniedError` admite `details`.
  - Pruebas unitarias del módulo y de integración `customers`, `customers-visibility`,
    `customer-contacts` y `customer-attachments` (`backend/test/support/crm-fixtures.ts`).
- **CRM Módulo 2 — piezas transversales** (`02-clientes-cuentas.md` §K.3 pasos 1 y 6, §L.2):
  - `TRANSACTION_RUNNER` + `TransactionContext` opaco para que varios puertos
    compartan una transacción sin conocer Prisma, y `SEQUENCE_GENERATOR`
    (`SELECT … FOR UPDATE` sobre `sequences`; `prefix`, `pattern`, `padding`,
    `resetPolicy`; dentro de la transacción del llamador) (00 §6.1).
  - `CatalogReferenceValidator` exportado por `CatalogsModule` (00 §3.5):
    `assertItem`/`check` por id o código, activo en el alta y valor desactivado
    conservado en la edición; `422 INVALID_CATALOG_VALUE` con `details[].field`,
    `catalogKey` y `reason` (`NOT_FOUND | INACTIVE`).
  - `VisibilityScopeResolver` exportado por `AccessModule` (00 §4.2): alcance por
    permiso (el más amplio de los roles que lo conceden) como descriptor neutral
    `ALL | FILTERED { ownerIds, teamIds, countryIds }`; `TEAM` con subequipos
    recursivos (CTE), `COUNTRY` sin país degradado a `OWN` con aviso (D-02.8).
  - Adjuntos (ADR-021): puerto `FILE_STORAGE` y adaptador `LocalFileSystemStorage`
    (clave `<año>/<mes>/<uuid>`, ruta contenida en la base sin seguir enlaces,
    temporal + `rename`, corte por tamaño en streaming, SHA-256);
    `AttachmentsModule`/`AttachmentsService` (`list`, `add`, `open`, `remove`
    acotados a `owner = { type, id }`; límites de `crm.adjuntos.*`; tipo por firma
    PDF/JPEG/PNG/DOCX/XLSX cotejado con extensión y lista blanca; compensación del
    binario si falla la base; auditoría `crm.attachment.added|removed`);
    `AttachmentUploadInterceptor` y `attachmentDownload` para los controladores de
    los dueños. Errores `413 ATTACHMENT_TOO_LARGE` y `422 ATTACHMENT_TYPE_NOT_ALLOWED`.
  - Configuración `ATTACHMENTS_STORAGE_PATH` (defecto `./storage/attachments`,
    creada y verificada al arrancar) en `env.schema.ts`, `.env.example`,
    `.gitignore`, volumen `attachments-data` en `docker-compose.yml` y punto de
    montaje con dueño `node` en la imagen del backend.
  - `AuditService.record(..., { maskedFields })`: los campos indicados se
    registran enmascarados en `changes` (`a***@d***.com`, `A***`) (DM-29).
  - `PayloadTooLargeError` (413) en los errores de aplicación y en el filtro global.
- **CRM Fase 0 — semillas** (`00-modelo-de-datos.md` §8):
  - Semilla esencial ampliada (`prisma/seed.ts`, `prisma/seed/crm-*.ts`): monedas
    (USD, GTQ, HNL, CRC, VES), países GT, SV, HN, CR, VE y EC, 9 unidades de
    medida, 4 reglas de conversión globales exactas, 6 secuencias `crm.*`, los 17
    catálogos `crm.*` con su semántica en `metadata`, 41 permisos del CRM (nuevas
    acciones `cerrar` y `administrar`), 5 módulos, roles de sistema `asesor`
    (OWN), `manager` (TEAM) y `responsable-pais` (COUNTRY) con la matriz de §5.4,
    y 28 parámetros (`crm.*` y `sistema.permite_datos_demo`). Las opciones de menú
    del CRM se declaran pero solo se siembran cuando su ruta está registrada
    (DM-32). Sin tipos de cambio reales hasta que el negocio los entregue.
  - Semilla de demostración (`prisma/seed-demo.ts`, script `prisma:seed:demo`),
    con guardia: se niega con `NODE_ENV=production`, sin `SEED_DEMO=true` o sin
    `sistema.permite_datos_demo=true`. Datos ficticios marcados `DEMO-` que cubren
    todos los estados de §8.3; idempotente y purgable (`--purge`).
  - Variables `SEED_DEMO` y `SEED_DEMO_PASSWORD` en `.env.example` (vacías).
  - Adjuntos demo (00 §8.3) en clientes `DEMO-`: 2 PDF y 1 PNG generados (< 10 KiB),
    con filas `stored_files` + `attachments` y binarios en `ATTACHMENTS_STORAGE_PATH`
    (ADR-021); compensación si la transacción falla; re-sembrar y `--purge` borran filas y
    binarios demo tras el commit, sin tocar archivos ajenos. Los de proyectos y visitas
    llegan con los Módulos 3 y 4.
  - Pruebas de integración de ambas semillas (`backend/test/seeds.e2e.spec.ts`).
- **CRM Fase 0 — protecciones transversales**:
  - Registro de semántica de catálogos (`catalog-semantics.registry.ts`) para los
    17 catálogos `crm.*`: `422 INVALID_CATALOG_METADATA` y `409 CATALOG_INVARIANT`
    (`invariant`, `closed_set`, `referenced_by_parameter`). Duplicados por código
    o por etiqueta normalizada, incluidos inactivos (D-07.5). `GET /catalogs/{id}`
    devuelve `metadataSchema` y `closedSet`.
  - Registro de reglas de parámetros (`parameter-rules.registry.ts`) con rangos,
    valores permitidos y referencias a catálogos (`422 INVALID_PARAMETER_VALUE`);
    `crm.moneda_base` es de solo lectura (`409 SYSTEM_RESOURCE_READ_ONLY`).
    `GET /parameters` añade `requiresConfigure`, `readOnly`, `allowedValues`,
    `editor` y `range`.
  - `ParameterReader`: lectura validada con caída al valor por defecto documentado.
  - `413` y `415` en la tabla de estados de `API-STANDARDS.md`.
- **CRM Fase 0 — esquema y migraciones** (`docs/implementation-plans/crm/00-modelo-de-datos.md`):
  monedas, tipos de cambio y países; unidades, familias, productos y reglas de
  conversión; clientes y contactos; proyectos, oportunidades (estimación en USD
  o moneda local con foto del tipo de cambio, ADR-024), resultados, historiales,
  productos asociados y forecast; visitas, eventos, actividades y participantes;
  adjuntos, importación de clientes y metas comerciales; vista
  `crm_interactions_v`. Integridad en la base con FK compuestas y 56 `CHECK`.
  Siete migraciones aditivas (`20261010100100…100700`), cada una con su script
  inverso en `backend/prisma/rollbacks/`. Sin seeds ni endpoints del CRM todavía.
- `users.employee_code` (único) y `users.country_id` (FK a `countries`), ambos
  opcionales en la base.
- Pruebas de integración del esquema CRM (`backend/test/crm-schema.e2e.spec.ts`).

### Changed
- `PATCH /parameters/crm.forecast.unidad_tonelaje` aplica RN-07.33: solo una unidad activa de
  dimensión `MASS` con regla identidad `GLOBAL` activa (`422 INVALID_PARAMETER_VALUE` con
  `details[].reason`). Antes solo se validaba el formato del código.
- Semilla demo: el tonelaje de productos asociados y forecast usa la precedencia
  `PRODUCT > PRODUCT_FAMILY > PROJECT_TYPE > GLOBAL` (antes omitía `PROJECT_TYPE`).
- `pnpm test` en la raíz ejecuta los paquetes uno tras otro (`--workspace-concurrency=1`): en
  paralelo, la carga del backend hacía vencer pruebas del frontend por tiempo. CI no cambia (ya
  ejecuta cada paquete por separado).
- Adjuntos: `AttachmentUploadInterceptor` decodifica el nombre del archivo del
  `multipart` como UTF-8 (`defParamCharset: 'utf8'`); un nombre con tildes ya no
  llega como latin1.
- NGINX: las rutas de subida de adjuntos (`/api/v{n}/{dueño}/{id}/attachments`)
  admiten 11 MiB de cuerpo (10 MiB de archivo + margen de `multipart`); el resto
  de la API sigue en 10 MiB. Sin ninguna `location` que sirva los adjuntos (ADR-021).
- Opciones de menú: `POST/PATCH /menu-options` rechazan una ruta con parámetro
  (`:`) con `422 INVALID_MENU_STRUCTURE` (`details[].field = 'path'`), y
  `GET /menu-options/routes` ya no las ofrece como destino (D-02.12).
- Catálogos: el alta y la edición de elementos validan y escriben dentro de una
  transacción que bloquea la fila del catálogo (`SELECT … FOR UPDATE`). Dos
  cambios simultáneos ya no pueden romper un invariante ni duplicar una etiqueta
  (p. ej. desactivar a la vez las dos únicas etapas `WON`: la segunda recibe
  `409 CATALOG_INVARIANT`). Sin cambios de contrato.
- Catálogos y parámetros sin dependencia circular: RN-07.26 usa el puerto neutral
  `ParameterCatalogReferences` (`common/ports`), implementado en el nuevo
  `ParametersCoreModule` (global), que es el único enlace del repositorio de
  parámetros. `CatalogLookupService` busca por clave exacta.
- Semilla de demostración:
  - La contraseña de los usuarios demo sale **solo** de `SEED_DEMO_PASSWORD`; ya no
    cae a `AUTH_DEFAULT_PASSWORD`. Sin ella, las cuentas quedan `INVITED`.
  - `crm.importaciones.habilitada` solo se cambia si no era `true`, y queda en la
    bitácora (`parameter.updated`, `metadata.source = demo-seed`). `--purge` no lo
    revierte.
  - `--purge` se niega, sin borrar nada, si un registro ajeno a la demo referencia
    a un usuario `@demo.invalid`, y lista tablas/columnas con su conteo.
- Procedimiento de rollback de las migraciones del CRM corregido
  (`docs/database/data-model.md` §10.3 y cabecera de cada `.down.sql`): tras cada
  `.down.sql` se borra su fila de `_prisma_migrations`, porque
  `prisma migrate resolve --rolled-back` solo acepta migraciones fallidas (P3012).
  Nueva prueba `backend/test/crm-rollbacks.e2e.spec.ts`.
- **Contrato:** los errores de validación de DTO responden `400` con código
  `VALIDATION_FAILED` (antes `BAD_REQUEST`) y `details: [{field, issue}]`, sin
  eco del valor recibido. Otros `400` (p. ej. UUID inválido en la ruta) siguen
  como `BAD_REQUEST`.
- **Contrato (rompe compatibilidad):** el alcance de datos `TERRITORY` pasa a
  llamarse `COUNTRY` (`dataScope` en `/me`, `/roles` y `/users`; addendum de
  2026-10-10 a ADR-018). Migración `20261010100000_crm_data_scope_country`
  (`ALTER TYPE … RENAME VALUE`, sin pérdida de datos). En la interfaz se muestra
  como "Su país" / "País". Ningún rol sembrado usaba `TERRITORY`.
- Defaults de `users.locale` y `users.time_zone` para usuarios **nuevos**:
  `es-GT` y `America/Guatemala` (antes `es-MX` y `America/Mexico_City`). Los
  usuarios existentes conservan su valor.

## [0.2.0] - 2026-10-09

### Added
- Proyecto creado a partir de project-template v1.0.1.
- Autenticación local (PLAN-AUTH-LOCAL): login, refresh con rotación y
  detección de reutilización, logout, cambio de contraseña, bloqueo por
  intentos fallidos, contraseñas iniciales con cambio obligatorio y
  restablecimiento por administrador.
- Pruebas de integración contra PostgreSQL en el esquema aislado `integration_test`.

- Administración completa (PLAN-ADMIN): usuarios, roles y permisos, opciones
  de menú, equipos, catálogos, parámetros, auditoría y bandeja de aprobaciones.
  Toda mutación queda en la bitácora con la diferencia antes/después.
- Exportación CSV de usuarios y de auditoría, con protección contra inyección
  de fórmulas y tope de 10 000 filas.
- Registro de rutas navegables (`app-routes.registry.json`) que valida las
  opciones de menú creadas desde la interfaz.

- Skills de pulido de UI y movimiento de emilkowalski/skills (10, MIT), con
  precedencia de las reglas del proyecto (CLAUDE.md §4).
- Skill `ui-ux-pro-max` (MIT) como consulta de recomendaciones de UX; sin
  generación de sistemas de diseño propios (ADR-017).

- Prototipo de referencia visual en `docs/design/prototype/` (entregado como
  `CRM.zip`) y logos, fondo de acceso y favicon actualizados.
- `GET /me/menu`: cada módulo indica `isSystem` (cambio aditivo) para agrupar
  la administración en la sección "Sistema" del menú.

### Changed
- **Look and feel** alineado con el prototipo (`docs/design/prototype/`):
  cabecera con módulos en pestañas, menú lateral por secciones (Principal,
  Módulos, Sistema) con grupos plegables, encabezado de página en banda,
  etiquetas de formulario sobre el campo, tablas en tarjeta con chips de
  filtro, diálogos con secciones numeradas, login con fondo completo y panel
  de inicio con datos reales. Sin controles sin función (decisión del
  responsable).
- **Contrato:** `GET /roles` pasa a ser paginado (`{ data, pagination }`).
- **Contrato:** `PATCH /users/{id}` ya no acepta `status`; el estado cambia con
  `POST /users/{id}/suspend` y `/reactivate`, que cierran sesiones y aplican
  las salvaguardas.
- **Contrato:** los roles de sistema rechazan cambios con
  `409 SYSTEM_RESOURCE_READ_ONLY` (la semilla repone sus asignaciones).
- **Seguridad (ADR-020):** asignar roles y permisos, crear o duplicar roles,
  cambiar lo que concede un rol, restablecer contraseñas y actuar sobre un
  administrador exigen el rol
  `administrador` (`403 ADMIN_ONLY`). Un no administrador solo da de alta
  usuarios con roles sin permisos. `gestor-accesos` gana `equipos.crear` y
  `equipos.eliminar`.
- Salvaguardas de acceso: `SELF_LOCKOUT` y `LAST_ADMIN` también se aplican a
  las denegaciones directas, y la comprobación es atómica (bloqueo consultivo
  de PostgreSQL). Las jerarquías de equipos y de menú se modifican bajo
  bloqueo para que dos cambios simultáneos no creen un ciclo.
- `POST /users` con `teamIds` exige `equipos.editar` y valida los equipos
  (`422 UNKNOWN_REFERENCE`). Las asignaciones directas rechazan destinos
  repetidos y más de 200 elementos (`400`).
- Reactivar una cuenta bloqueada levanta también el bloqueo por intentos.
- `JWT_REFRESH_TOKEN_TTL` por defecto pasa de `7d` a `8h`, sin deslizamiento.
- Las variables de duración (`JWT_*_TTL`) se validan al arrancar.

### Fixed
- La API confía en un salto de proxy y NGINX sobrescribe `X-Forwarded-For`:
  detrás de NGINX el rate limiting trataba a todos los usuarios como una sola
  IP, y la cabecera del cliente se propagaba sin filtrar.
- `VITE_API_BASE_URL` de ejemplo pasa a `/api/v1`: una URL absoluta a otro
  origen impedía enviar la cookie de refresco en el stack de Docker.