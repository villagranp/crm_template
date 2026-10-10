# 01 — Módulo 1: Inicio / Dashboard operativo

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §3 (3.1–3.4), con §1, §2, §7 (fórmulas compartidas), §10–§13
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md) (entidades, catálogos, `DataScope`, permisos, parámetros y decisiones `DM-n`)
- **Funcionalidades:** F-01 Dashboard general · F-02 Indicadores clave · F-03 Resumen de actividad · F-04 Alertas y pendientes ([matriz](matriz-trazabilidad.md))
- **Decisiones que lo enmarcan:** [ADR-004](../../adr/ADR-004-data-access-abstraction.md), [ADR-005](../../adr/ADR-005-rest-api-standard.md), [ADR-008](../../adr/ADR-008-authorization.md), [ADR-017](../../adr/ADR-017-design-system-grupo-ag.md), [ADR-018](../../adr/ADR-018-identity-access-model.md), [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)
- **Orden de implementación:** 5.º (después de Fase 0, Clientes, Proyectos y Actividad comercial; antes de Reportes)
- **Estado:** especificación. **No se ha tocado código, esquema, migraciones ni seeds.**
- **Skills aplicados:** `requirements-analysis`, `user-story`, `api-design`, `authorization`, `access-management`, `database`, `frontend-react`, `design-system`, `security`, `testing`, `documentation`

> Inicio es un **módulo de lectura**. No es dueño de ningún registro comercial
> (ALCANCE §3, "no debe convertirse en propietario"), **no crea tablas** y no
> escribe en la base. Calcula sus indicadores y alertas sobre las tablas del
> contrato 00 en el momento de cada consulta, y define las **fórmulas
> compartidas** de indicadores que el Módulo 5 (Reportes) está obligado a reutilizar.

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
- [Decisiones pendientes del módulo](#decisiones-pendientes-del-módulo)
- [Filas para la matriz](#filas-para-la-matriz)

---

## A. Objetivo funcional

Dar a cada usuario, nada más autenticarse, una vista **operativa** de su trabajo
comercial dentro de su ámbito de visibilidad:

1. **Quién soy y a qué tengo acceso** (F-01): identidad, rol, fecha y hora,
   navegación del CRM y accesos rápidos calculados en el servidor.
2. **Cómo va mi operación** (F-02): nueve indicadores calculados con registros
   reales, cada uno enlazado al listado de origen con el filtro aplicado.
3. **Qué ha pasado y qué viene** (F-03): actividad reciente y próximas visitas.
4. **Qué requiere mi atención** (F-04): bandeja de alertas calculadas con reglas
   parametrizables.

### Responsabilidades

| Es responsable de | No es responsable de |
|---|---|
| Componer la pantalla `/` (Panel de control) | Crear, editar o borrar clientes, proyectos, oportunidades, forecast, visitas o actividades |
| Definir y publicar las **fórmulas de indicadores comerciales** (servicio compartido `CommercialMetricsService`) | El tablero analítico, tendencias, embudo y exportación (Módulo 5, §7.7–7.8) |
| Calcular las cuatro alertas de §3.4 a partir de `crm.alertas.*` | Persistir alertas, notificarlas por correo o descartarlas (DM-26, DM-27) |
| Componer la actividad reciente a partir de la vista `crm_interactions_v` y de los historiales | El historial completo de interacciones (Módulo 4, §6.4) |
| Filtrar todo por permiso y por `DataScope` en el backend | Asignar permisos, roles o ámbitos (Administración, ADR-020) |

### Diferencia con el Dashboard comercial de Reportes (§7.7)

| | Inicio (este módulo) | Dashboard comercial (Módulo 5) |
|---|---|---|
| Propósito | Operativo: "hoy, lo mío y lo que vence" | Analítico: distribución, tendencias, comparativas |
| Período | Fijo y corto (mes en curso, ventana M+6, horas/días de alertas) | Filtrable por período, país y asesor |
| Visualización | Tarjetas, listas y bandeja | Gráficas |
| Fórmulas | **Las mismas** (servicio compartido, RN-01.10) | **Las mismas** |

---

## B. Alcance completo

Todo lo que pide ALCANCE §3, sin omisiones. La columna *Dónde* remite a la
sección de esta especificación que lo desarrolla.

### B.1 Dashboard general (§3.1, F-01)

| Elemento del alcance | Cómo se cubre | Dónde |
|---|---|---|
| Usuario autenticado | Sesión de `useAuth` + perfil `GET /me` | E.2 Hero |
| Nombre del usuario | `displayName` de `/me` (saludo con nombre de pila y nombre completo en el bloque de perfil) | E.2 |
| Rol | `roles` de `/me`, como chips | E.2 |
| Fecha y hora | Reloj en vivo (se refresca cada minuto) | E.2, RN-01.3 |
| Navegación general del CRM | Shell existente (sidebar y barra inferior) alimentado por `GET /me/menu` (ADR-018) | E.1 |
| Accesos rápidos a funcionalidades frecuentes | Bloque "Accesos rápidos" derivado de `/me/menu` (D-01.12) | E.6 |
| Accesos disponibles según permisos | Bloque "Todos mis accesos" agrupado por módulo, de `/me/menu` | E.6 |
| Adaptar contenido a perfil y ámbito | Cada tarjeta/panel se muestra solo con el permiso de su fuente; cifras filtradas por `DataScope` | RN-01.4, H |
| Acceder a registros y funcionalidades permitidos | Enlaces de tarjetas, alertas y eventos a sus pantallas | E.3–E.5 |
| Accesos rápidos navegan a la pantalla | `RouterLink` a `option.path` | E.6 |
| No mostrar accesos no autorizados | El menú lo calcula el servidor; las tarjetas sin permiso no se pintan ni se consultan | RN-01.2, RN-01.4 |
| Lo que hoy ya muestra `HomePage` (roles, permisos efectivos, alcance, equipos, nº de opciones y módulos, aviso de servidor no disponible) | **Se conserva** en el bloque "Mi acceso" y en el Hero | E.2 |

### B.2 Indicadores clave (§3.2, F-02)

| Tarjeta | Indicador | Definición | Navega a |
|---|---|---|---|
| K1 | Proyectos activos | KPI-01 (D.4) | Listado de proyectos, filtro "activos" |
| K2 | Oportunidades abiertas | KPI-02 | Listado de oportunidades, filtro "abiertas" |
| K3 | Oportunidades ganadas | KPI-03 | Listado de oportunidades, resultado ganado/parcial + período |
| K4 | Oportunidades perdidas | KPI-04 | Listado de oportunidades, resultado perdido + período |
| K5 | Forecast próximos seis meses | KPI-05 | Matriz de forecast, ventana M+1…M+6 |
| K6 | Visitas pendientes y próximas | KPI-06 / KPI-07 | Listado de visitas, filtro pendientes / próximas |
| K7 | Actividades pendientes | KPI-08 | Bandeja de pendientes, filtro "pendientes" |
| K8 | Actividades vencidas | KPI-09 | Bandeja de pendientes, filtro "vencidas" |
| K9 | Metas comerciales y cumplimiento | KPI-10 (DM-9) | Sin destino propio (no hay pantalla de metas) |

Además: cálculo con registros reales (RN-01.9), visibilidad del usuario
(RN-01.4), consistencia con Reportes (RN-01.10), nada inventado (RN-01.11).

### B.3 Resumen de actividad (§3.3, F-03)

| Elemento | Fuente | Dónde |
|---|---|---|
| Actividades comerciales recientes | `activities` (alta y completado) | D.5, E.4 |
| Próximas visitas | `visits` pendientes con fecha futura | D.5, E.4 |
| Últimas interacciones con clientes | Vista `crm_interactions_v` (criterio DM-22) | D.5 |
| Oportunidades recientemente modificadas | `opportunity_stage_history`, `opportunity_result_history`, `opportunities.updated_at` | D.5 |
| Actualizaciones relevantes de proyectos | `projects.created_at`, `project_phase_history` | D.5 |
| Fecha, tipo, responsable, cliente/proyecto y resumen | `RecentActivityItemDto` | F.3 |
| Orden cronológico | RN-01.20 | |
| Navegar al registro de origen, sujeto a permisos | `source` + resolución de ruta en el frontend | RN-01.22 |

### B.4 Alertas y pendientes (§3.4, F-04)

| Alerta | Código | Definición |
|---|---|---|
| Actividades vencidas | `ACTIVIDAD_VENCIDA` | AL-1 (D.6) |
| Visitas realizadas pendientes de confirmación | `VISITA_SIN_CONFIRMAR` | AL-2 |
| Proyectos sin actualizaciones en el período | `PROYECTO_SIN_ACTUALIZAR` | AL-3 |
| Oportunidades abiertas sin siguiente acción | `OPORTUNIDAD_SIN_SIGUIENTE_ACCION` | AL-4 |

Cada alerta incluye tipo, descripción, prioridad, responsable, fecha de
referencia, registro relacionado y acceso al origen (F.4). Reglas, umbrales y
prioridades salen de parámetros (RN-01.26); sin duplicados (RN-01.28); se
actualizan cuando cambia el origen (RN-01.29).

### B.5 Fuera de alcance del módulo (explícito)

- Mantenimiento de metas comerciales (no lo pide el alcance; DM-9).
- Marcar alertas como vistas o descartarlas (DM-26: sin descarte; se añadiría `alert_acknowledgements`).
- Envío de notificaciones o correos por alertas o recordatorios (DM-27).
- Gráficas, tendencias, filtros por país/asesor y exportación (Módulo 5).
- Edición de cualquier registro desde el panel.

---

## C. Reglas de negocio

### C.1 Generales y de presentación (F-01)

| ID | Regla |
|---|---|
| RN-01.1 | El panel es la ruta `/` del shell y la opción de menú `inicio` (pública, `isPublic = true`, ya sembrada). Cualquier sesión válida puede abrirlo; lo que ve dentro depende de sus permisos. |
| RN-01.2 | La navegación y los accesos salen **solo** de `GET /me/menu` (ADR-018, CLAUDE.md §8.11). El frontend no declara opciones propias. Se excluye la opción cuyo `path` es `/` (el propio panel). |
| RN-01.3 | La fecha y hora se muestran en la zona horaria y el idioma del navegador, con formato largo en español, y se refrescan cada 60 s. El saludo (buenos días / tardes / noches) sigue la hora local, como hoy. |
| RN-01.4 | Cada tarjeta, panel o tipo de evento/alerta exige el permiso `.ver` de su **entidad de origen** (tabla H.1). Sin ese permiso el bloque **no se pinta y no se consulta** (no se muestran ceros ni errores 403). El backend vuelve a exigir el permiso; ocultar es experiencia de usuario, no seguridad. |
| RN-01.5 | Todas las cifras, eventos y alertas se restringen al `DataScope` efectivo del usuario (el más amplio entre sus roles, `/me`) con las columnas y herencias de 00 §4.2 (DM-13). Un registro fuera del ámbito nunca se cuenta ni se lista. |
| RN-01.6 | La información de perfil que hoy muestra `HomePage` (roles, nº de permisos efectivos, alcance de datos, equipos, nº de opciones y módulos) se conserva. La etiqueta del alcance `COUNTRY` es "País" (DM-10). |
| RN-01.7 | Si el usuario no tiene ningún permiso de fuente comercial, el panel muestra Hero, "Mi acceso" y accesos, más el aviso "Todavía no tienes indicadores comerciales asignados", sin hacer peticiones a `/dashboard/*`. |
| RN-01.8 | El fallo de un bloque no afecta a los demás: cada tarjeta y panel tiene su propia carga, error con reintento y `correlationId`. |

### C.2 Indicadores (F-02)

| ID | Regla |
|---|---|
| RN-01.9 | Los indicadores se calculan **en cada consulta** sobre las tablas del contrato 00. No se almacenan ni se cachean en el servidor (P4 de 00). Cada respuesta incluye `generatedAt`. |
| RN-01.10 | **Fórmulas compartidas.** Las definiciones KPI-01…KPI-10 (D.4) se implementan **una sola vez** en `CommercialMetricsService` (módulo `commercial-metrics`, D-01.2). El Módulo 5 debe consumir ese servicio (o sus predicados exportados) para los conteos equivalentes de §7.1, §7.2, §7.4, §7.5 y §7.7; no puede reimplementarlas. Un cambio de fórmula se hace en ese servicio y afecta a ambos módulos a la vez. |
| RN-01.11 | No se inventan valores. Un conteo sin registros es `0` (es un dato real). Un valor **no calculable** se devuelve `null` y se muestra con texto explicativo: forecast sin líneas en la ventana → "Sin proyección"; meta con objetivo 0 → cumplimiento "No calculable"; sin metas → "Sin metas configuradas". |
| RN-01.12 | **Semántica por catálogo, nunca por etiqueta ni UUID** (00 §3.3): "abierta/cerrada" = `metadata.isClosed` de `crm.etapa_oportunidad`; "proyecto activo" = `metadata.isFinal = false` de `crm.fase_cliente`; "pendiente/realizada/confirmada/cancelada" de visita = `isPending/isDone/isConfirmed/isCancelled` de `crm.estado_visita`; "abierta/completada" de actividad = `isOpen/isCompleted` de `crm.estado_actividad`. |
| RN-01.13 | **Registro vigente** (parte de la definición compartida, D-01.13): un registro entra en indicadores, alertas y actividad reciente si no está eliminado lógicamente (`deletedAt IS NULL`, donde exista) **y** su proyecto y su cliente padres tampoco lo están. |
| RN-01.14 | **Ganadas** = resultado `WON` + `PARTIAL`, con desglose de parciales; **perdidas** = `LOST` (DM-15). Se atribuyen al período por `opportunity_results.decision_date`. Se cuentan sobre `opportunities` (una fila por oportunidad), nunca sobre el `JOIN` con productos (00 §2.7). |
| RN-01.15 | El período de ganadas/perdidas es por defecto el **mes en curso** de la zona `crm.zona_horaria_negocio`; el usuario puede elegir mes, trimestre o año en curso (D-01.3). El rango máximo admitido por la API es 366 días. |
| RN-01.16 | **Forecast:** la ventana es M+1…M+H, con M = mes actual en `crm.zona_horaria_negocio` y H = `crm.forecast.horizonte_meses` (6). Solo se suma `tonnage` (expresado en `crm.forecast.unidad_tonelaje`); las cantidades se informan agrupadas por unidad y **nunca se suman entre unidades** (00 §2.3). Las líneas con cantidad > 0 y sin conversión se cuentan como "sin conversión" y no entran en el total. |
| RN-01.17 | **Actividades pendientes y vencidas son disjuntas** (D-01.6): pendiente = abierta y no vencida; vencida = abierta y `dueAt < ahora`. "Por vencer" es un subconjunto de pendientes con `dueAt` dentro de `crm.alertas.actividad_por_vencer_horas`. |
| RN-01.18 | **Metas** (DM-9): la tarjeta solo existe con `metas.ver`. Con permiso y sin metas aplicables al ámbito y período, muestra "Sin metas configuradas" y ningún número. Con metas, muestra objetivo, logrado y cumplimiento = logrado / objetivo × 100 (dos decimales; `null` si el objetivo es 0). El logrado usa las fórmulas KPI de D.4 (D-01.8). |
| RN-01.19 | Cada tarjeta navega al listado del módulo dueño con el filtro equivalente a su fórmula (tabla E.3). Si la ruta de destino aún no está registrada en el router (módulo no implementado) o el usuario no tiene su permiso, la tarjeta se muestra sin enlace y con la nota "Listado disponible cuando se habilite el módulo". |

### C.3 Resumen de actividad (F-03)

| ID | Regla |
|---|---|
| RN-01.20 | La actividad reciente se ordena por `occurredAt` **descendente** (lo más reciente primero); las próximas visitas, por `scheduledStartAt` **ascendente** (la más cercana primero) (D-01.9). |
| RN-01.21 | Cada evento muestra fecha y hora, tipo, responsable (nombre visible del usuario), cliente y/o proyecto relacionados (código y nombre) y un resumen de como máximo 200 caracteres. **Nunca** incluye nombres, correos ni teléfonos de contactos (PII, 00 §4.5). |
| RN-01.22 | Cada evento lleva su origen (`source.type`, `source.id`, `source.code`, y el proyecto padre cuando aplique) para navegar a su ficha. Solo se devuelven eventos cuyo origen el usuario puede ver (permiso + ámbito), así que todo enlace devuelto es navegable; si la ruta de la ficha aún no existe, el evento se muestra sin enlace. |
| RN-01.23 | **Sin duplicados:** una visita o actividad aparece una sola vez como interacción aunque se haya reprogramado o editado (la vista `crm_interactions_v` tiene una fila por registro). Un cambio de etapa y el registro de resultado hechos en la **misma operación** (00 §3.4) se muestran como un único evento "Oportunidad cerrada". `OPORTUNIDAD_ACTUALIZADA` solo se emite si `opportunities.updated_at` es posterior al último evento de historial de esa oportunidad. |
| RN-01.24 | Ventana de la actividad reciente: últimos 30 días por defecto (`sinceDays`, máximo 90), paginada (`pageSize` por defecto 20, máximo 50). Próximas visitas: las siguientes en los próximos `crm.inicio.visitas_proximas_dias` días (D-01.5), máximo 50. |
| RN-01.25 | En las próximas visitas se marca `reminderDue = true` cuando `ahora ≥ scheduledStartAt − reminderMinutesBefore` (aviso en Inicio, DM-27). No se envía ninguna notificación. |

### C.4 Alertas (F-04)

| ID | Regla |
|---|---|
| RN-01.26 | Las alertas **se calculan** en cada consulta (00 §2.13, DM-26); no hay tabla de alertas. Umbrales, habilitación y prioridad salen de `crm.alertas.*` (00 §8.2, DM-7) y se leen en cada petición, así que un cambio del parámetro surte efecto sin desplegar. |
| RN-01.27 | La prioridad de cada tipo es el código de `crm.prioridad` indicado en `crm.alertas.prioridades`; etiqueta y peso (`metadata.weight`) salen del catálogo. Orden por defecto de la bandeja: peso de prioridad descendente, luego fecha de referencia ascendente (lo más antiguo primero). |
| RN-01.28 | **Sin duplicados por construcción:** la identidad de una alerta es `tipo + id del registro de origen`; una condición produce como mucho una alerta. Un mismo registro puede tener alertas de **tipos distintos** solo si cumple condiciones distintas. |
| RN-01.29 | Las alertas reflejan el estado actual del origen: cuando la condición deja de cumplirse (actividad completada, visita confirmada, proyecto actualizado, siguiente acción definida, registro eliminado o fuera del ámbito), la alerta desaparece en la siguiente consulta. El frontend no cachea la bandeja más de 60 s y la vuelve a pedir al volver a la pantalla o al recuperar el foco. |
| RN-01.30 | Si un parámetro `crm.alertas.*` falta o no es válido, **ese tipo** se desactiva (aparece con `enabled = false` y `disabledReason = PARAMETER_INVALID` en el resumen), los demás siguen funcionando y se registra un `warn` estructurado con la clave (sin valores de negocio). Nunca se usa un umbral inventado. |
| RN-01.31 | Visibilidad: una alerta solo se muestra si el usuario tiene el permiso `.ver` de la entidad de origen y el registro está en su ámbito (RN-01.5). El "responsable" es el dueño del registro de origen (`owner_id`). El filtro "Asignadas a mí" restringe a `owner_id = yo`. |

Reglas concretas de cada alerta: D.6.

---

## D. Modelo de datos utilizado

### D.1 Entidades propias

**Ninguna.** El módulo no crea tablas, columnas, vistas, enums ni catálogos.
Tampoco escribe en `audit_logs` (no hay mutaciones).

### D.2 Entidades compartidas (solo lectura)

| Entidad (tabla) de 00 | Para qué la usa Inicio | Dueño |
|---|---|---|
| `User`, `Role`, `UserRole`, `TeamMember`, `Team` | Perfil, nombre del responsable, resolución del ámbito `TEAM` | Núcleo / Administración |
| `MenuOption`, `AppModule` | Menú y accesos (vía `GET /me/menu`, no consulta directa) | Núcleo / Administración |
| `Country` | Ámbito `COUNTRY` (`users.country_id`) | Fase 0 |
| `Customer` | Nombre del cliente relacionado; vigencia (RN-01.13); país de visitas y actividades | Clientes |
| `Project`, `ProjectPhaseHistory` | KPI-01, AL-3, eventos de proyecto, país de oportunidades y forecast | Proyectos |
| `Opportunity`, `OpportunityStageHistory`, `OpportunityResult`, `OpportunityResultHistory` | KPI-02…04, AL-4, eventos de oportunidad | Proyectos |
| `ForecastLine`, `UnitOfMeasure` | KPI-05 | Proyectos / Fase 0 |
| `Visit`, `VisitEvent` | KPI-06/07, AL-2, próximas visitas, interacciones | Actividad comercial |
| `Activity` | KPI-08/09, AL-1, eventos de actividad | Actividad comercial |
| Vista `crm_interactions_v` | Últimas interacciones (00 §2.12) | Actividad comercial (vista de Fase 0) |
| `SalesTarget` | KPI-10 (pendiente DM-9) | Fase 0 (sin pantalla) |
| `Catalog`, `CatalogItem` | Semántica de estados, etapas, fases y prioridades | Administración |
| `SystemParameter` | `crm.alertas.*`, `crm.forecast.*`, `crm.zona_horaria_negocio`, `crm.inicio.visitas_proximas_dias` | Administración |

`Contact`, `InteractionParticipant`, `Attachment`, `ProjectProduct`,
`CustomerImport*` **no** se leen (PII y fuera del propósito del panel).

### D.3 Claves, relaciones y catálogos utilizados

- Identificadores: UUID de cada entidad (contrato de API) más su código humano
  (`projects.code`, `opportunities.code`, `visits.code`, `activities.code`,
  `customers.crm_code`) para mostrar.
- Relaciones recorridas: `opportunities.project_id → projects.id`,
  `projects.customer_id → customers.id`, `forecast_lines.project_id`,
  `visits.customer_id / project_id`, `activities.customer_id / project_id / opportunity_id`,
  `*_history.*_id`, `owner_id → users.id`.

| Catálogo (`Catalog.key`) | Claves de `metadata` usadas |
|---|---|
| `crm.fase_cliente` | `isFinal` |
| `crm.etapa_oportunidad` | `isClosed`, `order` (desglose por etapa) |
| `crm.estado_visita` | `isPending`, `isDone`, `isConfirmed`, `isCancelled` |
| `crm.estado_actividad` | `isOpen`, `isCompleted`, `isCancelled` |
| `crm.tipo_actividad` | `isInteraction` (DM-22) |
| `crm.prioridad` | `weight` |
| `crm.resultado_oportunidad` | Etiquetas de `WON/LOST/PARTIAL` |

| Parámetro (`SystemParameter.key`) | Uso en Inicio |
|---|---|
| `crm.zona_horaria_negocio` | "Hoy", límites de mes, ventana de forecast |
| `crm.forecast.horizonte_meses`, `crm.forecast.unidad_tonelaje` | KPI-05 |
| `crm.alertas.actividad_por_vencer_horas` | "Por vencer" (KPI-08) |
| `crm.alertas.visita_sin_confirmar_horas` | AL-2 |
| `crm.alertas.proyecto_sin_actualizar_dias` | AL-3 |
| `crm.alertas.oportunidad_sin_siguiente_accion` | Habilita AL-4 |
| `crm.alertas.prioridades` | Prioridad de AL-1…AL-4 |
| `crm.inicio.visitas_proximas_dias` | KPI-07 y próximas visitas. **Nuevo, propuesto** (D-01.5): requiere añadirse a 00 §8.2 |

### D.4 Definiciones compartidas de indicadores (contrato con Reportes)

Notación: `ahora` = instante actual (UTC); `hoy`, `mes actual` = calendario en
`crm.zona_horaria_negocio`; `vigente(x)` = RN-01.13; `ámbito(x)` = filtro de 00 §4.2 para la entidad.

| ID | Indicador | Fórmula | Ámbito (00 §4.2) |
|---|---|---|---|
| KPI-01 | Proyectos activos | `COUNT(projects)` con `vigente` y fase con `isFinal = false` (DM-16) | `projects.owner_id` / `projects.country_id` |
| KPI-02 | Oportunidades abiertas | `COUNT(opportunities)` con `vigente` y etapa con `isClosed = false`. Desglose por etapa (orden `metadata.order`) | `opportunities.owner_id` / `projects.country_id` + herencia del proyecto visible |
| KPI-03 | Oportunidades ganadas (período P) | `COUNT(opportunities)` con `vigente`, resultado `outcome IN (WON, PARTIAL)` y `decision_date ∈ P`. Desglose `wonCount` (WON) y `partialCount` (PARTIAL) | Igual que KPI-02 |
| KPI-04 | Oportunidades perdidas (período P) | `COUNT(opportunities)` con `vigente`, resultado `outcome = LOST` y `decision_date ∈ P` | Igual que KPI-02 |
| KPI-05 | Forecast M+6 | `SUM(forecast_lines.tonnage)` con proyecto `vigente` y `(year, month)` ∈ ventana M+1…M+H; serie por mes; `unconvertedLines = COUNT(quantity > 0 AND tonnage IS NULL)`; `quantitiesByUnit = SUM(quantity) GROUP BY unit_id` | `forecast_lines.owner_id` / `projects.country_id` + herencia del proyecto |
| KPI-06 | Visitas pendientes | `COUNT(visits)` con cliente `vigente` y estado `isPending = true` (cualquier fecha). Subconteo `overdueCount` = pendientes con `scheduled_start_at < ahora` | `visits.owner_id` / `customers.country_id` + herencia del proyecto |
| KPI-07 | Visitas próximas | Pendientes con `scheduled_start_at ∈ [ahora, ahora + N días]`, N = `crm.inicio.visitas_proximas_dias` | Igual que KPI-06 |
| KPI-08 | Actividades pendientes | `COUNT(activities)` con `vigente`, estado `isOpen = true` y (`due_at IS NULL` o `due_at ≥ ahora`). Subconteo `dueSoonCount` = `due_at ∈ [ahora, ahora + crm.alertas.actividad_por_vencer_horas]` | `activities.owner_id` / `customers.country_id` + herencia del proyecto |
| KPI-09 | Actividades vencidas | `COUNT(activities)` con `vigente`, estado `isOpen = true` y `due_at < ahora` | Igual que KPI-08 |
| KPI-10 | Metas y cumplimiento | Por cada meta aplicable (D-01.8): objetivo `target_value`; logrado según `metric`: `WON_OPPORTUNITIES` = KPI-03 del período de la meta; `VISITS` = visitas con estado `isDone` o `isConfirmed` y `actual_start_at` en el período; `ACTIVITIES` = actividades `isCompleted` con `completed_at` en el período; `TONNAGE` = Σ `opportunities.estimated_tonnage` de las ganadas del período (WON × 1, PARTIAL × `awarded_percent`/100); `AMOUNT` = ídem con `estimated_amount` en la moneda de la meta. Cumplimiento = logrado / objetivo × 100 | Meta del sujeto que corresponde al ámbito (D-01.8) |

Definiciones auxiliares que también se publican en el servicio compartido y
que Reportes reutiliza:

| ID | Definición |
|---|---|
| DEF-A | Oportunidad **cerrada** = etapa con `isClosed = true`. Oportunidad **abierta** = no cerrada. |
| DEF-B | **Estado comercial del proyecto** (DM-16): etapa abierta de mayor `order` entre sus oportunidades vigentes; si no hay abiertas, "Ganado" si alguna tiene resultado WON/PARTIAL, si no "Perdido"; "Sin oportunidades" si no tiene. |
| DEF-C | **Última actualización del proyecto** = `projects.last_activity_at` (00 §2.6, DM-16). |
| DEF-D | Actividad **vencida** = abierta y `due_at < ahora`; **por vencer** = abierta y `due_at ∈ [ahora, ahora + horas]`. Nunca es un estado del catálogo (00 C8). |
| DEF-E | Visita **realizada sin confirmar** = estado `isDone = true` y `confirmed_at IS NULL`. |
| DEF-F | **Interacción** = fila de `crm_interactions_v` cuyo origen es visita con estado `isDone`/`isConfirmed` o actividad `isCompleted` de un tipo con `isInteraction = true` (DM-22). |
| DEF-G | **Ventana de forecast** M+1…M+H y "mes actual" calculados en `crm.zona_horaria_negocio`, con cambio de año correcto (diciembre → enero). |

### D.5 Composición de la actividad reciente

| `eventType` | Origen | `occurredAt` | Permiso de la fuente |
|---|---|---|---|
| `ACTIVIDAD_REGISTRADA` | `activities.created_at` | `created_at` | `actividades.ver` |
| `ACTIVIDAD_COMPLETADA` | `activities.completed_at` | `completed_at` | `actividades.ver` |
| `INTERACCION` | `crm_interactions_v` (DEF-F) | `occurred_at` de la vista | `visitas.ver` (origen visita) / `actividades.ver` (origen actividad) |
| `OPORTUNIDAD_ETAPA` | `opportunity_stage_history` (excepto la fila de alta, `from_stage_id IS NULL`) | `changed_at` | `oportunidades.ver` |
| `OPORTUNIDAD_CERRADA` / `OPORTUNIDAD_RESULTADO` | `opportunity_result_history` (`RECORDED`, `CHANGED`, `CLEARED`); fusionado con el cambio de etapa de la misma operación (RN-01.23) | `changed_at` | `oportunidades.ver` |
| `OPORTUNIDAD_CREADA` | `opportunities.created_at` | `created_at` | `oportunidades.ver` |
| `OPORTUNIDAD_ACTUALIZADA` | `opportunities.updated_at` (RN-01.23) | `updated_at` | `oportunidades.ver` |
| `PROYECTO_CREADO` | `projects.created_at` | `created_at` | `proyectos.ver` |
| `PROYECTO_FASE` | `project_phase_history` (cambio de fase o de avance) | `changed_at` | `proyectos.ver` |

Si una actividad completada es a la vez interacción, se emite **solo**
`INTERACCION` (evita duplicar el mismo hecho). Qué cambios de proyecto y de
oportunidad son "relevantes" es D-01.10.

### D.6 Reglas de cada alerta

| ID | Tipo | Condición (sobre registros `vigente` y dentro del ámbito) | Fecha de referencia | Responsable | Registro relacionado | Descripción (plantilla) |
|---|---|---|---|---|---|---|
| AL-1 | `ACTIVIDAD_VENCIDA` | Actividad con estado `isOpen` y `due_at < ahora` (DEF-D) | `due_at` | `activities.owner_id` | Actividad (código, asunto) + cliente + proyecto | "Actividad {código} «{asunto}» vencida hace {n} días" |
| AL-2 | `VISITA_SIN_CONFIRMAR` | Visita DEF-E y `COALESCE(actual_end_at, actual_start_at, completion_recorded_at) < ahora − crm.alertas.visita_sin_confirmar_horas` | Esa misma fecha | `visits.owner_id` (D-01.14) | Visita (código, objetivo) + cliente + proyecto | "Visita {código} realizada el {fecha} pendiente de confirmación" |
| AL-3 | `PROYECTO_SIN_ACTUALIZAR` | Proyecto activo (KPI-01) y `last_activity_at < ahora − crm.alertas.proyecto_sin_actualizar_dias` | `last_activity_at` | `projects.owner_id` | Proyecto (código, nombre) + cliente | "Proyecto {código} sin actualizaciones desde hace {n} días" |
| AL-4 | `OPORTUNIDAD_SIN_SIGUIENTE_ACCION` | Solo si `crm.alertas.oportunidad_sin_siguiente_accion = true`. Oportunidad abierta (DEF-A) con `next_action` nulo o vacío tras recortar espacios (D-01.11) | `stage_changed_at` | `opportunities.owner_id` | Oportunidad (código) + proyecto + cliente | "Oportunidad {código} en etapa {etapa} sin siguiente acción" |

Prioridad: `crm.alertas.prioridades[tipo]` → elemento de `crm.prioridad` (RN-01.27).
Identidad: `id = "{tipo}:{sourceId}"` (RN-01.28).

### D.7 Restricciones de integridad relevantes

Inicio no añade restricciones: se apoya en las del contrato (CHECK de
`activities.ck_activities_completion`, `visits.ck_visits_confirm_requires`,
FK compuestas cliente–proyecto–oportunidad) que garantizan que sus fórmulas no
encuentren combinaciones imposibles. Índices que usan sus consultas (ya en 00):
`idx_projects_last_activity_at`, `idx_projects_phase_id`, `idx_opportunities_owner_id_stage_id`,
`idx_opportunity_results_outcome_decision_date`, `idx_forecast_lines_owner_id_year_month`,
`idx_visits_owner_id_scheduled_start_at`, `idx_visits_status_id_scheduled_start_at`,
`idx_activities_owner_id_status_id_due_at`, `idx_*_history_*_changed_at`.

---

## E. Pantallas y componentes

Una sola pantalla: **Panel de control** (`/`), que evoluciona la actual
`HomePage`. Mobile-first, tokens del tema (ADR-017, CLAUDE.md §8.12), cuatro
estados por bloque (cargando, vacío, error, sin permiso). Encabezado con
`PageHeader` (`Panel de control`, migas `Inicio › Panel de control`).

### E.1 Disposición

```text
┌──────────────────────── PageHeader: Panel de control ─────────────────────────┐
│ [Aviso servidor no disponible, si /health falla]                              │
│ ┌──────────── Hero ────────────┐ ┌──────── Mi acceso (4 mini-indicadores) ──┐ │
│ │ fecha · hora · saludo        │ │ Roles · Permisos · Alcance · Equipos      │ │
│ │ nombre · rol(es) · alcance   │ └───────────────────────────────────────────┘ │
│ └──────────────────────────────┘                                               │
│ Indicadores  [Período: Mes ▾]                                                  │
│ K1 K2 K3 K4 / K5 K6 K7 K8 / K9   (grid 1 / 2 / 3 / 4 columnas por breakpoint)   │
│ ┌──── Alertas y pendientes ────┐ ┌──── Actividad ─────────────────────────────┐ │
│ │ resumen por tipo (chips)     │ │ Próximas visitas (asc)                      │ │
│ │ lista paginada               │ │ Actividad reciente (desc, paginada)         │ │
│ └──────────────────────────────┘ └─────────────────────────────────────────────┘ │
│ Accesos rápidos · Todos mis accesos (por módulo)                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

En `xs` todo va en una columna en este orden: Hero, Alertas (resumen), Indicadores,
Actividad, Accesos, Mi acceso. La barra inferior y el sidebar no cambian.

### E.2 Hero y "Mi acceso" (F-01)

| Elemento | Dato | Estados |
|---|---|---|
| Fecha y hora | Reloj (`<time>`), refresco cada 60 s (RN-01.3) | — |
| Saludo | "Buenos días, {nombre}." (lógica actual) | Sin nombre: solo saludo |
| Nombre completo y roles | `displayName`, chips con `roles` | Carga: `Skeleton`; error de `/me`: `Alert` (texto actual) |
| Alcance | Chip "Ámbito: Propios / Equipo / País / Organización" | — |
| Resumen de accesos | "Tienes acceso a N opciones en M módulos…" (texto actual) | Carga: "Estamos cargando tus accesos." |
| Mi acceso | Las 4 tarjetas actuales (roles, permisos efectivos, alcance, equipos) en formato compacto | Mismos estados que hoy |

### E.3 Indicadores (F-02)

Componente `KpiCard` (evolución del `StatCard` actual: mismos tonos, reflejo y
movimiento con `prefers-reduced-motion`), con: icono, etiqueta, valor, pie
(subconteos), "Actualizado hh:mm" y enlace opcional.

| Tarjeta | Permiso para mostrarla | Valor | Pie | Destino (ruta del módulo dueño y filtro, D-01.4) |
|---|---|---|---|---|
| K1 Proyectos activos | `proyectos.ver` | KPI-01 | — | `/proyectos?active=true` |
| K2 Oportunidades abiertas | `oportunidades.ver` | KPI-02 | Top 3 etapas con su conteo | `/proyectos/oportunidades?status=OPEN` |
| K3 Ganadas | `oportunidades.ver` | KPI-03 | "{n} parciales" + período | `/proyectos/oportunidades?outcome=WON,PARTIAL&decisionFrom=…&decisionTo=…` |
| K4 Perdidas | `oportunidades.ver` | KPI-04 | Período | `/proyectos/oportunidades?outcome=LOST&decisionFrom=…&decisionTo=…` |
| K5 Forecast M+6 | `forecast.ver` | Total t (decimal con 2 decimales y símbolo) | Mini-serie de 6 meses (barras de texto accesibles) + "{n} líneas sin conversión" | `/proyectos/forecast` (ventana por defecto) |
| K6 Visitas | `visitas.ver` | KPI-06 pendientes | "{n} próximas en {N} días · {m} atrasadas" | `/actividad/visitas?statusGroup=PENDING` (y `&from=…&to=…` desde el pie) |
| K7 Actividades pendientes | `actividades.ver` | KPI-08 | "{n} por vencer en {h} h" | `/actividad/pendientes?bucket=DUE_SOON&bucket=PENDING` |
| K8 Actividades vencidas | `actividades.ver` | KPI-09 | — | `/actividad/pendientes?bucket=OVERDUE` |
| K9 Metas y cumplimiento | `metas.ver` | Cumplimiento principal (%) | Objetivo / logrado por métrica | Sin destino (RN-01.19) |

- **Filtro de período** (solo afecta K3, K4 y K9): `Mes en curso` (defecto), `Trimestre en curso`, `Año en curso` (D-01.3). Se guarda en la URL (`?period=MONTH`).
- **Estados por tarjeta:** cargando (`Skeleton` del tamaño de la tarjeta); error (mensaje de `describeApiError` + botón Reintentar + `correlationId`); vacío/no calculable (RN-01.11); sin permiso (no se pinta). Si el usuario no tiene ninguna tarjeta: aviso RN-01.7.
- **Accesibilidad:** cada tarjeta es `section` con `aria-label`; el enlace dice "Ver {indicador}"; la mini-serie de forecast tiene tabla accesible oculta visualmente.

### E.4 Actividad (F-03)

**Próximas visitas** (`visitas.ver`): lista compacta (máx. 5 visibles, "Ver más"
abre las siguientes hasta 50) con fecha/hora, cliente, proyecto, responsable,
objetivo resumido, estado y chip "Recordatorio" si `reminderDue`. Clic → ficha de
la visita. Vacío: "No tienes visitas en los próximos {N} días."

**Actividad reciente** (visible si el usuario tiene al menos un permiso de fuente
de D.5): línea de tiempo con fecha relativa ("hace 2 h") y absoluta en `title`,
icono por tipo, responsable, cliente/proyecto, resumen. Filtro por tipo de
evento (chips: Actividades, Interacciones, Oportunidades, Proyectos; solo los
permitidos). Paginación "Cargar más" (servidor). Vacío: "No hay actividad en los
últimos 30 días." Error: `Alert` con reintento.

### E.5 Alertas y pendientes (F-04)

- **Resumen** (`GET /dashboard/alerts/summary`): chip por tipo con conteo y color semántico de su prioridad (tokens semánticos, nunca de marca). Un tipo deshabilitado muestra "Desactivada" con tooltip (habilitación por parámetro o parámetro inválido). Clic en un chip filtra la lista.
- **Lista** (paginada en servidor, 10 por página por defecto): por alerta, prioridad, tipo, descripción, responsable, fecha de referencia (relativa y absoluta), registro relacionado y botón "Abrir" a la ficha de origen.
- **Filtros:** tipo, prioridad, "Asignadas a mí". En la URL (`?alertType=…&alertPriority=…&mine=true`).
- **Orden:** RN-01.27; alternativo por fecha de referencia.
- **Estados:** cargando; vacío "No tienes alertas pendientes."; error con reintento; sin permisos de ninguna fuente → bloque oculto.
- Por debajo de `sm` la lista pasa a tarjetas (mismo patrón que `DataTable`).

### E.6 Accesos (F-01)

- **Accesos rápidos:** hasta 8 opciones de `/me/menu` (excluida `/`), primero las de los módulos operativos del CRM (`clientes`, `proyectos`, `actividad-comercial`) en el orden del menú, después el resto (D-01.12).
- **Todos mis accesos:** todas las opciones navegables agrupadas por módulo (lo que hoy muestra "Accesos rápidos").
- Estados actuales conservados: carga (`Skeleton`), error ("No se pudo cargar tu menú…"), vacío ("Todavía no tienes opciones asignadas…").

### E.7 Navegación desde el panel

| Desde | A | Condición |
|---|---|---|
| Tarjeta K1–K8 | Listado del módulo dueño con filtro | Ruta registrada en el router **y** permiso de la ruta |
| Alerta / evento / próxima visita | Ficha del registro (`/actividad/actividades/:id`, `/actividad/visitas/:id`, `/proyectos/:id`, `/proyectos/oportunidades/:opportunityId` (03 E.1), `/clientes/:id`), según las rutas que definan 02–04 | Registro visible (ya filtrado por el backend) y ruta registrada |
| Acceso rápido | `option.path` | Opción concedida por el servidor |

La correspondencia `source.type → ruta` vive en un único archivo del feature
(`source-routes.ts`) y comprueba la existencia de la ruta con
`getShellNavigablePaths()` (mismo árbol que valida `route-registry.spec.ts`).

---

## F. Servicios y contratos

Todos bajo `/api/v1`, solo `GET`, formato de error de `API-STANDARDS.md` §8,
claves `camelCase`, fechas ISO 8601 UTC, decimales como **string**. Ningún
endpoint devuelve modelos de Prisma: siempre DTO. Las colecciones devuelven
`{ data, pagination }` (`PaginatedResponseDto`).

### F.1 Operaciones propias

| # | Método | Ruta | Permiso | Query | Respuesta |
|---|---|---|---|---|---|
| 1 | GET | `/dashboard/indicators/projects` | `proyectos.ver` | — | `ProjectIndicatorsResponseDto` |
| 2 | GET | `/dashboard/indicators/opportunities` | `oportunidades.ver` | `DashboardPeriodQueryDto` | `OpportunityIndicatorsResponseDto` |
| 3 | GET | `/dashboard/indicators/forecast` | `forecast.ver` | — | `ForecastIndicatorsResponseDto` |
| 4 | GET | `/dashboard/indicators/visits` | `visitas.ver` | — | `VisitIndicatorsResponseDto` |
| 5 | GET | `/dashboard/indicators/activities` | `actividades.ver` | — | `ActivityIndicatorsResponseDto` |
| 6 | GET | `/dashboard/indicators/targets` | `metas.ver` | `DashboardPeriodQueryDto` | `TargetIndicatorsResponseDto` |
| 7 | GET | `/dashboard/upcoming-visits` | `visitas.ver` | `UpcomingVisitsQueryDto` | `{ data: UpcomingVisitDto[], pagination }` |
| 8 | GET | `/dashboard/recent-activity` | Cualquiera de `actividades.ver`, `visitas.ver`, `oportunidades.ver`, `proyectos.ver` (D-01.1) | `RecentActivityQueryDto` | `{ data: RecentActivityItemDto[], pagination }` |
| 9 | GET | `/dashboard/alerts` | Cualquiera de `actividades.ver`, `visitas.ver`, `proyectos.ver`, `oportunidades.ver` (D-01.1) | `DashboardAlertsQueryDto` | `{ data: DashboardAlertDto[], pagination }` |
| 10 | GET | `/dashboard/alerts/summary` | Igual que 9 | — | `AlertsSummaryResponseDto` |

Los endpoints 8–10 filtran **dentro** del caso de uso cada fuente/tipo por su
propio permiso: un usuario con solo `actividades.ver` recibe únicamente eventos de
actividades y alertas `ACTIVIDAD_VENCIDA`.

#### DTO de consulta

```ts
// DashboardPeriodQueryDto
period?: 'MONTH' | 'QUARTER' | 'YEAR';   // defecto MONTH, calendario de crm.zona_horaria_negocio
from?: string;                            // fecha ISO (YYYY-MM-DD); si llega, exige `to` y anula `period`
to?: string;                              // from ≤ to, rango ≤ 366 días

// UpcomingVisitsQueryDto extends PaginationQueryDto
pageSize ≤ 50 (defecto 5); sortBy fijo scheduledStartAt asc (no se acepta otro)

// RecentActivityQueryDto extends PaginationQueryDto
sinceDays?: number;                       // 1–90, defecto 30
types?: RecentActivityEventType[];        // CSV; valores de D.5
pageSize ≤ 50 (defecto 20)

// DashboardAlertsQueryDto extends PaginationQueryDto
type?: AlertType[];                       // CSV: ACTIVIDAD_VENCIDA | VISITA_SIN_CONFIRMAR | PROYECTO_SIN_ACTUALIZAR | OPORTUNIDAD_SIN_SIGUIENTE_ACCION
priority?: string[];                      // códigos de crm.prioridad
mine?: boolean;                           // owner_id = usuario
sortBy?: 'priority' | 'referenceDate';    // whitelist; defecto priority (RN-01.27)
sortOrder?: 'asc' | 'desc';
pageSize ≤ 100 (defecto 10)
```

#### DTO de respuesta

```jsonc
// ProjectIndicatorsResponseDto
{ "activeProjects": 42, "generatedAt": "2026-10-10T15:04:00Z" }

// OpportunityIndicatorsResponseDto
{
  "open":  { "count": 17, "byStage": [ { "stageId": "uuid", "code": "COTIZANDO", "label": "Cotizando", "order": 2, "count": 11 } ] },
  "won":   { "count": 5, "wonCount": 4, "partialCount": 1 },
  "lost":  { "count": 2 },
  "period": { "from": "2026-10-01", "to": "2026-10-31", "kind": "MONTH" },
  "generatedAt": "…"
}

// ForecastIndicatorsResponseDto
{
  "window": { "from": { "year": 2026, "month": 11 }, "to": { "year": 2027, "month": 4 } },
  "tonnageUnit": { "code": "TON", "symbol": "t" },
  "totalTonnage": "1250.5000",            // null si no hay líneas en la ventana (RN-01.11)
  "months": [ { "year": 2026, "month": 11, "tonnage": "210.0000", "lineCount": 8 } ],
  "unconvertedLines": 3,
  "quantitiesByUnit": [ { "unitCode": "VAR", "unitSymbol": "var", "quantity": "1200.0000" } ],
  "generatedAt": "…"
}

// VisitIndicatorsResponseDto
{ "pending": { "count": 9, "overdueCount": 2 }, "upcoming": { "count": 4, "days": 7 }, "generatedAt": "…" }

// ActivityIndicatorsResponseDto
{ "pending": { "count": 14, "dueSoonCount": 3, "dueSoonHours": 48 }, "overdue": { "count": 5 }, "generatedAt": "…" }

// TargetIndicatorsResponseDto
{
  "hasTargets": true,                      // false → items = [] y la tarjeta dice "Sin metas configuradas"
  "period": { "from": "2026-10-01", "to": "2026-10-31", "kind": "MONTH" },
  "items": [ {
    "targetId": "uuid", "metric": "TONNAGE",
    "subject": { "type": "USER", "id": "uuid", "label": "Nombre visible" },
    "targetValue": "500.0000", "achievedValue": "320.0000",
    "compliancePercent": "64.00",          // null si targetValue = 0
    "unit": { "code": "TON", "symbol": "t" }, "currencyCode": null
  } ],
  "generatedAt": "…"
}

// UpcomingVisitDto
{ "id": "uuid", "code": "VIS-2026-00042", "scheduledStartAt": "…", "scheduledEndAt": null,
  "status": { "code": "PROGRAMADA", "label": "Programada" },
  "objective": "≤200 caracteres", "owner": { "id": "uuid", "displayName": "…" },
  "customer": { "id": "uuid", "crmCode": "CLI-000123", "name": "Razón social" },
  "project": { "id": "uuid", "code": "PRY-2026-00042", "name": "…" } | null,
  "reminderDue": false }

// RecentActivityItemDto
{ "id": "OPORTUNIDAD_ETAPA:uuid-del-historial", "eventType": "OPORTUNIDAD_ETAPA",
  "occurredAt": "…", "summary": "Contactado → Cotizando",
  "responsible": { "id": "uuid", "displayName": "…" },
  "customer": { "id": "uuid", "crmCode": "…", "name": "…" } | null,
  "project": { "id": "uuid", "code": "…", "name": "…" } | null,
  "source": { "type": "OPPORTUNITY", "id": "uuid", "code": "OPO-2026-00042", "projectId": "uuid" } }
// source.type ∈ ACTIVITY | VISIT | OPPORTUNITY | PROJECT

// DashboardAlertDto
{ "id": "ACTIVIDAD_VENCIDA:uuid", "type": "ACTIVIDAD_VENCIDA",
  "description": "Actividad ACT-2026-000042 «Llamar a compras» vencida hace 3 días",
  "priority": { "code": "ALTA", "label": "Alta", "weight": 3 },
  "responsible": { "id": "uuid", "displayName": "…" },
  "referenceDate": "…",
  "customer": { … } | null, "project": { … } | null,
  "source": { "type": "ACTIVITY", "id": "uuid", "code": "ACT-2026-000042", "projectId": null } }

// AlertsSummaryResponseDto
{ "items": [ { "type": "ACTIVIDAD_VENCIDA", "enabled": true, "disabledReason": null,
               "count": 5, "priority": { "code": "ALTA", "label": "Alta", "weight": 3 } } ],
  "generatedAt": "…" }
// disabledReason ∈ DISABLED_BY_PARAMETER | PARAMETER_INVALID | NO_PERMISSION (el tipo no se lista si NO_PERMISSION)
```

#### Errores

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Query inválida: `period` desconocido, `from` sin `to`, `from > to`, rango > 366 días, `sinceDays` fuera de 1–90, `type`/`types` desconocidos, `sortBy` fuera de la whitelist, `pageSize` > máximo |
| 401 | `UNAUTHENTICATED` | Sin sesión o token inválido |
| 403 | `PERMISSION_DENIED` | Falta el permiso del endpoint (1–7) o ninguno de los permisos admitidos (8–10) |
| 500 | `INTERNAL_ERROR` | Error inesperado (con `correlationId`; sin SQL ni nombres de tabla) |

No hay `404`, `409` ni `422`: no se direcciona ningún recurso por id y no hay
reglas de negocio de escritura. Un parámetro inválido **no** es un error de la
petición (RN-01.30).

### F.2 Servicio compartido de indicadores (contrato para el Módulo 5)

Módulo Nest `CommercialMetricsModule` (exporta `CommercialMetricsService`). Puerto
`COMMERCIAL_METRICS_READ_MODEL` con adaptador Prisma. Firma (tipos de dominio, sin Prisma):

```ts
interface MetricContext {
  scope: VisibilityScope;                 // resuelto por VisibilityScopeResolver (Fase 0)
  now: Date;                              // inyectable para pruebas
  businessTimeZone: string;               // crm.zona_horaria_negocio
}
interface DateRange { from: string; to: string }   // fechas de calendario, inclusivas

interface CommercialMetricsService {
  countActiveProjects(ctx: MetricContext): Promise<number>;                                   // KPI-01
  countOpenOpportunities(ctx: MetricContext): Promise<{ total: number; byStage: StageCount[] }>; // KPI-02
  countWonOpportunities(ctx: MetricContext, period: DateRange): Promise<{ total: number; won: number; partial: number }>; // KPI-03
  countLostOpportunities(ctx: MetricContext, period: DateRange): Promise<number>;            // KPI-04
  forecastWindow(ctx: MetricContext, horizonMonths: number): Promise<ForecastWindowSummary>; // KPI-05
  countVisits(ctx: MetricContext, upcomingDays: number): Promise<VisitCounts>;               // KPI-06/07
  countActivities(ctx: MetricContext, dueSoonHours: number): Promise<ActivityCounts>;        // KPI-08/09
  targetCompliance(ctx: MetricContext, period: DateRange): Promise<TargetCompliance[]>;      // KPI-10
  resolvePeriod(kind: 'MONTH' | 'QUARTER' | 'YEAR', ctx: MetricContext): DateRange;          // calendario de negocio
  forecastWindowMonths(ctx: MetricContext, horizonMonths: number): YearMonth[];              // DEF-G
}
```

Además exporta los **predicados** DEF-A…DEF-G en `metric-definitions.ts`
(funciones puras sobre la semántica de catálogo y fechas) para que el
`ReportingRepository` del Módulo 5 construya sus filtros con ellos. Obligación
para Reportes (a recoger en `05-reportes.md`): los conteos de abiertas, ganadas,
perdidas, parciales, proyectos activos, pendientes/realizadas/vencidas y forecast
por mes se obtienen de este servicio o de estos predicados.

### F.3 Consultas a otros módulos

Inicio **no llama** a servicios de los módulos 2–4: lee las tablas y la vista del
contrato 00 a través de sus propios puertos de lectura (00 §11:
`DashboardReadModel`, `AlertsReadModel`), igual que hará `ReportingRepository`.
Sí consume:

| Servicio | Dueño | Uso |
|---|---|---|
| `GET /me`, `GET /me/menu` | Acceso (existente) | Perfil y accesos (frontend) |
| `GET /health` | Health (existente) | Aviso de servidor no disponible (frontend, como hoy) |
| `VisibilityScopeResolver` | Fase 0 (transversal) | `DataScope` → `{ ownerIds?, countryIds? }` |
| `ParameterReader.get<T>(key)` (02 F.6.5) | Fase 0 / módulo `parameters` | `crm.alertas.*`, `crm.forecast.*`, zona horaria, D-01.5 |
| Lectura de `catalog_items` por `key` | Catálogos (existente) | Semántica y etiquetas (a través del adaptador de lectura) |

---

## G. Relaciones e integraciones internas

### G.1 Qué consume

| Módulo | Información | Identificadores |
|---|---|---|
| Clientes (2) | Cliente relacionado, vigencia, país de visitas/actividades | `customers.id`, `crm_code`, `legal_name`, `country_id`, `deleted_at` |
| Proyectos (3) | Proyectos, fase, `last_activity_at`, oportunidades, etapas, resultados, historiales, forecast | `projects.id/code`, `opportunities.id/code`, `forecast_lines` por `(project, product, year, month)` |
| Actividad comercial (4) | Visitas, eventos, actividades, vista de interacciones | `visits.id/code`, `activities.id/code`, `crm_interactions_v.source_type/source_id` |
| Administración (7) / núcleo | Usuarios, equipos, roles, permisos, menú, catálogos, parámetros | `users.id`, `teams.id`, códigos de permiso, `Catalog.key`, `SystemParameter.key` |

### G.2 Qué proporciona

| A | Qué |
|---|---|
| Reportes (5) | `CommercialMetricsService` y predicados DEF-A…G: **fuente única de fórmulas** (RN-01.10) |
| Todos los usuarios | La pantalla de entrada y la navegación a los módulos 2–4 |
| Proyectos (3) y Actividad (4) | Requisito: sus listados aceptan los filtros de destino de E.3 (D-01.4); sus fichas tienen ruta estable para los enlaces de E.7 |

### G.3 Comportamiento con módulos aún no implementados

El esquema completo existe desde la Fase 0, así que **las consultas de Inicio
funcionan aunque falte el código de un módulo**: si no hay registros, las cifras
son `0` y las listas están vacías (datos reales, RN-01.11).

| Si falta… | Efecto en Inicio |
|---|---|
| Fase 0 (esquema, catálogos, parámetros, `VisibilityScopeResolver`) | **Bloqueante.** No se implementa Inicio |
| Pantallas de Clientes (2) | Eventos y alertas muestran el cliente como texto sin enlace |
| Pantallas de Proyectos (3) | K1–K5 muestran cifra sin enlace (RN-01.19); enlaces a ficha de proyecto/oportunidad desactivados; las cifras siguen saliendo de las tablas |
| Pantallas de Actividad (4) | K6–K8 sin enlace; próximas visitas y alertas AL-1/AL-2 sin botón "Abrir" |
| Reportes (5) | Ninguno: Inicio crea el servicio compartido que Reportes consumirá después |
| Pantalla de metas (no existe) | K9 solo con metas cargadas por script (DM-9); sin ellas, "Sin metas configuradas" |
| Permiso de la fuente no concedido | El bloque no se pinta ni se consulta (RN-01.4) |

La disponibilidad de una ruta se comprueba en el frontend contra el árbol de
rutas (`getShellNavigablePaths`), no con una lista fija; al implementarse un
módulo y registrar su ruta, el enlace aparece sin tocar Inicio.

---

## H. Seguridad

### H.1 Permiso por operación

| Operación | Permiso | Justificación |
|---|---|---|
| Abrir `/` | Sesión válida (opción `inicio` pública) | RN-01.1 |
| `GET /me`, `/me/menu` | `@AuthenticatedOnly` (existente) | Autoservicio |
| Indicadores de proyectos (K1) | `proyectos.ver` | Fuente: `projects` |
| Indicadores de oportunidades (K2–K4) | `oportunidades.ver` | Fuente: `opportunities` |
| Forecast (K5) | `forecast.ver` | Fuente: `forecast_lines` |
| Visitas (K6) y próximas visitas | `visitas.ver` | Fuente: `visits` |
| Actividades (K7, K8) | `actividades.ver` | Fuente: `activities` |
| Metas (K9) | `metas.ver` | 00 §5.2 |
| Actividad reciente / alertas | Al menos uno de los `.ver` de fuente (D-01.1); cada tipo filtrado por el suyo | D.5, D.6 |

**No se crea ningún permiso nuevo.** Todos están en 00 §5.2 y en la matriz §5.4
(asesor, manager y responsable de país tienen todos los `.ver` usados; el
administrador, `*`).

### H.2 Ámbito de visibilidad (00 §4)

| `DataScope` | Efecto en Inicio |
|---|---|
| `OWN` | Solo registros cuyo dueño es el usuario (más herencias DM-13: p. ej. oportunidad de un proyecto propio) |
| `TEAM` | Registros de los miembros de los equipos donde es miembro o responsable, incluidos subequipos (DM-12) |
| `COUNTRY` | Registros del país del usuario (`users.country_id`; DM-14) |
| `ORGANIZATION` | Sin filtro |

- El ámbito se resuelve **en el backend** en cada petición con `VisibilityScopeResolver`; el frontend no envía ni puede ampliar el ámbito (no hay parámetro `ownerId` libre: `mine=true` solo **restringe**).
- Usuario de un ámbito que requiere país sin `country_id` (DM-30): se trata como conjunto vacío (cero resultados), nunca como `ORGANIZATION`. Se registra `warn`.
- Visibilidad ≠ edición (00 §4.3): Inicio solo lee; los enlaces llevan a fichas donde cada módulo aplica `editar`/`administrar`.

### H.3 Aplicación en backend

- Cada controlador declara `@RequirePermission(...)` (o el mecanismo de D-01.1); `PermissionsGuard` deniega por defecto.
- Los filtros de ámbito se aplican en el adaptador de lectura con parámetros (`$queryRaw` con plantilla o consultas Prisma tipadas); **nunca** SQL concatenado. `sortBy` con whitelist.
- Límites duros: `pageSize` máximo por endpoint (F.1), `sinceDays` ≤ 90, rango de período ≤ 366 días.
- Las respuestas no incluyen PII de contactos ni campos no listados en los DTO.

### H.4 Auditoría y logging

- Sin mutaciones → **no** se escribe en `audit_logs` (la consulta no es una operación auditable en esta plantilla, igual que los `GET` de administración).
- Log estructurado por petición (interceptor existente, con `correlationId`). El caso de uso registra en `debug` la duración por fuente y en `warn` los parámetros inválidos (clave, no valor). Nunca se registran resúmenes, descripciones ni nombres de clientes.

### H.5 Rendimiento como control

Cada endpoint hace un número acotado de consultas agregadas (sin N+1). Objetivo:
p95 < 500 ms por endpoint con el volumen de la semilla de demostración ×100,
medido en la prueba de integración de rendimiento ligera (PF-01.44).

---

## I. Criterios de aceptación

### F-01 Dashboard general

| ID | Criterio |
|---|---|
| AC-01.1 | **Given** un usuario autenticado con nombre "Ana López" y rol `asesor`, **When** abre `/`, **Then** ve el saludo con "Ana", su nombre completo, el chip del rol, la fecha larga y la hora actual, y la hora cambia al minuto siguiente sin recargar. (F-01) |
| AC-01.2 | **Given** cualquier usuario, **When** abre `/`, **Then** sigue viendo el número de roles, de permisos efectivos, su alcance de datos (con `COUNTRY` como "País") y sus equipos, y el texto "Tienes acceso a N opciones en M módulos". (F-01) |
| AC-01.3 | **Given** un usuario cuyo menú (`/me/menu`) concede Clientes, Agenda y Usuarios, **When** abre `/`, **Then** los accesos rápidos y "Todos mis accesos" muestran exactamente esas opciones (sin el propio panel), las del CRM primero, y al pulsar una navega a su `path`. (F-01) |
| AC-01.4 | **Given** un usuario sin `proyectos.ver`, **When** abre `/`, **Then** no ve la tarjeta K1 ni accesos a Proyectos, el navegador no hace petición a `/dashboard/indicators/projects`, **and** si la invoca directamente recibe `403 PERMISSION_DENIED`. (F-01, F-02) |
| AC-01.5 | **Given** un usuario con el rol `usuario` (sin permisos comerciales), **When** abre `/`, **Then** ve Hero, "Mi acceso", accesos y el aviso "Todavía no tienes indicadores comerciales asignados", y no se hace ninguna petición a `/dashboard/*`. (F-01) |
| AC-01.6 | **Given** que `/me/menu` falla, **When** se abre `/`, **Then** el bloque de accesos muestra el error con reintento y los indicadores siguen cargando por su cuenta. (F-01) |

### F-02 Indicadores clave

| ID | Criterio |
|---|---|
| AC-01.7 | **Given** 3 proyectos propios vigentes en fases `DISENO`, `CONSTRUCCION` y `FINALIZADO` y uno propio eliminado lógicamente, **When** un asesor consulta K1, **Then** el valor es 2. (F-02, KPI-01) |
| AC-01.8 | **Given** oportunidades propias en `CONTACTADO` (1), `COTIZANDO` (2), `GANADO` (1) y una `COTIZANDO` de un proyecto eliminado, **When** consulta K2, **Then** el valor es 3 con desglose Contactado 1 / Cotizando 2. (F-02, KPI-02, RN-01.13) |
| AC-01.9 | **Given** en el mes en curso una oportunidad `WON`, una `PARTIAL` (60 %) y una `WON` con fecha de decisión del mes anterior, **When** consulta K3 con período mes, **Then** el valor es 2 con "1 parcial"; **and** con período año, es 3. (F-02, KPI-03, DM-15) |
| AC-01.10 | **Given** una oportunidad `LOST` decidida este mes con 3 productos asociados, **When** consulta K4, **Then** el valor es 1 (no 3). (F-02, KPI-04, RN-01.14) |
| AC-01.11 | **Given** hoy 2026-10-10 y líneas de forecast en 2026-10 (10 t), 2026-11 (20 t), 2027-04 (5 t), 2027-05 (7 t) y una línea en 2026-12 en `VAR` sin conversión, **When** consulta K5, **Then** la ventana es 2026-11…2027-04, el total es "25.0000" t, `unconvertedLines` = 1, la cantidad en `VAR` aparece aparte y no se suma al total. (F-02, KPI-05) |
| AC-01.12 | **Given** visitas propias `PROGRAMADA` mañana, `REPROGRAMADA` dentro de 10 días, `PROGRAMADA` de ayer y una `CANCELADA` mañana, con `crm.inicio.visitas_proximas_dias = 7`, **When** consulta K6, **Then** pendientes = 3, próximas = 1, atrasadas = 1. (F-02, KPI-06/07) |
| AC-01.13 | **Given** actividades propias abiertas: una sin vencimiento, una que vence en 24 h, una que vence en 5 días, y una completada, con `actividad_por_vencer_horas = 48`, **When** consulta K7, **Then** pendientes = 3 y por vencer = 1. (F-02, KPI-08, RN-01.17) |
| AC-01.14 | **Given** una actividad abierta con vencimiento hace 1 hora y otra cancelada vencida, **When** consulta K8, **Then** el valor es 1 **and** esa actividad no cuenta en K7. (F-02, KPI-09) |
| AC-01.15 | **Given** un usuario con `metas.ver`: (a) sin filas en `sales_targets` aplicables → K9 muestra "Sin metas configuradas" y ningún número; (b) con una meta mensual `WON_OPPORTUNITIES` de 4 y 2 ganadas en el mes → objetivo 4, logrado 2, cumplimiento "50.00"; (c) con objetivo 0 → cumplimiento "No calculable"; **and** sin `metas.ver` la tarjeta no aparece. (F-02, KPI-10, DM-9) |
| AC-01.16 | **Given** los mismos datos de demostración, **When** consultan K1 un asesor (OWN), su manager (TEAM), el responsable de país (COUNTRY) y el administrador (ORGANIZATION), **Then** cada uno obtiene solo los proyectos de su ámbito y los valores cumplen OWN ≤ TEAM ≤ COUNTRY ≤ ORGANIZATION para ese país. (F-02, RN-01.5) |
| AC-01.17 | **Given** que las rutas `/proyectos/oportunidades` y `/actividad/pendientes` están registradas, **When** el usuario pulsa K2 o K8, **Then** navega al listado con el filtro de E.3 y el listado muestra el mismo número de registros que la tarjeta; **and** si la ruta no está registrada, la tarjeta no tiene enlace y muestra la nota de disponibilidad. (F-02, RN-01.19) |
| AC-01.18 | **Given** el servicio `CommercialMetricsService`, **When** el Módulo 5 calcula abiertas, ganadas, perdidas, proyectos activos, actividades pendientes/vencidas y forecast M+6 para el mismo usuario y período, **Then** obtiene los mismos valores que Inicio porque usa el mismo servicio (verificable desde que exista el Módulo 5; hasta entonces el servicio es la única implementación). (F-02, RN-01.10) |
| AC-01.19 | **Given** que `/dashboard/indicators/forecast` responde 500, **When** se abre `/`, **Then** K5 muestra error con reintento y `correlationId`, y el resto de tarjetas se ve normal; **and** sin líneas en la ventana, K5 muestra "Sin proyección" en lugar de "0 t". (F-02, RN-01.8, RN-01.11) |
| AC-01.20 | **Given** `from=2026-10-31&to=2026-10-01`, o un rango de 400 días, o `period=WEEK`, **When** se llama a `/dashboard/indicators/opportunities`, **Then** responde `400 VALIDATION_FAILED` con el detalle del campo. (F-02) |

### F-03 Resumen de actividad

| ID | Criterio |
|---|---|
| AC-01.21 | **Given** eventos visibles de los últimos 30 días, **When** se abre el panel, **Then** cada evento muestra fecha y hora, tipo, responsable, cliente y/o proyecto y un resumen de ≤ 200 caracteres, sin datos de contactos. (F-03) |
| AC-01.22 | **Given** en la ventana: una actividad creada, una llamada completada (tipo `isInteraction`), una visita confirmada, un cambio de etapa de oportunidad, un resultado registrado y un cambio de fase de proyecto, **When** se consulta la actividad reciente, **Then** aparecen los eventos `ACTIVIDAD_REGISTRADA`, `INTERACCION` (llamada), `INTERACCION` (visita), `OPORTUNIDAD_CERRADA` (etapa + resultado fusionados) y `PROYECTO_FASE`. (F-03, D.5) |
| AC-01.23 | **Given** una visita reprogramada dos veces y luego confirmada, **When** se consulta la actividad reciente, **Then** la visita aparece una sola vez como interacción **and** la lista está en orden descendente por fecha. (F-03, RN-01.20, RN-01.23) |
| AC-01.24 | **Given** visitas pendientes en los próximos 7 días, una con recordatorio de 60 min que empieza en 30 min, **When** se abre el panel, **Then** "Próximas visitas" las lista en orden ascendente y esa visita lleva el chip "Recordatorio". (F-03, RN-01.25, DM-27) |
| AC-01.25 | **Given** un asesor (OWN) con solo `actividades.ver`, **When** consulta la actividad reciente, **Then** solo recibe eventos de actividades propias (ni oportunidades, ni proyectos, ni actividades ajenas) **and** cada evento con ruta registrada navega a la ficha de origen. (F-03, RN-01.22) |
| AC-01.26 | **Given** que no hay eventos en la ventana, **When** se abre el panel, **Then** se muestra "No hay actividad en los últimos 30 días."; **and** si la petición falla, un error con reintento. (F-03) |

### F-04 Alertas y pendientes

| ID | Criterio |
|---|---|
| AC-01.27 | **Given** una actividad propia abierta con vencimiento ayer, **When** se consulta la bandeja, **Then** existe una alerta `ACTIVIDAD_VENCIDA` con la prioridad de `crm.alertas.prioridades`, fecha de referencia = vencimiento y responsable = dueño. (F-04, AL-1) |
| AC-01.28 | **Given** `visita_sin_confirmar_horas = 48` y dos visitas `REALIZADA` sin confirmar, una realizada hace 50 h y otra hace 10 h, **When** se consulta la bandeja, **Then** solo la primera genera `VISITA_SIN_CONFIRMAR`. (F-04, AL-2) |
| AC-01.29 | **Given** `proyecto_sin_actualizar_dias = 30`, un proyecto activo con `last_activity_at` hace 31 días y otro `FINALIZADO` hace 60 días, **When** se consulta la bandeja, **Then** solo el primero genera `PROYECTO_SIN_ACTUALIZAR`. (F-04, AL-3) |
| AC-01.30 | **Given** una oportunidad `COTIZANDO` sin siguiente acción (o solo espacios) y otra `GANADO` sin siguiente acción, **When** se consulta la bandeja, **Then** solo la primera genera `OPORTUNIDAD_SIN_SIGUIENTE_ACCION`; **and** con `crm.alertas.oportunidad_sin_siguiente_accion = false` no se genera y el resumen muestra el tipo como `DISABLED_BY_PARAMETER`. (F-04, AL-4) |
| AC-01.31 | **Given** cualquier alerta, **When** se muestra, **Then** incluye tipo, descripción, prioridad, responsable, fecha de referencia, registro relacionado (código y nombre) y un botón "Abrir" que navega a la ficha de origen si su ruta está registrada. (F-04) |
| AC-01.32 | **Given** la alerta AL-3 con umbral 30 días, **When** un administrador cambia `crm.alertas.proyecto_sin_actualizar_dias` a 45 y `crm.alertas.prioridades.PROYECTO_SIN_ACTUALIZAR` a `ALTA`, **Then** la siguiente consulta aplica el nuevo umbral y la nueva prioridad sin reiniciar ni desplegar. (F-04, RN-01.26) |
| AC-01.33 | **Given** una actividad vencida que además pertenece a un proyecto sin actualizar, **When** se consulta la bandeja varias veces, **Then** existe exactamente una alerta `ACTIVIDAD_VENCIDA` para la actividad y una `PROYECTO_SIN_ACTUALIZAR` para el proyecto, con identificadores estables entre consultas. (F-04, RN-01.28) |
| AC-01.34 | **Given** una alerta `ACTIVIDAD_VENCIDA`, **When** la actividad se completa con resultado (Módulo 4) y el usuario vuelve a `/`, **Then** la alerta ya no aparece y el conteo de K8 baja en 1. (F-04, RN-01.29) |
| AC-01.35 | **Given** un manager (TEAM) con `actividades.ver` y sin `oportunidades.ver`, **When** consulta la bandeja y su resumen, **Then** ve alertas de actividades de su equipo, ninguna de oportunidades, el tipo de oportunidades no aparece en el resumen, y "Asignadas a mí" reduce la lista a las suyas. (F-04, RN-01.31) |
| AC-01.36 | **Given** `crm.alertas.visita_sin_confirmar_horas = "abc"`, **When** se consulta la bandeja, **Then** el tipo `VISITA_SIN_CONFIRMAR` aparece `enabled = false` con `PARAMETER_INVALID`, los demás tipos funcionan y se registra un `warn` con la clave. (F-04, RN-01.30) |

### Transversales

| ID | Criterio |
|---|---|
| AC-01.37 | **Given** una petición sin token o con token inválido, **When** se llama a cualquiera de los 10 endpoints, **Then** responde `401 UNAUTHENTICATED`. (F-01…F-04) |
| AC-01.38 | **Given** datos con contactos y PII, **When** se inspeccionan las respuestas de los 10 endpoints y los logs generados, **Then** no contienen nombre, correo ni teléfono de contactos ni resúmenes en los logs. (F-03, F-04) |
| AC-01.39 | **Given** el contrato OpenAPI generado, **When** se revisa `/api/docs`, **Then** los 10 endpoints aparecen con su permiso, DTO de consulta y respuesta y códigos 400/401/403. (F-01…F-04) |

---

## J. Pruebas funcionales

Niveles según TESTING.md / ADR-013: **U** = unitaria (Jest backend o Vitest/RTL
frontend), **I** = integración backend contra PostgreSQL efímero
(`backend/test/*.e2e.spec.ts`, Supertest), **E2E** = Playwright
(`frontend/tests/e2e/`). Los datos de prueba se crean en cada prueba con
fábricas sobre la base efímera (no dependen de la semilla de demostración).

| ID | Tipo | Nivel | Caso | AC |
|---|---|---|---|---|
| PF-01.1 | Positivo | U (RTL) | Hero muestra nombre, roles, fecha y hora; con temporizador falso, la hora cambia al avanzar 60 s | AC-01.1 |
| PF-01.2 | Positivo | U (RTL) | "Mi acceso" conserva roles, permisos, alcance (`COUNTRY` → "País") y equipos | AC-01.2 |
| PF-01.3 | Positivo | U (RTL) | Accesos rápidos desde `mockApi('/me/menu')`: excluye `/`, CRM primero, máximo 8, enlace correcto | AC-01.3 |
| PF-01.4 | Negativo | U (RTL) | Sin `proyectos.ver`: K1 no se renderiza y no hay petición a `/dashboard/indicators/projects` | AC-01.4 |
| PF-01.5 | Negativo | I | `GET /dashboard/indicators/projects` con usuario sin `proyectos.ver` → 403 | AC-01.4 |
| PF-01.6 | Negativo | U (RTL) | Usuario sin permisos comerciales: aviso y cero peticiones a `/dashboard/*` | AC-01.5 |
| PF-01.7 | Negativo | U (RTL) | Error de `/me/menu`: mensaje con reintento; las tarjetas siguen cargando | AC-01.6 |
| PF-01.8 | Positivo | I | KPI-01: excluye fase final y proyectos eliminados | AC-01.7 |
| PF-01.9 | Positivo | I | KPI-02: conteo y desglose por etapa; excluye oportunidades de proyecto eliminado | AC-01.8 |
| PF-01.10 | Positivo | I | KPI-03: WON + PARTIAL del período; cambio de período mes/año | AC-01.9 |
| PF-01.11 | Positivo | I | KPI-04: oportunidad perdida con 3 productos cuenta 1 | AC-01.10 |
| PF-01.12 | Positivo | U | `forecastWindowMonths` con hoy en octubre, diciembre (cruce de año) y el último día del mes a las 23:30 en `America/Guatemala` (UTC del día siguiente) | AC-01.11 |
| PF-01.13 | Positivo | I | KPI-05: total solo de `tonnage` en la ventana, `unconvertedLines`, cantidades por unidad sin mezclar | AC-01.11 |
| PF-01.14 | Positivo | I | KPI-06/07: pendientes, próximas y atrasadas; la cancelada no cuenta | AC-01.12 |
| PF-01.15 | Positivo | I | KPI-08: pendientes no vencidas y por vencer; completada no cuenta | AC-01.13 |
| PF-01.16 | Positivo | I | KPI-09: vencidas; la cancelada no cuenta; disjunción con KPI-08 | AC-01.14 |
| PF-01.17 | Positivo | I | KPI-10 sin metas → `hasTargets = false`, `items = []` | AC-01.15 |
| PF-01.18 | Positivo | I | KPI-10 con meta `WON_OPPORTUNITIES` → 50.00; objetivo 0 → `compliancePercent = null` | AC-01.15 |
| PF-01.19 | Negativo | U (RTL) | K9 oculta sin `metas.ver`; "Sin metas configuradas" con `hasTargets = false` | AC-01.15 |
| PF-01.20 | Integración | I | Misma base, cuatro usuarios (OWN, TEAM con subequipo, COUNTRY, ORGANIZATION): cada KPI respeta su ámbito; registro de otro país nunca aparece para COUNTRY | AC-01.16 |
| PF-01.21 | Negativo | I | Usuario con alcance `COUNTRY` sin `country_id` → todos los indicadores en 0 y `warn` registrado | AC-01.16 |
| PF-01.22 | Positivo | U (RTL) | `source-routes`/tarjeta: con ruta registrada hay enlace con el filtro de E.3; sin ruta, nota de disponibilidad | AC-01.17 |
| PF-01.23 | Integración | E2E | Asesor demo pulsa K8 → `/actividad/pendientes?state=OVERDUE` muestra el mismo número de filas que la tarjeta | AC-01.17 |
| PF-01.24 | Integración | U | `CommercialMetricsService` es la única implementación de KPI-01…10: prueba de arquitectura (búsqueda en el código) que falla si otro módulo consulta `stage.metadata.isClosed`/`isFinal`/`isOpen` fuera de `metric-definitions.ts`; al existir el Módulo 5, prueba I que compara sus conteos con los de Inicio | AC-01.18 |
| PF-01.25 | Negativo | U (RTL) | K5 con 500: error con reintento y `correlationId`; las otras tarjetas se ven; sin líneas → "Sin proyección" | AC-01.19 |
| PF-01.26 | Negativo | I | `from > to`, rango > 366 días, `period=WEEK`, `from` sin `to` → 400 `VALIDATION_FAILED` | AC-01.20 |
| PF-01.27 | Positivo | U | `resolvePeriod` MONTH/QUARTER/YEAR en la zona de negocio, incluido el 31-dic y el 1-ene | AC-01.9, AC-01.20 |
| PF-01.28 | Positivo | I | Actividad reciente: forma de cada `RecentActivityItemDto`, resumen truncado a 200 | AC-01.21 |
| PF-01.29 | Positivo | I | Composición de D.5 con los seis hechos de AC-01.22; fusión etapa + resultado | AC-01.22 |
| PF-01.30 | Positivo | I | Visita reprogramada ×2 y confirmada aparece una vez; orden descendente; actividad completada de tipo interacción solo como `INTERACCION` | AC-01.23 |
| PF-01.31 | Positivo | I | `/dashboard/upcoming-visits`: orden ascendente, ventana N días, `reminderDue` | AC-01.24 |
| PF-01.32 | Negativo | I | Actividad reciente con solo `actividades.ver` y OWN: ningún evento de otras fuentes ni de otros dueños; sin ningún permiso de fuente → 403 | AC-01.25 |
| PF-01.33 | Negativo | U (RTL) | Panel de actividad: vacío y error | AC-01.26 |
| PF-01.34 | Positivo | I | AL-1 con prioridad del parámetro y campos completos | AC-01.27, AC-01.31 |
| PF-01.35 | Positivo | I | AL-2: umbral de horas (50 h sí, 10 h no); visita confirmada no genera | AC-01.28 |
| PF-01.36 | Positivo | I | AL-3: activo > umbral sí; fase final no; eliminado no | AC-01.29 |
| PF-01.37 | Positivo | I | AL-4: abierta sin acción o con espacios sí; cerrada no; parámetro `false` → tipo `DISABLED_BY_PARAMETER` | AC-01.30 |
| PF-01.38 | Positivo | U (RTL) | Alerta muestra todos los campos y "Abrir" navega (o no hay botón si la ruta no existe) | AC-01.31 |
| PF-01.39 | Integración | I | Cambiar umbral y prioridad con `PATCH /parameters/{key}` y volver a consultar: aplica sin reinicio | AC-01.32 |
| PF-01.40 | Positivo | I | Dos consultas seguidas devuelven los mismos `id` de alerta; una por condición | AC-01.33 |
| PF-01.41 | Integración | I + E2E | I: completar la actividad (vía caso de uso del Módulo 4 o actualización directa en la base de prueba) → la alerta desaparece y KPI-09 baja; E2E: el usuario completa la actividad y al volver a `/` la alerta no está | AC-01.34 |
| PF-01.42 | Negativo | I | Manager TEAM sin `oportunidades.ver`: sin alertas ni tipo de oportunidades; `mine=true` solo las suyas; alerta de un registro fuera del equipo nunca aparece | AC-01.35 |
| PF-01.43 | Negativo | U + I | U: `alert-rules` con valores inválidos, ausentes y JSON de prioridades con código inexistente; I: tipo `PARAMETER_INVALID`, los demás funcionan, `warn` emitido | AC-01.36 |
| PF-01.44 | Integración | I | Rendimiento ligero: con volumen ×100 de la demo, p95 de cada endpoint < 500 ms y número de consultas por petición acotado | H.5 |
| PF-01.45 | Negativo | I | Los 10 endpoints sin token → 401 | AC-01.37 |
| PF-01.46 | Negativo | I | Respuestas sin campos de contactos (búsqueda de correo/teléfono de contactos sembrados en el JSON) y logs capturados sin resúmenes | AC-01.38 |
| PF-01.47 | Positivo | I | El documento OpenAPI incluye los 10 endpoints con permisos y códigos | AC-01.39 |
| PF-01.48 | Integración | E2E | Recorrido: asesor demo entra → ve K1–K8 con cifras, alertas y actividad; usuario `usuario` entra → solo Hero, accesos y aviso | AC-01.1, AC-01.5, AC-01.16 |

---

## K. Dependencias y orden

### K.1 Para empezar Inicio hace falta

| Dependencia | Tipo | Estado esperado |
|---|---|---|
| Fase 0: migraciones 1–8 de 00 §9 (incluida la vista `crm_interactions_v` y `sales_targets`) | Bloqueante | Aplicadas |
| Fase 0: catálogos `crm.*` con su semántica y registro `catalog-semantics.registry.ts` | Bloqueante | Sembrados |
| Fase 0: parámetros `crm.alertas.*`, `crm.forecast.*`, `crm.zona_horaria_negocio` (+ `crm.inicio.visitas_proximas_dias` si se aprueba D-01.5) | Bloqueante | Sembrados |
| Fase 0: permisos `*.ver` y `metas.ver`, roles `asesor`, `manager`, `responsable-pais` | Bloqueante | Sembrados |
| Fase 0: `VisibilityScopeResolver` | Bloqueante | Implementado |
| DM-10 (`COUNTRY`) aplicado en backend y frontend | Bloqueante para la etiqueta "País" | Aplicado |
| DM-12 (alcance `TEAM`) y DM-13 (herencias) | Bloqueante para RN-01.5 | Resueltas (ya lo exige Clientes) |
| Módulos 2, 3 y 4 implementados | Recomendado (orden §11) | Si faltan, degradación de G.3 |
| D-01.1 resuelta | Bloqueante solo para endpoints 8–10 | Si no se aprueba, alternativa de D-01.1 |

### K.2 Orden interno de implementación

1. `commercial-metrics`: `metric-definitions.ts`, `commercial-period.ts`, puerto y adaptador, servicio y pruebas unitarias y de integración (KPI-01…10).
2. `dashboard`: indicadores (endpoints 1–6) + pruebas.
3. Alertas: `alert-rules.ts`, `AlertsReadModel`, endpoints 9–10 + pruebas.
4. Actividad: `DashboardReadModel`, endpoints 7–8 + pruebas.
5. Frontend: feature `dashboard`, evolución de `HomePage`, pruebas RTL.
6. E2E, OpenAPI, documentación (DESIGN-SYSTEM §8f, CHANGELOG, matriz).

### K.3 Dependencias futuras (quién depende de Inicio)

- **Reportes (5)** depende de `CommercialMetricsService` y DEF-A…G (RN-01.10). `05-reportes.md` debe declararlo.
- **Administración (7)**: al construir el mantenimiento de parámetros del CRM, valida rangos de `crm.alertas.*` (si Inicio no los ha añadido ya a `PARAMETER_RANGES`, L.1).
- Si se aprueban descarte de alertas (DM-26), metas con pantalla (DM-9) o notificaciones (DM-27), se amplía este módulo sin cambiar sus fórmulas.

---

## L. Archivos de código a implementar

Rutas reales del repositorio. "Nuevo" = archivo a crear; "Modificar" = existe hoy.

### L.1 Backend

| Archivo | Acción | Contenido |
|---|---|---|
| `backend/src/modules/commercial-metrics/commercial-metrics.module.ts` | Nuevo | Módulo Nest; enlaza el puerto a su adaptador Prisma; **exporta** `CommercialMetricsService` |
| `backend/src/modules/commercial-metrics/commercial-metrics.service.ts` (+ `.spec.ts`) | Nuevo | KPI-01…10 (F.2) |
| `backend/src/modules/commercial-metrics/metric-definitions.ts` (+ `.spec.ts`) | Nuevo | Predicados DEF-A…G (puros, sin Prisma) |
| `backend/src/modules/commercial-metrics/commercial-period.ts` (+ `.spec.ts`) | Nuevo | `resolvePeriod`, ventana M+H, "hoy" en zona de negocio |
| `backend/src/modules/commercial-metrics/ports/commercial-metrics-read-model.port.ts` | Nuevo | `COMMERCIAL_METRICS_READ_MODEL` y tipos de dominio |
| `backend/src/infrastructure/database/prisma/repositories/prisma-commercial-metrics.repository.ts` | Nuevo | Adaptador: consultas agregadas con filtros de ámbito parametrizados |
| `backend/src/modules/dashboard/dashboard.module.ts` | Nuevo | Importa `CommercialMetricsModule`, `PrismaModule`; enlaza `DASHBOARD_READ_MODEL` y `ALERTS_READ_MODEL` |
| `backend/src/modules/dashboard/dashboard.controller.ts` | Nuevo | Endpoints 1–10 con `@RequirePermission` (o D-01.1), decoradores OpenAPI y mapeo a DTO |
| `backend/src/modules/dashboard/dashboard-indicators.service.ts` (+ `.spec.ts`) | Nuevo | Resuelve ámbito y parámetros; delega en `CommercialMetricsService` |
| `backend/src/modules/dashboard/dashboard-activity.service.ts` (+ `.spec.ts`) | Nuevo | Actividad reciente y próximas visitas; filtro por permiso de fuente; deduplicación RN-01.23 |
| `backend/src/modules/dashboard/dashboard-alerts.service.ts` (+ `.spec.ts`) | Nuevo | Bandeja y resumen; filtro por permiso de tipo |
| `backend/src/modules/dashboard/alert-rules.ts` (+ `.spec.ts`) | Nuevo | Lectura y validación de `crm.alertas.*`; resolución de prioridad; RN-01.30 |
| `backend/src/modules/dashboard/ports/dashboard-read-model.port.ts` | Nuevo | `DASHBOARD_READ_MODEL` (00 §11 `DashboardReadModel`) |
| `backend/src/modules/dashboard/ports/alerts-read-model.port.ts` | Nuevo | `ALERTS_READ_MODEL` (00 §11 `AlertsReadModel`) |
| `backend/src/modules/dashboard/dto/dashboard-indicators.dto.ts` | Nuevo | `DashboardPeriodQueryDto` y DTO de respuesta 1–6 |
| `backend/src/modules/dashboard/dto/dashboard-activity.dto.ts` | Nuevo | `UpcomingVisitsQueryDto`, `RecentActivityQueryDto`, `UpcomingVisitDto`, `RecentActivityItemDto`, versiones paginadas |
| `backend/src/modules/dashboard/dto/dashboard-alerts.dto.ts` | Nuevo | `DashboardAlertsQueryDto`, `DashboardAlertDto`, `AlertsSummaryResponseDto` |
| `backend/src/infrastructure/database/prisma/repositories/prisma-dashboard.repository.ts` | Nuevo | Adaptador de `DASHBOARD_READ_MODEL`: `$queryRaw` con plantilla sobre `crm_interactions_v` + historiales, `LIMIT`/`OFFSET` |
| `backend/src/infrastructure/database/prisma/repositories/prisma-alerts.repository.ts` | Nuevo | Adaptador de `ALERTS_READ_MODEL`: AL-1…AL-4 como consultas parametrizadas |
| `backend/src/app.module.ts` | Modificar | Registrar `CommercialMetricsModule` y `DashboardModule` |
| `backend/src/common/decorators/require-any-permission.decorator.ts` + `backend/src/common/guards/permissions.guard.ts` (+ spec) | Nuevo / Modificar | **Solo si se aprueba D-01.1** |
| `backend/src/modules/parameters/parameter-value.ts` (+ spec) | Modificar | Rangos de `crm.alertas.*` y `crm.inicio.visitas_proximas_dias` en `PARAMETER_RANGES`, si no los ha añadido la Fase 0 |
| `backend/prisma/seed/crm-parameters.ts` | Modificar (Fase 0) | `crm.inicio.visitas_proximas_dias = 7` (solo si se aprueba D-01.5; el archivo lo crea la Fase 0) |
| `backend/test/dashboard.e2e.spec.ts` | Nuevo | Integración de los 10 endpoints: 200/400/401/403, ámbitos, alertas, actividad |
| `backend/test/commercial-metrics.e2e.spec.ts` | Nuevo | Integración de KPI-01…10 contra PostgreSQL |

**Menú y rutas:** no se siembra ninguna opción nueva ni se añade ninguna ruta a
`backend/src/modules/access/app-routes.registry.json`: la opción `inicio` (`/`,
pública) ya existe en `backend/prisma/seed/access-catalog.ts` (DM-32).

### L.2 Frontend

| Archivo | Acción | Contenido |
|---|---|---|
| `frontend/src/features/dashboard/README.md` | Nuevo | Convenciones del feature (mismo formato que `features/admin/README.md`) |
| `frontend/src/features/dashboard/dashboard.api.ts` | Nuevo | Llamadas con `httpClient` a los 10 endpoints |
| `frontend/src/features/dashboard/dashboard.types.ts` | Nuevo | Tipos que reflejan los DTO de F.1 |
| `frontend/src/features/dashboard/dashboard.queries.ts` | Nuevo | Hooks TanStack Query con claves `['dashboard', …]`; `staleTime` ≤ 60 s, `refetchOnWindowFocus` (RN-01.29); `enabled` según permiso (RN-01.4) |
| `frontend/src/features/dashboard/dashboard.permissions.ts` | Nuevo | Constantes con los códigos exactos de H.1 |
| `frontend/src/features/dashboard/dashboard-format.ts` (+ spec) | Nuevo | Decimales en texto, toneladas, porcentajes, fechas relativas |
| `frontend/src/features/dashboard/source-routes.ts` (+ spec) | Nuevo | `source.type`/tarjeta → ruta y filtros (E.3, E.7); comprobación con `getShellNavigablePaths()` |
| `frontend/src/features/dashboard/components/HeroCard.tsx` | Nuevo (extraído) | Hero actual + hora en vivo + roles y alcance |
| `frontend/src/features/dashboard/components/AccessSummary.tsx` | Nuevo (extraído) | Las 4 tarjetas actuales de perfil |
| `frontend/src/features/dashboard/components/KpiCard.tsx` (+ spec) | Nuevo (extraído de `StatCard`) | Tarjeta con estados y enlace opcional |
| `frontend/src/features/dashboard/components/KpiGrid.tsx` (+ spec) | Nuevo | K1–K9 y selector de período |
| `frontend/src/features/dashboard/components/TargetsCard.tsx` (+ spec) | Nuevo | K9 |
| `frontend/src/features/dashboard/components/AlertsPanel.tsx` (+ spec) | Nuevo | Resumen, filtros y lista paginada |
| `frontend/src/features/dashboard/components/RecentActivityPanel.tsx` (+ spec) | Nuevo | Línea de tiempo con filtros y "Cargar más" |
| `frontend/src/features/dashboard/components/UpcomingVisitsList.tsx` (+ spec) | Nuevo | Próximas visitas con chip de recordatorio |
| `frontend/src/features/dashboard/components/QuickAccess.tsx` (+ spec) | Nuevo (extraído) | Accesos rápidos y "Todos mis accesos" |
| `frontend/src/routes/pages/HomePage.tsx` | Modificar | Compone los componentes del feature; conserva lo actual (RN-01.6); se elimina el comentario "Sin KPIs de negocio" |
| `frontend/src/routes/pages/HomePage.spec.tsx` | Modificar | Casos de E (permisos, estados, conservación de perfil) |
| `frontend/src/components/layout/MaterialSymbol.tsx` | Modificar (si aplica) | Iconos nuevos usados por tarjetas/alertas |
| `frontend/src/theme/tokens.ts` | Modificar (si aplica) | Tokens semánticos de prioridad de alerta si no existen (ADR-017) |
| `frontend/tests/e2e/dashboard.e2e.spec.ts` | Nuevo | PF-01.23, PF-01.41, PF-01.48 |

`frontend/src/routes/app-routes.tsx` y `route-paths.ts` **no cambian**: la ruta
`/` ya existe (`{ index: true, element: <HomePage /> }`).

### L.3 Documentación

| Archivo | Acción |
|---|---|
| `docs/design/DESIGN-SYSTEM.md` §8f | Actualizar: el panel ya muestra indicadores, alertas y actividad con datos reales |
| `CHANGELOG.md` | Entrada del módulo |
| `docs/implementation-plans/crm/matriz-trazabilidad.md` | Filas F-01…F-04 (lo fusiona el coordinador) |
| OpenAPI | Generado por los decoradores del controlador (sin archivo manual) |

---

## Decisiones pendientes del módulo

### Decisiones de 00 que afectan a Inicio

| ID | Efecto en este módulo | Valor con el que se especifica |
|---|---|---|
| DM-1 | Moneda de la estimación: logrado de metas `AMOUNT` | Monto + moneda; meta `AMOUNT` solo suma oportunidades de su moneda |
| DM-7 | Umbrales y prioridades de alertas | 48 h / 48 h / 30 días / prioridades de 00 §8.2 |
| DM-9 | Metas: existencia, granularidad, carga | Tabla vacía en Fase 0; K9 con "Sin metas configuradas" (RN-01.18) |
| DM-10 | Etiqueta del alcance "País" en Hero y "Mi acceso" | `COUNTRY` |
| DM-12 / DM-13 / DM-14 | Ámbito `TEAM`, herencias, un país por usuario | Valores por defecto de 00 |
| DM-15 | Ganadas = WON + PARTIAL; WON implica 100 % | Valor de 00 (KPI-03, KPI-10) |
| DM-16 | Proyecto activo, estado comercial, última actualización | Valor de 00 (KPI-01, DEF-B, DEF-C, AL-3) |
| DM-20 | Quién confirma visitas (responsable mostrado en AL-2) | Ver D-01.14 |
| DM-22 | Qué es interacción | DEF-F |
| DM-26 | Alertas calculadas, sin descarte | Calculadas |
| DM-27 | Recordatorio de visita como aviso en Inicio | `reminderDue` (RN-01.25) |
| DM-32 | Menú: la opción `inicio` ya existe | Sin opción nueva |

### Decisiones nuevas

| ID | Pregunta | Recomendación por defecto | Impacto |
|---|---|---|---|
| **D-01.1** | ¿Cómo se autorizan los endpoints que mezclan fuentes (actividad reciente, alertas, resumen)? `@RequirePermission` exige **todos** los permisos indicados | Nuevo decorador `@RequireAnyPermission(...)` en `backend/src/common/decorators` + soporte en `PermissionsGuard` (deny-by-default si no tiene ninguno) y filtro por fuente dentro del caso de uso. Es un patrón de autorización nuevo: **addendum a ADR-008** y escalado según CLAUDE.md §11 | Si no se aprueba: se parte en un endpoint por fuente/tipo (`/dashboard/alerts/activities`, `/visits`, `/projects`, `/opportunities` y equivalentes de actividad reciente), cada uno con `@RequirePermission`, y el frontend fusiona y ordena. El alcance funcional no cambia; aumentan peticiones y la paginación de la bandeja pasa a ser por tipo |
| **D-01.2** | ¿Dónde viven las fórmulas compartidas con Reportes? 00 §11 nombra `DashboardReadModel` (Inicio) y `ReportingRepository` (Reportes) por separado | **Resuelta en la consolidación:** módulo `backend/src/modules/commercial-metrics/`; el Módulo 3 crea primero `metric-definitions.ts` (DEF-A/B/C/G, RN-03.77), el Módulo 1 crea `CommercialMetricsModule`/`CommercialMetricsService` y completa los predicados, y Reportes lo consume (05 G.3); `DashboardReadModel` queda para actividad reciente y `AlertsReadModel` para alertas. Precisa 00 §11 (sin cambio de esquema) | Si se prefiere que las fórmulas vivan en Reportes, Inicio no podría implementarse antes que Reportes sin duplicarlas |
| **D-01.3** | Período por defecto de ganadas/perdidas y metas en el panel | Mes en curso (zona de negocio), selector mes / trimestre / año en curso | Solo UI y valor por defecto de la query |
| **D-01.4** | Nombres de los filtros de destino de las tarjetas (`active`, `status=OPEN`, `outcome`, `decisionFrom/To`, `state=PENDING/OVERDUE`) | Los de E.3. **Alineados en la consolidación** con los contratos de los dueños: 03 F.1/F.2 (`active`, `status`, `outcome`, `decisionFrom/To`) y 04 F.1/F.2 (`statusGroup` en `/visits`, `bucket` repetible en `/activities/pending`). Esos listados deben aplicar la **misma** fórmula (servicio compartido) | Si 03/04 eligen otros nombres, solo cambia `source-routes.ts` |
| **D-01.5** | Horizonte de "visitas próximas" | Parámetro nuevo `crm.inicio.visitas_proximas_dias` (NUMBER, 7, rango 1–60), añadido a 00 §8.2 como **propuesto** y a la semilla esencial. Reportes lo reutiliza (D-05.6 resuelta en la consolidación) | Si no se aprueba un parámetro nuevo, constante de 7 días documentada en el código (no configurable) |
| **D-01.6** | ¿"Actividades pendientes" incluye las vencidas? | Disjuntas: pendientes = abiertas no vencidas; vencidas aparte (RN-01.17). Módulo 4 (bandeja) y Módulo 5 (§7.5) usan la misma definición | Si se quieren inclusivas, cambia KPI-08 en el servicio compartido y los textos |
| **D-01.7** | Metas sin configurar: ¿tarjeta oculta o visible con "Sin metas configuradas"? | Visible con el mensaje si el usuario tiene `metas.ver` (recomendación de 00 §2.15); oculta sin el permiso | Solo UI |
| **D-01.8** | Fórmula del "logrado" por métrica y sujeto de la meta según el ámbito | KPI-10 de D.4. Sujeto: OWN → meta del usuario; TEAM → metas de los equipos donde es responsable o miembro principal; COUNTRY → meta de su país; ORGANIZATION → suma de metas de país. El logrado se calcula con el mismo ámbito | Depende de DM-9; si cambia la granularidad, cambia solo `targetCompliance` |
| **D-01.9** | Orden y ventana de la actividad reciente | Pasado descendente (30 días, máx. 90); próximas visitas ascendente en lista separada | Solo consulta y UI |
| **D-01.10** | ¿Qué cambios de proyecto y oportunidad son "relevantes" para el resumen? | Proyecto: alta y cambio de fase/avance. Oportunidad: alta, cambio de etapa, resultado y "actualizada" genérica (RN-01.23). No se usan `audit_logs` (P6 de 00) | Añadir más tipos (p. ej. reasignación de responsable) exigiría historial funcional o leer `audit_logs` |
| **D-01.11** | ¿Una siguiente acción con fecha pasada cuenta como "sin siguiente acción"? | No: AL-4 solo cuando falta el texto. Una acción vencida podría ser una quinta alerta futura | Nueva alerta = nuevo parámetro y nueva regla |
| **D-01.12** | ¿Qué son "funcionalidades frecuentes" en los accesos rápidos? | Las opciones de `/me/menu` de los módulos operativos del CRM primero (máx. 8), sin lista declarada en el frontend (CLAUDE.md §8.11) | Por uso real requeriría registrar navegación en `UserPreference` (fuera de alcance) |
| **D-01.13** | ¿Se excluyen de indicadores los registros cuyo proyecto o cliente está eliminado lógicamente? | Sí (RN-01.13), en la definición compartida con Reportes | Si Reportes debe conservar históricos de proyectos eliminados, la regla cambia en el servicio compartido para ambos |
| **D-01.14** | Responsable que se muestra en la alerta de visita sin confirmar (¿el asesor o quien debe confirmar?) | El dueño de la visita (`visits.owner_id`); la alerta la ve también quien tenga `visitas.ver` en su ámbito (p. ej. el manager que confirma, DM-20) | Si se quiere asignar al confirmador, hace falta una regla para determinarlo (DM-20) |

Ninguna decisión pendiente elimina alcance: todas las funcionalidades F-01…F-04
quedan especificadas con el valor por defecto indicado.

---

## Filas para la matriz

| F-xx | Entidades | Dependencias | AC | PF |
|---|---|---|---|---|
| F-01 | `User`, `Role`, `UserRole`, `TeamMember`, `Team`, `MenuOption`, `AppModule` (vía `GET /me`, `GET /me/menu`) | Núcleo de acceso (existente), DM-10, DM-32, D-01.12 | AC-01.1–AC-01.6, AC-01.37, AC-01.39 | PF-01.1–PF-01.7, PF-01.45, PF-01.47, PF-01.48 |
| F-02 | `Project`, `Opportunity`, `OpportunityResult`, `ForecastLine`, `UnitOfMeasure`, `Visit`, `Activity`, `Customer`, `SalesTarget`, `CatalogItem`, `SystemParameter` | Fase 0, Proyectos (3), Actividad (4), `VisibilityScopeResolver`, Reportes (5) consume `CommercialMetricsService`; DM-9, DM-15, DM-16, D-01.2–D-01.8, D-01.13 | AC-01.7–AC-01.20, AC-01.37, AC-01.39 | PF-01.8–PF-01.27, PF-01.44, PF-01.45, PF-01.47, PF-01.48 |
| F-03 | Vista `crm_interactions_v`, `Activity`, `Visit`, `OpportunityStageHistory`, `OpportunityResultHistory`, `Opportunity`, `Project`, `ProjectPhaseHistory`, `Customer`, `User` | Fase 0 (vista), Actividad (4), Proyectos (3), Clientes (2) para enlaces; DM-22, DM-27, D-01.1, D-01.9, D-01.10 | AC-01.21–AC-01.26, AC-01.37, AC-01.38 | PF-01.28–PF-01.33, PF-01.45, PF-01.46 |
| F-04 | `Activity`, `Visit`, `Project`, `Opportunity`, `Customer`, `User`, `CatalogItem` (`crm.prioridad`), `SystemParameter` (`crm.alertas.*`) | Fase 0 (parámetros), Actividad (4), Proyectos (3), Administración (7) para mantener parámetros; DM-7, DM-20, DM-26, D-01.1, D-01.11, D-01.14 | AC-01.27–AC-01.36, AC-01.37, AC-01.38 | PF-01.34–PF-01.43, PF-01.45, PF-01.46 |
