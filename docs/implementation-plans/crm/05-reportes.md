# 05 — Módulo 5: Reportes

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §7 (7.1–7.8), con §3.2 (indicadores de Inicio que deben coincidir), §5.7–§5.11, §6.2, §6.5, §6.6, §9.2 y §10–§13
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md). Este módulo **solo lee**: no crea tablas, no escribe en entidades comerciales
- **Funcionalidades de la matriz:** F-34 a F-41 ([`matriz-trazabilidad.md`](matriz-trazabilidad.md))
- **Decisiones que lo enmarcan:** [ADR-004](../../adr/ADR-004-data-access-abstraction.md), [ADR-005](../../adr/ADR-005-rest-api-standard.md), [ADR-008](../../adr/ADR-008-authorization.md), [ADR-009](../../adr/ADR-009-material-ui.md), [ADR-015](../../adr/ADR-015-snowflake-analytical-source.md), [ADR-017](../../adr/ADR-017-design-system-grupo-ag.md), [ADR-018](../../adr/ADR-018-identity-access-model.md), [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md), [ADR-022](../../adr/ADR-022-exceljs-para-generar-y-leer-xlsx.md) (`exceljs`), [ADR-023](../../adr/ADR-023-mui-x-charts-community-para-graficas.md) (`@mui/x-charts` Community), [ADR-024](../../adr/ADR-024-moneda-base-usd-y-tipos-de-cambio.md) (moneda base USD); PLAN-ADMIN D13/D14 (exportación y tablas)
- **Estado:** **completado el 2026-10-14** (backend, frontend, E2E y revisión E5 aprobada). Implementado (backend 2026-10-13/14, frontend 2026-10-14) y validado de extremo a extremo con Playwright (PF-05.39, PF-05.40) en el stack aislado el 2026-10-14; las ocho funcionalidades `completada` (ver «Precisiones de implementación — E2E»). Decisiones del módulo resueltas por el responsable de negocio el 2026-10-10. Sin cambios de esquema ni migraciones; dependencias nuevas con ADR: `exceljs` (ADR-022) y `@mui/x-charts` (ADR-023).
- **Skills aplicados:** `requirements-analysis`, `user-story`, `api-design`, `architecture`, `adr`, `authorization`, `security`, `database`, `frontend-react`, `design-system`, `testing`, `documentation`
- **Orden de implementación:** sexto (alcance §11): después de Clientes, Proyectos, Actividad comercial e Inicio.

> **Sin bloqueantes de decisión (2026-10-10).** Las dos dependencias nuevas tienen
> ADR aceptado: `exceljs` para la exportación XLSX (ADR-022, D-05.1) y `@mui/x-charts`
> Community para las gráficas (ADR-023, D-05.2). Las fórmulas compartidas con Inicio
> quedaron aprobadas (DM-15, DM-16, D-05.5, D-05.6, D-05.7). Todo importe se
> expresa en USD (DM-36, ADR-024). Siguen aplicando las dependencias de
> implementación de K.1 (Fase 0 y módulos previos).

---

## A. Objetivo funcional

Dar a asesores, managers, responsables de país y administradores una lectura
**fiable, filtrable y exportable** de la operación comercial registrada en el CRM:
cartera de proyectos, pipeline de oportunidades y sus resultados, forecast M+6,
visitas y actividades, más un tablero analítico y un embudo comercial.

Responsabilidades:

1. Calcular cada indicador con **una única definición**, la misma que usa Inicio
   (§3.2 "los criterios de cálculo deben ser consistentes con el Módulo de Reportes";
   §7 "las fórmulas e indicadores deben ser consistentes con Inicio").
2. Aplicar en **cada** consulta, agregado y exportación el alcance de visibilidad
   del usuario (OWN, TEAM, COUNTRY, ORGANIZATION) y sus permisos.
3. Exportar a Excel el **conjunto completo** filtrado y autorizado, con formatos
   de fecha, número y unidades reales.
4. No modificar ninguna entidad comercial ni duplicar sus datos: Reportes no es
   dueño de ningún registro.

Fuera de responsabilidad: Power BI u otro BI externo (§7), Snowflake (ver D.4),
metas y su mantenimiento (DM-9, Inicio), alertas (Inicio), edición de cualquier dato.

---

## B. Alcance completo

| Funcionalidad | Alcance | Qué se entrega |
|---|---|---|
| **F-34** Reporte de proyectos | §7.1 | Listado con código, nombre, cliente, país, ubicación, asesor, tipo, fase, % de avance, estado comercial, fecha estimada de decisión y última actualización. Filtros, ordenamiento, paginación y navegación a la ficha del proyecto |
| **F-35** Reporte de oportunidades | §7.2 | Listado con proyecto, cliente, asesor, etapa, resultado, estimación (monto original con su moneda y equivalente en USD; totales en USD), fecha de decisión y fecha de actualización. Conteos de abiertas, ganadas, perdidas y parciales; distribución por etapa y por asesor. Filtros por período, asesor, cliente y estado. Criterio explícito de abierta/cerrada. Sin duplicar oportunidades al consultar productos |
| **F-36** Reporte de forecast | §7.3 | Detalle por línea (proyecto, cliente, producto, familia, año, mes, cantidad, unidad, tonelaje, asesor, fecha de actualización). Consolidación por mes, producto, familia, proyecto, cliente y asesor. Totales mensuales y acumulados respetando unidades. Última actualización de las proyecciones |
| **F-37** Reporte de visitas | §7.4 | Listado con cliente, proyecto, asesor, fecha planificada, fecha real, estado, resultado y fecha de confirmación. Filtros por período, asesor, estado, cliente y país. Diferencia programadas, realizadas, confirmadas y canceladas. Visitas reprogramadas contadas una vez |
| **F-38** Reporte de actividades | §7.5 | Listado con tipo, asunto, cliente, proyecto, responsable, fecha, vencimiento, prioridad, estado y resultado. Filtros por período, asesor, estado, cliente y tipo. Conteos de pendientes, realizadas y vencidas |
| **F-39** Exportación a Excel | §7.6 | `.xlsx` real (`exceljs`, ADR-022) de cada uno de los cinco reportes, con los mismos filtros y permisos, encabezados, fechas y números con formato, unidades junto a cada cantidad y el conjunto completo de registros filtrados y autorizados |
| **F-40** Dashboard comercial | §7.7 | Tablero analítico (gráficas con `@mui/x-charts` Community, ADR-023) con proyectos activos, oportunidades por etapa, ganadas vs. perdidas, forecast por mes, distribución por asesor, actividades y visitas, y tendencias de los indicadores disponibles. Filtros por período, país y asesor. Diferenciado del Inicio |
| **F-41** Embudo comercial | §7.8 | Embudo visual con las etapas del pipeline; filtros por etapa, cliente, tipo de cliente, asesor y período; cantidad por etapa y porcentajes solo cuando sean calculables |

Operaciones transversales: opciones de filtro autorizadas (asesores, países y
valores de catálogo visibles para el usuario), navegación al registro de origen
sujeta a permisos y auditoría de cada exportación.

No se excluye nada del §7. Lo que el alcance dejaba abierto quedó resuelto el
2026-10-10 (**Decisiones del módulo**) sin recortar alcance.

---

## C. Reglas de negocio

### C.1 Reglas generales

| ID | Regla |
|---|---|
| RN-05.1 | **Solo lectura.** Ningún endpoint del módulo escribe en tablas comerciales. La única escritura es el registro de auditoría de la exportación (RN-05.43) |
| RN-05.2 | **Fuente única:** PostgreSQL del CRM vía el puerto `ReportingRepository` (00 §11). Sin Snowflake, sin BI externo, sin copias ni tablas de agregados |
| RN-05.3 | **Visibilidad en toda consulta:** filas, conteos, distribuciones, totales, series del dashboard, embudo y exportación se calculan **después** de aplicar el `VisibilityScope` del usuario según la tabla de 00 §4.2 (incluidas las herencias de DM-13). Un registro fuera de alcance no aparece ni suma en ningún número |
| RN-05.4 | **Filtros ∩ alcance:** un filtro nunca amplía el alcance. Filtrar por un asesor o país fuera del alcance devuelve un conjunto vacío (no `403`, para no revelar a quién se puede consultar; las opciones de filtro ya solo ofrecen lo visible) |
| RN-05.5 | **Eliminados lógicos excluidos:** no cuentan clientes, proyectos, oportunidades, productos asociados ni actividades con `deleted_at` no nulo, ni hijos de un proyecto eliminado (D-05.12). Las visitas no tienen borrado (00 §2.10) |
| RN-05.6 | **Semántica por catálogo, nunca por etiqueta ni por UUID** (00 §3.3): abierta/cerrada = `metadata.isClosed`; fase final = `metadata.isFinal`; estados de actividad = `isOpen/isCompleted/isCancelled`; estados de visita = `isPending/isDone/isConfirmed/isCancelled`; embudo = `metadata.inFunnel` + `metadata.order`. Añadir una etapa o estado en el catálogo no requiere desplegar |
| RN-05.7 | **Zona horaria de negocio:** "hoy", límites de día y de mes de los períodos y de las series se calculan en `crm.zona_horaria_negocio` (00 §8.2). "Ahora" para vencimientos es el instante del servidor (las columnas son `timestamptz`) |
| RN-05.8 | **Período:** `from` y `to` son fechas de calendario (`YYYY-MM-DD`) **inclusivas**. Sobre columnas `date` se comparan tal cual; sobre `timestamptz` se traducen a `[from 00:00, to+1 00:00)` en la zona de negocio. `from > to` → `400`. Rango máximo por reporte en RN-05.10 |
| RN-05.9 | **Base de fecha explícita:** cada reporte filtra el período por una columna documentada y seleccionable (`dateBasis`); la tabla de RN-05.10 es el contrato. Todos los números de una pantalla usan el **mismo** conjunto filtrado |
| RN-05.10 | Bases de fecha, valor por defecto y rango máximo (D-05.4): ver tabla C.2 |
| RN-05.11 | **Sin valores inventados:** un indicador sin datos muestra `0` cuando el conteo es real y cero; una tasa o porcentaje sin denominador válido se devuelve `null` con motivo, nunca `0 %` ni `100 %` |
| RN-05.12 | **Unidades nunca mezcladas** (00 §2.3 punto 5): las toneladas se suman solo sobre `tonnage` no nulo; las cantidades se totalizan **agrupadas por unidad**; las líneas sin regla de conversión se informan aparte como "sin conversión" y no entran en el total de toneladas |
| RN-05.13 | **Dinero en USD** (DM-1, DM-36, ADR-024): todo total, agregado, distribución, serie o indicador de montos se calcula sumando `opportunities.estimated_amount_usd` (el equivalente guardado como foto al registrar la estimación) y se rotula en USD (`crm.moneda_base`). **Nunca** se suman montos en monedas distintas ni se reconvierte con la tasa del día. Lo mismo vale para el indicador compartido KPI-10 `AMOUNT` de Inicio (01): las metas de monto son en USD (00 §2.15) y su logrado suma `estimated_amount_usd` de las ganadas (PARTIAL × `awarded_percent` / 100), con la misma definición en `metric-definitions.ts`. La referencia en moneda local es solo de presentación (RN-05.58) |
| RN-05.14 | **Orden determinista:** toda lista se ordena por el campo pedido (lista blanca por reporte) y, como desempate, por `id`. La exportación usa el mismo orden que la pantalla |

### C.2 Bases de fecha por reporte (contrato de `dateBasis`)

| Reporte | `dateBasis` permitidos (columna) | Por defecto | Período por defecto | Rango máximo |
|---|---|---|---|---|
| Proyectos | `DECISION_ESTIMATED` (`projects.estimated_decision_date`), `UPDATED` (`projects.last_activity_at`), `CREATED` (`projects.created_at`) | — (sin período) | Ninguno: cartera completa | 5 años |
| Oportunidades | `IDENTIFIED` (`opportunities.opportunity_date`, DM-35), `DECIDED` (`opportunity_results.decision_date`), `UPDATED` (`opportunities.updated_at`) | `IDENTIFIED` | Ninguno | 5 años |
| Forecast | Período absoluto de la línea (`year`, `month`) con `fromMonth`/`toMonth` = `YYYY-MM` | — | M+1…M+6 (ventana móvil, `crm.forecast.horizonte_meses`) | 24 meses |
| Visitas | `SCHEDULED` (`visits.scheduled_start_at`, la vigente), `ACTUAL` (`visits.actual_start_at`), `CONFIRMED` (`visits.confirmed_at`) | `SCHEDULED` | Mes en curso | 5 años |
| Actividades | `ACTIVITY_DATE` (`COALESCE(scheduled_at, due_at)`), `DUE` (`due_at`), `COMPLETED` (`completed_at`) | `ACTIVITY_DATE` | Mes en curso | 5 años |
| Dashboard | Cada sección declara la suya (E.7) | — | Últimos 12 meses cerrados + mes en curso | 24 meses |
| Embudo | `IDENTIFIED` (cohorte por fecha de identificación) | — | Ninguno ("cuando aplique", §7.8) | 5 años |

Con `dateBasis = DECIDED` solo entran oportunidades con resultado; con `ACTUAL` o
`CONFIRMED` solo visitas con ese dato; con `COMPLETED` solo actividades completadas.
Es consecuencia de la definición, no un filtro oculto, y la pantalla lo indica.

### C.3 Definiciones de métricas (glosario compartido con Inicio)

Todas las definiciones se implementan **una sola vez** en el servicio compartido
de métricas (G.3). Las fórmulas son predicados sobre el universo visible (RN-05.3,
RN-05.5).

**Proyectos**

| ID | Métrica | Definición exacta |
|---|---|---|
| RN-05.15 | Proyecto **activo** | `deleted_at IS NULL` **y** fase con `metadata.isFinal = false` (DM-16). Es independiente de sus oportunidades (§5.7) |
| RN-05.16 | Proyecto **finalizado** | `deleted_at IS NULL` y fase con `metadata.isFinal = true` |
| RN-05.17 | **Estado comercial** del proyecto (columna de F-34) | Derivado (DM-16): si tiene oportunidades abiertas → la etapa abierta de mayor `metadata.order` entre ellas; si no tiene abiertas y alguna tiene resultado `WON` o `PARTIAL` → "Ganado"; si no tiene abiertas y todas las cerradas son `LOST` → "Perdido"; sin oportunidades vigentes → "Sin oportunidades". Se calcula con una subconsulta agregada por proyecto (nunca un `JOIN` que multiplique filas) |
| RN-05.18 | **Última actualización** | `projects.last_activity_at` (00 §2.6, DM-16). La misma columna que usa la alerta de Inicio y Proyectos del equipo |

**Oportunidades**

| ID | Métrica | Definición exacta |
|---|---|---|
| RN-05.19 | Universo | `opportunities.deleted_at IS NULL` y proyecto no eliminado. **Se cuenta sobre `opportunities`** (una fila por oportunidad), nunca sobre el `JOIN` con `project_products`, `opportunity_stage_history` ni `activities` (00 §2.7) |
| RN-05.20 | **Abierta** | Etapa vigente con `metadata.isClosed = false` |
| RN-05.21 | **Cerrada** | Etapa vigente con `metadata.isClosed = true` |
| RN-05.22 | **Ganada** | Cerrada **y** `opportunity_results.outcome ∈ {WON, PARTIAL}` (DM-15: un parcial es una adjudicación, cuenta como ganada) |
| RN-05.23 | **Parcial** | `outcome = PARTIAL`. Subconjunto de las ganadas; se muestra desglosado ("de las cuales parciales") y como conteo propio "Resultados parciales" (§7.2) |
| RN-05.24 | **Ganada total** | `outcome = WON` (implícito 100 %, DM-15) |
| RN-05.25 | **Perdida** | Cerrada y `outcome = LOST` |
| RN-05.26 | **Cerrada sin resultado** | Cerrada y sin fila en `opportunity_results`. Con la regla de DM-15 no debería existir; si existe (dato heredado) se cuenta aquí y **no** como ganada ni perdida, para que cuadre el total |
| RN-05.27 | Invariante de conteos | `abiertas + ganadas + perdidas + cerradas sin resultado = total` (los parciales están dentro de las ganadas). Prueba obligatoria |
| RN-05.28 | **Fecha de decisión** (columna) | `opportunity_results.decision_date` si hay resultado (`decisionDateKind = ACTUAL`); si no, `projects.estimated_decision_date` marcada como estimada (`ESTIMATED`) (00 C7) |
| RN-05.29 | **Estimación** | Por fila: monto original (`estimated_amount`) con su moneda (`currency_code`), tipo de cambio aplicado (`exchange_rate`) y su fecha (`exchange_rate_date`), equivalente en USD (`estimated_amount_usd`) y `estimated_tonnage` (DM-1, DM-36). Totales: suma de `estimated_amount_usd` (RN-05.13) y suma de toneladas estimadas no nulas. El orden por monto usa `estimated_amount_usd` |
| RN-05.30 | Distribución por etapa | Conteo por etapa vigente, todas las etapas activas del catálogo en `metadata.order` (las de conteo 0 incluidas, para no ocultar huecos) |
| RN-05.31 | Distribución por asesor | Por `opportunities.owner_id`: total, abiertas, ganadas (y parciales), perdidas |
| RN-05.32 | Filtro de **estado** | `status` multivalor ∈ `OPEN`, `CLOSED`, `WON`, `PARTIAL`, `LOST`, `CLOSED_NO_RESULT` con las definiciones anteriores; además `stageId` multivalor |

**Forecast**

| ID | Métrica | Definición exacta |
|---|---|---|
| RN-05.33 | Universo | `forecast_lines` de proyectos no eliminados, visibles según 00 §4.2 (dueño = `forecast_lines.owner_id`, país = `projects.country_id`, herencia del proyecto; DM-25/C11). Las líneas con `quantity = 0` son proyecciones retiradas (00 §2.9) y **no** se listan ni cuentan |
| RN-05.34 | Total mensual | Por (año, mes): suma de `tonnage` de las líneas con conversión + lista de `{unidad, suma de quantity}` + número de líneas sin conversión |
| RN-05.35 | Total acumulado | Suma corrida del total mensual de toneladas en orden cronológico dentro del rango filtrado (M+1, M+1..M+2, …). Las cantidades por unidad también se acumulan por unidad |
| RN-05.36 | Consolidación | `groupBy` ∈ `MONTH`, `PRODUCT`, `FAMILY`, `PROJECT`, `CUSTOMER`, `OWNER` (uno o dos niveles, el segundo opcional). Cada grupo devuelve toneladas por mes del rango, total del grupo, cantidades por unidad y líneas sin conversión |
| RN-05.37 | Última actualización | Por línea: `forecast_lines.updated_at`. Del conjunto: `MAX(updated_at)` de las líneas filtradas y visibles |

**Visitas** (una fila por visita, 00 §2.10)

| ID | Métrica | Definición exacta |
|---|---|---|
| RN-05.38 | Categorías de estado (disjuntas, por el estado vigente `visits.status_id`) | **Programada** = `isPending` (incluye el estado REPROGRAMADA); **Realizada** = `isDone` (realizada sin confirmar); **Confirmada** = `isConfirmed`; **Cancelada** = `isCancelled`. `programadas + realizadas + confirmadas + canceladas = total`. "Realizadas en total" = realizadas + confirmadas. Sobre los cinco estados de DM-20 (PROGRAMADA, REPROGRAMADA, REALIZADA, CONFIRMADA, CANCELADA); la confirmación la registra el **propio asesor dueño de la visita** tras la realización (DM-20, `ck_visits_confirmed_by_owner`), y el reporte muestra `confirmed_at` tal cual, sin recalcularla |
| RN-05.39 | **Reprogramadas sin duplicar** | Una visita reprogramada es **una fila**; se cuenta una vez, en el período de su `scheduled_start_at` **vigente**. `visit_events` nunca entra en el `FROM` de un conteo. Indicador informativo (no aditivo): visitas con `reschedule_count > 0` y total de reprogramaciones |
| RN-05.40 | **Pendientes / próximas** (compartido con Inicio §3.2) | Pendiente = `isPending`. Próxima = pendiente con `scheduled_start_at` entre ahora y ahora + horizonte (D-05.6). Pendiente atrasada = pendiente con `scheduled_start_at < ahora` (se muestra, no es un estado) |

**Actividades**

| ID | Métrica | Definición exacta |
|---|---|---|
| RN-05.41 | Categorías (disjuntas, D-05.5) | **Pendiente** = estado `isOpen` y (`due_at IS NULL` o `due_at ≥ ahora`); **Vencida** = `isOpen` y `due_at < ahora` (derivada, 00 C8); **Realizada** = `isCompleted`; **Cancelada** = `isCancelled`. Suma = total. "Abiertas" = pendientes + vencidas. Universo: `deleted_at IS NULL` |
| RN-05.42 | Próximas a vencer (informativo) | Pendiente con `due_at` en `[ahora, ahora + crm.alertas.actividad_por_vencer_horas]` (límite superior **incluido**, mismo parámetro que §6.2 y misma regla que la bandeja del Módulo 4 y KPI-08 de 01; corregido el 2026-10-13, ver Precisiones) |

### C.4 Exportación

| ID | Regla |
|---|---|
| RN-05.43 | Exportar exige `reportes.exportar` **y** `reportes.ver`. Cada exportación correcta deja un registro `crm.report.exported` en `audit_logs` con: reporte, formato, filtros descritos (ids y fechas, sin texto libre de búsqueda más allá de 100 caracteres), alcance aplicado, filas exportadas y duración. Nunca se registran los datos exportados |
| RN-05.44 | La exportación reutiliza **exactamente** la consulta de la pantalla (mismo DTO de filtros, mismo `VisibilityScope`, mismo orden), sin paginación |
| RN-05.45 | **Conjunto completo, sin truncar** (§7.6): antes de escribir el archivo se cuenta el conjunto. Si supera el tope `crm.reportes.max_filas_exportacion` (100 000, D-05.3 resuelta, 00 §8.2) responde `422 EXPORT_TOO_LARGE` con el conteo y el tope; **no** entrega un archivo parcial. Es una desviación consciente del patrón de PLAN-ADMIN (corte en 10 000 con `X-Export-Truncated`), porque aquí el alcance exige el conjunto completo |
| RN-05.46 | Instantánea coherente: conteo y volcado se ejecutan en una transacción `REPEATABLE READ READ ONLY`, leyendo por lotes con *keyset* (orden + `id`), de modo que el archivo contiene exactamente las filas contadas |
| RN-05.47 | Formato: celdas tipadas. Fechas como fecha de Excel (`dd/mm/yyyy`; con hora `dd/mm/yyyy hh:mm`, convertidas a la zona de negocio, indicada en la hoja "Filtros"); cantidades `#,##0.0000`; toneladas `#,##0.000` con encabezado "Tonelaje (t)"; porcentajes como fracción con formato `0.00 %`; montos `#,##0.00` siempre con su moneda en la columna contigua (columnas de monto de RN-05.59); tipo de cambio `#,##0.00000000`; **cada cantidad lleva su columna de unidad al lado**. Encabezados en negrita, fila congelada y autofiltro |
| RN-05.48 | Hojas: 1) datos del reporte; 2) "Resumen" con los mismos conteos y totales de la pantalla (oportunidades, forecast, visitas, actividades); 3) "Filtros" con nombre del reporte, fecha y hora de generación, zona horaria, filtros aplicados en texto legible, alcance (Propios / Equipo / País / Organización) y número de filas |
| RN-05.49 | **Sin fórmulas** (ADR-022): ninguna celda se escribe como fórmula; todo texto se escribe como celda de texto y pasa además por la neutralización existente de `backend/src/common/csv.ts` (apóstrofo delante de `=`, `+`, `-`, `@`, tabulador y CR), de modo que un cliente llamado `=HYPERLINK(...)` queda como texto inerte. Valores con más de 15 dígitos significativos (límite de precisión de Excel) se escriben como texto y se marcan en la hoja "Filtros" |
| RN-05.50 | La exportación no incluye columnas que la pantalla no muestra ni datos personales de contactos (00 §4.5): los reportes del §7 no los tienen |

### C.5 Dashboard y embudo

| ID | Regla |
|---|---|
| RN-05.51 | El dashboard comercial es **analítico** (tendencias, distribuciones, comparación entre asesores y meses, filtros de período/país/asesor). No muestra alertas, accesos rápidos, actividad reciente ni pendientes personales, que son del Inicio operativo (§3), y vive en su propia ruta `/reportes/dashboard` |
| RN-05.52 | **Tendencias** solo de indicadores con fecha histórica fiable, en cubos mensuales: oportunidades identificadas (`opportunity_date`), ganadas y perdidas (`decision_date`), actividades realizadas (`completed_at`), visitas realizadas (`actual_start_at`), forecast por mes (año/mes). "Proyectos activos" se muestra como valor actual y distribución por fase, **sin tendencia** (no hay instantáneas históricas; D-05.13) |
| RN-05.53 | Embudo: etapas activas con `metadata.inFunnel = true` ordenadas por `metadata.order`. Cantidad por etapa = oportunidades del conjunto filtrado cuya etapa **vigente** es esa |
| RN-05.54 | **Porcentaje de participación** de una etapa = cantidad de la etapa / total de oportunidades en etapas del embudo × 100. Se devuelve solo si el total > 0; si no, `null` con motivo `NO_DATA` |
| RN-05.55 | **Conversión acumulada** (alcance) de la etapa k = oportunidades que alcanzaron k / oportunidades que alcanzaron la primera etapa del embudo × 100, donde "alcanzó k" = el mayor `metadata.order` entre las etapas `inFunnel` presentes en su `opportunity_stage_history` (incluida la vigente) es ≥ el `order` de k. Se calcula **solo** si todas las oportunidades del conjunto tienen historial de etapas (el alta crea la primera fila, 00 §2.7) y el denominador ≥ `MIN_FUNNEL_SAMPLE` (D-05.9); si no, `null` con motivo `INSUFFICIENT_HISTORY` o `INSUFFICIENT_SAMPLE` |
| RN-05.56 | El filtro por **etapa** del embudo limita las barras que se muestran, pero los porcentajes se calculan siempre sobre el embudo completo del resto de filtros (si no, dejarían de ser correctos) |
| RN-05.57 | **Tipo de cliente** = `customers.company_type_id` (catálogo `crm.tipo_empresa`) (D-05.8) |

### C.6 Montos y moneda (DM-36, ADR-024)

| ID | Regla |
|---|---|
| RN-05.58 | **Moneda local de referencia** (solo presentación): cuando el conjunto de países efectivo del reporte —filtro `countryId` ∩ alcance del usuario (un usuario `COUNTRY` tiene un solo país)— se reduce a **un único país** cuya moneda (`countries.currency_code`) no es USD, el resumen puede mostrar, junto al total en USD, su equivalente en la moneda local = total USD × la tasa de esa moneda con mayor `effective_date` ≤ **fecha de corte**, obtenida con `ExchangeRateReader.findApplicable(currencyCode, cutDate)` (00 §2.16). Fecha de corte = `to` del período si se indica; si no, hoy en `crm.zona_horaria_negocio`. Se rotula "referencial" y muestra la fecha de vigencia de la tasa usada. No se muestra (con motivo, nunca como error) si hay varios países (`MULTIPLE_COUNTRIES`), si la moneda del país es USD (`BASE_CURRENCY`) o si no hay tasa ≤ fecha de corte (`EXCHANGE_RATE_NOT_FOUND`). Nunca mezcla monedas, nunca sustituye al total en USD y no se usa en ningún indicador, distribución ni comparación. Aritmética decimal en backend, 4 decimales `HALF_UP` |
| RN-05.59 | **Columnas de monto en la exportación** (F-39): toda exportación que incluye la estimación de oportunidades lleva, en este orden, *Monto estimado (original)*, *Moneda*, *Tipo de cambio* (unidades por 1 USD; 1 en USD), *Fecha del tipo de cambio* (vacía en USD) y *Monto estimado (USD)*, seguidas de *Tonelaje estimado (t)*. La hoja "Resumen" totaliza solo en USD y, si aplica RN-05.58, añade la fila "Equivalente referencial en <moneda> (tasa del <fecha>)" claramente separada |

---

## D. Modelo de datos utilizado

### D.1 Entidades propias

**Ninguna.** El módulo no crea tablas, columnas ni vistas en la propuesta por
defecto. Solo añade una fila de parámetro (D.5) y filas de menú (H.3), que son datos.

### D.2 Entidades consumidas (solo lectura)

| Entidad (00) | Uso en Reportes | Columnas clave |
|---|---|---|
| `customers` | Cliente de cada fila, país (visitas/actividades), tipo de cliente (embudo) | `id`, `crm_code`, `legal_name`, `country_id`, `company_type_id`, `sales_owner_id`, `deleted_at` |
| `projects` | F-34; contexto de oportunidades, forecast, visitas y actividades | `code`, `name`, `customer_id`, `country_id`, `city`, `owner_id`, `project_type_id`, `phase_id`, `phase_progress`, `estimated_decision_date`, `last_activity_at`, `created_at`, `deleted_at` |
| `opportunities` | F-35, F-40, F-41 | `code`, `project_id`, `stage_id`, `opportunity_date`, `owner_id`, `estimated_amount`, `currency_code`, `exchange_rate`, `exchange_rate_date`, `estimated_amount_usd`, `estimated_tonnage`, `closed_at`, `updated_at`, `deleted_at` |
| `opportunity_results` | Resultado, motivo, % adjudicado, fecha de decisión | `opportunity_id` (único), `outcome`, `reason_id`, `awarded_percent`, `decision_date` |
| `opportunity_stage_history` | Conversión acumulada del embudo (RN-05.55) | `opportunity_id`, `to_stage_id`, `changed_at` |
| `project_products` | Solo en el filtro opcional por producto/familia del reporte de oportunidades, con `EXISTS` (D-05.10) | `opportunity_id`, `product_id`, `deleted_at` |
| `forecast_lines` | F-36, forecast del dashboard | `project_id`, `product_id`, `year`, `month`, `quantity`, `unit_id`, `tonnage`, `owner_id`, `updated_at` |
| `products`, `product_families`, `units_of_measure` | Etiquetas, consolidación por producto/familia, unidades | `sku`, `description`, `family_id`, `code`, `symbol`, `dimension` |
| `visits` | F-37, dashboard | `code`, `customer_id`, `project_id`, `owner_id`, `status_id`, `scheduled_start_at`, `original_scheduled_at`, `reschedule_count`, `actual_start_at`, `result_id`, `result_summary`, `confirmed_at` |
| `activities` | F-38, dashboard | `code`, `type_id`, `subject`, `customer_id`, `project_id`, `owner_id`, `status_id`, `priority_id`, `scheduled_at`, `due_at`, `result_id`, `result_notes`, `completed_at`, `deleted_at` |
| `catalog_items` / `catalogs` | Etiquetas y semántica (`metadata`) de etapas, fases, tipos, estados, prioridades, resultados | `crm.etapa_oportunidad`, `crm.fase_cliente`, `crm.tipo_proyecto`, `crm.tipo_empresa`, `crm.resultado_oportunidad`, `crm.motivo_resultado`, `crm.estado_visita`, `crm.resultado_interaccion`, `crm.tipo_actividad`, `crm.estado_actividad`, `crm.prioridad` |
| `users`, `team_members`, `teams`, `countries` | Nombre del asesor, resolución del alcance, filtros por país/asesor; `countries.currency_code` para la referencia local (RN-05.58) | vía `VisibilityScopeResolver` (00 §11) |
| `currencies`, `exchange_rates` | Nombre/símbolo de la moneda y tasa vigente a la fecha de corte para la referencia local (RN-05.58) | Solo vía `ExchangeRateReader` (Fase 0, 00 §11); nunca para reconvertir estimaciones guardadas |
| `system_parameters` | Zona horaria, horizonte del forecast, umbral de "por vencer", tope de exportación | `crm.zona_horaria_negocio`, `crm.forecast.horizonte_meses`, `crm.forecast.unidad_tonelaje`, `crm.alertas.actividad_por_vencer_horas`, `crm.reportes.max_filas_exportacion` (D.5), `crm.moneda_base` |
| `audit_logs` | **Escritura** de `crm.report.exported` (único insert del módulo) | `event`, `resource_type = crm.report`, `metadata` |

No se usan: `contacts`, `interaction_participants`, `attachments`, `customer_imports`,
`sales_targets` (las metas son de Inicio, DM-9), `crm_interactions_v` (los reportes
leen visitas y actividades por separado para no mezclar sus columnas).

### D.3 Modelo de lectura

- Puerto `ReportingRepository` (00 §11) para filas paginadas y volcados de exportación;
  puerto `CommercialMetricsReadModel` (G.3) para conteos y agregados compartidos con Inicio.
  Ambos devuelven tipos del módulo, nunca tipos de Prisma (ADR-004).
- Adaptadores en `infrastructure/database/prisma/repositories/`. Listas con el
  cliente de Prisma y `select` explícito; agregados (estado comercial del proyecto,
  distribuciones, embudo, series mensuales) con `$queryRaw` **parametrizado con
  plantilla** (nunca `$queryRawUnsafe`, nunca concatenación), igual que la vista de
  interacciones (00 §2.12).
- Anti-duplicación: todo agregado por oportunidad o visita se hace en una
  subconsulta con `GROUP BY` del padre antes de unirse, o con `EXISTS`; nunca
  `COUNT(*)` sobre un `JOIN` uno-a-muchos (RN-05.19, RN-05.39).
- Tiempo máximo de consulta: `SET LOCAL statement_timeout` de 10 s en pantallas y
  60 s en exportación, dentro de la transacción de lectura.
- **Vistas SQL:** no se proponen. Si el estado comercial del proyecto (RN-05.17)
  resultara costoso o divergente entre Proyectos (§5.4 "filtro por etapa de
  oportunidad") y Reportes, se propondría una vista `crm_project_commercial_status_v`
  **en 00**, no aquí (D-05.15).

### D.4 Snowflake (ADR-015)

**No aplica.** El alcance exige que los reportes se generen con los datos del CRM y
prohíbe BI externo (§7); 00 §11 ya fija `ReportingRepository` sobre PostgreSQL. El
puerto existente `AnalyticsDataProvider` no se usa. Si en el futuro se publicaran
estos datos a Snowflake, sería una integración nueva con su ADR.

### D.5 Parámetros

| `key` | Tipo | Valor | Estado |
|---|---|---|---|
| `crm.reportes.max_filas_exportacion` | NUMBER | `100000` | **Aprobado** (D-05.3 resuelta, 2026-10-10); ya en 00 §8.2 |
| `crm.moneda_base` | STRING | `USD` | Definido en 00 §8.2 (DM-36), de solo lectura; rótulo de todos los importes |
| `crm.inicio.visitas_proximas_dias` | NUMBER | `7` | Definido por Inicio (D-01.5); Reportes lo reutiliza (D-05.6) |

Todos se siembran con la semilla esencial (`seed/crm-parameters.ts`) sin pisar valores.

### D.6 Índices

Los índices de 00 cubren los filtros principales (`idx_opportunities_owner_id_stage_id`,
`idx_opportunity_results_outcome_decision_date`, `idx_forecast_lines_year_month`,
`idx_visits_owner_id_scheduled_start_at`, `idx_activities_owner_id_status_id_due_at`,
`idx_projects_last_activity_at`, `idx_opportunity_stage_history_opportunity_id_changed_at`).
Posibles faltantes, a confirmar con `EXPLAIN` sobre la semilla de demostración ampliada:
`opportunities(opportunity_date)`, `visits(confirmed_at)`, `activities(completed_at)`.
Si hacen falta, se añaden **en 00** como migración aditiva.

---

## E. Pantallas y componentes

### E.1 Comunes a las siete pantallas

- Ubicación: `frontend/src/features/crm/reports/` (área CRM de D-02.11, estructura como
  `features/admin/README.md`). Rutas de 00 §5.3, declaradas en `features/crm/crm-routes.ts`, cargadas con `React.lazy` para que
  `@mui/x-charts` (ADR-023) y la lógica de reportes no pesen en la carga inicial.
- `PageHeader` con migas "Reportes / <Pantalla>". Nada de hex, píxeles ni duraciones
  a mano (CLAUDE.md §8.12; colores de series desde `chartSeries` de `tokens.ts`).
- **Barra de filtros** (`ReportFilterBar`): período (selector de rango con atajos
  "Mes en curso", "Trimestre", "Año en curso", "Últimos 12 meses"), base de fecha
  cuando aplica, asesor, país, cliente (autocompletar) y filtros propios. Los
  filtros viven en la URL (se puede compartir y recargar una vista) con los nombres
  de parámetro de la API. Chips de filtros activos con "Limpiar".
- Las opciones de asesor, país y catálogos salen de `GET /reports/filter-options`
  (nunca listas fijas, alcance §1 regla 8).
- **Tabla:** el `DataTable` existente (PLAN-ADMIN D14, sin librería nueva), con
  paginación, orden y filtros en el servidor y vista de tarjetas por debajo de `sm`.
- **Resumen:** tarjetas de conteo encima de la tabla (oportunidades, visitas,
  actividades, forecast). Cada tarjeta es un botón que aplica el filtro de estado
  correspondiente a la tabla.
- **Exportar a Excel:** botón visible solo con `reportes.exportar`; el archivo lo
  genera el backend con `exceljs` (ADR-022); muestra progreso, descarga con `saveFile`; ante `422 EXPORT_TOO_LARGE` muestra
  "El resultado tiene N filas y el máximo exportable es M. Acota los filtros."
- **Estados de cada pantalla:** cargando (esqueletos), vacío ("No hay registros
  para los filtros seleccionados" + "Limpiar filtros"), error (mensaje de
  `describeApiError` + "Reintentar", con `correlationId`), sin permiso (ruta
  protegida por `reportes.ver`; `AccessDeniedPage`), y "datos sin conversión"
  (aviso en forecast cuando hay líneas sin tonelaje).
- **Navegación al origen:** el código del registro es enlace a su ficha
  (`/proyectos/:id`, `/clientes/:id`, `/actividad/visitas/:id`,
  `/actividad/actividades/:id`) solo si el usuario tiene el permiso `.ver` de esa
  entidad **y** la ruta existe en el router; si no, se muestra como texto.
- Accesibilidad: tablas con encabezados reales, filtros con etiqueta, foco visible,
  objetivos táctiles de 44 px en móvil, cifras con `Intl.NumberFormat('es-GT')`.
- **Importes:** todo total se rotula en USD; donde se muestra un monto concreto
  aparecen el monto original con su moneda y el equivalente en USD (RN-05.13,
  RN-05.29). La referencia en moneda local (RN-05.58) se muestra solo con un país
  efectivo, en texto secundario con la etiqueta "referencial" y la fecha de la tasa.

### E.2 Reporte de proyectos — `/reportes/proyectos` (F-34)

| Elemento | Detalle |
|---|---|
| Columnas | Código (enlace), Nombre, Cliente, País, Ubicación (ciudad), Asesor, Tipo, Fase, % avance (barra + número), Estado comercial (chip con texto), Fecha estimada de decisión, Última actualización |
| Filtros | Búsqueda (código, nombre, cliente), país, ciudad (texto), asesor, cliente, tipo de proyecto, fase, estado comercial (`OPEN_STAGE:<stageId>`, `WON`, `LOST`, `NO_OPPORTUNITIES`), situación (`ACTIVE`, `FINISHED`, `ALL` por defecto), período opcional con base de fecha |
| Orden | `code`, `name`, `customerName`, `countryName`, `ownerName`, `phaseOrder`, `phaseProgress`, `estimatedDecisionDate`, `lastActivityAt` (defecto `lastActivityAt desc`) |
| Exportar | Mismas columnas |

### E.3 Reporte de oportunidades — `/reportes/oportunidades` (F-35)

| Elemento | Detalle |
|---|---|
| Resumen | Total, Abiertas, Ganadas (con "de las cuales parciales: n"; DM-15: un parcial cuenta como ganada), Perdidas, Resultados parciales, Cerradas sin resultado (solo si > 0); **estimación total en USD** y toneladas estimadas; si el filtro se reduce a un país con moneda distinta de USD, debajo "≈ <monto> <moneda> (referencial, tasa del <fecha>)" (RN-05.58) |
| Distribuciones | Por etapa (barras horizontales + tabla) y por asesor (tabla: total, abiertas, ganadas, parciales, perdidas). Gráficas con `@mui/x-charts` Community (ADR-023), cargadas en diferido y con "Ver como tabla" |
| Columnas | Código (enlace), Proyecto, Cliente, Asesor, Etapa, Resultado (con % adjudicado si es parcial y motivo si es perdida), Estimación (monto original + moneda y equivalente en USD; toneladas), Fecha de decisión (con marca "estimada" si aplica), Fecha de actualización |
| Filtros | Período + base de fecha, asesor, cliente, estado (RN-05.32), etapa, país, producto y familia (D-05.10) |
| Orden | `code`, `projectName`, `customerName`, `ownerName`, `stageOrder`, `estimatedAmountUsd` (por el equivalente en USD), `decisionDate`, `updatedAt` (defecto `updatedAt desc`) |
| Exportar | Columnas de pantalla con la estimación desglosada según RN-05.59 (monto original, moneda, tipo de cambio, fecha del tipo de cambio, monto USD, tonelaje) |

### E.4 Reporte de forecast — `/reportes/forecast` (F-36)

| Elemento | Detalle |
|---|---|
| Vistas | Pestañas "Detalle" (una fila por línea) y "Consolidado" (matriz: filas = grupo, columnas = meses del rango + Total) |
| Resumen | Fila de totales mensuales en toneladas, fila de acumulado, cantidades por unidad (una línea por unidad), número de líneas sin conversión, "Última actualización: <fecha y hora>" |
| Columnas (detalle) | Proyecto, Cliente, Producto (SKU + descripción), Familia, Año, Mes, Cantidad, Unidad, Tonelaje (t) ("sin conversión" cuando es nulo), Asesor, Fecha de actualización |
| Consolidación | Selector `Agrupar por` (Mes, Producto, Familia, Proyecto, Cliente, Asesor) y segundo nivel opcional |
| Filtros | Rango de meses (`fromMonth`, `toMonth`, por defecto M+1…M+6), proyecto, cliente, producto, familia, asesor, país |
| Orden (detalle) | `year,month` (defecto asc), `projectName`, `productSku`, `familyName`, `ownerName`, `tonnage`, `updatedAt` |

### E.5 Reporte de visitas — `/reportes/visitas` (F-37)

| Elemento | Detalle |
|---|---|
| Resumen | Programadas, Realizadas (sin confirmar), Confirmadas, Canceladas, Total; informativos: "Reprogramadas: n visitas (m reprogramaciones)", "Pendientes atrasadas: n" |
| Columnas | Código (enlace), Cliente, Proyecto, Asesor, Fecha planificada (vigente; icono con tooltip "Reprogramada n veces, original: <fecha>" si `rescheduleCount > 0`), Fecha real, Estado (chip con texto), Resultado, Fecha de confirmación |
| Filtros | Período + base de fecha, asesor, categoría de estado y/o estado de catálogo, cliente, país, proyecto |
| Orden | `scheduledStartAt` (defecto desc), `actualStartAt`, `confirmedAt`, `customerName`, `ownerName`, `statusOrder` |

### E.6 Reporte de actividades — `/reportes/actividades` (F-38)

| Elemento | Detalle |
|---|---|
| Resumen | Pendientes, Vencidas, Realizadas, Canceladas, Total; informativo "Próximas a vencer: n" |
| Columnas | Código (enlace), Tipo, Asunto, Cliente, Proyecto, Responsable, Fecha, Vencimiento (resaltado con texto "Vencida" si aplica), Prioridad, Estado, Resultado |
| Filtros | Período + base de fecha, asesor, categoría de estado (`PENDING`, `OVERDUE`, `COMPLETED`, `CANCELLED`) y/o estado de catálogo, cliente, tipo de actividad, prioridad, país |
| Orden | `activityDate` (defecto desc), `dueAt`, `priorityWeight`, `customerName`, `ownerName`, `typeName` |

### E.7 Dashboard comercial — `/reportes/dashboard` (F-40)

Filtros: período (defecto últimos 12 meses cerrados + mes en curso, máximo 24),
país y asesor. Cuadrícula responsive (una columna en móvil, dos en `md`, tres en `lg`).
Gráficas con `@mui/x-charts` Community (ADR-023), colores de `chartSeries` del tema,
página cargada con `React.lazy`; ningún componente de las ediciones Pro/Premium.

| Panel | Visualización | Base de fecha / definición |
|---|---|---|
| Proyectos activos | Cifra + barras por fase | Estado actual (RN-05.15); el período no aplica (se indica) |
| Oportunidades por etapa | Barras horizontales en orden de etapa | Etapa vigente de oportunidades identificadas en el período (`IDENTIFIED`) |
| Ganadas vs. perdidas | Barras agrupadas por mes (ganadas con parciales apilados, perdidas) | `decision_date` |
| Forecast por mes | Barras de toneladas por mes + línea de acumulado | Año/mes de la línea; meses del período ∪ M+1…M+6 |
| Distribución por asesor | Barras horizontales: oportunidades abiertas, ganadas y toneladas de forecast por asesor (top 10 + "Otros") | Mismo conjunto que los paneles anteriores |
| Actividades y visitas | Barras agrupadas por mes: actividades realizadas, visitas realizadas (realizadas + confirmadas), visitas canceladas | `completed_at`, `actual_start_at`, `cancelled_at` |
| Tendencias | Líneas mensuales de: oportunidades identificadas, ganadas, perdidas, actividades realizadas, visitas realizadas | RN-05.52 |

Cada gráfica tiene título, leyenda con texto (el color nunca es el único
indicador), tooltip, y un conmutador **"Ver como tabla"** con los mismos datos
(accesibilidad y lectores de pantalla). Cada panel carga y falla por separado
(estado de error por panel). Clic en una barra navega al reporte correspondiente
con el filtro aplicado (p. ej. etapa → reporte de oportunidades filtrado por etapa).

### E.8 Embudo comercial — `/reportes/embudo` (F-41)

- Barras horizontales por etapa del embudo (orden de catálogo), dibujadas con
  `BarChart` en `layout="horizontal"` de `@mui/x-charts` Community (ADR-023; **no**
  el `FunnelChart` de la edición Pro), página cargada con `React.lazy` y
  conmutador "Ver como tabla", con la cantidad en la barra, el % de participación y, si es
  calculable, la conversión acumulada. Cuando un porcentaje es `null` se muestra
  "—" con tooltip del motivo ("Sin datos", "Historial insuficiente", "Muestra
  insuficiente (n < M)").
- Filtros: etapa (multivalor), cliente, tipo de cliente, asesor, país y período
  opcional.
- Tabla equivalente debajo (Etapa, Cantidad, % del embudo, Conversión acumulada).
- Clic en una etapa → reporte de oportunidades filtrado por esa etapa y los mismos filtros.

---

## F. Servicios y contratos

Todos bajo `/api/v1`, autenticados (JWT), con el formato de error de
`API-STANDARDS.md` §8 y `X-Correlation-ID`. Colecciones con `page` (base 1),
`pageSize` (defecto 20, máximo 100), `sortBy` (lista blanca por reporte, E.2–E.6) y
`sortOrder`. Los resúmenes van en endpoints `…/summary` separados para no alterar
la forma estándar `{ data, pagination }`.

### F.1 Operaciones propias

| Método | Ruta | Permiso | Respuesta |
|---|---|---|---|
| GET | `/reports/filter-options` | `reportes.ver` | `ReportFilterOptionsDto` |
| GET | `/reports/projects` | `reportes.ver` | `Paginated<ProjectReportRowDto>` |
| GET | `/reports/projects/export` | `reportes.exportar` + `reportes.ver` | `.xlsx` |
| GET | `/reports/opportunities` | `reportes.ver` | `Paginated<OpportunityReportRowDto>` |
| GET | `/reports/opportunities/summary` | `reportes.ver` | `OpportunityReportSummaryDto` |
| GET | `/reports/opportunities/export` | `reportes.exportar` + `reportes.ver` | `.xlsx` |
| GET | `/reports/forecast` | `reportes.ver` | `Paginated<ForecastReportRowDto>` |
| GET | `/reports/forecast/consolidated` | `reportes.ver` | `Paginated<ForecastGroupDto>` + meses en cada grupo |
| GET | `/reports/forecast/summary` | `reportes.ver` | `ForecastReportSummaryDto` |
| GET | `/reports/forecast/export` | `reportes.exportar` + `reportes.ver` | `.xlsx` (detalle; con `groupBy`, añade hoja "Consolidado") |
| GET | `/reports/visits` | `reportes.ver` | `Paginated<VisitReportRowDto>` |
| GET | `/reports/visits/summary` | `reportes.ver` | `VisitReportSummaryDto` |
| GET | `/reports/visits/export` | `reportes.exportar` + `reportes.ver` | `.xlsx` |
| GET | `/reports/activities` | `reportes.ver` | `Paginated<ActivityReportRowDto>` |
| GET | `/reports/activities/summary` | `reportes.ver` | `ActivityReportSummaryDto` |
| GET | `/reports/activities/export` | `reportes.exportar` + `reportes.ver` | `.xlsx` |
| GET | `/reports/dashboard` | `reportes.ver` | `CommercialDashboardDto` (paneles de estado y distribuciones) |
| GET | `/reports/dashboard/trends` | `reportes.ver` | `CommercialTrendsDto` (series mensuales) |
| GET | `/reports/funnel` | `reportes.ver` | `SalesFunnelDto` |

Las rutas `/export`, `/summary`, `/consolidated` y `/trends` se declaran antes de
cualquier ruta con parámetro (patrón de `users.controller.ts`). Todo es `GET`: no
hay mutaciones (la auditoría de exportación es efecto interno, igual que en
`/users/export` y `/audit-logs/export`).

### F.2 DTOs de consulta (entrada)

Validados con `class-validator` (`whitelist`, `forbidNonWhitelisted`). UUIDs con
`@IsUUID`; multivalores como parámetros repetidos (`ownerId=a&ownerId=b`, máximo 50).

```text
ReportPeriodQueryDto            from?: date (YYYY-MM-DD), to?: date, dateBasis?: enum por reporte
ProjectReportQueryDto           extends PaginationQueryDto + ReportPeriodQueryDto
                                search?, countryId[]?, city?, ownerId[]?, customerId[]?, projectTypeId[]?,
                                phaseId[]?, commercialStatus[]?, situation?: ACTIVE|FINISHED|ALL
OpportunityReportQueryDto       + ReportPeriodQueryDto: ownerId[]?, customerId[]?, countryId[]?,
                                status[]?: OPEN|CLOSED|WON|PARTIAL|LOST|CLOSED_NO_RESULT, stageId[]?,
                                productId[]?, productFamilyId[]?
ForecastReportQueryDto          fromMonth?: YYYY-MM, toMonth?: YYYY-MM, projectId[]?, customerId[]?,
                                productId[]?, productFamilyId[]?, ownerId[]?, countryId[]?
ForecastConsolidatedQueryDto    + groupBy: MONTH|PRODUCT|FAMILY|PROJECT|CUSTOMER|OWNER, thenBy?: (ídem, ≠ groupBy)
VisitReportQueryDto             + ReportPeriodQueryDto: ownerId[]?, customerId[]?, countryId[]?, projectId[]?,
                                statusCategory[]?: SCHEDULED|COMPLETED|CONFIRMED|CANCELLED, statusId[]?
ActivityReportQueryDto          + ReportPeriodQueryDto: ownerId[]?, customerId[]?, countryId[]?, typeId[]?,
                                statusCategory[]?: PENDING|OVERDUE|COMPLETED|CANCELLED, statusId[]?, priorityId[]?
ReportExportQueryDto<T>         = filtros de T SIN page/pageSize + format: 'xlsx' (único valor en v1)
DashboardQueryDto               from?, to?, countryId[]?, ownerId[]?
FunnelQueryDto                  from?, to?, stageId[]?, customerId[]?, companyTypeId[]?, ownerId[]?, countryId[]?
```

### F.3 DTOs de respuesta (selección)

```text
ProjectReportRowDto        id, code, name, customer{id, name}, country{id, name}, city, owner{id, displayName},
                           projectType{id, label}|null, phase{id, label, isFinal}, phaseProgress: "45.00",
                           commercialStatus{kind: OPEN_STAGE|WON|LOST|NO_OPPORTUNITIES, stage{id,label}|null},
                           estimatedDecisionDate: "2026-11-30"|null, lastActivityAt: ISO-8601 UTC
OpportunityReportRowDto    id, code, project{id, code, name}, customer{id, name}, owner{id, displayName},
                           stage{id, label, isClosed}, result{outcome: WON|LOST|PARTIAL, reason{id,label}|null,
                           awardedPercent|null}|null, estimate{amount:"7750.0000"|null, currencyCode:"GTQ"|null,
                           exchangeRate:"7.75000000"|null, exchangeRateDate:"2026-10-01"|null (null si USD),
                           amountUsd:"1000.0000"|null, tonnage:"12.5000"|null}, decisionDate|null, decisionDateKind: ACTUAL|ESTIMATED|null, updatedAt
OpportunityReportSummaryDto total, open, won, wonFull, partial, lost, closedWithoutResult,
                           byStage[{stage{id,label,order,isClosed}, count}],
                           byOwner[{owner{id,displayName}, total, open, won, partial, lost}],
                           estimateTotals{amountUsd:"125000.0000", currencyCode:"USD", tonnage,
                             localReference{currencyCode, amount, exchangeRate, exchangeRateDate, cutDate,
                               label:"referencial"}|null,
                             localReferenceUnavailableReason: MULTIPLE_COUNTRIES|BASE_CURRENCY|EXCHANGE_RATE_NOT_FOUND|null}
ForecastReportRowDto       id, project{id,code,name}, customer{id,name}, product{id,sku,description},
                           family{id,name}, year, month, quantity:"10.0000", unit{id,code,symbol},
                           tonnage:"3.3600"|null, owner{id,displayName}, updatedAt
ForecastGroupDto           key{type, id|null, label}, subgroups?[…], months[{year, month, tonnage, quantities[{unit, quantity}],
                           linesWithoutConversion}], total{tonnage, quantities[], linesWithoutConversion}
ForecastReportSummaryDto   months[{year, month, tonnage, cumulativeTonnage, quantities[{unit, quantity, cumulative}],
                           linesWithoutConversion}], totals{tonnage, quantities[]}, tonnageUnit:"TON",
                           lastUpdatedAt|null, lineCount
VisitReportRowDto          id, code, customer, project|null, owner, scheduledStartAt, originalScheduledAt,
                           rescheduleCount, actualStartAt|null, status{id,label,category}, result{id,label}|null,
                           resultSummary|null, confirmedAt|null
VisitReportSummaryDto      total, scheduled, completed, confirmed, cancelled, completedTotal,
                           rescheduledVisits, rescheduleEvents, overduePending
ActivityReportRowDto       id, code, type{id,label}, subject, customer, project|null, owner, activityDate|null,
                           dueAt|null, priority{id,label,weight}, status{id,label,category}, isOverdue,
                           result{id,label}|null, resultNotes|null
ActivityReportSummaryDto   total, pending, overdue, completed, cancelled, dueSoon
CommercialDashboardDto     period{from,to}, activeProjects{count, byPhase[]}, opportunitiesByStage[],
                           wonLostByMonth[{year,month,won,partial,lost}], forecastByMonth[{year,month,tonnage,cumulative}],
                           byOwner[{owner, openOpportunities, won, forecastTonnage}], activityVisitByMonth[…]
CommercialTrendsDto        series[{metric: OPPORTUNITIES_IDENTIFIED|WON|LOST|ACTIVITIES_COMPLETED|VISITS_COMPLETED,
                           points[{year, month, value}]}]
SalesFunnelDto             stages[{stage{id,label,order}, count, shareOfTotal:"42.86"|null,
                           cumulativeConversion:"60.00"|null, unavailableReason: NO_DATA|INSUFFICIENT_HISTORY|
                           INSUFFICIENT_SAMPLE|null}], totalInFunnel, sampleMinimum
ReportFilterOptionsDto     owners[{id, displayName}] (solo usuarios dentro del alcance con registros comerciales),
                           countries[{id, name}] (dentro del alcance), catalogs{<key>: [{id, code, label, metadata relevante}]},
                           productFamilies[{id, name}], scope: OWN|TEAM|COUNTRY|ORGANIZATION,
                           businessTimeZone, timeZone (aditivos, P-05.27)
```

Decimales como cadena (API-STANDARDS §10), porcentajes con dos decimales,
instantes ISO-8601 UTC, fechas de calendario `YYYY-MM-DD`. Sin modelos de Prisma.

### F.4 Exportación

| Aspecto | Contrato |
|---|---|
| Respuesta | `200`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="reporte-<oportunidades|proyectos|forecast|visitas|actividades>-YYYYMMDD-HHmm.xlsx"`, `X-Export-Rows: <n>`, `X-Export-Truncated: false` (se conserva la cabecera de la casa por compatibilidad; en este módulo nunca es `true`) |
| Generación | En el servidor con `exceljs` (ADR-022) detrás de `common/xlsx.ts`, en *streaming* (`stream.xlsx.WorkbookWriter`, fila a fila hacia la respuesta) para memoria acotada, tras la comprobación de conteo de RN-05.45; celdas de texto neutralizadas (RN-05.49) |
| Tope | `crm.reportes.max_filas_exportacion` (100 000, D-05.3 resuelta). Superado → `422 EXPORT_TOO_LARGE`, `details: [{ rows, maxRows }]` |
| Concurrencia | `@Throttle` en las rutas `/export`: 5 por minuto por usuario; exceso → `429 RATE_LIMIT_EXCEEDED` |
| OpenAPI | `@ApiProduces(xlsx)`, `schema: { type: 'string', format: 'binary' }`, respuestas 400/401/403/422/429 documentadas |

### F.5 Códigos de error

| Status | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_FAILED` (validación; mismo código que 02–04, ver DC-6) | Fecha mal formada, `from > to`, `fromMonth > toMonth`, `sortBy` fuera de lista blanca, `pageSize > 100`, enum inválido, `format ≠ xlsx`, `thenBy = groupBy`, paginación enviada a `/export` |
| 401 | `UNAUTHENTICATED` | Sin token o token inválido |
| 403 | `PERMISSION_DENIED` | Sin `reportes.ver`; o en `/export` sin `reportes.exportar` |
| 422 | `PERIOD_TOO_LONG` | Rango mayor al máximo de C.2 |
| 422 | `EXPORT_TOO_LARGE` | Conjunto mayor al tope de exportación |
| 422 | `INVALID_CATALOG_SEMANTICS` | El catálogo de etapas/estados no cumple los invariantes de 00 §3.3 (p. ej. etapa `inFunnel` sin `order`); protege de resultados incorrectos |
| 429 | `RATE_LIMIT_EXCEEDED` | Exceso de exportaciones |
| 503 | `REPORT_TIMEOUT` | La consulta superó el `statement_timeout`; mensaje "Acota los filtros"; se registra en log con `correlationId` |

Un id de filtro inexistente **no** es error: devuelve conjunto vacío (igual que
fuera de alcance, RN-05.4).

### F.6 Consultas a otros módulos

Reportes **no** llama a los servicios de Clientes, Proyectos ni Actividad: lee las
tablas compartidas por su propio puerto de lectura (00 §11), aplicando las mismas
definiciones a través del servicio de métricas compartido. Sí consume:

| Servicio | Dueño | Uso |
|---|---|---|
| `VisibilityScopeResolver` | Fase 0 | Alcance del usuario → `{ownerIds?, countryIds?}` |
| `CommercialMetricsService` + `CommercialMetricsReadModel` | Compartido Inicio/Reportes (G.3) | Conteos y definiciones |
| `ParameterReader.get<T>(key)` (02 F.6.5) | Fase 0 / módulo `parameters` | Zona horaria, horizonte, tope, umbrales, `crm.moneda_base` |
| `ExchangeRateReader.findApplicable(currencyCode, date)` | Fase 0 (00 §11, ADR-024) | Tasa vigente a la fecha de corte para la referencia en moneda local (RN-05.58); nunca reconvierte estimaciones guardadas |
| `AuditService.record` | Auditoría (existente) | `crm.report.exported` |
| `AccessService.resolveActor` / guardas | Acceso (existente) | Permisos y actor |

---

## G. Relaciones e integraciones internas

### G.1 Qué consume

| Módulo | Información |
|---|---|
| Clientes (2) | Cliente, país, tipo de empresa, responsable |
| Proyectos (3) | Proyectos, fase, clasificación, oportunidades, etapas, resultados, historial de etapas, productos asociados, forecast |
| Actividad comercial (4) | Visitas (estado vigente, fechas, reprogramaciones, confirmación) y actividades |
| Administración (7) | Permisos, alcance, catálogos con semántica, parámetros, auditoría |
| Inicio (1) | Comparte el servicio de métricas (no consume pantallas) |

### G.2 Qué proporciona

- A Inicio: nada directo; ambos consumen el servicio de métricas compartido. Las
  tarjetas de Inicio pueden enlazar al reporte filtrado (`/reportes/oportunidades?status=OPEN`)
  como "consultar los registros relacionados" (§3.2) cuando el usuario tiene `reportes.ver`.
- A Auditoría: eventos `crm.report.exported`.
- Identificadores: siempre los UUID de 00 en filtros y enlaces; los códigos humanos
  (`PRY-…`, `OPO-…`) solo para mostrar.

### G.3 Servicio de métricas compartido (requisito de consistencia)

Inicio (§3.2) y Reportes (§7) **no** pueden tener dos implementaciones de la misma
fórmula. Se exige **un único** componente:

| Pieza | Ubicación propuesta | Contenido |
|---|---|---|
| `CommercialMetricsModule` | `backend/src/modules/commercial-metrics/` | Módulo Nest exportado; lo importan `inicio` y `reports` |
| `metric-definitions.ts` | ídem | Definiciones de C.3 como funciones puras y tipadas sobre la semántica del catálogo (categorizar etapa, resultado, estado de visita y de actividad) — probadas unitariamente |
| `CommercialMetricsService` | ídem | Los métodos de indicadores con la **firma del dueño** (01 F.2: `countActiveProjects`, `countOpenOpportunities`, `countWonOpportunities`, `countLostOpportunities`, `forecastWindow`, `countVisits`, `countActivities`, `targetCompliance`, `resolvePeriod`, `forecastWindowMonths`). Reportes **añade** al mismo servicio sus agregaciones con filtros: `countOpportunities(filter)`, `countProjects(filter)`, `countVisits(filter)`, `countActivities(filter)`, `forecastTotals(filter)`, `stageDistribution(filter)`, `ownerDistribution(filter)`, `funnel(filter)`, `monthlySeries(metric, filter)`. `filter` = `{ scope, period?, dateBasis?, countryIds?, ownerIds?, customerIds?, … }` |
| `CommercialMetricsReadModel` (puerto) | `commercial-metrics/ports/` | Puerto `ports/commercial-metrics-read-model.port.ts` (token `COMMERCIAL_METRICS_READ_MODEL`, 01 L.1); adaptador `prisma-commercial-metrics.repository.ts` |
| `commercial-period.ts` (nombre de 01 L.1) | `commercial-metrics/` | Conversión de períodos y meses a instantes en `crm.zona_horaria_negocio`; ventana M+1…M+6 |

Reglas:

- Las tarjetas de Inicio llaman al mismo método con el mismo filtro que un reporte
  "sin filtros adicionales": **Inicio = Reportes con el alcance del usuario y sin
  período** para abiertas, proyectos activos, pendientes, vencidas y visitas
  pendientes/próximas; para ganadas/perdidas, Inicio usa el período de D-05.7 con
  `dateBasis = DECIDED`, que el reporte reproduce con esos mismos filtros. PF-05.30
  lo verifica.
- Lo crean los módulos anteriores (resuelto en la consolidación): el Módulo 3 crea
  `metric-definitions.ts` con DEF-A/B/C/G y el Módulo 1 crea el módulo y el servicio y
  completa los predicados; los nombres son los de `01-inicio-dashboard.md`: el requisito es
  la implementación única, no el nombre. Reportes no crea una segunda.
- `00` lista `DashboardReadModel` (Inicio) y `ReportingRepository` (Reportes): se
  mantienen para lo específico de cada uno (filas paginadas, actividad reciente,
  alertas); los **conteos e indicadores** salen de `CommercialMetricsReadModel`.
- Un cambio de fórmula se hace en `metric-definitions.ts` y cambia a la vez Inicio
  y Reportes; las pruebas de ambos módulos lo detectan.

### G.4 Comportamiento cuando otro módulo aún no está implementado

| Situación | Comportamiento |
|---|---|
| Tablas sin datos (módulo de origen sin pantallas o sin uso) | Las tablas existen desde la Fase 0: las consultas devuelven vacío y la pantalla muestra el estado vacío; conteos en 0 reales, porcentajes `null` (`NO_DATA`) |
| Ficha de destino no construida (ruta no registrada) | El código se muestra como texto, sin enlace (E.1) |
| Inicio no implementado todavía | Reportes crea `CommercialMetricsModule` (G.3) y 01 lo reutiliza |
| Catálogo con semántica incompleta (registro de 00 §3.3 no desplegado) | `422 INVALID_CATALOG_SEMANTICS` con el catálogo afectado, en lugar de cifras erróneas |
| Librerías de gráficas y XLSX | **Resuelto** (ADR-023, ADR-022, 2026-10-10): F-39, F-40 y F-41 se entregan completas; sin comportamiento degradado |
| Sin tipo de cambio para la referencia local (tasas iniciales aún no cargadas, 00 §8.2) | Se omite la referencia con motivo `EXCHANGE_RATE_NOT_FOUND`; los totales en USD no dependen de ella |
| `VisibilityScopeResolver` de Fase 0 no disponible | El módulo no se habilita: ninguna consulta sin alcance (deny-by-default) |

---

## H. Seguridad

### H.1 Autenticación y autorización

| Operación | Permiso | Alcance | Notas |
|---|---|---|---|
| Ver cualquiera de los 5 reportes, dashboard, embudo, opciones de filtro | `reportes.ver` | Sí, en cada consulta | Por defecto no se exige además el `.ver` de la entidad de origen (D-05.11) |
| Exportar | `reportes.exportar` **y** `reportes.ver` | Sí | Asesor sin exportar por defecto (00 §5.4, DM-11) |
| Navegar a la ficha de origen | `.ver` de la entidad (p. ej. `proyectos.ver`) | Lo aplica el módulo dueño | El enlace solo se muestra con permiso; el backend del dueño vuelve a validar |

- `@RequirePermission` en cada endpoint; los `/export` llevan ambos permisos.
- **Deny-by-default:** sin `VisibilityScope` resuelto no se ejecuta consulta.
- **El alcance se aplica en el repositorio**, como predicado SQL, nunca filtrando
  en memoria después de traer filas (rendimiento y para que los conteos sean correctos).
- `OWN`/`TEAM`/`COUNTRY`/`ORGANIZATION` por entidad según 00 §4.2, incluidas las
  herencias (DM-13): p. ej., una oportunidad de un proyecto visible es visible aunque
  su `owner_id` sea otro; una visita con proyecto visible es visible.
- Ocultar botones es experiencia de usuario; la autoridad es el backend (§9.2 "no
  limitar la seguridad a ocultar botones").

### H.2 Datos y exportación

- Las exportaciones extraen datos en bloque: permiso propio, auditoría de cada una
  (RN-05.43), tope y limitación de frecuencia (F.4).
- Los reportes no contienen PII de contactos; contienen nombres de usuarios internos
  (asesores) y datos de empresa. El log estructurado de la exportación registra
  reporte, filtros (ids), filas y duración, **nunca** el contenido.
- Inyección: filtros validados por DTO; `sortBy` por lista blanca; SQL agregado con
  `$queryRaw` de plantilla (parámetros enlazados); celdas de Excel nunca como fórmula (RN-05.49).
- Búsqueda libre limitada a 100 caracteres y escapada para `ILIKE` (`%`, `_`).
- Dependencias nuevas con ADR aceptado: `exceljs` (ADR-022) y `@mui/x-charts`
  Community (ADR-023). Versión exacta en el lockfile, revisión de licencia y
  `pnpm audit` en el pipeline; `@mui/x-charts-pro` no puede aparecer en `package.json`.

### H.3 Menú

Siete opciones del módulo `reportes` (00 §5.3), todas con `requiredPermission =
reportes.ver`, sembradas **con el módulo** (DM-32) y registradas en
`app-routes.registry.json` y en el router. El menú sigue saliendo de `GET /me/menu`
(ADR-018). Asignar `reportes.ver/exportar` a roles es exclusivo del administrador (ADR-020).

---

## I. Criterios de aceptación

| ID | F | Criterio (Given / When / Then) |
|---|---|---|
| AC-05.1 | F-34 | Dado un usuario con `reportes.ver`, cuando abre `/reportes/proyectos`, entonces ve paginados los proyectos visibles con las 12 columnas de §7.1 y el orden por defecto `lastActivityAt desc` |
| AC-05.2 | F-34 | Dado un proyecto con oportunidades en Contactado y Cotizando, cuando se lista, entonces su estado comercial es la etapa abierta de mayor orden (Cotizando) y el proyecto aparece **una** vez |
| AC-05.3 | F-34 | Dado un filtro combinado (país + fase + asesor + situación ACTIVE), cuando se aplica, entonces solo aparecen proyectos que cumplen todos y no eliminados; con fase final excluidos de ACTIVE |
| AC-05.4 | F-34 | Dado un usuario con `proyectos.ver`, cuando pulsa el código, entonces navega a `/proyectos/:id`; sin ese permiso el código es texto |
| AC-05.5 | F-35 | Dado un conjunto de oportunidades, cuando se consulta el resumen, entonces `open + won + lost + closedWithoutResult = total` y `partial ≤ won` |
| AC-05.6 | F-35 | Dada una oportunidad parcial (60 %), cuando se consulta, entonces cuenta en ganadas y en parciales, y la fila muestra "Parcial 60 %" |
| AC-05.7 | F-35 | Dada una oportunidad con 3 productos asociados, cuando se filtra por una familia de dos de ellos, entonces la oportunidad aparece una vez y cuenta una vez |
| AC-05.8 | F-35 | Dado `dateBasis=DECIDED` y un período, cuando se consulta, entonces solo entran oportunidades con fecha de decisión en el período, y lo indica la pantalla |
| AC-05.9 | F-35 | Dada una oportunidad sin resultado, cuando se lista, entonces la fecha de decisión es la estimada del proyecto marcada "estimada" |
| AC-05.10 | F-35 | Cuando se consulta el resumen, entonces la distribución por etapa incluye todas las etapas activas en orden (también con 0) y la distribución por asesor suma el total |
| AC-05.11 | F-35 | Dadas estimaciones en USD y en GTQ, cuando se consulta el resumen, entonces hay **un solo** total, en USD, igual a la suma de `estimated_amount_usd` (nunca la suma de montos originales), y ninguna cifra mezcla monedas |
| AC-05.12 | F-36 | Dado el reporte de forecast sin filtros, cuando se abre, entonces muestra M+1…M+6 en la zona de negocio, totales mensuales y acumulados en toneladas y la última actualización |
| AC-05.13 | F-36 | Dadas líneas en KG con regla y en VAR sin regla, cuando se totaliza, entonces el total en toneladas solo incluye las convertidas, las cantidades se muestran por unidad y se informa el número de líneas sin conversión |
| AC-05.14 | F-36 | Cuando se consolida por cada uno de Mes, Producto, Familia, Proyecto, Cliente y Asesor, entonces la suma de los grupos coincide con el total del resumen |
| AC-05.15 | F-36 | Dada una línea con cantidad 0, cuando se consulta, entonces no aparece ni cuenta |
| AC-05.16 | F-36 | Dado un rango de meses pasados, cuando se consulta, entonces aparecen las líneas históricas (la ventana móvil no borra historia) |
| AC-05.17 | F-37 | Dadas visitas en los cinco estados, cuando se consulta el resumen, entonces programadas + realizadas + confirmadas + canceladas = total, y REPROGRAMADA cuenta como programada |
| AC-05.18 | F-37 | Dada una visita reprogramada dos veces, cuando se consulta, entonces aparece una vez, con su fecha planificada vigente, en el período de esa fecha y con "reprogramada 2 veces" |
| AC-05.19 | F-37 | Cuando se filtra por país, entonces se usa el país del cliente de la visita |
| AC-05.20 | F-38 | Dadas actividades abiertas con vencimiento pasado y futuro, completadas y canceladas, cuando se consulta el resumen, entonces vencidas y pendientes son disjuntas y la suma de las cuatro categorías es el total |
| AC-05.21 | F-38 | Dada una actividad eliminada lógicamente, cuando se consulta, entonces no aparece ni cuenta |
| AC-05.22 | F-38 | Cuando se filtra por período, asesor, estado, cliente y tipo a la vez, entonces la lista y los conteos usan el mismo conjunto |
| AC-05.23 | F-39 | Dado un usuario con `reportes.exportar`, cuando exporta cualquiera de los cinco reportes con filtros, entonces recibe un `.xlsx` válido con las mismas filas (número, orden y contenido) que la pantalla sin paginar |
| AC-05.24 | F-39 | Cuando abre el archivo, entonces las fechas son fechas de Excel, las cantidades y toneladas son números con formato, cada cantidad tiene su unidad al lado, hay encabezados y hojas "Resumen" y "Filtros" |
| AC-05.25 | F-39 | Dado un usuario OWN, cuando exporta, entonces el archivo contiene solo sus registros (y heredados visibles) |
| AC-05.26 | F-39 | Dado un conjunto mayor que el tope, cuando exporta, entonces recibe `422 EXPORT_TOO_LARGE` con el conteo, sin archivo parcial |
| AC-05.27 | F-39 | Cuando exporta con éxito, entonces existe un `audit_logs` `crm.report.exported` con reporte, filtros, alcance y filas |
| AC-05.28 | F-39 | Dado un usuario con `reportes.ver` sin `reportes.exportar`, cuando llama a `/export`, entonces `403` y no ve el botón |
| AC-05.29 | F-39 | Dado un texto que empieza por `=`, `+`, `-` o `@`, cuando se exporta, entonces la celda es de texto, neutralizada con apóstrofo (ADR-022), y no fórmula |
| AC-05.30 | F-40 | Cuando abre `/reportes/dashboard`, entonces ve los siete paneles de E.7 con los filtros período/país/asesor, sin alertas ni accesos rápidos del Inicio |
| AC-05.31 | F-40 | Dado un filtro de asesor, cuando se aplica, entonces todos los paneles se recalculan con ese asesor y dentro del alcance |
| AC-05.32 | F-40 | Cuando un panel falla, entonces solo ese panel muestra error y "Reintentar" |
| AC-05.33 | F-40 | Cada gráfica tiene "Ver como tabla" con los mismos valores y leyenda con texto |
| AC-05.34 | F-40 | El panel de proyectos activos no muestra tendencia y lo indica |
| AC-05.35 | F-41 | Cuando abre el embudo, entonces ve las etapas `inFunnel` en orden con su cantidad |
| AC-05.36 | F-41 | Dado un conjunto vacío, entonces los porcentajes son "—" con motivo "Sin datos", nunca 0 % |
| AC-05.37 | F-41 | Dada una oportunidad sin historial de etapas en el conjunto, entonces la conversión acumulada es `null` con motivo `INSUFFICIENT_HISTORY` y la participación sí se calcula |
| AC-05.38 | F-41 | Cuando filtra por una etapa, entonces se muestra solo esa barra con el porcentaje del embudo completo |
| AC-05.39 | F-41 | Cuando filtra por tipo de cliente, entonces se usa `crm.tipo_empresa` del cliente del proyecto |
| AC-05.40 | Todas | Dado un usuario sin `reportes.ver`, cuando llama a cualquier endpoint, entonces `403`; sin token, `401` |
| AC-05.41 | Todas | Dados usuarios OWN, TEAM, COUNTRY y ORGANIZATION, cuando consultan el mismo reporte, entonces cada uno ve y cuenta solo lo de su alcance, y la suma de los OWN de un equipo coincide con el TEAM de su manager (sin herencias cruzadas) |
| AC-05.42 | Todas | Dados los mismos filtros, las cifras de Inicio (proyectos activos, abiertas, ganadas, perdidas, forecast M+6, visitas pendientes/próximas, actividades pendientes/vencidas) coinciden con las del reporte correspondiente |
| AC-05.43 | Todas | Ninguna operación del módulo modifica filas de tablas comerciales (verificado comparando conteos y `updated_at` antes/después) |
| AC-05.44 | F-35 | Dada una oportunidad en GTQ (7 750 a tasa 7,75 del 2026-10-01) y otra en USD, cuando se listan, entonces cada fila muestra el monto original con su moneda y el equivalente en USD (1 000,00 y el propio monto), y `sortBy=estimatedAmountUsd` ordena por el equivalente en USD |
| AC-05.45 | F-35 | Dado un filtro que se reduce a Guatemala (o un usuario `COUNTRY` de Guatemala) y una tasa GTQ con vigencia ≤ la fecha de corte, cuando se consulta el resumen, entonces junto al total en USD aparece su equivalente en GTQ rotulado "referencial" con la fecha de la tasa; con dos países, con El Salvador o Ecuador (moneda USD) o sin tasa ≤ fecha de corte, no aparece y `localReferenceUnavailableReason` es `MULTIPLE_COUNTRIES`, `BASE_CURRENCY` o `EXCHANGE_RATE_NOT_FOUND` |
| AC-05.46 | F-39 | Cuando se exporta el reporte de oportunidades, entonces cada fila trae, en este orden, monto original, moneda, tipo de cambio, fecha del tipo de cambio (vacía en USD) y monto en USD como celdas tipadas, y la hoja "Resumen" totaliza solo en USD (con la fila referencial separada si aplica RN-05.58) |
| AC-05.47 | F-40, F-41 | Cuando se abren el dashboard y el embudo, entonces las gráficas son de `@mui/x-charts` Community cargadas en diferido (no están en el *bundle* inicial), el embudo se dibuja como barras horizontales (sin `FunnelChart` Pro) y cada gráfica ofrece "Ver como tabla" |

---

## J. Pruebas funcionales

Unitarias (Jest/Vitest), integración contra base efímera (`backend/test/support/integration-database.ts`),
E2E Nest (`backend/test/*.e2e.spec.ts`) y E2E de navegador (Playwright).
Datos: semilla de demostración + *fixtures* por prueba.

| ID | Tipo | Caso | Resultado esperado | AC |
|---|---|---|---|---|
| PF-05.1 | Unit | `metric-definitions`: categorizar etapas abiertas/cerradas y resultados, incluida etapa nueva `NEGOCIANDO` (`isClosed=false`) añadida al catálogo | Categoría correcta sin cambiar código | AC-05.5 |
| PF-05.2 | Unit | Invariante de conteos con combinaciones de WON/PARTIAL/LOST/sin resultado | Se cumple RN-05.27 | AC-05.5 |
| PF-05.3 | Unit | `commercial-period`: límites de mes y M+1…M+6 en `America/Guatemala` el último día del mes a las 23:30 local | Ventana del mes local, no UTC | AC-05.12 |
| PF-05.4 | Unit | Estado comercial (RN-05.17) en los 4 casos | Valor correcto en cada caso | AC-05.2 |
| PF-05.5 | Unit | Embudo: participación, conversión acumulada, `NO_DATA`, `INSUFFICIENT_HISTORY`, `INSUFFICIENT_SAMPLE` | Valores y motivos correctos; nunca `0 %` sin denominador | AC-05.36, AC-05.37 |
| PF-05.6 | Unit | Escritor XLSX (`common/xlsx.ts` sobre `exceljs`): tipos de celda, formatos, textos `=1+1`, `+A1`, `-2`, `@SUM`, número de 16 dígitos | Fecha tipada, número con `numFmt`, textos neutralizados con apóstrofo y como celda de texto, número largo como texto | AC-05.24, AC-05.29 |
| PF-05.7 | Integración | Proyecto con 2 oportunidades y 4 productos: reporte de proyectos | Una fila por proyecto | AC-05.2 |
| PF-05.8 | Integración | **No duplicar al unir productos:** oportunidad con 3 productos, filtro por familia | Lista y conteo = 1 | AC-05.7 |
| PF-05.9 | Integración | Oportunidad PARTIAL 60 % | Cuenta en `won` y `partial`, no en `lost` | AC-05.6 |
| PF-05.10 | Integración | Cada `dateBasis` de oportunidades con fechas en el borde del período | Inclusividad de `from` y `to` correcta | AC-05.8 |
| PF-05.11 | Integración | Distribuciones por etapa y asesor | Suman el total; etapas con 0 presentes | AC-05.10 |
| PF-05.12 | Integración | Totales con oportunidades en USD y GTQ | Un único total en USD = Σ `estimated_amount_usd`; ningún total por moneda original | AC-05.11 |
| PF-05.13 | Integración | Forecast con KG (regla), TON (identidad) y VAR (sin regla) | Toneladas = KG×factor + TON; VAR en "sin conversión"; cantidades por unidad | AC-05.13 |
| PF-05.14 | Integración | Consolidaciones (6 `groupBy` + `thenBy`) | Suma de grupos = total del resumen; acumulado correcto | AC-05.14 |
| PF-05.15 | Integración | Línea con cantidad 0 y líneas de meses pasados | 0 excluida; pasadas visibles con rango pasado | AC-05.15, AC-05.16 |
| PF-05.16 | Integración | **Visita reprogramada contada una vez:** 2 eventos `RESCHEDULED`, original en el mes anterior | Una fila, en el mes de la fecha vigente; `rescheduledVisits=1`, `rescheduleEvents=2` | AC-05.18 |
| PF-05.17 | Integración | Visitas en los 5 estados | Suma de categorías = total; REPROGRAMADA en programadas | AC-05.17 |
| PF-05.18 | Integración | Filtro por país en visitas y actividades | Usa `customers.country_id` | AC-05.19 |
| PF-05.19 | Integración | Actividades: vencida (ayer), pendiente (mañana), sin vencimiento, completada, cancelada, eliminada | Categorías disjuntas; eliminada fuera | AC-05.20, AC-05.21 |
| PF-05.20 | E2E Nest | Cada endpoint: `401` sin token, `403` sin `reportes.ver`, `200` con permiso | Según contrato | AC-05.40 |
| PF-05.21 | E2E Nest | `/export` con `reportes.ver` sin `reportes.exportar` | `403` | AC-05.28 |
| PF-05.22 | E2E Nest | **Visibilidad:** asesor A (OWN), asesor B (OWN, mismo equipo), manager (TEAM), responsable de país (COUNTRY de GT), administrador, sobre lista, resumen, dashboard, embudo y exportación | Cada uno solo su alcance; A + B = manager en proyectos propios; COUNTRY no ve SV; herencia DM-13 respetada | AC-05.25, AC-05.41 |
| PF-05.23 | E2E Nest | Filtro por asesor fuera del alcance | `200` con conjunto vacío | AC-05.41 |
| PF-05.24 | E2E Nest | Exportación de los cinco reportes: abrir el `.xlsx` con la propia librería en la prueba | Filas = conteo de la pantalla, mismo orden, formatos y hojas Resumen/Filtros | AC-05.23, AC-05.24 |
| PF-05.25 | E2E Nest | Exportación con tope bajado por parámetro (p. ej. 5) y 6 filas | `422 EXPORT_TOO_LARGE`, `details.rows=6`; sin auditoría de éxito | AC-05.26 |
| PF-05.26 | E2E Nest | Exportación correcta | `audit_logs` con `crm.report.exported`, filtros, alcance, filas | AC-05.27 |
| PF-05.27 | E2E Nest | Validación: `from > to`, rango > máximo, `sortBy` no permitido, `pageSize=101`, `format=csv`, `page` en `/export` | `400` o `422 PERIOD_TOO_LONG` según F.5 | — |
| PF-05.28 | E2E Nest | Sexta exportación en un minuto | `429` | — |
| PF-05.29 | E2E Nest | Solo lectura: snapshot de conteos y `max(updated_at)` de tablas comerciales antes y después de llamar a todos los endpoints | Sin cambios (salvo `audit_logs`) | AC-05.43 |
| PF-05.30 | Integración | **Consistencia Inicio vs Reportes:** para cada usuario de PF-05.22, comparar cada tarjeta de Inicio con el reporte equivalente (mismos filtros y período de D-05.7) | Valores idénticos | AC-05.42 |
| PF-05.31 | Integración | Cambiar el catálogo (desactivar una etapa, añadir una `inFunnel`) | Reportes e Inicio cambian a la vez | AC-05.42 |
| PF-05.32 | Integración | Catálogo de etapas con `inFunnel` sin `order` | `422 INVALID_CATALOG_SEMANTICS` | — |
| PF-05.33 | Integración | Proyecto eliminado lógicamente con oportunidad cerrada, forecast y actividad | Nada de ese proyecto aparece ni cuenta | AC-05.21 |
| PF-05.34 | Front (RTL) | Barra de filtros: estado en URL, recarga conserva filtros, "Limpiar" | Filtros persistidos y limpiados | AC-05.22 |
| PF-05.35 | Front (RTL) | Botón Exportar oculto sin permiso; mensaje de `EXPORT_TOO_LARGE` | Oculto; mensaje en español con N y M | AC-05.26, AC-05.28 |
| PF-05.36 | Front (RTL) | Cuatro estados (cargando, vacío, error con reintento, sin permiso) en las siete pantallas | Presentes | AC-05.32 |
| PF-05.37 | Front (RTL) | Enlaces al origen según permiso y ruta existente | Enlace o texto según corresponda | AC-05.4 |
| PF-05.38 | Front (RTL) | Gráficas: "Ver como tabla" con los mismos valores; porcentaje `null` → "—" con motivo | Coincidencia exacta | AC-05.33, AC-05.36 |
| PF-05.39 | Playwright | Manager filtra el reporte de oportunidades, abre el embudo desde el dashboard y exporta | Navegación con filtros aplicados; descarga `.xlsx` | AC-05.23, AC-05.30, AC-05.35 |
| PF-05.40 | Playwright | Asesor: menú muestra Reportes sin botón Exportar; móvil 400 px sin scroll horizontal | Correcto | AC-05.28 |
| PF-05.41 | Rendimiento (integración) | Semilla ampliada (50 000 oportunidades, 200 000 líneas de forecast): reporte y exportación de 100 000 filas | Pantallas < 2 s p95; exportación < 60 s con memoria acotada (streaming) | AC-05.23 |
| PF-05.42 | Integración | Oportunidades en GTQ y USD: filas y orden `estimatedAmountUsd` | Cada fila con monto original, moneda, tasa, fecha y USD; orden por USD | AC-05.44 |
| PF-05.43 | Integración | Referencia local: filtro a GT con tasa ≤ corte; GT sin tasa; GT + HN; SV; usuario `COUNTRY` de GT sin filtro | Referencia solo en el primer y el último caso, con la tasa de mayor vigencia ≤ fecha de corte; en los demás, `null` con el motivo correcto | AC-05.45 |
| PF-05.44 | Unit | Cálculo de la referencia: total USD × tasa con aritmética decimal, 4 decimales `HALF_UP`; fecha de corte = `to` o hoy en la zona de negocio | Valores exactos; nunca `number` flotante | AC-05.45 |
| PF-05.45 | E2E Nest | Exportación de oportunidades abierta con `exceljs` en la prueba | Columnas de monto de RN-05.59 en orden y tipadas; "Resumen" solo en USD (+ fila referencial con un país) | AC-05.46 |
| PF-05.46 | Front (RTL) | Resumen de oportunidades con y sin `localReference` | Total en USD siempre; referencia en texto secundario con "referencial" y fecha solo si viene | AC-05.45 |
| PF-05.47 | Front (RTL) + arquitectura | Dashboard y embudo: páginas lazy, embudo con `BarChart` horizontal, "Ver como tabla"; prueba que falla si se importa `@mui/x-charts-pro` o `FunnelChart` | Correcto | AC-05.47 |

---

## K. Dependencias y orden

### K.1 Necesita para funcionar

1. **Fase 0** (00): esquema CRM migrado, catálogos con semántica y registro de
   invariantes (00 §3.3), parámetros, permisos `reportes.ver/exportar`,
   `VisibilityScopeResolver`, `ExchangeRateReader` y la semilla de monedas, países con
   su moneda y tipos de cambio (DM-36, ADR-024), `DataScope.COUNTRY` (DM-10).
2. **Decisiones:** todas resueltas el 2026-10-10 — DM-15, DM-16 (fórmulas), DM-13
   (herencias), DM-12 (alcance TEAM), DM-25 (visibilidad del forecast), DM-36 (USD),
   D-05.4 a D-05.7 (compartidas con Inicio). Ya no bloquean.
3. **Librerías:** `exceljs` (ADR-022) para F-39 y `@mui/x-charts` Community (ADR-023)
   para las visualizaciones de F-35, F-40 y F-41, ambas con ADR aceptado; se
   incorporan con versión exacta y `pnpm audit` en verde (gate de ADR-022).
4. Datos de los módulos 2, 3 y 4 (por el orden §11 ya implementados) y el servicio
   de métricas compartido de Inicio (G.3).

### K.2 Orden interno propuesto

1. Ampliar `commercial-metrics` (creado por los módulos 3 y 1) con las agregaciones de Reportes + pruebas de definiciones.
2. `ReportingRepository` + reportes de oportunidades y proyectos (F-35, F-34).
3. Forecast (F-36), visitas (F-37), actividades (F-38).
4. Opciones de filtro y pantallas de tablas.
5. Exportación XLSX (F-39) con `exceljs` (ADR-022).
6. Dashboard (F-40) y embudo (F-41) con `@mui/x-charts` Community (ADR-023).
7. Menú/rutas, E2E, OpenAPI, documentación.

### K.3 Dependencias futuras

- Integraciones (6): los clientes importados aparecen sin cambios.
- Administración (7): cambios de catálogos/parámetros se reflejan sin despliegue;
  si se crea la pantalla de metas (DM-9), el dashboard podría añadir cumplimiento
  (fuera del §7.7 actual).
- Exportación asíncrona para conjuntos mayores que el tope (D-05.14).

---

## L. Archivos de código a implementar

### L.1 Backend

| Archivo | Acción |
|---|---|
| `backend/src/modules/commercial-metrics/commercial-metrics.module.ts` | Crear (o reutilizar el de Inicio, G.3) |
| `backend/src/modules/commercial-metrics/metric-definitions.ts` + `.spec.ts` | Crear |
| `backend/src/modules/commercial-metrics/commercial-metrics.service.ts` + `.spec.ts` | Crear |
| `backend/src/modules/commercial-metrics/commercial-period.ts` + `.spec.ts` | Reutilizar (creado por el Módulo 1) |
| `backend/src/modules/commercial-metrics/ports/commercial-metrics-read-model.port.ts` | Modificar: añadir las consultas de agregación de Reportes |
| `backend/src/modules/reports/reports.module.ts` | Crear; registrar en `backend/src/app.module.ts` |
| `backend/src/modules/reports/ports/reporting.repository.port.ts` | Crear (`ReportingRepository`, 00 §11) |
| `backend/src/modules/reports/project-report.controller.ts` / `.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/opportunity-report.controller.ts` / `.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/forecast-report.controller.ts` / `.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/visit-report.controller.ts` / `.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/activity-report.controller.ts` / `.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/dashboard.controller.ts` / `dashboard.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/funnel.controller.ts` / `funnel.service.ts` (+ `.spec.ts`) | Crear |
| `backend/src/modules/reports/filter-options.controller.ts` / `.service.ts` | Crear |
| `backend/src/modules/reports/report-export.service.ts` (+ `.spec.ts`) | Crear: conteo, tope, transacción de lectura, auditoría |
| `backend/src/modules/reports/report-columns.ts` | Crear: columnas de cada reporte (encabezado, tipo, formato), compartidas por pantalla y exportación; incluye las columnas de monto de RN-05.59 |
| `backend/src/modules/reports/local-currency-reference.ts` (+ `.spec.ts`) | Crear: país efectivo, fecha de corte y equivalente referencial sobre `ExchangeRateReader` (RN-05.58) |
| `backend/src/modules/reports/dto/*.dto.ts` | Crear (F.2, F.3) |
| `backend/src/common/xlsx.ts` + `xlsx.spec.ts` | Crear: envoltorio sobre `exceljs` (ADR-022): escritor en *streaming* (`stream.xlsx.WorkbookWriter`), tipos de celda, formatos, sin fórmulas y neutralización de `common/csv.ts`; ninguna otra pieza importa la librería directamente (la lectura para 06 se añade en el mismo archivo) |
| `backend/src/infrastructure/database/prisma/repositories/prisma-reporting.repository.ts` | Crear |
| `backend/src/infrastructure/database/prisma/repositories/prisma-commercial-metrics.repository.ts` | Modificar (creado por el Módulo 1) |
| `backend/src/modules/access/app-routes.registry.json` | Modificar: 7 rutas `/reportes/*` |
| `backend/prisma/seed/access-catalog.ts` | Modificar: módulo `reportes` y sus 7 opciones (DM-32); permisos ya sembrados en Fase 0 |
| `backend/prisma/seed/crm-parameters.ts` | Modificar: `crm.reportes.max_filas_exportacion` (y D-05.6 si aplica) |
| `backend/package.json` | Modificar: `exceljs` con versión exacta (ADR-022), si 06 no la incorporó antes |

### L.2 Frontend

| Archivo | Acción |
|---|---|
| `frontend/src/features/crm/reports/README.md` | Crear: convenciones del área (como `features/admin/README.md`) |
| `frontend/src/features/crm/crm-routes.ts` | Modificar: rutas `/reportes/*` + `reportes.ver` + páginas lazy (D-02.11) |
| `frontend/src/features/crm/reports/reports.permissions.ts` | Crear: `reportes.ver`, `reportes.exportar` |
| `frontend/src/features/crm/reports/common/ReportFilterBar.tsx`, `PeriodPicker.tsx`, `SummaryCards.tsx`, `ExportButton.tsx`, `ChartPanel.tsx` (con "Ver como tabla"), `report-format.ts`, `use-report-query-state.ts` (+ `.spec.tsx`) | Crear |
| `frontend/src/features/crm/reports/filter-options.api.ts` / `.queries.ts` | Crear |
| `frontend/src/features/crm/reports/projects/ProjectsReportPage.tsx`, `projects-report.api.ts`, `.queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/opportunities/OpportunitiesReportPage.tsx`, `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/forecast/ForecastReportPage.tsx`, `ForecastConsolidatedTable.tsx`, `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/visits/VisitsReportPage.tsx`, `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/activities/ActivitiesReportPage.tsx`, `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/dashboard/CommercialDashboardPage.tsx`, paneles, `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/features/crm/reports/funnel/SalesFunnelPage.tsx`, `FunnelChart.tsx` (barras horizontales con `BarChart` de `@mui/x-charts` Community, ADR-023), `…api.ts`, `…queries.ts` (+ spec) | Crear |
| `frontend/src/routes/route-paths.ts` | Modificar: `ROUTE_PATHS.reports.*` |
| `frontend/src/routes/app-routes.tsx` | Sin cambios si ya incorpora `crm-routes` (lo hace el Módulo 2) |
| `frontend/src/components/layout/MaterialSymbol.tsx` | Modificar si falta `bar_chart` |
| `DataTable`, `use-table-query-state`, `EmptyState`, `ListToolbar`, `save-file` | **Reutilizar.** Hoy viven en `features/admin/common`; si al llegar aquí los módulos 2–4 ya los promovieron a una ubicación compartida (p. ej. `frontend/src/components/data/`), se importan de ahí; si no, se promueven en un cambio previo sin alterar su comportamiento. No se duplican |
| `frontend/package.json` | Modificar: `@mui/x-charts` (Community) con versión exacta compatible con `@mui/material` v6 y React 18 (ADR-023) |

### L.3 Pruebas

| Archivo | Contenido |
|---|---|
| `backend/test/reports-projects.e2e.spec.ts` | PF-05.7, PF-05.20, PF-05.33 |
| `backend/test/reports-opportunities.e2e.spec.ts` | PF-05.8 a PF-05.12 |
| `backend/test/reports-forecast.e2e.spec.ts` | PF-05.13 a PF-05.15 |
| `backend/test/reports-visits-activities.e2e.spec.ts` | PF-05.16 a PF-05.19 |
| `backend/test/reports-visibility.e2e.spec.ts` | PF-05.22, PF-05.23 |
| `backend/test/reports-export.e2e.spec.ts` | PF-05.21, PF-05.24 a PF-05.28 |
| `backend/test/reports-read-only.e2e.spec.ts` | PF-05.29 |
| `backend/test/commercial-metrics-consistency.e2e.spec.ts` | PF-05.30, PF-05.31 (compartida con Inicio) |
| `backend/test/support/` | *Fixtures* de reportes (usuarios por alcance, oportunidades con productos, visitas reprogramadas) |
| `frontend/tests/e2e/crm-reports.e2e.spec.ts` | PF-05.39, PF-05.40 (nombre con el prefijo `crm-` de los E2E de los módulos 2 y 4; ver P-05.33) |

### L.4 Documentación

| Archivo | Acción |
|---|---|
| `docs/adr/ADR-022-exceljs-para-generar-y-leer-xlsx.md` | Ya aceptado (2026-10-10, D-05.1); actualizar solo si la implementación se desvía |
| `docs/adr/ADR-023-mui-x-charts-community-para-graficas.md` | Ya aceptado (2026-10-10, D-05.2); actualizar solo si la implementación se desvía |
| `docs/design/DESIGN-SYSTEM.md` | Añadir sección de gráficas (series, leyendas, tabla equivalente, movimiento reducido) |
| `docs/api/README.md` | Añadir los endpoints de reportes |
| `docs/implementation-plans/crm/00-modelo-de-datos.md` | Sin cambios: el parámetro de D.5 ya está en 00 §8.2 (D-05.3 resuelta) |
| `CHANGELOG.md` | Entrada del módulo |

---

## Decisiones del módulo (resueltas el 2026-10-10)

Todas las decisiones de esta sección quedaron resueltas por el responsable de
negocio el 2026-10-10: las marcadas **Respuesta del responsable** con su
respuesta expresa y el resto con el valor recomendado, que quedó aprobado. Se
conservan los identificadores.

### Reutilizadas de 00

| # | Efecto en Reportes (valor final) |
|---|---|
| DM-1 | **Resuelta (2026-10-10).** **Respuesta del responsable:** estimación = monto en USD o moneda del país + foto de la tasa + equivalente USD, y toneladas; **todos los totales en USD** sobre `estimated_amount_usd` (RN-05.13, RN-05.29); ya no se totaliza por moneda |
| DM-10 | **Resuelta (2026-10-10).** Alcance `COUNTRY` en todas las consultas |
| DM-11 | **Resuelta (2026-10-10).** Asesor sin `reportes.exportar` |
| DM-12 / DM-13 | **Resuelta (2026-10-10).** Resolución de TEAM y herencias de visibilidad en cada consulta |
| DM-15 | **Resuelta (2026-10-10).** Un parcial cuenta como ganada: ganadas = WON + PARTIAL, con parciales desglosados (RN-05.22, RN-05.23) |
| DM-16 | **Resuelta (2026-10-10).** Proyecto activo, estado comercial, última actualización (RN-05.15 a RN-05.18) |
| DM-20 | **Resuelta (2026-10-10).** **Respuesta del responsable:** cinco estados; confirma el propio asesor dueño de la visita, no el manager. Categorías de visita sobre los cinco estados; el reporte muestra la confirmación del dueño (RN-05.38) |
| DM-24 | **Resuelta (2026-10-10).** Líneas sin regla = "sin conversión", fuera del total de toneladas |
| DM-25 | **Resuelta (2026-10-10).** Visibilidad del forecast sigue al proyecto (RN-05.33) |
| DM-32 | **Resuelta (2026-10-10).** Menú de Reportes sembrado con el módulo |
| DM-35 | **Resuelta (2026-10-10).** Base `IDENTIFIED` = `opportunity_date` (también fecha de referencia de la tasa de la estimación) |
| DM-36 | **Resuelta (2026-10-10).** **Respuesta del responsable:** moneda base USD con tipo de cambio a la moneda del país (ADR-024). Importes en USD; referencia en moneda local solo con un país efectivo (RN-05.58); columnas de monto de la exportación (RN-05.59) |

### Nuevas

| # | Pregunta | Valor final (resuelta 2026-10-10: valor recomendado aprobado) | Impacto si cambia |
|---|---|---|---|
| **D-05.1** | Librería para generar `.xlsx` real (no existe ninguna; requiere **ADR**, CLAUDE.md §8.6) | **Resuelta (2026-10-10).** **`exceljs`** (MIT) en el backend, detrás de `common/xlsx.ts`, usando su escritor en *streaming* (`stream.xlsx.WorkbookWriter`). Comparación: **exceljs** — MIT, publicada en npm, formatos numéricos y de fecha, negrita, panel congelado, autofiltro, *streaming* real a la respuesta; contra: mantenimiento lento (pocas versiones recientes) y más dependencias transitivas, aceptable en backend (no afecta al *bundle*). **SheetJS (xlsx)** — la versión del registro npm (0.18.x) está abandonada y con vulnerabilidades conocidas (contaminación de prototipo, ReDoS); las versiones corregidas se distribuyen solo desde el CDN propio (riesgo de cadena de suministro y fuera de `pnpm audit`); la edición comunitaria (Apache-2.0) no aplica estilos de celda (son de la edición Pro) y la escritura es en memoria. **write-excel-file** — MIT y ligera, pero sin *streaming*. **Escritor OOXML propio** + zip — sin dependencia pesada, pero código de formato que mantener. Versión exacta y revisión de licencia en el ADR | Adoptado en [ADR-022](../../adr/ADR-022-exceljs-para-generar-y-leer-xlsx.md) (aceptado). Si `exceljs` no supera el gate de `pnpm audit`, ADR-022 prevé como plan B un escritor propio |
| **D-05.2** | Librería de gráficas (no existe ninguna; requiere **ADR**) | **Resuelta (2026-10-10).** **`@mui/x-charts` (edición Community, MIT)**, versión compatible con `@mui/material` v6 y React 18 a fijar en el ADR. Toma el tema MUI (colores de `chartSeries`, tipografía, modo oscuro) sin capa de traducción (ADR-009/ADR-017), es tree-shakeable y se carga solo en las rutas de reportes (lazy). **El embudo no usa el `FunnelChart` de la edición Pro** (licencia comercial): se dibuja como barras horizontales (`BarChart` en `layout="horizontal"`) o con `Box` del tema + tabla equivalente. Comparación: **Recharts** — MIT, maduro, trae embudo y mejoró la accesibilidad (capa de teclado), pero estilo propio que hay que mapear a tokens a mano y *bundle* similar o mayor; **Chart.js / react-chartjs-2** — *canvas*, accesibilidad más pobre (sin DOM por serie) y sin integración con el tema; **Nivo / ECharts** — muy completos pero pesados. En todos los casos cada gráfica lleva "Ver como tabla" (accesibilidad garantizada por la tabla, no por la librería) | Adoptado en [ADR-023](../../adr/ADR-023-mui-x-charts-community-para-graficas.md) (aceptado). Con Recharts habría que añadir un adaptador de tema |
| **D-05.3** | Tope de exportación XLSX frente a "el conjunto completo" (§7.6) y frente al tope de la casa (10 000 filas, PLAN-ADMIN D13) | **Resuelta (2026-10-10).** Parámetro nuevo `crm.reportes.max_filas_exportacion` = **100 000**; por encima, `422 EXPORT_TOO_LARGE` y **nunca** archivo truncado; *streaming* + transacción `REPEATABLE READ READ ONLY` + lotes *keyset*. El tope de 10 000 de la casa se mantiene para usuarios y auditoría (datos personales en bloque); aquí no hay PII de contactos y el alcance exige completitud | Tope menor: más `422`. Si se exige exportar cualquier tamaño: exportación asíncrona (D-05.14). Parámetro ya en 00 §8.2 |
| **D-05.4** | Columna por la que filtra el período cada reporte y período por defecto | **Resuelta (2026-10-10).** Tabla C.2 (oportunidades por `opportunity_date`; visitas por `scheduled_start_at` vigente; actividades por `COALESCE(scheduled_at, due_at)`; forecast por año/mes M+1…M+6; proyectos sin período por defecto), seleccionable con `dateBasis` | Cambian los resultados por defecto, no el contrato |
| **D-05.5** | ¿"Pendientes" incluye las vencidas? (compartida con Inicio §3.2 y Actividad §6.2) | **Resuelta (2026-10-10).** **Disjuntas:** pendientes = abiertas no vencidas; vencidas aparte; abiertas = suma | Si son inclusivas, cambia `metric-definitions.ts` y a la vez Inicio y Reportes |
| **D-05.6** | Horizonte de "visitas próximas" (compartida con Inicio) | **Resuelta (2026-10-10).** **Resuelta en la consolidación:** se usa el parámetro de D-01.5, `crm.inicio.visitas_proximas_dias` (7 días). No se crea otro | Solo parámetro |
| **D-05.7** | Período de "ganadas" y "perdidas" en la tarjeta de Inicio, para que el reporte lo reproduzca | **Resuelta (2026-10-10).** **Resuelta en la consolidación:** lo fija Inicio (D-01.3: mes en curso por `decision_date`, con selector mes / trimestre / año). El enlace de la tarjeta lleva ese mismo período al reporte, que acepta cualquiera | PF-05.30 compara con el período que tenga la tarjeta |
| **D-05.8** | "Tipo de cliente" del embudo (§7.8): ¿tipo de empresa o estado del cliente (prospecto/activo)? | **Resuelta (2026-10-10).** `crm.tipo_empresa` | Cambiar a `crm.estado_cliente` es cambiar una columna del filtro |
| **D-05.9** | Cómo calcular los porcentajes del embudo "cuando exista información suficiente" | **Resuelta (2026-10-10).** Participación siempre que el total > 0; conversión acumulada por historial (RN-05.55) solo con historial completo y denominador ≥ `MIN_FUNNEL_SAMPLE` = 5 (constante; parámetro si el negocio lo pide) | Otra fórmula de conversión cambia solo `funnel()` |
| **D-05.10** | ¿Filtro por producto/familia en el reporte de oportunidades? (el alcance pide "evitar duplicar al consultar sus productos asociados" sin listar el filtro) | **Resuelta (2026-10-10).** Incluido, implementado con `EXISTS` | Si se descarta, se quita el filtro; la regla anti-duplicación sigue aplicando a cualquier consulta futura |
| **D-05.11** | ¿Basta `reportes.ver` o se exige también el `.ver` de cada entidad de origen? | **Resuelta (2026-10-10).** Basta `reportes.ver` (00 §5.2); la navegación a la ficha sí exige el permiso de origen | Exigir permisos de origen: un reporte devolvería `403` aunque el menú lo muestre; habría que ajustar el menú |
| **D-05.12** | ¿Cuentan oportunidades, forecast, visitas o actividades de un proyecto eliminado lógicamente? | **Resuelta (2026-10-10).** No (RN-05.5), igual en Inicio | Si cuentan, cambia el universo en `metric-definitions.ts` |
| **D-05.13** | ¿Tendencia de "proyectos activos"? (no hay instantáneas históricas) | **Resuelta (2026-10-10).** Sin tendencia; valor actual y distribución por fase. Reconstruirla desde `project_phase_history` es posible pero costoso y aproximado (eliminaciones no fechadas) | Si se exige: reconstrucción desde el historial de fases o tabla de instantáneas mensuales (cambio en 00, ADR si implica planificador) |
| **D-05.14** | ¿Exportaciones mayores que el tope? | **Resuelta (2026-10-10).** Fuera de v1: `422` y acotar filtros | Exportación asíncrona (`202` + descarga posterior) podría guardar el archivo con el `FileStorage` de ADR-021 (DM-8 resuelta), pero necesita planificador: ADR |
| **D-05.15** | ¿Vista SQL para el estado comercial del proyecto, compartida con Proyectos §5.4? | **Resuelta (2026-10-10).** No en v1: subconsulta en el adaptador de métricas compartido | Si se crea, se define en 00 (migración aditiva) |

---

## Precisiones de implementación (2026-10-13)

Primera etapa del backend (K.2 pasos 1–4): servicio de métricas compartido, `ReportingRepository`,
reportes F-34 a F-38 y opciones de filtro. La exportación XLSX (F-39), el dashboard (F-40), el
embudo (F-41), el menú y las rutas llegan en la etapa siguiente. Sin cambios de esquema,
migraciones ni dependencias; Snowflake no aplica (D.4).

### P-05.1 `commercial-metrics` creado aquí con los nombres de 01 (decisión del usuario)

El Módulo 1 (Inicio) lo desarrolla otro desarrollador en otra rama. Para no bloquear Reportes y
para que la integración sea limpia, esta rama crea **solo** lo que Reportes necesita, con los
nombres y firmas exactos de `01-inicio-dashboard.md` §F.2 y §L.1:

| Pieza (01 L.1) | Archivo | Contenido en esta rama |
|---|---|---|
| `CommercialMetricsModule` | `commercial-metrics/commercial-metrics.module.ts` | Enlaza el puerto a su adaptador; exporta `CommercialMetricsService` y `BUSINESS_CLOCK` (mismo token que provee `ProjectsModule`) |
| `CommercialMetricsService` | `commercial-metrics/commercial-metrics.service.ts` | KPI-01…09 con la firma de 01 F.2 (`countActiveProjects`, `countOpenOpportunities`, `countWonOpportunities`, `countLostOpportunities`, `forecastWindow`, `countVisits`, `countActivities`, `resolvePeriod`, `forecastWindowMonths`) **más** las agregaciones de Reportes (P-05.2). **No** incluye `targetCompliance` (KPI-10, metas DM-9): Reportes no lo usa; lo añade el Módulo 1 |
| `MetricContext`, `DateRange` | `ports/…port.ts`, `commercial-period.ts` | Como 01 F.2: `{ scope, now, businessTimeZone }` y `{ from, to }` inclusivo |
| `COMMERCIAL_METRICS_READ_MODEL` / `CommercialMetricsReadModel` | `commercial-metrics/ports/commercial-metrics-read-model.port.ts` | Agregados con criterios por entidad (P-05.2) |
| `prisma-commercial-metrics.repository.ts` | `infrastructure/database/prisma/repositories/` | Adaptador; además exporta los `FROM … WHERE …` por entidad que reutiliza `prisma-reporting.repository.ts` (un solo predicado para lista, conteos y exportación, RN-05.9) |
| `commercial-period.ts` | `commercial-metrics/` | `resolvePeriod` (mes/trimestre/año en curso), `businessToday`, `startOfBusinessDay`, `toBusinessWindow` (RN-05.8), `exceedsYears`, `monthsBetween`, `parseYearMonth`; reexporta `forecastWindowMonths` de `metric-definitions.ts` (DEF-G no se duplica) |
| `metric-definitions.ts` | ídem | **Ampliado sin tocar** lo que usa el Módulo 3: `isFunnelStage`, `opportunityCategory` (+ `tallyOpportunities`, `opportunityCountsAreConsistent`, filtro `OPPORTUNITY_STATUS_FILTERS`), `visitCategory` (+ DEF-E `isDoneUnconfirmedVisit`, `visitStatusIdsByCategory`, `upcomingVisitsLimit`) y `activityCategory` (+ DEF-D `isActivityDueSoon`, `activityStatusIdsByGroup`). Las de visitas y actividades **delegan** en las reglas de referencia del Módulo 4 (`visitStatusGroup`, `activityStatusGroup`, `dueSoonLimit`); no son una segunda implementación |

Las pruebas de lo añadido van en `metric-definitions.reports.spec.ts` (no en
`metric-definitions.spec.ts`) para no chocar con lo que añada el Módulo 1. Al integrar la rama
del Módulo 1 se espera conflicto en estos archivos nuevos: se conserva **una** implementación
(estas firmas ya son las de 01) y el Módulo 1 añade `targetCompliance`, `DashboardReadModel` y
`AlertsReadModel`. Las tarjetas de Inicio deben llamar a estos mismos métodos (PF-05.30 ya los
compara con los reportes).

### P-05.2 Firmas de las agregaciones de Reportes (G.3)

G.3 nombra `countVisits(filter)` y `countActivities(filter)`, pero 01 F.2 ya define
`countVisits(ctx, upcomingDays)` y `countActivities(ctx, dueSoonHours)`. Se conservan las de 01 y
las de Reportes se llaman `countVisitCategories(criteria, now, upcomingDays | null)` y
`countActivityCategories(criteria, dueSoonHours | null)`. El resto: `countOpportunities(criteria)`,
`stageDistribution(criteria, semantics)`, `ownerDistribution(criteria)`, `countProjects(criteria)`,
`forecastTotals(criteria)`, `forecastConsolidation(criteria, grouping, page)` y `semantics()`
(catálogos validados y resueltos a ids, sin caché). `funnel` y `monthlySeries` llegan con el
embudo y el dashboard (P-05.14, P-05.15). El `filter` genérico de G.3 se concreta en un criterio tipado por entidad
(`OpportunityCriteria`, `ProjectCriteria`, `ForecastCriteria`, `VisitCriteria`,
`ActivityCriteria`), que comparten el servicio de métricas y `ReportingRepository`.

### P-05.3 Alcance y universo

- Todas las consultas usan el alcance de **`reportes.ver`** (D-05.11) tanto para lo directo como
  para las herencias de DM-13/DM-25, con los predicados ya publicados por los módulos dueños:
  `projectVisibilitySql`, `opportunityVisibilitySql`, `commercialVisibilitySql` (visitas y
  actividades) y `forecastLineVisibilitySql` (antes `lineVisibilitySql`, privado; ahora exportado).
  También se exportan, sin cambiar su comportamiento, `commercialLateral` y
  `commercialStatusCondition` (DEF-B, D-05.15) y `PRIORITY_WEIGHT_SQL`.
- "Registro vigente" (RN-01.13 + RN-05.5): ni el registro, ni su proyecto, ni su cliente
  eliminados. Se aplica también a visitas y actividades cuyo proyecto vinculado está eliminado.
- Deny-by-default: sin cuenta local o con alcance `NONE` el servicio responde `403` antes de
  consultar, aunque el guard ya haya exigido el permiso.

### P-05.4 Períodos, orden y validación

- `from`/`to` van **juntos** o ninguno (`400`); `from > to` → `400`. **Sin período no se filtra
  por fecha**: el "período por defecto" de C.2 (mes en curso en visitas y actividades) es el
  valor inicial de la pantalla, que lo envía; la API sin período devuelve todo, que es lo que
  exige G.3 ("Inicio = Reportes sin período" para pendientes, vencidas y visitas).
- Proyectos no tiene base por defecto: con período, `dateBasis` es obligatorio (`400`).
- Rango máximo de 5 años: se admite hasta el día anterior al aniversario (`2021-01-01`…`2025-12-31`);
  forecast ≤ 24 meses incluidos. `422 PERIOD_TOO_LONG` con `details[{ field, code, message, maxYears | maxMonths }]`.
- El orden `year,month` del forecast (E.4) se llama `sortBy=period`. Sin `sortBy` se usa el orden
  por defecto del reporte (o el `sortOrder` pedido); con `sortBy` y sin `sortOrder`, ascendente.
  Desempate siempre por `id`.

### P-05.5 Definiciones (contradicciones resueltas)

- **"Por vencer"** (RN-05.42): 05 decía `[ahora, ahora + horas)`; 01 KPI-08 y la bandeja del
  Módulo 4 (`activityDueBucket`) usan el límite **incluido**. Se aplica `[ahora, ahora + horas]`
  (una sola regla para los tres módulos) y se corrige el texto de RN-05.42.
- "Visita próxima" (KPI-07): `[ahora, ahora + días]`, límite incluido.
- Categoría de visita con la precedencia del Módulo 4 (`isPending` → `isDone` → `isConfirmed`;
  sin indicador válido, `CANCELLED`).
- Distribución por etapa (RN-05.30): todas las activas (también con 0) **y** las inactivas que aún
  tienen oportunidades, para que la suma sea el total.

### P-05.6 `INVALID_CATALOG_SEMANTICS`

`semantics()` valida cada elemento (activo o no) de `crm.etapa_oportunidad`, `crm.fase_cliente`,
`crm.estado_visita` y `crm.estado_actividad` con el esquema y las reglas por elemento del registro
de 00 §3.3 (`catalog-semantics.registry.ts`); un catálogo ausente también lo dispara. No se
re-evalúan los invariantes del conjunto activo (se imponen al escribir con `409 CATALOG_INVARIANT`
y no producen cifras erróneas). `details[] = { field: <catalog>, code, itemCode, message }`. Se
prueba con unitarias: provocarlo en integración rompería el catálogo compartido de las suites
paralelas (PF-05.32 queda para el embudo).

### P-05.7 Forma de los DTO (aditivos respecto de F.3)

- `ReportFilterOptionsDto.catalogs` usa claves fijas en camelCase (`opportunityStages`,
  `projectPhases`, `projectTypes`, `visitStatuses`, `activityStatuses`, `activityTypes`,
  `priorities`, `companyTypes`), con `isActive` (los inactivos se ofrecen para históricos) y la
  semántica relevante (`order`, `isClosed`, `inFunnel`, `isFinal`, `category`, `group`, `weight`).
  `owners` = responsables de algún registro comercial visible; `countries` = países de los
  registros visibles ∪ país del alcance `COUNTRY`; `productFamilies` = familias activas.
- Añadidos: `commercialStatus.label` (proyectos), `status.category` (visitas y actividades),
  `ReportStageCountDto.stage.code/isActive`, `ForecastReportSummaryDto.range`,
  `ActivityReportSummaryDto.dueSoonHours`, `ForecastGroupDto.subgroups = null` sin `thenBy`.

### P-05.8 Moneda local de referencia (RN-05.58)

País efectivo = el filtro `countryId` si viene; si no, el país del alcance `COUNTRY`; en otro
caso no hay país (`MULTIPLE_COUNTRIES`). Un país filtrado que no existe también es
`MULTIPLE_COUNTRIES`. Fecha de corte = `to` del período (cualquier `dateBasis`) o hoy en
`crm.zona_horaria_negocio`. Tasa con `CurrencyConversionService.findApplicable` (sin exportar el
puerto de lectura) y producto con `multiplyDecimal` (4 decimales `HALF_UP`).

### P-05.9 Tiempo máximo y lectura (D.3)

`runReportRead` (addendum de 2026-10-13 a ADR-004): transacción `REPEATABLE READ READ ONLY` con
`statement_timeout` de 10 s; al vencer, `503 REPORT_TIMEOUT` con la nueva clase transversal
`ServiceUnavailableError` (traducida a `503` por `AllExceptionsFilter`). El registro con
`correlationId` es el `http_request` del interceptor (status `503`). Inicio heredará el mismo
comportamiento al usar el servicio compartido. No hay logs adicionales: las lecturas no llevan
datos personales y no se auditan (solo la exportación, F-39).

### P-05.10 Pruebas de esta etapa

Unitarias: `metric-definitions.reports.spec.ts` (PF-05.1, PF-05.2), `commercial-period.spec.ts`
(PF-05.3), `commercial-metrics.service.spec.ts`, `report-criteria.spec.ts`,
`local-currency-reference.spec.ts` (PF-05.44), `opportunity-report.service.spec.ts`,
`report-services.spec.ts`, `report-read.spec.ts`. Integración: `reports-projects.e2e.spec.ts`
(PF-05.7, PF-05.20 en los 11 endpoints, PF-05.33), `reports-opportunities.e2e.spec.ts`
(PF-05.8–12, PF-05.42, PF-05.43, PF-05.27), `reports-forecast.e2e.spec.ts` (PF-05.13–15),
`reports-visits-activities.e2e.spec.ts` (PF-05.16–19), `reports-visibility.e2e.spec.ts`
(PF-05.22, PF-05.23), `reports-read-only.e2e.spec.ts` (PF-05.29) y
`commercial-metrics-consistency.e2e.spec.ts` (PF-05.30, PF-05.31, solo lectura y timeout).
Pendientes de la etapa siguiente: PF-05.5, PF-05.6, PF-05.21, PF-05.24–28 (exportación y
`429`), PF-05.32 y las de frontend y Playwright (las de backend, cubiertas en P-05.18).

---

## Precisiones de implementación — segunda etapa del backend (2026-10-14)

K.2 pasos 5–7, parte backend: exportación XLSX (F-39), dashboard (F-40), embudo (F-41), menú y
rutas. Sin cambios de esquema ni migraciones. Dependencia nueva: `exceljs` (ADR-022).

### P-05.11 `exceljs` 4.4.0 y el gate de `pnpm audit`

ADR-022 no fijaba versión: se incorpora la última estable (`4.4.0`, `--save-exact`) en
`@app/backend` (addendum de ADR-022). `pnpm audit --audit-level=high` sobre `exceljs` y sus
dependencias de ZIP y XML: **ninguna alta ni crítica**; un único aviso **moderado** (`uuid`
< 11.1.1, vía `exceljs` → `uuid@8.3.2`; `exceljs` solo lo usa para identificadores internos del
libro, sin entradas del usuario). El `pnpm audit` **global** del monorepo sigue en rojo por
avisos **previos** ajenos a este cambio (`vite`/`vitest`/`tinypool` del frontend, `jest`/
`braces`, `ts-jest`/`handlebars`, `prisma`/`deepmerge-ts`); se reporta como pendiente.

### P-05.12 Exportación (F-39): piezas y comportamiento

- `common/xlsx.ts` es la única pieza que importa `exceljs` (las pruebas lo usan para **leer**
  el archivo). Escritor en *streaming*; textos como celda de texto (formato `@`) y
  neutralizados con `neutralizeFormula` de `common/csv.ts` (ahora exportada); números con más
  de 15 dígitos significativos → texto, contados en la hoja "Filtros". Los instantes se
  escriben en la hora local de `crm.zona_horaria_negocio`.
- `ReportingRepository.export*Rows(criteria, sort, sink)`: **misma** consulta (SELECT, FROM,
  WHERE, orden) que la lista. Conteo → `sink.begin(rowCount)` (tope) → lotes *keyset* de 1 000
  (`ORDER BY expr NULLS LAST, id`; la última clave viaja como texto y se vuelve a convertir a su
  tipo SQL, sin perder microsegundos ni decimales), en una transacción `REPEATABLE READ READ
  ONLY` con `statement_timeout` de 60 s (`EXPORT_STATEMENT_TIMEOUT_MS`).
- Hojas: "Datos" (columnas de `report-columns.ts`), "Consolidado" (forecast con `groupBy`;
  todos los grupos, `thenBy` opcional y exige `groupBy`), "Resumen" (los mismos servicios que
  `/summary`) y "Filtros". El reporte de proyectos no tiene resumen en pantalla: su "Resumen"
  lleva proyectos, activos y finalizados del conjunto (AC-05.24 pide la hoja en los cinco).
- "Resumen" y "Datos" se leen en transacciones distintas: con escrituras concurrentes pueden
  diferir en un registro; `X-Export-Rows` y la fila "Filas" son siempre las del archivo.
- Columnas (RN-05.50, opción más restrictiva): **no** se exportan `resultSummary` (visitas) ni
  `resultNotes` (actividades), texto libre que la pantalla resume como "Resultado". En forecast,
  "Tonelaje (t)" vacío = sin conversión (la columna sigue siendo numérica; el conteo va en
  "Resumen"). El resultado de la oportunidad usa las etiquetas fijas Ganado / Parcial / Perdido.
- "Filtros" en texto legible solo con las etiquetas **del alcance** (opciones de filtro
  autorizadas: asesores, países, catálogos, familias). Clientes, proyectos y productos se
  muestran por su id: resolver su nombre revelaría registros fuera del alcance (RN-05.4).
- Auditoría `crm.report.exported` (`resourceType = crm.report`, `resourceId` = reporte,
  `metadata = { report, format, filters (JSON, ≤ 4 000 caracteres), scope, rows, durationMs }`) al
  completar el volcado y **antes** de cerrar el ZIP: toda extracción completa queda registrada.
  Log `report_exported` (ids, filas, duración; sin PII).
- Un error **antes** de empezar el archivo llega con el formato estándar (`422`, `503`…). Si ya
  se enviaron las cabeceras, se corta la conexión (nunca un archivo truncado que parezca
  válido) y se registra `report_export_aborted`.
- Cabeceras: además de las de F.4, `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.

### P-05.13 Límite de exportaciones (F.4)

`ReportExportThrottleGuard` (guard de ruta, después de autenticación y permisos): ventana
deslizante de 60 s sobre el almacenamiento del `ThrottlerModule`, clave = proveedor + sujeto del
token. "5 por minuto por usuario" se aplica a **todas** las rutas `/export` juntas y cuenta
también las peticiones que después rechaza la validación (opción más restrictiva). Exceso →
`429 RATE_LIMIT_EXCEEDED` con `Retry-After`. El almacenamiento es en memoria por instancia (como
el limitador global).

### P-05.14 Dashboard (F-40)

- Período: `from`/`to` juntos o ninguno, `from ≤ to`; por defecto del 1 de M-12 al último día
  de M (zona del negocio); máximo 24 meses **de calendario** (`422 PERIOD_TOO_LONG`,
  `maxMonths: 24`). Series con **todos** los meses del período (también en 0).
- Paneles: proyectos activos por fase (fases no finales; estado actual, sin período ni
  tendencia, D-05.13); oportunidades **identificadas** en el período por etapa vigente
  (`stageDistribution` con `IDENTIFIED`); ganadas/parciales/perdidas por mes de
  `decision_date` (`wonLostByMonth` añade `wonFull`: `won` = WON + PARTIAL, DM-15, y el apilado
  usa `wonFull` + `partial`); forecast de los meses del período ∪ M+1…M+H con acumulado sobre
  los meses devueltos (`forecastRange` y `tonnageUnit` añadidos); actividades completadas
  (`completed_at`), visitas realizadas + confirmadas (`actual_start_at`) y canceladas
  (`cancelled_at`) por mes.
- "Distribución por asesor": abiertas entre las identificadas en el período, ganadas decididas
  en el período y toneladas del rango de forecast; top 10 por abiertas + ganadas (después
  toneladas y nombre) y el resto en "Otros" (`owner: null`). Solo asesores con algún valor.
- `CommercialMetricsService` añade `monthlyCounts`/`monthlySeries` (G.3), `activeProjectsByPhase`,
  `forecastOwnerTonnage` y los criterios del dashboard; el puerto, `projectPhaseCounts`,
  `opportunityMonthlyCounts`, `activityMonthlyCounts`, `visitMonthlyCounts` y
  `forecastOwnerTonnage`. Meses en la zona del negocio (`AT TIME ZONE` para `timestamptz`).

### P-05.15 Embudo (F-41)

- `funnel(criteria, semantics, visibleStageIds)` en el servicio compartido; el filtro de etapa
  **no** entra en el criterio (RN-05.56). `companyTypeIds` es un campo opcional nuevo de
  `OpportunityCriteria` (`customers.company_type_id`, D-05.8).
- Población de la conversión = todas las oportunidades del conjunto filtrado (cualquier etapa
  vigente: una perdida que pasó por Cotizando cuenta como que alcanzó Cotizando). Alcance de
  cada una = mayor `order` de las etapas `inFunnel` activas entre su historial y su etapa
  vigente.
- `unavailableReason` por etapa: `NO_DATA` si el total del embudo es 0; si no, el motivo de la
  conversión (`INSUFFICIENT_HISTORY` antes que `INSUFFICIENT_SAMPLE`) o `null`.
- Una etapa activa `inFunnel` sin `order` entero → `422 INVALID_CATALOG_SEMANTICS` (PF-05.32;
  lo prueba una app de integración propia que sustituye la lectura de catálogos, sin tocar el
  catálogo compartido).

### P-05.16 Menú y rutas (DM-32, H.3)

Las siete rutas `/reportes/*` quedan en `app-routes.registry.json`; con ello la semilla esencial
crea las siete opciones ya declaradas (`reportes-*`, `reportes.ver`) para asesor, manager y
responsable de país. El frontend registra las mismas rutas en
`features/crm/reports/reports-routes.ts` con un componente **provisional**
(`ReportsPendingPage`, "En construcción") hasta la etapa de frontend, y los iconos `bar_chart`,
`insights` y `filter_alt` en `MaterialSymbol`.

### P-05.17 Rendimiento e índices (PF-05.41, D.6)

Medido en un esquema de integración con 1 000 proyectos, 50 000 oportunidades y 200 000 líneas
de forecast (equipo de desarrollo, PostgreSQL en Docker; 3 ejecuciones): pantallas entre 0,1 y
0,3 s (lista, resumen, forecast), consolidado de forecast ~0,9 s, dashboard ~0,5 s y embudo
~1,2 s, todas < 2 s. Exportación de 50 000 oportunidades en ~16 s y de 100 000 líneas de forecast
(5,8 MB) en ~27 s, < 60 s, con un pico de memoria del proceso de ~180 MB por encima del reposo
(streaming). `EXPLAIN` de `opportunities.opportunity_date` en un mes: *seq scan* (selectividad
~11 %; no hay índice y a este volumen no hace falta). `visits(confirmed_at)` y
`activities(completed_at)` no se pudieron evaluar con volumen (sin datos ampliados de
actividad). **No se cambia el esquema**; si el volumen real lo exige, se proponen en 00 como
migración aditiva (D.6).

### P-05.18 Pruebas de esta etapa

Unitarias: `common/xlsx.spec.ts` (PF-05.6), `commercial-metrics.funnel.spec.ts` (PF-05.5,
series mensuales), `dashboard.service.spec.ts`, `report-export.service.spec.ts`. Integración:
`reports-export.e2e.spec.ts` (PF-05.21, PF-05.24–PF-05.28, PF-05.45, AC-05.25),
`reports-dashboard-funnel.e2e.spec.ts` (AC-05.30–AC-05.39, PF-05.32), y ampliadas
`reports-projects.e2e.spec.ts` (PF-05.20 en los 14 endpoints de lectura),
`reports-read-only.e2e.spec.ts` (PF-05.29 con dashboard, embudo y exportación) y
`seeds.e2e.spec.ts` (siete opciones de menú). Pendientes: las de frontend y Playwright
(PF-05.34–PF-05.40, PF-05.46, PF-05.47).

---

## Precisiones de implementación — frontend, primera tanda (2026-10-14)

Pantallas de F-34 a F-38 y su exportación (F-39) sobre el contrato real del backend. Sin
dependencias nuevas (`@mui/x-charts` la incorpora la tanda del dashboard y el embudo), sin
cambios de backend ni de contrato. El dashboard (F-40) y el embudo (F-41) siguen con
`ReportsPendingPage`.

### P-05.19 Estado en la URL y filtros de un solo valor

`useReportQueryState` (sobre `useTableQueryState`) guarda filtros, período, base de fecha,
búsqueda, orden y página con **los nombres de parámetro de la API**. Cada filtro admite **un
valor** en la URL aunque la API acepte repetidos (máx. 50): es el patrón de los módulos 2–4 y
basta para los AC; multivalor queda como mejora sin cambio de contrato. Las tarjetas de resumen
fijan el filtro de estado (`status` en oportunidades, `statusCategory` en visitas y actividades);
pulsar la tarjeta activa lo quita. Lista, resumen y exportación usan los mismos filtros
(RN-05.9, RN-05.44): la exportación añade `sortBy`/`sortOrder` de la pantalla y `format=xlsx`, sin
`page`/`pageSize`.

### P-05.20 Período por defecto

- Visitas y actividades: sin período en la URL, la pantalla calcula "Mes en curso" con "hoy" en
  `crm.zona_horaria_negocio` y lo **envía** (P-05.4), sin escribirlo en la URL (un enlace sin
  período abre siempre el mes en curso). Su chip no se quita (se cambia) y no se ofrece "Sin
  período" (opción más restrictiva; un rango libre de hasta 5 años sigue disponible). "Limpiar"
  vuelve al mes en curso.
- Proyectos y oportunidades: sin período por defecto ("Sin período" = no se filtra por fecha).
  En proyectos, con período la base de fecha es obligatoria (validación en pantalla, igual que el
  `400` del backend).
- Forecast: sin `fromMonth`/`toMonth` no se envía rango; el chip muestra el rango que devuelve
  `/summary` (`range`, M+1…M+6). Rango máximo de 24 meses validado en pantalla.
- Atajos: "Mes en curso", "Trimestre en curso", "Año en curso" y "Últimos 12 meses" (11 meses
  cerrados + el mes en curso). Los esquemas Zod de `report-period.ts` replican `from ≤ to`, juntos
  o ninguno y el máximo de 5 años (hasta el día anterior al aniversario).

### P-05.21 Zonas horarias

`GET /reports/filter-options` no publica zonas. La pantalla usa las de los `form-options` del
Módulo 4 (`useCommercialTimeZones`, ahora exportado por su barril `entry-points` junto con
`formatDateTime`, `formatDate`, `formatCalendarDate` y `todayInTimeZone`): instantes en la zona
del perfil y "hoy" en la del negocio; sin `actividades.ver` ni `visitas.ver`, o mientras cargan,
la del navegador. Las fechas de calendario (`estimatedDecisionDate`, `decisionDate`) se muestran
sin conversión. **Hueco:** publicar `businessTimeZone` en `ReportFilterOptionsDto` (aditivo) para no
depender del Módulo 4; no bloquea (el negocio y los usuarios comparten zona). **Cerrado en P-05.27.**

### P-05.22 Exportación en la interfaz (F-39)

- `httpClient.download` devuelve además las cabeceras de la respuesta (`X-Export-Rows`) y
  `ApiError.retryAfterSeconds` lee `Retry-After` (cambios aditivos del cliente HTTP). La descarga
  usa un tiempo máximo de 120 s (la consulta puede tardar hasta 60 s, P-05.12).
- Botón "Exportar a Excel" solo con `reportes.exportar`; durante la generación muestra
  "Generando archivo…" deshabilitado. Al terminar: "Se descargó <archivo> con N filas.". Errores,
  siempre con "Referencia: <correlationId>": `422 EXPORT_TOO_LARGE` → "El resultado tiene N filas
  y el máximo exportable es M. Acota los filtros."; `429` → "Vuelve a intentarlo en N segundos";
  `503 REPORT_TIMEOUT` → "Acota los filtros"; `422 PERIOD_TOO_LONG` con el límite de `details`.
- Forecast: desde la pestaña "Consolidado" la exportación lleva `groupBy`/`thenBy` (hoja
  "Consolidado"); desde "Detalle", solo el detalle.

### P-05.23 Navegación al origen y selectores remotos

- Código como enlace a la ficha solo con el `.ver` de la entidad (`proyectos.ver`,
  `oportunidades.ver`, `visitas.ver`, `actividades.ver`); cliente y proyecto de cada fila, con
  `clientes.ver` y `proyectos.ver`. Todas las fichas ya están registradas en el router.
- Cliente, proyecto y producto se eligen con los selectores de 02/03 (`CustomerPicker`,
  `ProjectPicker`, `ProductPicker`) y no se ofrecen sin `clientes.ver`, `proyectos.ver` o
  `productos.ver`. `CustomerPicker` busca solo clientes activos (limitación aceptada; un id de la
  URL se respeta). El texto de su chip se recuerda en la sesión; tras recargar dice
  "Seleccionado" (no se resuelve el nombre para no consultar otro módulo). **Revisado en P-05.28**
  para cliente y proyecto.

### P-05.24 Distribuciones de F-35 y piezas para el dashboard y el embudo

Las distribuciones por etapa y por asesor se muestran como **tablas** dentro de `ChartPanel`
(título, descripción, carga, error con "Reintentar", vacío y conmutador "Ver como tabla" /
"Ver como gráfica" que aparece solo si se pasa `chart`). La tanda del dashboard y el embudo añade
la gráfica (`@mui/x-charts`, ADR-023) pasando `chart` sin cambiar las tablas. Piezas comunes en
`features/crm/reports/common/` (ver `features/crm/README.md`).

### P-05.25 Forecast consolidado

Pestañas "Detalle" y "Consolidado" en la URL (`vista=consolidado`). El consolidado pagina los
grupos con su propio prefijo (`consolidado.page`, `consolidado.groupBy`, `consolidado.thenBy`);
`groupBy` por defecto `MONTH`. Columnas = meses del rango del resumen + "Total" (toneladas,
cantidades por unidad y líneas sin conversión); subgrupos sangrados bajo su grupo.

### P-05.26 Pruebas de esta tanda

Vitest + RTL: `report-period.spec.ts`, `report-format.spec.ts`, `reports.errors.spec.ts`,
`ReportFilterBar.spec.tsx` (PF-05.34), `ExportButton.spec.tsx` (PF-05.35), `SummaryCards.spec.tsx`,
`ChartPanel.spec.tsx`, `SourceLink.spec.tsx` (PF-05.37), `reports-routes.spec.ts` y una por
pantalla (`ProjectsReportPage`, `OpportunitiesReportPage` con PF-05.46, `ForecastReportPage`,
`VisitsReportPage`, `ActivitiesReportPage`), con los cuatro estados de PF-05.36 (cargando, vacío,
error con reintento y sin permiso) en proyectos y error/vacío en el resto; `http-client.spec.ts`
cubre las cabeceras y `Retry-After`. Pendientes: PF-05.38 y PF-05.47 (gráficas, otra tanda) y los
Playwright PF-05.39/PF-05.40.

---

## Precisiones de implementación — frontend, segunda tanda (2026-10-14)

Dashboard (F-40), embudo (F-41) y gráficas de F-35 con `@mui/x-charts` Community (ADR-023 y su
addendum), más los huecos de la primera tanda. Único cambio de backend: campos aditivos en
`GET /reports/filter-options` (P-05.27). Sin cambios de esquema ni de permisos.

### P-05.27 Zonas horarias en `filter-options` (cierra el hueco de P-05.21)

`ReportFilterOptionsDto` añade `businessTimeZone` (`crm.zona_horaria_negocio`, el mismo valor que ya
usa `ReportContext`) y `timeZone` (zona del perfil, `users.time_zone`; vacía → la del negocio), con
el mismo `reportes.ver`. Puerto nuevo `ReportingRepository.userTimeZone(userId)`. El frontend usa
`useReportTimeZones()` (comparte caché con las opciones de filtro: sin peticiones nuevas) en lugar
de `useCommercialTimeZones`; una zona que `Intl` no reconoce, o mientras carga, → la del navegador.
Prueba de integración en `reports-projects.e2e.spec.ts` (perfil propio y perfil vacío).

### P-05.28 Chips de cliente, proyecto y producto tras recargar

Cliente y proyecto se nombran con su ficha (`GET /customers/:id` con `clientes.ver`,
`GET /projects/:id` con `proyectos.ver`): son los **mismos** permisos con que se ofrece el
selector, y la misma consulta (misma clave de caché) que el selector ya hace para su valor
preseleccionado, así que no hay petición nueva. Sin permiso no se consulta; fuera de alcance
(`404`) o con error, "Seleccionado". **Hueco:** producto sigue en "Seleccionado" tras recargar:
`GET /products` no filtra por id y no hay `GET /products/:id` (añadirlo es un cambio de contrato
del Módulo 3; no bloquea).

### P-05.29 Gráficas: una sola puerta, colores por papel y un solo eje

- `charts/LazyCharts.tsx` (`LazyBarChart`, `LazyLineChart`, `LazyComboChart`) es la única entrada;
  carga con `React.lazy` las tres implementaciones, únicas que importan la librería. Cada gráfica
  va en una `figure` con leyenda HTML con texto (≥ 2 series) y esqueleto mientras llega el
  *chunk*. Sin animación con `prefers-reduced-motion: reduce`.
- Colores por papel (`tone`): dos azules de identidad y el rojo semántico sólo para una serie que
  es un estado negativo (perdidas, visitas canceladas), tokens `chartColors`/`chartLayout`
  (DESIGN-SYSTEM §3 "Gráficas"). Verde/rojo no se emparejan (CVD).
- Nunca dos ejes: en "Distribución por asesor" abiertas y ganadas (conteos) van en una gráfica y
  las toneladas de forecast en otra, dentro del mismo panel (E.7 las pedía juntas; se separan por
  unidad). "Forecast por mes" sí combina barras y línea porque ambas son toneladas.
- Tendencias como **múltiplos pequeños**: una línea por indicador con su título y su escala
  (cinco series en una sola gráfica no se distinguían con la paleta de la marca); la tabla
  equivalente es mes × indicador.
- F-35: la distribución por etapa añade barras horizontales sobre la tabla existente; la de
  asesor sigue como tabla (E.3).
- Cada gráfica tiene "Ver como tabla" (`ChartDataTable`) con los mismos valores, formateados desde
  las cadenas decimales de la API (la conversión a número es sólo para la geometría).

### P-05.30 Dashboard (F-40) en la interfaz

- Sin período en la URL **no se envía** ninguno: el servidor aplica el suyo (P-05.14) y la
  pantalla muestra el `period` devuelto en el chip ("… (por defecto)", no se quita). Así pantalla
  y servidor nunca discrepan. Con período, el máximo de **24 meses de calendario** se valida en
  pantalla con la misma cuenta que el backend (`periodDraftSchema({ maxMonths })`, aditivo).
- País y asesor, un valor cada uno en la URL (P-05.19), se envían a `/dashboard` y a `/trends`.
- Granularidad de error: los seis paneles de `GET /reports/dashboard` comparten consulta y fallan
  juntos (cada uno pinta su error y su "Reintentar"); "Tendencias" (`/trends`) carga y falla por
  separado (AC-05.32). Partir el endpoint por panel sería un cambio de contrato; no hace falta.
- Clic en una barra → reporte con el filtro aplicado, y el mismo destino como enlace en la tabla:
  etapa → oportunidades (`stageId`, asesor, país, período con `dateBasis=IDENTIFIED`); fase →
  proyectos (`phaseId`, `situation=ACTIVE`, asesor, país); asesor → oportunidades (`ownerId`, país,
  período `IDENTIFIED`; "Otros" sin enlace); mes de forecast → forecast de ese mes (`fromMonth` =
  `toMonth`, asesor, país). "Ganadas vs. perdidas" y "Actividades y visitas" no navegan: sus
  conjuntos (ganadas + parciales por fecha de decisión; visitas realizadas + confirmadas por fecha
  real) no se expresan con un solo filtro de URL de los reportes de destino.
- "Proyectos activos" muestra la cifra y el texto "El período no aplica y este indicador no tiene
  tendencia" (AC-05.34). "Forecast por mes" avisa de las líneas sin conversión del rango.

### P-05.31 Embudo (F-41) en la interfaz

- Filtro de etapa de **un valor** en la URL (P-05.19; E.8 lo pedía multivalor, la API lo admite y
  queda como mejora sin cambio de contrato); sólo ofrece etapas con `inFunnel`.
- Barra: cantidad y, si se puede calcular, la participación ("4 · 57.14 %"). Tabla: Etapa,
  Cantidad, % del embudo, Conversión acumulada. Un porcentaje `null` se pinta "—" con el motivo
  visible debajo y en *tooltip*: "Sin datos", "Historial insuficiente" y "Muestra insuficiente
  (menos de M oportunidades)" con M = `sampleMinimum` (el DTO no trae el tamaño de la muestra, así
  que no se muestra "n < M"). Si la conversión no se puede calcular, un aviso lo explica.
- Clic en una etapa (o su enlace en la tabla) → reporte de oportunidades con `stageId`, cliente,
  asesor, país y período (`dateBasis=IDENTIFIED`). `companyTypeId` **no** se traslada: el reporte
  de oportunidades no tiene ese filtro.

### P-05.32 Pruebas de esta tanda

Vitest + RTL: `CommercialDashboardPage.spec.tsx` (AC-05.30–AC-05.34, PF-05.36, PF-05.38),
`SalesFunnelPage.spec.tsx` (AC-05.35–AC-05.39, PF-05.36, PF-05.38), `charts/ReportCharts.spec.tsx`
(librería real: embudo como `BarChart` horizontal con el color del tema; líneas y combinada con un
solo eje), `charts/charts-architecture.spec.ts` (PF-05.47: versión exacta, sin Pro/Premium ni
`FunnelChart`, librería sólo en las implementaciones y éstas sólo por `import()`, páginas lazy),
`use-report-time-zones.spec.tsx` (P-05.27), y ampliadas `ReportFilterBar.spec.tsx` (P-05.28),
`ChartPanel.spec.tsx` (`summary`), `report-period.spec.ts` (meses de calendario),
`OpportunitiesReportPage.spec.tsx` (gráfica por etapa) y `reports-routes.spec.ts` (siete páginas
lazy). Integración: `reports-projects.e2e.spec.ts` (zonas de `filter-options`). Las pantallas usan
dobles de las implementaciones (`testing/chart-doubles.ts`). Pendientes: los Playwright
PF-05.39/PF-05.40 (cubiertos en P-05.33).

---

## Precisiones de implementación — E2E (2026-10-14)

Etapa E4: recorridos de Playwright contra el stack aislado (`integration_e2e`, TESTING.md «E2E de
Reportes»). Sin cambios de código de producción, contrato ni esquema; no apareció ningún defecto
de producto.

### P-05.33 Recorridos PF-05.39 y PF-05.40

- Archivo `frontend/tests/e2e/crm-reports.e2e.spec.ts` (L.3 decía `reports.e2e.spec.ts`; se sigue el
  prefijo `crm-` de `crm-customers` y `crm-commercial-activity`). Serie con una sesión por usuario
  (2 accesos); cada aserción se contrasta con la respuesta real del servidor (`/summary`,
  `pagination.totalItems`, `X-Export-Rows`), nunca con cifras fijas de la demo.
- **PF-05.39 se divide en dos pruebas.** (1) Reporte de oportunidades desde el menú: resumen que
  cuadra (AC-05.5) y coincide con la tabla, tarjeta "Ganadas" que filtra la tabla, filtro
  "Estado = Abiertas" con su chip y, con él, "Exportar a Excel": se descarga
  `reporte-oportunidades-YYYYMMDD-HHmm.xlsx`, la prueba lo abre con `exceljs` (resuelto desde
  `backend/package.json`, sin dependencia nueva en el frontend) y comprueba hojas Datos / Resumen /
  Filtros, encabezados, número de filas y el mismo orden que la pantalla (AC-05.23). (2) Dashboard
  desde el menú con los siete paneles (AC-05.30), filtro de asesor aplicado a `/dashboard` y
  `/trends` (AC-05.31), "Ver como tabla" con los valores de la API (AC-05.33) y etapa → reporte de
  oportunidades con etapa, asesor y período `IDENTIFIED` y el **mismo conteo**; después el embudo.
- **"Abre el embudo desde el dashboard"** se interpreta como navegar al embudo por el menú estando
  en el dashboard: E.7 no define un enlace del dashboard al embudo (sus enlaces van a los reportes
  filtrados, P-05.30) y añadirlo sería alcance nuevo. El embudo se comprueba con su total, su tabla
  alternativa (AC-05.35) y etapa → reporte de oportunidades con el mismo conteo.
- **PF-05.40**: el asesor ve las siete opciones de Reportes (sale de `GET /me/menu`), sin
  "Exportar a Excel" (AC-05.28); visibilidad por alcance (AC-05.41): un proyecto de otro asesor del
  equipo lo encuentra el manager en el reporte de proyectos y el asesor no; y las siete pantallas a
  400 px sin desplazamiento horizontal de la página (las de tabla, como lista de tarjetas; dashboard
  y embudo, con sus gráficas ya pintadas).

### P-05.34 Datos y ejecución

- `e2e-stack.ts activate` imprime `E2E_REPORT_TEAM_PROJECT_CODE`: proyecto que el manager ve en
  `GET /reports/projects` y el asesor no (`GET /projects/{id}` → `404`), elegido por la API y
  distinto del que reasigna PF-03.115 (el orden de las suites no importa). No hacen falta usuarios
  propios: los roles de la semilla ya separan `reportes.exportar` (manager) del asesor.
- Batería completa en cuatro tandas separadas más de un minuto por el límite de 10 accesos por
  minuto: la cuarta es `crm-reports`. Puerta E4: dos ejecuciones completas seguidas en verde, cada
  una desde un esquema recién preparado.
- **Ajuste en PF-03.116 (Módulo 3).** Su prueba «sin `forecast.ver` no ve la opción del
  forecast» buscaba *cualquier* enlace «Forecast» y empezó a fallar porque el menú del Módulo 5
  trae Reportes › Forecast (`/reportes/forecast`), que exige `reportes.ver` y no `forecast.ver`
  (H.3, D-05.11): es el comportamiento especificado, no un defecto. La prueba comprueba ahora que
  no hay enlace a `/proyectos/forecast` ni ningún «Forecast» distinto del de Reportes, y la ruta
  sigue respondiendo «Sin acceso».

---

## Precisiones de implementación — revisión E5 (2026-10-14)

Revisión de código y de seguridad (AGENTS §9.12) de todo el módulo. Sin cambios de contrato,
esquema, permisos ni dependencias.

### P-05.35 Correcciones de la revisión

- **Fallo de la exportación con el libro empezado (P-05.12).** El escritor en *streaming* podía
  tener el libro abierto sin haber enviado aún las cabeceras; un error en ese intervalo (p. ej.
  `503 REPORT_TIMEOUT` durante el volcado o un fallo de auditoría) llegaba al filtro global con
  `Content-Type` XLSX y `Content-Disposition: attachment` ya fijados, y el ZIP podía seguir
  escribiendo en la respuesta. Ahora el archivo va por un flujo intermedio
  (`streamReportExport`): antes de enviar cabeceras se desconecta, se retiran las cabeceras del
  archivo y el error sale en JSON estándar; con las cabeceras enviadas se corta la conexión como
  antes (`report_export_aborted`). Prueba: `report-download.spec.ts`.
- **Hoja "Filtros" legible (RN-05.48).** Los enumerados (`dateBasis`, `status`,
  `statusCategory`, `situation`, `commercialStatus`, `groupBy`/`thenBy`, `sortBy`, `sortOrder`) se
  escriben con etiquetas en español; `OPEN_STAGE:<id>` nombra la etapa si es una opción
  autorizada. Se mantiene la decisión restrictiva de P-05.12: un id que no está entre las
  opciones autorizadas (cliente, proyecto, producto o asesor fuera del alcance) se muestra por
  su id, nunca por su nombre (prueba unitaria y aserción de integración con un asesor ajeno). La
  auditoría conserva los códigos (máquina).
- **Decisiones restrictivas verificadas y vigentes:** no se exportan `resultSummary` ni
  `resultNotes` (P-05.12, RN-05.50); "Filtros" con ids para clientes, proyectos y productos
  (P-05.12); el límite de 5 exportaciones por minuto cuenta también las rechazadas por
  validación (P-05.13, guard antes de los *pipes*).
- **Verificado sin cambios:** permiso y alcance de `reportes.ver` en las 19 rutas (los `/export`
  exigen además `reportes.exportar`, ambos obligatorios); alcance como predicado SQL en filas,
  conteos, distribuciones, dashboard, embudo, opciones de filtro y exportación (mismo
  `FROM … WHERE`); SQL de plantilla parametrizado (solo `ASC`/`DESC`, `<`/`>` y el tipo de la
  clave *keyset* van como texto, de listas fijas; `sortBy` por lista blanca en el DTO); búsqueda
  ≤ 100 caracteres escapada para `LIKE`; neutralización de fórmulas en todo texto del XLSX;
  `statement_timeout` en toda lectura y ninguna consulta extra del pool dentro de la transacción
  del volcado; firmas de `CommercialMetricsService` iguales a 01 F.2 y `metric-definitions.ts`
  solo ampliado (el Módulo 3 no cambia); frontend con gráficas solo en carga diferida, colores de
  `chartColors`, "Ver como tabla", cuatro estados y exportación con los mismos filtros y orden
  que la lista.
- **Deuda conocida (sin cambios):** avisos previos de `pnpm audit` (P-05.11) y chip de producto
  «Seleccionado» tras recargar (P-05.28, requiere contrato del Módulo 3).

## Precisiones de implementación — integración con los Módulos 1 y 6 (2026-10-14)

Merge de `main` (Módulo 1 · Inicio, Módulo 6 · Integraciones, despliegue de QA) en
`feature/crm-reportes`, como anticipaba P-05.1. Sin cambios de contrato, esquema, permisos ni
dependencias.

### P-05.36 Un solo `commercial-metrics` y un solo `common/xlsx.ts`

- **Base: la implementación del Módulo 1** (ya en `main`, 01 P-1). `CommercialMetricsService`
  conserva KPI-01…KPI-10 con su firma y su comportamiento (`countOutcomes`, `targetCompliance`,
  `semanticCatalog`, `MetricContext.inheritedProjectScope` para la herencia de visitas y
  actividades de 01 P-2, `forecastWindow(ctx, h, unidad)`) y Reportes añade encima sus
  agregaciones de P-05.2 (`semantics`, `countOpportunities`, `stageDistribution`,
  `ownerDistribution`, `countProjects`, `countVisitCategories`, `countActivityCategories`,
  `forecastTotals`, `forecastConsolidation`, `funnel`, `monthlyCounts`/`monthlySeries`,
  `activeProjectsByPhase`, `forecastOwnerTonnage` y los `*Criteria`). Las implementaciones de
  KPI-01…09 que esta rama había escrito sobre las agregaciones se retiran: Inicio y la prueba de
  consistencia usan las del Módulo 1.
- Adaptaciones de Reportes a los nombres de 01: `METRIC_CATALOGS.opportunityStage`/`projectPhase`;
  la etapa de la distribución pasa a `ReportStageCount` (`StageCount` de 01 + `isClosed`,
  `isActive`); DEF-E `isDoneUnconfirmedVisit` con la firma de 01 (`{ isDone, confirmedAt }`);
  `MetricContext` vive en el puerto y el servicio lo reexporta. El constructor recibe el lector de
  catálogos (Reportes) y el logger (Inicio).
- **Puerto y adaptador:** una sola interfaz con las dos familias de consultas (las de Inicio
  reciben ids y alcance; las de Reportes, criterios por entidad). El adaptador del Módulo 1 tenía
  su propia copia de `forecastLineVisibilitySql`; ahora usa la que exporta
  `prisma-forecast.repository.ts` (P-05.3), un solo predicado.
- **Definiciones:** `metric-definitions.ts` reúne las del Módulo 3, las del Módulo 1 (DEF-D, DEF-E,
  DEF-F y los conjuntos `isPending`/`isDone`/`isConfirmed`/`isOpen`/`isCompleted`) y las de
  Reportes (categorías disjuntas que delegan en el Módulo 4). Con un catálogo válido (un solo
  indicador por estado, que impone el registro de semántica) dan los mismos conjuntos.
- **PF-05.30/31 cubren las dos puertas:** `commercial-metrics-consistency.e2e.spec.ts` compara con
  el reporte equivalente tanto los métodos del servicio como las tarjetas de Inicio por HTTP
  (`/dashboard/indicators/projects|opportunities|forecast|visits|activities`), y el cambio de
  semántica de una etapa se ve a la vez en el servicio, en Inicio y en el reporte.
- **Diferencias de forma, no de negocio, que se mantienen:** KPI-03/04 de 01 cuentan las filas de
  `opportunity_results` del período sin mirar la etapa, y RN-05.22/25 exigen etapa cerrada; como
  reabrir una oportunidad anula su resultado (03, plan `REOPEN`), con datos válidos coinciden. En
  KPI-05, el `lineCount` mensual de Inicio incluye las líneas con cantidad 0 (proyecciones
  retiradas, que Reportes no cuenta, RN-05.33) y `totalTonnage` es `null` también con líneas sin
  conversión (01 P-12), donde el reporte da `0.0000`; las toneladas y las líneas sin conversión
  coinciden. Queda anotado para el responsable de negocio, sin cambiar ninguno de los dos.
- **XLSX:** las dos ramas incorporaron `exceljs` 4.4.0 exacta (una sola entrada en
  `backend/package.json` y en el *lockfile*). `common/xlsx.ts` es un único envoltorio con la
  lectura y la escritura de texto del Módulo 6 y el `XlsxStreamWriter` de Reportes; ambos
  neutralizan con `neutralizeFormula` de `common/csv.ts` (addendum de ADR-022).
- `AllExceptionsFilter`/`httpStatusOf` traducen a la vez `ServiceUnavailableError` → `503`
  (Reportes) y `UnsupportedMediaTypeError` → `415` (Módulo 6).
- E2E: TESTING.md «Todas las suites E2E en un mismo stack» ordena las diez suites en cinco tandas
  (un segundo `activate` con `E2E_ADMIN_PASSWORD` tras `auth-local`, para la carga masiva).

---

## Filas para la matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisiones (resueltas 2026-10-10) |
|---|---|---|---|---|---|---|---|---|---|---|
| F-34 | 5 Reportes | Reporte de proyectos | §7.1 | [05](05-reportes.md) | projects, customers, countries, users, opportunities, opportunity_results, catalog_items | Fase 0; Proyectos; `commercial-metrics` | AC-05.1–AC-05.4, AC-05.40–AC-05.43 | PF-05.4, PF-05.7, PF-05.20, PF-05.22, PF-05.33, PF-05.37 | especificada | DM-16, D-05.4, D-05.12, D-05.15 |
| F-35 | 5 Reportes | Reporte de oportunidades | §7.2 | [05](05-reportes.md) | opportunities (incl. `exchange_rate`, `exchange_rate_date`, `estimated_amount_usd`), opportunity_results, projects, customers, countries (`currency_code`), currencies, exchange_rates (lectura), project_products, users, catalog_items | Fase 0 (`ExchangeRateReader`); Proyectos; `commercial-metrics`; ADR-023 (distribuciones), ADR-024 | AC-05.5–AC-05.11, AC-05.40–AC-05.45 | PF-05.1, PF-05.2, PF-05.8–PF-05.12, PF-05.22, PF-05.30, PF-05.42–PF-05.44, PF-05.46 | especificada | DM-1, DM-15, DM-35, DM-36, D-05.4, D-05.10 |
| F-36 | 5 Reportes | Reporte de forecast | §7.3 | [05](05-reportes.md) | forecast_lines, projects, customers, products, product_families, units_of_measure, users | Fase 0; Proyectos (forecast); `commercial-metrics` | AC-05.12–AC-05.16, AC-05.40–AC-05.43 | PF-05.3, PF-05.13–PF-05.15, PF-05.22 | especificada | DM-24, DM-25, D-05.4 |
| F-37 | 5 Reportes | Reporte de visitas | §7.4 | [05](05-reportes.md) | visits, customers, projects, users, catalog_items | Fase 0; Actividad comercial; `commercial-metrics` | AC-05.17–AC-05.19, AC-05.40–AC-05.43 | PF-05.16–PF-05.18, PF-05.22 | especificada | DM-20 (cinco estados; confirma el dueño), D-05.4, D-05.6 |
| F-38 | 5 Reportes | Reporte de actividades | §7.5 | [05](05-reportes.md) | activities, customers, projects, users, catalog_items | Fase 0; Actividad comercial; `commercial-metrics` | AC-05.20–AC-05.22, AC-05.40–AC-05.43 | PF-05.19, PF-05.22, PF-05.30 | especificada | D-05.4, D-05.5 |
| F-39 | 5 Reportes | Exportación a Excel | §7.6 | [05](05-reportes.md) | las de F-34…F-38; audit_logs (escritura); system_parameters (`crm.reportes.max_filas_exportacion`) | F-34…F-38; ADR-022 (`exceljs`, escritor en *streaming*, neutralización de fórmulas) | AC-05.23–AC-05.29, AC-05.46 | PF-05.6, PF-05.21, PF-05.24–PF-05.28, PF-05.35, PF-05.45 | especificada | D-05.1 (ADR-022), D-05.3, D-05.14, DM-36 |
| F-40 | 5 Reportes | Dashboard comercial | §7.7 | [05](05-reportes.md) | projects, opportunities, opportunity_results, forecast_lines, visits, activities, catalog_items, users | `commercial-metrics`; ADR-023 (`@mui/x-charts` Community, carga diferida) | AC-05.30–AC-05.34, AC-05.41, AC-05.42, AC-05.47 | PF-05.22, PF-05.30, PF-05.36, PF-05.38, PF-05.39, PF-05.47 | especificada | D-05.2 (ADR-023), D-05.13 |
| F-41 | 5 Reportes | Embudo comercial | §7.8 | [05](05-reportes.md) | opportunities, opportunity_stage_history, projects, customers, catalog_items | `commercial-metrics`; ADR-023 (barras horizontales, sin `FunnelChart` Pro) | AC-05.35–AC-05.39, AC-05.47 | PF-05.5, PF-05.32, PF-05.38, PF-05.39, PF-05.47 | especificada | D-05.2 (ADR-023), D-05.8, D-05.9 |

> F-39, F-40 y F-41 pasan de `bloqueada` a `especificada` (2026-10-10): las dos
> librerías nuevas tienen ADR aceptado (ADR-022, ADR-023). Las ocho funcionalidades
> del módulo quedan `especificada`.
>
> **Estado vigente (2026-10-14):** las ocho funcionalidades están `completada` en la
> matriz (backend, frontend y E2E en verde; P-05.33, P-05.34). Las filas de arriba conservan el
> estado con que se especificaron.
