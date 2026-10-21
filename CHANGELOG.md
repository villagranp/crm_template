# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Endurecimiento para exposición a internet** ([plan](docs/security/plan-exposicion-internet.md) §2;
  backend, frontend, NGINX y contenedores; brechas ASVS G-11, G-17, G-18, G-20, G-21, G-22 y,
  parcialmente, G-25 y G-26). Lo que depende del borde y de las imágenes está hecho en código y
  pendiente de verificar con el NGINX y el Docker reales (`nginx -t`, `curl`, construcción de imágenes;
  lista en `docs/deployment/environments.md`).
  - **Security — CSRF:** `POST /auth/refresh` y `POST /auth/logout` exigen
    `X-Requested-With: XMLHttpRequest`; si falta, `403 CSRF_HEADER_REQUIRED` sin efectos. El cliente
    HTTP del frontend la envía en todas las peticiones a la API.
  - **Security — cookie:** la cookie de refresco lleva el prefijo `__Secure-` fuera de desarrollo
    (no `__Host-`, porque la cookie mantiene `Path=/api/v1/auth`).
  - **Security — CSP con nonce por respuesta** en lugar de `style-src 'unsafe-inline'`, y
    `base-uri 'none'`: NGINX escribe el nonce en `index.html` (marcador `__CSP_NONCE__`, `sub_filter`,
    sin caché) y la caché de Emotion lo aplica (`frontend/src/theme/emotion-cache.ts`). El contenedor
    del frontend ya no emite CSP (ADR-011, addendum 2026-10-20).
  - **Security — borde:** `405` a métodos fuera de `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` y
    `OPTIONS` (el contenedor estático, solo `GET` y `HEAD`); `X-Forwarded-Proto` del cliente ya no se
    confía (solo desde un `geo $from_trusted_ingress`, vacío); en `/api/` se ocultan las cabeceras de
    helmet que ya pone NGINX (una de cada tipo); HSTS preparado por el `map` `$hsts_header`, apagado
    en Docker y QA.
  - **Security — build:** sin mapas de código fuente en producción (`FRONTEND_BUILD_SOURCEMAP=hidden`
    opcional para monitorización) y `404` a `*.map`; Dockerfiles sin respaldo sin lockfile e imágenes
    base fijadas por digest.
  - **Observabilidad:** evento `rate_limited` (`warn`) en cada `429`, con `correlationId`, `method`,
    plantilla de ruta, `clientIp` y `principalId` en el límite por usuario (ADR-016, addendum
    2026-10-20).
- **SSO con Microsoft Entra ID** ([ADR-027](docs/adr/ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md),
  `AUTHENTICATION.md` §4; backend y frontend). Solo probado con tokens y MSAL simulados: la primera
  prueba real contra un tenant se hará en QA.
  - **Alta al primer ingreso, sin permisos:** con `AUTH_PROVIDER=entra`, un token válido con un `oid`
    sin vínculo crea el usuario sin roles, equipos ni país (el administrador del CRM le asigna el
    acceso, ADR-020), de forma idempotente y a prueba de peticiones simultáneas. Solo si el correo
    pertenece a los dominios de `seguridad.sso_dominios_permitidos` (sembrado `somosgrupoag.com`) y
    el interruptor `seguridad.sso_alta_automatica` está encendido. Errores 403:
    `IDENTITY_NOT_LINKED`, `IDENTITY_INCOMPLETE`, `IDENTITY_DOMAIN_NOT_ALLOWED` y
    `SSO_PROVISIONING_DISABLED`. Auditoría `user.provisioned`.
  - **Vinculación solo por `oid`, nunca por correo:** un usuario local existente no entra hasta que se
    vincula. `load:data … entra-identities` vincula en lote desde una plantilla
    (`docs/templates/plantilla-vinculos-entra.{csv,xlsx}`); auditoría `user.identity_linked`.
  - **Corte directo, sin `hybrid`:** `pnpm --filter @app/backend run auth:revoke-local` revoca las
    credenciales y sesiones locales tras vincular a todos (simulación por defecto; `--confirm`;
    aborta si queda alguna cuenta sin vincular salvo `--allow-unlinked`). Las bajas son manuales.
  - **Token endurecido:** RS256, `ver 2.0`, `scp` obligatorio, `exp` obligatorio, `oid` GUID, y los
    opcionales `ENTRA_REQUIRED_SCOPE` y `ENTRA_ALLOWED_CLIENT_IDS` (`azp`), obligatorios con
    `NODE_ENV=production` y `AUTH_PROVIDER=entra`. Las variables `ENTRA_*` se validan al arrancar.
  - **Frontend:** adaptador `@azure/msal-browser` 4.30.0 (flujo de redirección con PKCE, sin
    ventanas emergentes ni iframes), ruta pública `/auth/callback`, estado «Acceso pendiente» para
    quien entra sin rol y «Usar otra cuenta». `GET /users?pendingAccess=true`, `pendingAccess` en la
    lista, el detalle y el alta, y chip «Pendientes de acceso» en Administración → Usuarios.
  - **Despliegue:** `connect-src` hacia `login.microsoftonline.com` en la política de seguridad de
    NGINX; `VITE_*` documentadas para el servidor de QA y nombre `miclienteag-qa.somosgrupoag.com`.
    Tras actualizar, ejecutar `prisma:seed` para el parámetro y los permisos nuevos.
- **Carga inicial de datos por scripts con plantilla** (`docs/implementation-plans/CARGA-INICIAL.md`;
  backend y documentación, sin cambios de esquema, endpoints, permisos ni dependencias): el
  administrador del sistema carga **proyectos**, **productos y familias** y **minutos de seguridad**
  con `pnpm --filter @app/backend run load:data -- <template|validate|apply> <proyectos|productos|…>`
  (`projects`, `products`, `safety-minutes`). `validate` no escribe nada y es lo que corre por
  omisión; `apply` exige `--actor` (administrador activo con el permiso de la entidad) y, en
  producción, `--confirm-production`. Usa los servicios de aplicación existentes (folios, unicidad,
  visibilidad y auditoría con el actor), valida fila a fila acumulando todos los errores con fila,
  columna y motivo (sin datos de las celdas), es idempotente («ya existe» se omite sin modificar),
  no aplica nada si hay errores de validación y genera un informe CSV; salida distinta de 0 con
  errores. Plantillas CSV y XLSX versionadas en `docs/templates/` (con README: orden de carga,
  pasos y errores) y sección «Carga inicial de datos» en `docs/deployment/qa-windows.md`. Los
  proyectos se enlazan al cliente por su **código CRM**. Módulo sin controladores
  `initial-data-load`; `ProjectsModule`, `ProductsModule` y `SafetyMinutesModule` exportan ahora
  `ProjectsService`, `ProjectClassificationService`, `ProductMastersService` y
  `SafetyMinutesService`; `readSheetRows` admite `exactSheet`; el saneamiento de celdas de la carga
  masiva de clientes acepta columnas ajenas (sin cambio de comportamiento). `validate` anticipa los
  obligatorios parametrizados de proyectos (`crm.campos_obligatorios`), distingue «ya existe» de un
  conflicto (`CODE_CONFLICT` bloquea; `EXISTS_DIFFERENT` avisa sin bloquear), tiene paridad con las
  validaciones de los DTO de alta y reporta aparte los proyectos creados sin clasificar
  (`CLASSIFICATION_FAILED`); `template` no sobrescribe sin `--force`.
- **Ajustes 1** (`docs/implementation-plans/AJUSTES-1.md`; backend y frontend):
  - **Dashboard personalizable por usuario**: cada usuario elige qué bloques e indicadores (K1-K9)
    de Inicio ve y en qué orden con «Personalizar panel»; «Restablecer» vuelve a la composición por
    defecto. Se guarda en la preferencia `ui.inicio.tarjetas` de `user_preferences`; la composición
    por defecto es el parámetro `ui.inicio.tarjetas` (grupo `interfaz`, editor `dashboard-cards`).
    Endpoints: `GET /me/ui-settings`, `GET /me/preferences`, `PUT`/`DELETE
    /me/preferences/dashboard-cards`. Código nuevo `422 INVALID_DASHBOARD_CARDS`.
  - **Minuto de seguridad**: un mensaje institucional por fecha, visible para toda sesión en un
    bloque de Inicio (`GET /me/safety-minute`, sin permiso) y con mantenimiento en
    «Administración → Minuto de seguridad» (`/safety-minutes*`). Tabla `safety_minutes`, migración
    `20261015100000_safety_minutes` con su rollback `.down.sql`, permisos `minuto_seguridad.ver`,
    `.crear`, `.editar` y `.eliminar`, opción de menú `admin-minuto-seguridad` y eventos de
    auditoría `safety_minute.created|updated|deleted`. Códigos nuevos `SAFETY_MINUTE_DUPLICATE`,
    `SAFETY_MINUTE_LOCKED` y `SAFETY_MINUTE_PAST_DATE`.
  - **Barra superior parametrizable**: los botones de buscar, pantalla completa y notificaciones se
    muestran u ocultan con `ui.barra_superior.buscar`, `.pantalla_completa` y `.notificaciones`
    (buscar y notificaciones sembrados en `false`: aún no tienen función). Se leen por
    `GET /me/ui-settings`, que no expone ningún otro parámetro.
  - **Tema por usuario**: el modo claro u oscuro sigue al usuario entre dispositivos
    (`PUT /me/preferences/theme`, preferencia `ui.tema`); `localStorage` queda como caché para el
    acceso y el arranque.
  - Parámetros `ui.*` y grupo «Interfaz» en la pantalla de Parámetros; `GET /parameters` añade el
    campo `editorOptions`.
  - Cambios visibles: el acceso muestra solo el nombre «Mi Cliente AG» (sin texto ni viñetas del
    panel de marca), el pie dice «© 2026 Grupo AG», Inicio se organiza en dos columnas desde `md` y
    muestra un marcador de carga mientras llega la configuración por primera vez.

### Changed
- **Endurecimiento para exposición a internet — cambios de contrato y de configuración**
  ([plan](docs/security/plan-exposicion-internet.md) §2, `docs/api/README.md` «Sistema y sesión»).
  **Backend y frontend deben desplegarse juntos.**
  - `POST /auth/logout` ya no es «siempre `204`»: sin `X-Requested-With: XMLHttpRequest` responde
    `403 CSRF_HEADER_REQUIRED` (igual que `POST /auth/refresh`). Con `AUTH_PROVIDER=entra` siguen en
    `404`.
  - `GET /api/v1/health` responde solo `{ status: "ok", timestamp }` y `GET /api/v1/ready`
    `{ status: "ready", timestamp }`: se quitaron `app` y el detalle de la base (`checks`). Si no está
    lista, `503 SERVICE_NOT_READY` con el formato de error único.
  - La cookie de refresco se llama `__Secure-refresh_token` cuando `NODE_ENV` no es `development`
    (`refresh_token` en desarrollo) y solo se lee el nombre vigente: **las sesiones locales vigentes
    se pierden una vez** al desplegar.
  - Con `NODE_ENV=production`, `CORS_ALLOWED_ORIGINS` solo admite orígenes `https://` exactos (sin
    `*`, ruta ni barra final) o vacío; si no, la API no arranca. En `docker-compose.yml` pasa a vacío
    por defecto (mismo origen).
  - Nueva variable `TRUST_PROXY_HOPS` (entero ≥ 0, por defecto `1`; `2` con WAF o Front Door delante
    de NGINX; nunca más que los saltos reales), en `.env.example`, `docker-compose.yml` y
    `infrastructure/qa-windows/env.qa.example`.
- **CRM — integración del Módulo 5 (Reportes) con los Módulos 1 (Inicio) y 6 (Integraciones)**
  (`05-reportes.md`, P-05.36; sin cambios de contrato, esquema, permisos ni dependencias):
  - Un solo `commercial-metrics`: base del Módulo 1 (KPI-01…KPI-10 con su firma y
    comportamiento) más las agregaciones de Reportes; un solo puerto y un solo adaptador, que usa
    `forecastLineVisibilitySql` de Proyectos; `metric-definitions.ts` con las definiciones de los
    Módulos 1, 3 y 5. `StageCount` de Reportes pasa a `ReportStageCount`; DEF-E con la firma de 01.
  - Un solo `common/xlsx.ts` (lectura y escritura de texto de la carga masiva, escritor tipado en
    *streaming* de la exportación) y una sola versión de `exceljs` (4.4.0, addendum de ADR-022).
  - `commercial-metrics-consistency.e2e.spec.ts` (PF-05.30/31) compara con los reportes también
    las tarjetas de Inicio por HTTP (`/dashboard/indicators/*`).
  - TESTING.md «Todas las suites E2E en un mismo stack»: diez suites en cinco tandas.
- E2E PF-03.116 (`projects.e2e.spec.ts`): «sin `forecast.ver`» comprueba que no hay enlace a
  `/proyectos/forecast` ni otro «Forecast» que no sea Reportes › Forecast, que desde el Módulo 5
  aparece con `reportes.ver` (05 H.3, D-05.11).
- Frontend (aditivo): `httpClient.download` devuelve las cabeceras de la respuesta y `ApiError`
  expone `retryAfterSeconds` (`Retry-After`). El barril `commercial-activity/entry-points` exporta
  los formatos de fecha del Módulo 4 (e `isValidTimeZone`) para Reportes; las zonas horarias de
  Reportes salen ya de `GET /reports/filter-options` (`useReportTimeZones`). `ChartPanel` acepta
  `summary`, `ReportFilterBar` acepta `maxMonths`/`defaultNote` en el período y nombra cliente y
  proyecto tras recargar con su ficha (P-05.28); `customers` exporta `useCustomer`. Vitest
  procesa `@mui/x-charts` con `server.deps.inline`. Se elimina `ReportsPendingPage`.
- **Ajustes 1 — cambios de contrato** (`docs/api/README.md`, «Endpoints — Ajustes 1»; solo aditivos):
  - `GET /parameters` devuelve en cada parámetro el campo nuevo `editorOptions`
    (`Record<string, string[]> | null`); los clientes que lo ignoran no se ven afectados.
  - Nuevos parámetros `ui.*` en la semilla (no pisa valores ya editados) y nuevo permiso
    `minuto_seguridad.*`; ningún permiso existente cambia.
  - `ExchangeRatesQueryDto`: `IsNotBeforeFrom` pasa a `common/dto/not-before-from.validator.ts`
    para compartirlo con el minuto de seguridad (sin cambio de comportamiento).
- **CRM Módulo 7 — cambios de contrato** (`docs/api/README.md`, "Módulo 7 · Administración"):
  - `GET /product-families` y `GET /units-of-measure` devuelven `{ data, pagination }` (antes
    `{ data }`), con `pageSize` 100 por defecto, `isActive` = `true` (defecto) | `false` | `all`,
    `search` y `sortBy`/`sortOrder`. Compatible para quien lee `data` (Módulo 3).
    `GET /units-of-measure` acepta `productos.ver` **o** `proyectos.ver` (`@RequireAnyPermission`).
  - `GET /products` admite `isActive=false|all` y `sortBy` `createdAt`/`updatedAt` (antes solo `sku`).
  - El evento `audit_log.exported` guarda `layout` (`events` | `fields`) en su metadato.
  - Equipos (RN-07.45): reemplazar miembros, fijar o cambiar `managerId`/`parentId` y eliminar un
    equipo con miembros o subequipos exigen ser administrador (`403 ADMIN_ONLY`); al
    administrador, borrar con miembros sigue dando `409 HAS_CHILDREN`.
  - Equipos (D1, decisión del responsable 2026-10-14): cambiar `isActive` de un equipo **con
    miembros o subequipos** también es exclusivo del administrador (`403 ADMIN_ONLY`); un equipo
    vacío lo activa o desactiva cualquiera con `equipos.editar`.
  - Parámetros (D2, decisión del responsable 2026-10-14): `auditoria.dias_retencion` pasa a ser
    estructural y exige además `parametros.configurar` (RN-07.32).
- Pruebas de integración: `exclusiveParameters` (candado consultivo por esquema) hace mutuamente
  excluyentes `customers.e2e` y `customer-imports.e2e`, que cambian los mismos parámetros globales.
- Semilla demo: la carga `DEMO-IMP-0001` guarda `raw_data` e incidencias con la forma real de la
  importación (13 columnas, códigos y campos de 06 F.3).
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
- **CRM Módulo 5 — revisión E5 de Reportes** (`05-reportes.md`, P-05.35): la exportación XLSX
  ya no puede responder un error JSON con las cabeceras del archivo (`Content-Type` XLSX y
  `Content-Disposition: attachment`) cuando falla con el libro empezado pero antes de enviar
  cabeceras: el archivo se escribe en un flujo intermedio que se desconecta, se retiran sus
  cabeceras y el error llega con el formato estándar (`report-download.spec.ts`). La hoja
  "Filtros" muestra los enumerados en español (RN-05.48) y nunca el nombre de un id que no esté
  entre las opciones autorizadas (prueba unitaria e integración).
- **Arranque del backend compilado**: `start`, `start:prod` y el `CMD` de la imagen ejecutaban
  `dist/main.js`, que no existe (el build genera `dist/src/main.js`); el contenedor no arrancaba.
- **Imágenes Docker**: Node 22.12 → 22.20. El corepack de 22.12 tiene claves de firma de npm
  caducadas y no podía descargar pnpm (`Cannot find matching keyid`): ninguna imagen se construía.
- **Imagen del backend**: copiaba `backend/node_modules`, que en el workspace son enlaces al
  almacén de la raíz, y el contenedor fallaba con `Cannot find module`. Ahora `pnpm deploy --prod`
  genera un `node_modules` autocontenido con el cliente de Prisma regenerado.
- **NGINX**: `POST /api/v1/customer-imports` (carga masiva) admite 11 MB como los adjuntos (10 MiB
  más el multipart); antes NGINX cortaba en 10 MB. `/api/` vuelve a incluir las cabeceras de
  seguridad, que su `add_header Cache-Control` anulaba.
- Clientes (Módulo 2): en modo `BY_NATURAL_KEY` sin responsable, el actor por defecto se buscaba
  como clave natural y la fila quedaba `INVALID_SALES_OWNER`; ahora se busca por id.
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
- **CRM Módulo 5 — Reportes, completado** (F-34…F-41, `matriz-trazabilidad.md`): backend,
  frontend, E2E y revisión E5 en verde. `commercial-metrics` (creado aquí con los nombres de la
  spec 01) quedó unificado con el del Módulo 1 al integrar `main` (ver «Changed»). Pendiente: deuda previa de `pnpm audit` (avisos de vite, vitest, jest y prisma, no
  aportados por `exceljs` ni `@mui/x-charts`); chip de producto «Seleccionado» tras recargar
  (requiere `GET /products/:id` del Módulo 3).
- **CRM Módulo 5 — E2E de Reportes** (`05-reportes.md`, P-05.33, P-05.34):
  `frontend/tests/e2e/crm-reports.e2e.spec.ts` con PF-05.39 (manager: reporte de oportunidades
  filtrado con su resumen y exportación `.xlsx` abierta con `exceljs`; dashboard con filtro de
  asesor, «Ver como tabla» y etapa → reporte filtrado; embudo desde el menú) y PF-05.40 (asesor:
  menú de Reportes sin «Exportar a Excel», visibilidad por alcance y siete pantallas a 400 px sin
  scroll horizontal). `e2e-stack.ts activate` imprime `E2E_REPORT_TEAM_PROJECT_CODE`; TESTING.md
  «E2E de Reportes» (cuarta tanda). F-34…F-41 pasan a `completada`.
- **CRM Módulo 5 — frontend de los reportes, la exportación, el dashboard y el embudo** (`05-reportes.md`, P-05.19–P-05.32):
  pantallas `/reportes/proyectos`, `/reportes/oportunidades`, `/reportes/forecast`,
  `/reportes/visitas` y `/reportes/actividades` (F-34…F-38) con filtros, período, orden y página
  en la URL, tarjetas de resumen que filtran la tabla, tabla → tarjetas en móvil, enlaces a la
  ficha de origen según permiso, importes en USD con la referencia local "referencial" y botón
  "Exportar a Excel" (F-39, solo con `reportes.exportar`; mensajes de `EXPORT_TOO_LARGE`, `429` y
  `REPORT_TIMEOUT` con referencia). Piezas comunes reutilizables en `features/crm/reports/common`
  (`useReportQueryState`, `ReportFilterBar`, `SummaryCards`, `ExportButton`, `ChartPanel`,
  `ReportTable`, `ReportPage`, `SourceLink`).
  - **Dashboard comercial** `/reportes/dashboard` (F-40): siete paneles (proyectos activos por
    fase, oportunidades por etapa, ganadas vs. perdidas, forecast por mes con acumulado,
    distribución por asesor, actividades y visitas, tendencias como múltiplos pequeños) con
    filtros de período (máximo 24 meses de calendario; sin período, el que aplica el servidor),
    país y asesor en la URL; cada panel con "Ver como tabla", estados propios y clic en la barra
    hacia el reporte filtrado.
  - **Embudo comercial** `/reportes/embudo` (F-41): barras horizontales por etapa con cantidad y
    % de participación, tabla con conversión acumulada, porcentajes no calculables como "—" con
    su motivo (`NO_DATA`, `INSUFFICIENT_HISTORY`, `INSUFFICIENT_SAMPLE`), filtros de etapa,
    cliente, tipo de cliente, asesor, país y período; clic en una etapa → reporte de
    oportunidades filtrado.
  - Gráficas con **`@mui/x-charts` 8.29.3** (Community, ADR-023 addendum), cargadas en un *chunk*
    diferido desde `reports/charts/LazyCharts` (también la distribución por etapa de F-35);
    tokens `chartColors`/`chartLayout` (DESIGN-SYSTEM §3 "Gráficas"); prueba de arquitectura
    PF-05.47. `features/crm/reports/README.md` con las convenciones del área.
  - Backend (aditivo): `GET /reports/filter-options` publica `businessTimeZone` y `timeZone`
    (perfil del usuario) (P-05.27).
- **CRM Módulo 7 — Administración, backend** (F-43…F-47, `07-administracion.md`, `docs/api/README.md`):
  - Usuarios: `employeeCode` (único, recortado y en mayúsculas) y `country` en lista, detalle,
    alta, edición, búsqueda, filtro `countryId` y exportación (columnas Código de colaborador y
    País). `countryId` y `teamIds` solo los fija un administrador (`403 ADMIN_ONLY`, addendum de
    ADR-020); un rol comercial exige código y país (`422 CRM_PROFILE_INCOMPLETE`, D-07.3).
    `userAuditView` añade `employeeCode`, `countryId` y `countryIsoCode` al antes/después.
  - `PUT /users/{id}/teams` (módulo `teams`, `equipos.editar` + administrador): reemplaza los
    equipos del usuario y audita `team.members_replaced` y `user.teams_replaced`.
  - Maestros comerciales en el módulo `products`: alta, detalle y edición (sin borrado) de
    familias, productos, unidades y reglas de conversión, con `productos.ver` /
    `productos.configurar`, auditoría `crm.<recurso>.created/updated` y códigos
    `UNIT_DIMENSION_LOCKED`, `CONVERSION_RULE_PROTECTED` (`reason` `identity_factor` |
    `tonnage_identity` | `tonnage_unit`), `INVALID_CONVERSION_TARGET` e `INVALID_CONVERSION_SCOPE`.
  - Tipos de cambio en el módulo `exchange-rates` (ADR-024): `GET/POST /exchange-rates`,
    `PATCH /exchange-rates/{id}` (solo tasa, fuente y notas) y `GET /currencies` (`{ data }`), con
    `parametros.ver` / `parametros.configurar`; `409 EXCHANGE_RATE_DUPLICATE`,
    `422 INVALID_EXCHANGE_RATE`; auditoría `crm.exchange_rate.created/updated`.
  - `GET /parameters/authentication` (`parametros.ver`): proveedor vigente de `AUTH_PROVIDER`,
    solo lectura y sin secretos (D-07.8).
  - Auditoría: filtro `field` en `GET /audit-logs` y en la exportación; `layout=events|fields`
    en `GET /audit-logs/export` (una fila por campo cambiado; el tope sigue contando eventos).
  - Inmutabilidad de `audit_logs` en la base (ADR-025): migración
    `20261014100000_audit_logs_append_only` con la función `audit_logs_append_only()` y los
    disparadores `trg_audit_logs_no_update`, `trg_audit_logs_no_truncate` y
    `trg_audit_logs_delete_after_retention` (SQLSTATE `AU001`; retención de
    `auditoria.dias_retencion`, 365 si falta, es ilegible o < 30). Script inverso en
    `backend/prisma/rollbacks/`. Recomendación de roles en `docs/deployment/environments.md`.
  - Rutas `/administracion/tipos-cambio`, `/administracion/productos` y
    `/administracion/conversiones` en `app-routes.registry.json`: sus opciones de menú sembradas
    (`admin-tipos-cambio`, `admin-productos`, `admin-conversiones`) ya se crean.
  - Revisión: D1 (`isActive` de un equipo con miembros o subequipos, solo administrador) y D2
    (`auditoria.dias_retencion` exige `parametros.configurar`), ver "Changed"; las
    exportaciones CSV entrecomillan también los valores con `;` o tabulador (además de `,`,
    comillas y saltos de línea); la carga masiva normaliza el `employeeCode` (recortado y en
    mayúsculas) igual que el alta y la edición de usuarios.
- **CRM Módulo 7 — Administración, frontend** (`07-administracion.md`,
  `frontend/src/features/admin/README.md`):
  - Pantallas `/administracion/tipos-cambio` (tasas con alta y corrección de tasa, fuente y
    notas; monedas en solo lectura),
    `/administracion/productos` (familias, productos y unidades) y `/administracion/conversiones`
    (reglas de conversión a tonelaje por ámbito). Los formularios de maestros validan con los
    mismos patrones que el backend (`master-data-rules.ts`: códigos y SKU que empiezan por letra
    o dígito y se pasan a mayúsculas, orden 0–100000).
  - Usuarios: código de colaborador y país en lista, ficha, formularios, filtro y exportación;
    panel «Equipos» en la ficha del usuario (`PUT /users/{id}/teams`, solo administrador). La
    lista de países sale de `GET /customers/form-options` (exige `clientes.ver`).
  - Parámetros: editores específicos de los parámetros estructurados (campos obligatorios,
    reglas de duplicidad, valores por defecto, prioridades de alertas, reglas de avance,
    transiciones de etapa, tipos de adjunto) y bloque de solo lectura «Autenticación» con el
    proveedor vigente (`GET /parameters/authentication`). Catálogos: formulario de semántica
    (`metadata`) generado desde `metadataSchema`.
  - Auditoría: vista «por campo» (una fila por campo cambiado), filtro por campo y exportación con
    `layout=fields`.
  - Equipos: miembros, responsable, equipo padre, eliminar con miembros o subequipos y (D1)
    activar o desactivar un equipo con miembros o subequipos solo para el administrador; al resto
    se le muestran deshabilitados con la explicación.
  - Etiquetas de estado de usuario: `SUSPENDED` → «Inactivo», `LOCKED` → «Bloqueado
    temporalmente».
- **QA en Windows Server** (ADR-026, `docs/deployment/qa-windows.md`): backend como servicio de
  Windows, NGINX for Windows con HTTPS sirviendo el frontend y la API, PostgreSQL 18 local.
  `infrastructure/qa-windows/`: `nginx.conf`, `env.qa.example` (sin valores reales),
  `actualizar.ps1` (pull, build, migrate deploy, semilla, reinicio y comprobación) y `respaldo.ps1`
  (base y adjuntos con retención).
- **CRM Módulo 6 — Carga masiva de clientes (F-42)** (`06-integraciones.md`):
  - API `/customer-imports` (configuración, plantilla CSV/XLSX, subida y validación, historial,
    detalle, filas, confirmación `202` en segundo plano, cancelación y archivo de errores), con
    `importaciones.ver` / `importaciones.crear` (+ `clientes.crear` para subir y confirmar) y
    tras el parámetro `crm.importaciones.habilitada` (`409 IMPORTS_DISABLED`).
  - Lectura segura: tipo real por firma (`415 UNSUPPORTED_FILE_TYPE`), guardia ZIP propia
    (entradas, tamaños reales descomprimidos, razón de compresión, rutas, macros, DTD), lector CSV
    propio (`common/csv-reader.ts`, UTF-8 estricto, `,`/`;`) y envoltorio `common/xlsx.ts` sobre
    **`exceljs` 4.4.0** (nueva dependencia, ADR-022 y su addendum).
  - Validación fila a fila con las reglas del Módulo 2, duplicados en el archivo y contra
    existentes, avisos de NIT (`DUPLICATE_TAX_ID`) y una transacción por fila al importar.
  - Pantallas `/integraciones/clientes` (historial, nueva carga) y `/integraciones/clientes/:importId`
    (vista previa, confirmación, progreso y resultado); opción de menú `integraciones-clientes`.
  - Script de purga de retención `pnpm --filter @app/backend run imports:purge-rows` (D-06.12).
  - `413`/`415` en el filtro global (`UnsupportedMediaTypeError`).
- Módulo 2 (aditivo, para la importación): `duplicateKeys` devuelve `legalName` y acepta el
  contexto de `prepare()`; `CustomerReferenceCache` para validar lotes; `withinTransaction` y
  `auditMetadata` en `CustomerCreationService.create`; `CustomersService` exportado.
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