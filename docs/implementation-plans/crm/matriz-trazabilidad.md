# Matriz de trazabilidad del CRM

Cobertura de las **47 funcionalidades** del documento de alcance
([`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md)), agrupadas en sus siete
módulos. Cada fila apunta a la especificación que la desarrolla.

## Resumen

Regenerada el 2026-10-10 a partir de las secciones "Filas para la matriz" vigentes de
las siete especificaciones, verificadas contra el cuerpo de cada una: todos los
identificadores citados existen y cada criterio o prueba nuevo figura en la fila de la
funcionalidad que cubre. Los conteos de RN, AC y PF son los identificadores definidos en
cada especificación (numeración continua, sin huecos ni duplicados).

| Módulo | Especificación | Funcionalidades | Reglas (RN) | Criterios (AC) | Pruebas (PF) | `especificada` | `implementada (backend)` | `bloqueada` | `completada` |
|---|---|---|---|---|---|---|---|---|---|
| 1 Inicio | [01](01-inicio-dashboard.md) | 4 (F-01…F-04) | 32 | 41 | 50 | 0 | 0 | 0 | 4 |
| 2 Clientes | [02](02-clientes-cuentas.md) | 5 (F-05…F-09) | 32 | 55 | 62 | 0 | 0 | 0 | 5 |
| 3 Proyectos | [03](03-proyectos.md) | 11 (F-10…F-20) | 83 | 95 | 133 | 0 | 0 | 0 | 11 |
| 4 Actividad comercial | [04](04-actividad-comercial.md) | 13 (F-21…F-33) | 36 | 64 | 68 | 0 | 0 | 0 | 13 |
| 5 Reportes | [05](05-reportes.md) | 8 (F-34…F-41) | 59 | 47 | 47 | 8 | 0 | 0 | 0 |
| 6 Integraciones | [06](06-integraciones.md) | 1 (F-42) | 31 | 34 | 54 | 1 | 0 | 0 | 0 |
| 7 Administración | [07](07-administracion.md) | 5 (F-43…F-47) | 46 | 42 | 51 | 5 | 0 | 0 | 0 |
| **Total** | | **47** | **319** | **378** | **465** | **14** | **0** | **0** | **33** |

- `pendiente`: 0 · `especificada`: 14 · `implementada (backend)`: 0 · `bloqueada`: 0 · `en desarrollo`: 0 ·
  `completada`: 33 (Módulo 1: F-01…F-04, 2026-10-13; Módulo 2: F-05…F-09, 2026-10-11/12;
  Módulo 3: F-10…F-20, 2026-10-12; Módulo 4: F-21…F-33, 2026-10-13).
- Módulos 3 y 4 integrados el 2026-10-13 en `feature/crm-actividad-comercial`: el Módulo 4
  consume el Módulo 3 real (selectores y preselección de su barril, bloqueo del proyecto y
  `last_activity_at` con su repositorio, puntos de entrada de E.11 en la ficha del proyecto y
  en el detalle de oportunidad, E2E PF-04.58 desde la ficha; ver 04, «Precisiones de
  implementación (2026-10-13)»). F-11 y F-31 quedan cubiertas de extremo a extremo.
- **Todas las decisiones están resueltas (2026-10-10)**: el responsable de negocio
  respondió expresamente cinco temas y aprobó el valor recomendado del resto
  ([`decisiones-pendientes.md`](decisiones-pendientes.md)). F-39, F-40 y F-41 dejaron
  de estar bloqueadas al aprobarse ADR-022 (`exceljs`) y ADR-023 (`@mui/x-charts`
  Community); los adjuntos de los módulos 2, 3, 4 y 6 quedaron desbloqueados por ADR-021.
- **Extensión de alcance aprobada:** F-46 incluye el mantenimiento de tipos de cambio
  (DM-36 / ADR-024), y F-17, F-35 y F-46 leen o mantienen `currencies` y
  `exchange_rates`.
- Criterios y pruebas **transversales** no asignados a una sola funcionalidad (se
  aplican a todas las filas del módulo): 03 AC-03.84 / PF-03.110, PF-03.111, PF-03.116
  (menú y rutas, F-10…F-20); 04 AC-04.60 / PF-04.46 (auditoría y `visit_events`,
  F-25…F-33), PF-04.47 (proyecto con visita no cambia de cliente) y PF-04.57 (registro de
  rutas); 05 PF-05.23 (AC-05.41), PF-05.29 (AC-05.43) y PF-05.31 (AC-05.42), comunes a
  F-34…F-40. Los demás transversales (01 AC-01.37–39; 02 AC-02.49–51; 03 AC-03.85–86;
  04 AC-04.58–59, AC-04.64; 05 AC-05.40–43) se citan en las filas a las que aplican.
- F-42 queda entera (CSV y XLSX); su uso en producción sigue sujeto al parámetro
  `crm.importaciones.habilitada` (DM-28), que no bloquea la implementación.

## Cómo se cuentan las 47

Una funcionalidad por subapartado numerado del alcance (3.1 … 9.5). En el Módulo 4
los subapartados de visitas (6.5.1–6.5.4) y de actividades (6.6.1–6.6.3) cuentan
por separado, igual que la gestión general de visitas (6.5) y la entidad de
actividad (6.6): 4 + 5 + 11 + 13 + 8 + 1 + 5 = **47**.

## Estados

| Estado | Significado |
|---|---|
| `pendiente` | Aún sin especificación escrita |
| `especificada` | Documentada en su archivo, con criterios y pruebas. **No** es "completada". |
| `bloqueada` | Depende de una decisión pendiente ([`decisiones-pendientes.md`](decisiones-pendientes.md)) sin la cual no se puede construir; el alcance se conserva |
| `en desarrollo` | Implementación en curso |
| `implementada (backend)` | API, servicios y pruebas de backend (unitarias e integración) en verde; falta el frontend o el E2E. **No** es "completada" |
| `completada` | Implementada **y** validada por sus pruebas (alcance §12) |

Las columnas *Criterios* y *Pruebas* citan los identificadores de la sección I y J
de cada especificación (`AC-<módulo>.<n>`, `PF-<módulo>.<n>`). La columna *Decisiones
(resueltas)* cita las decisiones que dieron forma a la fila: identificadores de `00` §10
(`DM-n`), de cada módulo (`D-0X.n`) y de la consolidación (`DC-n`), todas resueltas el
2026-10-10 y localizables en el índice de
[`decisiones-pendientes.md`](decisiones-pendientes.md).

## Matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisiones (resueltas) |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 1 Inicio | Dashboard general | §3.1 | [01](01-inicio-dashboard.md) | `users`, `roles`, `user_roles`, `team_members`, `teams`, `menu_options`, `app_modules` (vía `GET /me`, `GET /me/menu`) | Núcleo de acceso (existente) | AC-01.1–AC-01.6, AC-01.37, AC-01.39 | PF-01.1–PF-01.7, PF-01.45, PF-01.47, PF-01.48 | completada (2026-10-13; enlaces a fichas del Módulo 4 al integrarlo, P-14) | DM-10, DM-32, D-01.12, DC-7 |
| F-02 | 1 Inicio | Indicadores clave | §3.2 | [01](01-inicio-dashboard.md) | `projects`, `opportunities`, `opportunity_results`, `forecast_lines`, `units_of_measure`, `visits`, `activities`, `customers`, `sales_targets`, `catalog_items`, `system_parameters` | Fase 0; Módulos 3 y 4; `VisibilityScopeResolver`; `CommercialMetricsService` (lo consume Reportes) | AC-01.7–AC-01.20, AC-01.37, AC-01.39–AC-01.41 | PF-01.8–PF-01.27, PF-01.44, PF-01.45, PF-01.47–PF-01.50 | completada (2026-10-13; enlaces a fichas del Módulo 4 al integrarlo, P-14) | DM-9, DM-15, DM-16, DM-36, D-01.2–D-01.8, D-01.13 |
| F-03 | 1 Inicio | Resumen de actividad | §3.3 | [01](01-inicio-dashboard.md) | Vista `crm_interactions_v`, `activities`, `visits`, `opportunity_stage_history`, `opportunity_result_history`, `opportunities`, `projects`, `project_phase_history`, `customers`, `users` | Fase 0 (vista); Módulos 2, 3 y 4 (enlaces) | AC-01.21–AC-01.26, AC-01.37, AC-01.38 | PF-01.28–PF-01.33, PF-01.45, PF-01.46 | completada (2026-10-13; enlaces a fichas del Módulo 4 al integrarlo, P-14) | DM-22, DM-27, D-01.1, D-01.9, D-01.10 |
| F-04 | 1 Inicio | Alertas y pendientes | §3.4 | [01](01-inicio-dashboard.md) | `activities`, `visits`, `projects`, `opportunities`, `customers`, `users`, `catalog_items` (`crm.prioridad`), `system_parameters` (`crm.alertas.*`) | Fase 0 (parámetros); Módulos 3 y 4; Módulo 7 (mantenimiento de parámetros) | AC-01.27–AC-01.36, AC-01.37, AC-01.38 | PF-01.34–PF-01.43, PF-01.45, PF-01.46 | completada (2026-10-13; enlaces a fichas del Módulo 4 al integrarlo, P-14) | DM-7, DM-20 (confirma el asesor dueño), DM-26, D-01.1, D-01.11, D-01.14 |
| F-05 | 2 Clientes | Búsqueda de clientes | §4.1 | [02](02-clientes-cuentas.md) | `customers`, `countries`, `catalog_items` (`crm.estado_cliente`), `users`, `team_members`, `projects` (herencia) | Fase 0 (modelo, semilla, `VisibilityScopeResolver`) | AC-02.1–AC-02.11, AC-02.50, AC-02.51, AC-02.55 | PF-02.1–PF-02.11, PF-02.50–PF-02.52, PF-02.54, PF-02.57, PF-02.61 | completada | DM-10, DM-12, DM-13, DM-14, D-02.8, D-02.11, D-02.14 |
| F-06 | 2 Clientes | Creación de clientes | §4.2 | [02](02-clientes-cuentas.md) | `customers`, `sequences`, `countries`, `catalog_items` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `users`, `system_parameters`, `attachments`, `stored_files`, `audit_logs` | `SequenceGenerator`, `CatalogReferenceValidator`, `ParameterReader`, `AttachmentsService` sobre `FileStorage` (ADR-021) | AC-02.12–AC-02.25, AC-02.50, AC-02.53, AC-02.55 | PF-02.12–PF-02.25, PF-02.50, PF-02.52, PF-02.55, PF-02.56, PF-02.59, PF-02.61 | completada | DM-2, DM-3, DM-4, DM-8, DM-18, D-02.1–D-02.4, D-02.15, D-02.17, D-06.11, DC-4, DC-6 |
| F-07 | 2 Clientes | Ficha del cliente | §4.3 | [02](02-clientes-cuentas.md) | `customers`, `contacts`, `attachments`, `stored_files`, `audit_logs`, `projects`/`activities`/`visits` (conteos) | `FileStorage` (ADR-021); Módulo 4 (botón de actividad, disponibilidad por menú) | AC-02.26–AC-02.35, AC-02.49, AC-02.50, AC-02.52–AC-02.54 | PF-02.26–PF-02.35, PF-02.49, PF-02.50, PF-02.52–PF-02.54, PF-02.58–PF-02.60, PF-02.62 | completada | DM-4, DM-8, DM-29, DM-33, DM-34, D-02.5, D-02.6, D-02.9, D-02.10, D-02.13, D-02.16, D-06.11, DC-2, DC-4 |
| F-08 | 2 Clientes | Proyectos asociados al cliente | §4.4 | [02](02-clientes-cuentas.md) | `projects`, `catalog_items` (`crm.fase_cliente`), `opportunities` (estado comercial) — lectura vía contrato del Módulo 3 | Módulo 3: `GET /projects?customerId=` (contrato fijado en 03 F.1) y ruta `/proyectos/:projectId` | AC-02.36–AC-02.39 | PF-02.36–PF-02.39 (y PF-03.118 en 03) | completada: sección de proyectos de la ficha sobre `GET /projects?customerId=` (03 F.1), con filtros, orden y navegación; activada por disponibilidad del menú | DM-16, D-02.10 |
| F-09 | 2 Clientes | Contactos | §4.5 | [02](02-clientes-cuentas.md) | `contacts`, `customers.primary_contact_id`, `interaction_participants` (lectura), `audit_logs` | — | AC-02.40–AC-02.48, AC-02.50 | PF-02.40–PF-02.48, PF-02.50, PF-02.52, PF-02.56 | completada | DM-5, DM-29, D-02.4, D-02.6, D-02.7 |
| F-10 | 3 Proyectos | Crear proyecto | §5.1 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `sequences`, `customers`, `countries`, `users`, `catalog_items` (`crm.fase_cliente`), `system_parameters`, `attachments`/`stored_files`, `audit_logs` | Fase 0 (`SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`); Módulo 2 (`CustomerReferenceGuard`, `CustomerPicker`, `AttachmentsService` sobre `FileStorage` (ADR-021), `ParameterReader`) | AC-03.1–AC-03.8, AC-03.95 | PF-03.1–PF-03.13, PF-03.113, PF-03.114, PF-03.133 | completada | DM-8, DM-17, D-03.1, D-03.4, D-03.16 |
| F-11 | 3 Proyectos | Consultar y editar proyectos | §5.2 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `opportunities`, `opportunity_stage_history`, `opportunity_results`, `opportunity_result_history`, `project_products`, `forecast_lines`, `attachments`, `audit_logs`, `visits`/`activities` (bloqueos) | F-10; Módulo 4 (`CommercialActivitySection`, `NewActivityButton`, `PlanVisitButton`) | AC-03.9–AC-03.16, AC-03.81, AC-03.85, AC-03.94, AC-03.95 | PF-03.14–PF-03.24, PF-03.107, PF-03.112, PF-03.113, PF-03.131, PF-03.133 | completada | DM-8, DM-16, DM-33, DM-34, D-02.10, D-03.2, D-03.11 |
| F-12 | 3 Proyectos | Duplicar proyecto | §5.3 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `project_products`, `unit_conversion_rules`, `audit_logs` | F-10, F-15, F-19 | AC-03.17–AC-03.20 | PF-03.25–PF-03.29, PF-03.115 | completada | DM-17, D-03.9 |
| F-13 | 3 Proyectos | Buscar proyectos | §5.4 | [03](03-proyectos.md) | `projects`, `customers`, `countries`, `users`, `opportunities`, `catalog_items` | F-10; `VisibilityScopeResolver`; `metric-definitions.ts` (DEF-A/B, creado aquí) | AC-03.21–AC-03.25, AC-03.86 | PF-03.30–PF-03.35, PF-03.117–PF-03.120 | completada | DM-16, D-03.1, D-03.3 |
| F-14 | 3 Proyectos | Visualización de proyectos del equipo | §5.5 | [03](03-proyectos.md) | `projects`, `users`, `team_members`, `teams`, `roles` (`dataScope`: `OWN`, `TEAM`, `COUNTRY`, `ORGANIZATION`) | F-10 | AC-03.26–AC-03.29 | PF-03.34, PF-03.36–PF-03.39, PF-03.115 | completada | DM-10, DM-11, DM-12, DM-13, DM-34, D-03.10 |
| F-15 | 3 Proyectos | Clasificación de proyectos | §5.6 | [03](03-proyectos.md) | `projects`, `catalog_items` (`crm.tipo_proyecto`, `crm.sector_proyecto`), `units_of_measure`, `unit_conversion_rules` | Fase 0 (`UnitConversionResolver`, reglas genéricas) | AC-03.30–AC-03.35 | PF-03.40–PF-03.48 | completada | DM-24, D-03.13 |
| F-16 | 3 Proyectos | Fase del cliente | §5.7 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `catalog_items` (`crm.fase_cliente`), `system_parameters` (`crm.proyectos.reglas_avance`) | F-10 | AC-03.36–AC-03.40 | PF-03.49–PF-03.55 | completada | D-03.15 |
| F-17 | 3 Proyectos | Oportunidades comerciales | §5.8 | [03](03-proyectos.md) | `opportunities`, `opportunity_stage_history`, `catalog_items` (`crm.etapa_oportunidad`), `sequences`, `countries` (`currency_code`), `currencies`, `exchange_rates` (lectura), `system_parameters` (`crm.oportunidades.transiciones_etapa`, `crm.valores_por_defecto`, `crm.moneda_base`, `crm.tipos_cambio.dias_aviso_antiguedad`) | F-10; Fase 0 (`ExchangeRateReader`, semilla de monedas y tipos de cambio); ADR-024 | AC-03.41–AC-03.50, AC-03.87–AC-03.94 | PF-03.56–PF-03.69, PF-03.121–PF-03.132 | completada | DM-1, DM-6, DM-33, DM-35, DM-36, D-03.7, D-03.8, D-03.12 |
| F-18 | 3 Proyectos | Resultado de oportunidades | §5.9 | [03](03-proyectos.md) | `opportunity_results`, `opportunity_result_history`, `opportunities`, `catalog_items` (`crm.resultado_oportunidad`, `crm.motivo_resultado`) | F-17 | AC-03.51–AC-03.58 | PF-03.70–PF-03.79 | completada | DM-15 (parcial cuenta como ganada), D-03.8 |
| F-19 | 3 Proyectos | Productos asociados | §5.10 | [03](03-proyectos.md) | `project_products`, `products`, `product_families`, `units_of_measure`, `unit_conversion_rules`, `catalog_items` (`crm.estado_producto_asociado`) | F-10, F-17; Fase 0 (maestro y reglas) | AC-03.59–AC-03.68 | PF-03.80–PF-03.91 | completada | DM-23, DM-24, D-03.13, D-03.14 |
| F-20 | 3 Proyectos | Forecast comercial M+6 | §5.11 | [03](03-proyectos.md) | `forecast_lines`, `project_products`, `products`, `units_of_measure`, `unit_conversion_rules`, `users`, `system_parameters` (`crm.forecast.*`, `crm.zona_horaria_negocio`) | F-19 | AC-03.69–AC-03.83 | PF-03.92–PF-03.109, PF-03.114 | completada | DM-24, DM-25, D-03.5, D-03.6, D-03.13 |
| F-21 | 4 Actividad | Agenda general | §6.1 | [04](04-actividad-comercial.md) | `visits`, `activities`, `attachments`, `customers`, `projects`, `users`, `countries`, `catalog_items` | Fase 0; Módulos 2 y 3 | AC-04.1–AC-04.6, AC-04.58, AC-04.59, AC-04.64 | PF-04.6, PF-04.37–PF-04.39, PF-04.43–PF-04.45, PF-04.48, PF-04.49, PF-04.59 | completada | DM-8, DM-12, D-01.1, D-04.1, D-04.12 |
| F-22 | 4 Actividad | Actividades pendientes | §6.2 | [04](04-actividad-comercial.md) | `activities`, `catalog_items` (`crm.estado_actividad`, `crm.prioridad`), `system_parameters` | Fase 0; Módulo 2 | AC-04.7–AC-04.10 | PF-04.1, PF-04.2, PF-04.35, PF-04.36, PF-04.50, PF-04.61 | completada | DM-7 |
| F-23 | 4 Actividad | Seguimiento comercial | §6.3 | [04](04-actividad-comercial.md) | Vista `crm_interactions_v`, `visits`, `activities`, `attachments` | Fase 0 (migración 8); Módulos 2 y 3 | AC-04.11–AC-04.14 | PF-04.7, PF-04.41, PF-04.42, PF-04.55, PF-04.58 | completada | DM-22, D-04.9 |
| F-24 | 4 Actividad | Historial de interacciones | §6.4 | [04](04-actividad-comercial.md) | Vista `crm_interactions_v`, `visits`, `activities` | Fase 0 (migración 8) | AC-04.15–AC-04.18 | PF-04.40, PF-04.55, PF-04.59 | completada | DM-22 |
| F-25 | 4 Actividad | Visitas comerciales (gestión) | §6.5 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `stored_files`, `contacts` | Fase 0; Módulos 2 y 3 | AC-04.19–AC-04.23, AC-04.64 | PF-04.10, PF-04.14, PF-04.23, PF-04.25, PF-04.52, PF-04.62, PF-04.67 | completada | DM-8, DM-20, DC-2, DC-4 |
| F-26 | 4 Actividad | Planificar visita | §6.5.1 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `stored_files`, `sequences`, `system_parameters` | Fase 0; Módulos 2 y 3 | AC-04.24–AC-04.28 | PF-04.4, PF-04.8–PF-04.13, PF-04.51, PF-04.56, PF-04.59, PF-04.62 | completada | DM-8, DM-27, D-04.2, D-04.5 |
| F-27 | 4 Actividad | Registrar visita realizada | §6.5.2 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `projects` (`last_activity_at`) | F-26 | AC-04.29–AC-04.32 | PF-04.3, PF-04.15–PF-04.17, PF-04.52, PF-04.59 | completada | DM-21, D-04.4, D-04.6 |
| F-28 | 4 Actividad | Confirmar visita | §6.5.3 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `attachments` | F-27 | AC-04.33–AC-04.36, AC-04.61–AC-04.63 | PF-04.18–PF-04.20, PF-04.52, PF-04.59, PF-04.60, PF-04.63–PF-04.66, PF-04.68 | completada | DM-20 (confirma el asesor dueño de la visita; `ck_visits_confirmed_by_owner`) |
| F-29 | 4 Actividad | Reprogramar o cancelar visita | §6.5.4 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `attachments`, `catalog_items` (motivos) | F-26 | AC-04.37–AC-04.41 | PF-04.21–PF-04.24, PF-04.52, PF-04.59, PF-04.62 | completada | DM-8, D-04.3 (`isRescheduled`), D-04.5, D-04.18 |
| F-30 | 4 Actividad | Actividades comerciales (entidad) | §6.6 | [04](04-actividad-comercial.md) | `activities`, `interaction_participants`, `attachments`, `opportunities`, `catalog_items` | Fase 0; Módulos 2 y 3 | AC-04.42–AC-04.45 | PF-04.27, PF-04.31, PF-04.34 | completada | DM-33, D-04.7 |
| F-31 | 4 Actividad | Crear actividad | §6.6.1 | [04](04-actividad-comercial.md) | `activities`, `customers`, `projects`, `opportunities`, `sequences` | Módulos 2 y 3 (fichas) | AC-04.46–AC-04.49 | PF-04.26, PF-04.53, PF-04.54, PF-04.58 | completada | D-04.10, D-04.14 |
| F-32 | 4 Actividad | Llamadas, reuniones y correos | §6.6.2 | [04](04-actividad-comercial.md) | `activities`, `interaction_participants`, `catalog_items` (`crm.tipo_actividad.metadata.fields`) | F-30 | AC-04.50–AC-04.53 | PF-04.5, PF-04.28–PF-04.30, PF-04.53, PF-04.58 | completada | D-04.8 |
| F-33 | 4 Actividad | Confirmar realización de actividad | §6.6.3 | [04](04-actividad-comercial.md) | `activities`, `attachments`, `projects` (`last_activity_at`) | F-30 | AC-04.54–AC-04.57 | PF-04.32, PF-04.33, PF-04.50, PF-04.61 | completada | DM-21, D-04.6 |
| F-34 | 5 Reportes | Reporte de proyectos | §7.1 | [05](05-reportes.md) | `projects`, `customers`, `countries`, `users`, `opportunities`, `opportunity_results`, `catalog_items` | Fase 0; Módulo 3; `commercial-metrics` | AC-05.1–AC-05.4, AC-05.40–AC-05.43 | PF-05.4, PF-05.7, PF-05.20, PF-05.22, PF-05.33, PF-05.37 | especificada | DM-16, D-05.4, D-05.12, D-05.15 |
| F-35 | 5 Reportes | Reporte de oportunidades | §7.2 | [05](05-reportes.md) | `opportunities` (incl. `exchange_rate`, `exchange_rate_date`, `estimated_amount_usd`), `opportunity_results`, `projects`, `customers`, `countries` (`currency_code`), `currencies`, `exchange_rates` (lectura), `project_products`, `users`, `catalog_items` | Fase 0 (`ExchangeRateReader`); Módulo 3; `commercial-metrics`; ADR-023 (distribuciones); ADR-024 | AC-05.5–AC-05.11, AC-05.40–AC-05.45 | PF-05.1, PF-05.2, PF-05.8–PF-05.12, PF-05.22, PF-05.30, PF-05.42–PF-05.44, PF-05.46 | especificada | DM-1, DM-15, DM-35, DM-36, D-05.4, D-05.10 |
| F-36 | 5 Reportes | Reporte de forecast | §7.3 | [05](05-reportes.md) | `forecast_lines`, `projects`, `customers`, `products`, `product_families`, `units_of_measure`, `users` | Fase 0; Módulo 3 (forecast); `commercial-metrics` | AC-05.12–AC-05.16, AC-05.40–AC-05.43 | PF-05.3, PF-05.13–PF-05.15, PF-05.22 | especificada | DM-24, DM-25, D-05.4 |
| F-37 | 5 Reportes | Reporte de visitas | §7.4 | [05](05-reportes.md) | `visits`, `customers`, `projects`, `users`, `catalog_items` | Fase 0; Módulo 4; `commercial-metrics` | AC-05.17–AC-05.19, AC-05.40–AC-05.43 | PF-05.16–PF-05.18, PF-05.22 | especificada | DM-20 (cinco estados; confirma el asesor dueño), D-05.4, D-05.6 |
| F-38 | 5 Reportes | Reporte de actividades | §7.5 | [05](05-reportes.md) | `activities`, `customers`, `projects`, `users`, `catalog_items` | Fase 0; Módulo 4; `commercial-metrics` | AC-05.20–AC-05.22, AC-05.40–AC-05.43 | PF-05.19, PF-05.22, PF-05.30, PF-05.33, PF-05.34 | especificada | D-05.4, D-05.5 |
| F-39 | 5 Reportes | Exportación a Excel | §7.6 | [05](05-reportes.md) | Las de F-34…F-38; `audit_logs` (escritura); `system_parameters` (`crm.reportes.max_filas_exportacion`) | F-34…F-38; ADR-022 (`exceljs`, escritor en *streaming*, neutralización de fórmulas) | AC-05.23–AC-05.29, AC-05.46 | PF-05.6, PF-05.21, PF-05.24–PF-05.28, PF-05.35, PF-05.39–PF-05.41, PF-05.45 | especificada | D-05.1 (ADR-022), D-05.3, D-05.14, DM-36 |
| F-40 | 5 Reportes | Dashboard comercial | §7.7 | [05](05-reportes.md) | `projects`, `opportunities`, `opportunity_results`, `forecast_lines`, `visits`, `activities`, `catalog_items`, `users` | `commercial-metrics`; ADR-023 (`@mui/x-charts` Community, carga diferida) | AC-05.30–AC-05.34, AC-05.41, AC-05.42, AC-05.47 | PF-05.22, PF-05.30, PF-05.36, PF-05.38, PF-05.39, PF-05.47 | especificada | D-05.2 (ADR-023), D-05.13 |
| F-41 | 5 Reportes | Embudo comercial | §7.8 | [05](05-reportes.md) | `opportunities`, `opportunity_stage_history`, `projects`, `customers`, `catalog_items` | `commercial-metrics`; ADR-023 (barras horizontales, sin `FunnelChart` Pro) | AC-05.35–AC-05.39, AC-05.47 | PF-05.5, PF-05.32, PF-05.38, PF-05.39, PF-05.47 | especificada | D-05.2 (ADR-023), D-05.8, D-05.9 |
| F-42 | 6 Integraciones | Carga masiva de clientes (CSV/XLSX) | §8.1 | [06](06-integraciones.md) | `customer_imports`, `customer_import_rows`, `customers`, `countries`, `catalog_items` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `users`, `system_parameters`, `sequences`, `audit_logs` | Fase 0; Módulo 2 (validación y alta de clientes, F-06); `exceljs` y `common/xlsx.ts` compartidos con F-39 (ADR-022); uso productivo sujeto a `crm.importaciones.habilitada` (no bloquea) | AC-06.1–AC-06.34 | PF-06.1–PF-06.54 | especificada | DM-2, DM-4, DM-8, DM-18, DM-28, D-06.1 (ADR-022), D-06.2–D-06.13, DC-4, DC-6 |
| F-43 | 7 Administración | Usuarios | §9.1 | [07](07-administracion.md) | `users` (+`employee_code`, `country_id`; defaults `es-GT`/`America/Guatemala`), `countries`, `teams`, `team_members`, `user_roles`, `audit_logs` | Fase 0 (migración 2, semilla de países); PLAN-ADMIN usuarios y equipos; ADR-020 y su addendum de 2026-10-10 | AC-07.1–AC-07.10, AC-07.41 | PF-07.1–PF-07.5, PF-07.19–PF-07.24, PF-07.39, PF-07.43, PF-07.45, PF-07.49 | especificada | DM-12, DM-14, DM-30, D-07.2, D-07.3, D-07.4, D-07.13, D-07.14 |
| F-44 | 7 Administración | Roles y permisos | §9.2 | [07](07-administracion.md) | `roles`, `permissions`, `role_permissions`, `role_menu_options`, enum `data_scope` | Fase 0 (migración 1, semilla de roles/permisos); PLAN-ADMIN roles; ADR-018, ADR-020 | AC-07.11–AC-07.17 | PF-07.6–PF-07.9, PF-07.25–PF-07.27, PF-07.45 | especificada | DM-10, DM-11, DM-32, DM-34, D-07.1 |
| F-45 | 7 Administración | Catálogos | §9.3 | [07](07-administracion.md) | `catalogs`, `catalog_items` (17 `crm.*`), `system_parameters` (referencias) | Fase 0 (semilla, registro de semántica); PLAN-ADMIN catálogos | AC-07.18–AC-07.25 | PF-07.10, PF-07.11, PF-07.28–PF-07.33, PF-07.40, PF-07.46 | especificada | D-07.5, D-07.6, D-07.12 |
| F-46 | 7 Administración | Parámetros generales (incluye tipos de cambio — extensión de alcance aprobada por el responsable (2026-10-10), DM-36 / ADR-024) | §9.4 | [07](07-administracion.md) | `system_parameters` (`crm.*`, `seguridad.*`), `units_of_measure`, `product_families`, `products`, `unit_conversion_rules`, `currencies` (solo lectura), `exchange_rates` | Fase 0 (semilla de parámetros, maestros, monedas y tipos de cambio; `ExchangeRateReader`); PLAN-ADMIN parámetros; ADR-019, ADR-024 | AC-07.26–AC-07.33, AC-07.40, AC-07.42 | PF-07.12–PF-07.16, PF-07.34–PF-07.36, PF-07.41, PF-07.42, PF-07.47, PF-07.48, PF-07.50, PF-07.51 | especificada | DM-6, DM-7, DM-23, DM-24, DM-36, D-07.7, D-07.8, D-07.9 |
| F-47 | 7 Administración | Auditoría e historial de cambios | §9.5 | [07](07-administracion.md) | `audit_logs` | PLAN-ADMIN auditoría; eventos emitidos por los módulos 2–6; ADR-025 | AC-07.34–AC-07.39 | PF-07.17, PF-07.18, PF-07.37–PF-07.39, PF-07.44, PF-07.46 | especificada | DM-29, D-07.10, D-07.11 |

> Una fila pasa a `en desarrollo` cuando empieza su implementación y a `completada`
> solo cuando está implementada **y** validada por sus pruebas. Si una decisión se
> reabre y deja de poder construirse lo que depende de ella, la fila pasa a `bloqueada`
> conservando su alcance.
