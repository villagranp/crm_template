# Matriz de trazabilidad del CRM

Cobertura de las **47 funcionalidades** del documento de alcance
([`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md)), agrupadas en sus siete
módulos. Cada fila apunta a la especificación que la desarrolla.

## Resumen

Consolidado el 2026-10-10 a partir de las secciones "Filas para la matriz" de las
siete especificaciones, verificadas contra el cuerpo de cada una (identificadores
existentes y asignados a la funcionalidad correcta).

| Módulo | Especificación | Funcionalidades | Reglas (RN) | Criterios (AC) | Pruebas (PF) | `especificada` | `bloqueada` |
|---|---|---|---|---|---|---|---|
| 1 Inicio | [01](01-inicio-dashboard.md) | 4 (F-01…F-04) | 31 | 39 | 48 | 4 | 0 |
| 2 Clientes | [02](02-clientes-cuentas.md) | 5 (F-05…F-09) | 31 | 51 | 57 | 5 | 0 |
| 3 Proyectos | [03](03-proyectos.md) | 11 (F-10…F-20) | 77 | 86 | 120 | 11 | 0 |
| 4 Actividad comercial | [04](04-actividad-comercial.md) | 13 (F-21…F-33) | 36 | 60 | 62 | 13 | 0 |
| 5 Reportes | [05](05-reportes.md) | 8 (F-34…F-41) | 57 | 43 | 41 | 5 | 3 |
| 6 Integraciones | [06](06-integraciones.md) | 1 (F-42) | 30 | 31 | 50 | 1 | 0 |
| 7 Administración | [07](07-administracion.md) | 5 (F-43…F-47) | 43 | 39 | 46 | 5 | 0 |
| **Total** | | **47** | **305** | **349** | **424** | **44** | **3** |

- `pendiente`: 0 · `especificada`: 44 · `bloqueada`: 3 (F-39, F-40, F-41, solo en lo que
  depende de las librerías nuevas: D-05.1 y D-05.2) · `en desarrollo` / `completada`: 0.
- Todas las filas `especificada` se construyen con el **valor recomendado** de sus
  decisiones pendientes; ninguna decisión elimina alcance. Lo que bloquea la Fase 0 o
  un módulo está en [`decisiones-pendientes.md`](decisiones-pendientes.md) (niveles T0,
  T1 y ADR).
- Criterios y pruebas **transversales** (no asignados a una sola funcionalidad):
  01 AC-01.37–39 / PF-01.44–48; 02 AC-02.49–51 / PF-02.49–57; 03 AC-03.84–86 /
  PF-03.110–120; 04 AC-04.58–60 / PF-04.44–47, PF-04.57; 05 AC-05.40–43 /
  PF-05.20, PF-05.22, PF-05.23, PF-05.29–31; 06: todo el módulo es F-42. Se citan en
  las filas a las que aplican.
- F-42 (carga masiva) queda `especificada`: sin el ADR de D-06.1 se construye entera
  con CSV; solo la variante XLSX espera al ADR.

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
| `completada` | Implementada **y** validada por sus pruebas (alcance §12) |

Las columnas *Criterios* y *Pruebas* citan los identificadores de la sección I y J
de cada especificación (`AC-<módulo>.<n>`, `PF-<módulo>.<n>`). La columna *Decisión
pendiente* cita los identificadores de `00` §10 (`DM-n`), de cada módulo (`D-0X.n`)
y de la consolidación (`DC-n`); todos están en
[`decisiones-pendientes.md`](decisiones-pendientes.md).

## Matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisión pendiente |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 1 Inicio | Dashboard general | §3.1 | [01](01-inicio-dashboard.md) | `users`, `roles`, `user_roles`, `team_members`, `teams`, `menu_options`, `app_modules` (vía `GET /me`, `GET /me/menu`) | Núcleo de acceso (existente) | AC-01.1–AC-01.6, AC-01.37, AC-01.39 | PF-01.1–PF-01.7, PF-01.45, PF-01.47, PF-01.48 | especificada | DM-10, DM-32, D-01.12 |
| F-02 | 1 Inicio | Indicadores clave | §3.2 | [01](01-inicio-dashboard.md) | `projects`, `opportunities`, `opportunity_results`, `forecast_lines`, `units_of_measure`, `visits`, `activities`, `customers`, `sales_targets`, `catalog_items`, `system_parameters` | Fase 0; Módulos 3 y 4; `VisibilityScopeResolver`; `CommercialMetricsService` (lo consume Reportes) | AC-01.7–AC-01.20, AC-01.37, AC-01.39 | PF-01.8–PF-01.27, PF-01.44, PF-01.45, PF-01.47, PF-01.48 | especificada | DM-9, DM-15, DM-16, D-01.3, D-01.4, D-01.5, D-01.6, D-01.7, D-01.8, D-01.13 |
| F-03 | 1 Inicio | Resumen de actividad | §3.3 | [01](01-inicio-dashboard.md) | Vista `crm_interactions_v`, `activities`, `visits`, `opportunity_stage_history`, `opportunity_result_history`, `opportunities`, `projects`, `project_phase_history`, `customers`, `users` | Fase 0 (vista); Módulos 2, 3 y 4 (enlaces) | AC-01.21–AC-01.26, AC-01.37, AC-01.38 | PF-01.28–PF-01.33, PF-01.45, PF-01.46 | especificada | DM-22, DM-27, D-01.1 (ADR), D-01.9, D-01.10 |
| F-04 | 1 Inicio | Alertas y pendientes | §3.4 | [01](01-inicio-dashboard.md) | `activities`, `visits`, `projects`, `opportunities`, `customers`, `users`, `catalog_items` (`crm.prioridad`), `system_parameters` (`crm.alertas.*`) | Fase 0 (parámetros); Módulos 3 y 4; Módulo 7 (mantenimiento de parámetros) | AC-01.27–AC-01.36, AC-01.37, AC-01.38 | PF-01.34–PF-01.43, PF-01.45, PF-01.46 | especificada | DM-7, DM-20, DM-26, D-01.1 (ADR), D-01.11, D-01.14 |
| F-05 | 2 Clientes | Búsqueda de clientes | §4.1 | [02](02-clientes-cuentas.md) | `customers`, `countries`, `catalog_items` (`crm.estado_cliente`), `users`, `team_members`, `projects` (herencia) | Fase 0 (modelo, semilla, `VisibilityScopeResolver`) | AC-02.1–AC-02.11, AC-02.50, AC-02.51 | PF-02.1–PF-02.11, PF-02.50–PF-02.54, PF-02.57 | especificada | DM-10, **DM-12**, DM-13, DM-14, D-02.8, D-02.11, D-02.14 |
| F-06 | 2 Clientes | Creación de clientes | §4.2 | [02](02-clientes-cuentas.md) | `customers`, `sequences`, `countries`, `catalog_items` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `users`, `system_parameters`, `attachments`, `stored_files`, `audit_logs` | `SequenceGenerator`, `CatalogReferenceValidator`, `ParameterReader`, `AttachmentsService` | AC-02.12–AC-02.25, AC-02.50 | PF-02.12–PF-02.25, PF-02.50, PF-02.52, PF-02.55, PF-02.56 | especificada | DM-3, DM-4, DM-8 (adjuntos), DM-18, D-02.1, D-02.2, D-02.3, D-02.4, D-02.15, D-02.17, D-06.11 |
| F-07 | 2 Clientes | Ficha del cliente | §4.3 | [02](02-clientes-cuentas.md) | `customers`, `contacts`, `attachments`, `stored_files`, `audit_logs`, `projects`/`activities`/`visits` (conteos) | Módulo 4 (botón de actividad, disponibilidad por menú) | AC-02.26–AC-02.35, AC-02.49, AC-02.50 | PF-02.26–PF-02.35, PF-02.49, PF-02.50, PF-02.52–PF-02.54 | especificada | DM-8, DM-29, DM-33, DM-34, D-02.5, D-02.6, D-02.9, D-02.10, D-02.13, D-02.16 |
| F-08 | 2 Clientes | Proyectos asociados al cliente | §4.4 | [02](02-clientes-cuentas.md) | `projects`, `catalog_items` (`crm.fase_cliente`), `opportunities` (estado comercial) — lectura vía contrato del Módulo 3 | Módulo 3: `GET /projects?customerId=` (contrato fijado en 03 F.1) y ruta `/proyectos/:projectId` | AC-02.36–AC-02.39 | PF-02.36–PF-02.39 (y PF-03.118 en 03) | especificada | DM-16, D-02.10 |
| F-09 | 2 Clientes | Contactos | §4.5 | [02](02-clientes-cuentas.md) | `contacts`, `customers.primary_contact_id`, `interaction_participants` (lectura), `audit_logs` | — | AC-02.40–AC-02.48, AC-02.50 | PF-02.40–PF-02.48, PF-02.50, PF-02.52, PF-02.56 | especificada | DM-5, DM-29, D-02.4, D-02.6, D-02.7 |
| F-10 | 3 Proyectos | Crear proyecto | §5.1 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `sequences`, `customers`, `countries`, `users`, `catalog_items` (`crm.fase_cliente`), `system_parameters`, `attachments`/`stored_files`, `audit_logs` | Fase 0 (`SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`); Módulo 2 (`CustomerReferenceGuard`, `CustomerPicker`, `AttachmentsService`, `ParameterReader`) | AC-03.1–AC-03.8 | PF-03.1–PF-03.13, PF-03.113, PF-03.114 | especificada | DM-8 (adjuntos), DM-17, D-03.1, D-03.4, D-03.16 |
| F-11 | 3 Proyectos | Consultar y editar proyectos | §5.2 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `opportunities`, `opportunity_stage_history`, `opportunity_results`, `opportunity_result_history`, `project_products`, `forecast_lines`, `attachments`, `audit_logs`, `visits`/`activities` (bloqueos) | F-10; Módulo 4 (`CommercialActivitySection`, `NewActivityButton`, `PlanVisitButton`) | AC-03.9–AC-03.16, AC-03.81, AC-03.85 | PF-03.14–PF-03.24, PF-03.107, PF-03.112, PF-03.113 | especificada | DM-8, DM-16, DM-33, DM-34, D-02.10, D-03.2, D-03.11 |
| F-12 | 3 Proyectos | Duplicar proyecto | §5.3 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `project_products`, `unit_conversion_rules`, `audit_logs` | F-10, F-15, F-19 | AC-03.17–AC-03.20 | PF-03.25–PF-03.29, PF-03.115 | especificada | DM-17, D-03.9 |
| F-13 | 3 Proyectos | Buscar proyectos | §5.4 | [03](03-proyectos.md) | `projects`, `customers`, `countries`, `users`, `opportunities`, `catalog_items` | F-10; `VisibilityScopeResolver`; `metric-definitions.ts` (DEF-A/B, creado aquí) | AC-03.21–AC-03.25, AC-03.86 | PF-03.30–PF-03.35, PF-03.117–PF-03.120 | especificada | DM-16, D-03.1, D-03.3 |
| F-14 | 3 Proyectos | Visualización de proyectos del equipo | §5.5 | [03](03-proyectos.md) | `projects`, `users`, `team_members`, `teams`, `roles` (`dataScope`) | F-10 | AC-03.26–AC-03.29 | PF-03.34, PF-03.36–PF-03.39, PF-03.115 | especificada | DM-10, DM-11, **DM-12**, DM-13, DM-34, D-03.10 |
| F-15 | 3 Proyectos | Clasificación de proyectos | §5.6 | [03](03-proyectos.md) | `projects`, `catalog_items` (`crm.tipo_proyecto`, `crm.sector_proyecto`), `units_of_measure`, `unit_conversion_rules` | Fase 0 (`UnitConversionResolver`, reglas genéricas) | AC-03.30–AC-03.35 | PF-03.40–PF-03.48 | especificada | DM-24, D-03.13 |
| F-16 | 3 Proyectos | Fase del cliente | §5.7 | [03](03-proyectos.md) | `projects`, `project_phase_history`, `catalog_items` (`crm.fase_cliente`), `system_parameters` (`crm.proyectos.reglas_avance`) | F-10 | AC-03.36–AC-03.40 | PF-03.49–PF-03.55 | especificada | D-03.15 |
| F-17 | 3 Proyectos | Oportunidades comerciales | §5.8 | [03](03-proyectos.md) | `opportunities`, `opportunity_stage_history`, `catalog_items` (`crm.etapa_oportunidad`), `sequences`, `system_parameters` (`crm.oportunidades.transiciones_etapa`, `crm.valores_por_defecto`, `crm.moneda_por_defecto`) | F-10 | AC-03.41–AC-03.50 | PF-03.56–PF-03.69 | especificada | DM-1, DM-6, DM-33, DM-35, D-03.7, D-03.8, D-03.12 |
| F-18 | 3 Proyectos | Resultado de oportunidades | §5.9 | [03](03-proyectos.md) | `opportunity_results`, `opportunity_result_history`, `opportunities`, `catalog_items` (`crm.resultado_oportunidad`, `crm.motivo_resultado`) | F-17 | AC-03.51–AC-03.58 | PF-03.70–PF-03.79 | especificada | DM-15, D-03.8 |
| F-19 | 3 Proyectos | Productos asociados | §5.10 | [03](03-proyectos.md) | `project_products`, `products`, `product_families`, `units_of_measure`, `unit_conversion_rules`, `catalog_items` (`crm.estado_producto_asociado`) | F-10, F-17; Fase 0 (maestro y reglas) | AC-03.59–AC-03.68 | PF-03.80–PF-03.91 | especificada | DM-23, DM-24, D-03.13, D-03.14 |
| F-20 | 3 Proyectos | Forecast comercial M+6 | §5.11 | [03](03-proyectos.md) | `forecast_lines`, `project_products`, `products`, `units_of_measure`, `unit_conversion_rules`, `users`, `system_parameters` (`crm.forecast.*`, `crm.zona_horaria_negocio`) | F-19 | AC-03.69–AC-03.83 | PF-03.92–PF-03.109, PF-03.114 | especificada | DM-24, DM-25, D-03.5, D-03.6, D-03.13 |
| F-21 | 4 Actividad | Agenda general | §6.1 | [04](04-actividad-comercial.md) | `visits`, `activities`, `attachments`, `customers`, `projects`, `users`, `countries`, `catalog_items` | Fase 0; Módulos 2 y 3 | AC-04.1–AC-04.6, AC-04.58, AC-04.59 | PF-04.6, PF-04.37–PF-04.39, PF-04.43, PF-04.48, PF-04.49, PF-04.59 | especificada | DM-8, **DM-12**, D-01.1 (ADR), D-04.1, D-04.12 |
| F-22 | 4 Actividad | Actividades pendientes | §6.2 | [04](04-actividad-comercial.md) | `activities`, `catalog_items` (`crm.estado_actividad`, `crm.prioridad`), `system_parameters` | Fase 0; Módulo 2 | AC-04.7–AC-04.10 | PF-04.1, PF-04.2, PF-04.35, PF-04.36, PF-04.50, PF-04.61 | especificada | DM-7, D-01.6 |
| F-23 | 4 Actividad | Seguimiento comercial | §6.3 | [04](04-actividad-comercial.md) | Vista `crm_interactions_v`, `visits`, `activities`, `attachments` | Fase 0 (migración 8); Módulos 2 y 3 | AC-04.11–AC-04.14 | PF-04.7, PF-04.41, PF-04.42, PF-04.55, PF-04.58 | especificada | DM-22, D-01.1 (ADR), D-04.9 |
| F-24 | 4 Actividad | Historial de interacciones | §6.4 | [04](04-actividad-comercial.md) | Vista `crm_interactions_v`, `visits`, `activities` | Fase 0 (migración 8) | AC-04.15–AC-04.18 | PF-04.40, PF-04.55, PF-04.59 | especificada | DM-22, D-01.1 (ADR) |
| F-25 | 4 Actividad | Visitas comerciales (gestión) | §6.5 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `contacts` | Fase 0; Módulos 2 y 3 | AC-04.19–AC-04.23 | PF-04.10, PF-04.14, PF-04.23, PF-04.25, PF-04.52 | especificada | DM-20 |
| F-26 | 4 Actividad | Planificar visita | §6.5.1 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `sequences`, `system_parameters` | Fase 0; Módulos 2 y 3 | AC-04.24–AC-04.28 | PF-04.4, PF-04.8–PF-04.13, PF-04.51, PF-04.56, PF-04.59 | especificada | DM-8, DM-27, D-04.2, D-04.5 |
| F-27 | 4 Actividad | Registrar visita realizada | §6.5.2 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `interaction_participants`, `attachments`, `projects` (`last_activity_at`) | F-26 | AC-04.29–AC-04.32 | PF-04.3, PF-04.15–PF-04.17, PF-04.52, PF-04.59 | especificada | DM-21, D-04.4, D-04.6 |
| F-28 | 4 Actividad | Confirmar visita | §6.5.3 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `attachments` | F-27 | AC-04.33–AC-04.36 | PF-04.18–PF-04.20, PF-04.52, PF-04.59, PF-04.60 | especificada | DM-20 |
| F-29 | 4 Actividad | Reprogramar o cancelar visita | §6.5.4 | [04](04-actividad-comercial.md) | `visits`, `visit_events`, `attachments`, `catalog_items` (motivos) | F-26 | AC-04.37–AC-04.41 | PF-04.21–PF-04.24, PF-04.52, PF-04.59, PF-04.62 | especificada | DM-20, D-04.3, D-04.5, D-04.18 |
| F-30 | 4 Actividad | Actividades comerciales (entidad) | §6.6 | [04](04-actividad-comercial.md) | `activities`, `interaction_participants`, `attachments`, `opportunities`, `catalog_items` | Fase 0; Módulos 2 y 3 | AC-04.42–AC-04.45 | PF-04.27, PF-04.31, PF-04.34 | especificada | DM-33, D-04.7 |
| F-31 | 4 Actividad | Crear actividad | §6.6.1 | [04](04-actividad-comercial.md) | `activities`, `customers`, `projects`, `opportunities`, `sequences` | Módulos 2 y 3 (fichas) | AC-04.46–AC-04.49 | PF-04.26, PF-04.53, PF-04.54, PF-04.58 | especificada | D-04.10, D-04.14 |
| F-32 | 4 Actividad | Llamadas, reuniones y correos | §6.6.2 | [04](04-actividad-comercial.md) | `activities`, `interaction_participants`, `catalog_items` (`crm.tipo_actividad.metadata.fields`) | F-30 | AC-04.50–AC-04.53 | PF-04.5, PF-04.28–PF-04.30, PF-04.53, PF-04.58 | especificada | D-04.8 |
| F-33 | 4 Actividad | Confirmar realización de actividad | §6.6.3 | [04](04-actividad-comercial.md) | `activities`, `attachments`, `projects` (`last_activity_at`) | F-30 | AC-04.54–AC-04.57 | PF-04.32, PF-04.33, PF-04.50, PF-04.61 | especificada | DM-21, D-04.6 |
| F-34 | 5 Reportes | Reporte de proyectos | §7.1 | [05](05-reportes.md) | `projects`, `customers`, `countries`, `users`, `opportunities`, `opportunity_results`, `catalog_items` | Fase 0; Módulo 3; `commercial-metrics` | AC-05.1–AC-05.4, AC-05.40–AC-05.43 | PF-05.4, PF-05.7, PF-05.20, PF-05.22, PF-05.33, PF-05.37 | especificada | DM-16, D-05.4, D-05.12, D-05.15 |
| F-35 | 5 Reportes | Reporte de oportunidades | §7.2 | [05](05-reportes.md) | `opportunities`, `opportunity_results`, `projects`, `customers`, `project_products`, `users`, `catalog_items` | Fase 0; Módulo 3; `commercial-metrics` | AC-05.5–AC-05.11, AC-05.40–AC-05.43 | PF-05.1, PF-05.2, PF-05.8–PF-05.12, PF-05.22, PF-05.30 | especificada | DM-1, DM-15, DM-35, D-05.4, D-05.10 |
| F-36 | 5 Reportes | Reporte de forecast | §7.3 | [05](05-reportes.md) | `forecast_lines`, `projects`, `customers`, `products`, `product_families`, `units_of_measure`, `users` | Fase 0; Módulo 3 (forecast); `commercial-metrics` | AC-05.12–AC-05.16, AC-05.40–AC-05.43 | PF-05.3, PF-05.13–PF-05.15, PF-05.22 | especificada | DM-24, DM-25, D-05.4 |
| F-37 | 5 Reportes | Reporte de visitas | §7.4 | [05](05-reportes.md) | `visits`, `customers`, `projects`, `users`, `catalog_items` | Fase 0; Módulo 4; `commercial-metrics` | AC-05.17–AC-05.19, AC-05.40–AC-05.43 | PF-05.16–PF-05.18, PF-05.22 | especificada | DM-20, D-01.5, D-05.4 |
| F-38 | 5 Reportes | Reporte de actividades | §7.5 | [05](05-reportes.md) | `activities`, `customers`, `projects`, `users`, `catalog_items` | Fase 0; Módulo 4; `commercial-metrics` | AC-05.20–AC-05.22, AC-05.40–AC-05.43 | PF-05.19, PF-05.22, PF-05.30, PF-05.33, PF-05.34 | especificada | D-01.6, D-05.4 |
| F-39 | 5 Reportes | Exportación a Excel | §7.6 | [05](05-reportes.md) | Las de F-34…F-38; `audit_logs` (escritura); `system_parameters` | F-34…F-38; ADR de librería XLSX | AC-05.23–AC-05.29 | PF-05.6, PF-05.21, PF-05.24–PF-05.28, PF-05.35, PF-05.39–PF-05.41 | bloqueada | **D-05.1 (ADR)**, D-05.3, D-05.14 |
| F-40 | 5 Reportes | Dashboard comercial | §7.7 | [05](05-reportes.md) | `projects`, `opportunities`, `opportunity_results`, `forecast_lines`, `visits`, `activities`, `catalog_items`, `users` | `commercial-metrics`; ADR de gráficas | AC-05.30–AC-05.34, AC-05.41, AC-05.42 | PF-05.22, PF-05.30, PF-05.36, PF-05.38, PF-05.39 | bloqueada | **D-05.2 (ADR)**, D-05.13 |
| F-41 | 5 Reportes | Embudo comercial | §7.8 | [05](05-reportes.md) | `opportunities`, `opportunity_stage_history`, `projects`, `customers`, `catalog_items` | `commercial-metrics`; ADR de gráficas | AC-05.35–AC-05.39 | PF-05.5, PF-05.32, PF-05.38, PF-05.39 | bloqueada | **D-05.2 (ADR)**, D-05.8, D-05.9, DC-5 |
| F-42 | 6 Integraciones | Carga masiva de clientes (CSV/XLSX) | §8.1 | [06](06-integraciones.md) | `customer_imports`, `customer_import_rows`, `customers`, `countries`, `catalog_items` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `users`, `system_parameters`, `sequences`, `audit_logs` | Fase 0; Módulo 2 (`CustomerValidationService`, `CustomerCreationService`, F-06); ADR de librería XLSX compartido con F-39 (solo la variante XLSX) | AC-06.1–AC-06.31 | PF-06.1–PF-06.50 | especificada | DM-28, DM-4, DM-18, DM-8, D-06.1 (ADR, solo XLSX), D-06.2–D-06.13 |
| F-43 | 7 Administración | Usuarios | §9.1 | [07](07-administracion.md) | `users` (+`employee_code`, `country_id`), `countries`, `teams`, `team_members`, `user_roles`, `audit_logs` | Fase 0 (migración 2, semilla de países); PLAN-ADMIN usuarios; ADR-020 | AC-07.1–AC-07.10 | PF-07.1–PF-07.5, PF-07.19–PF-07.24, PF-07.39, PF-07.43, PF-07.45 | especificada | **DM-12**, DM-14, DM-30, D-07.2, D-07.3, D-07.4, D-07.14 |
| F-44 | 7 Administración | Roles y permisos | §9.2 | [07](07-administracion.md) | `roles`, `permissions`, `role_permissions`, `role_menu_options`, enum `data_scope` | Fase 0 (migración 1, semilla de roles/permisos); PLAN-ADMIN roles; ADR-018, ADR-020 | AC-07.11–AC-07.17 | PF-07.6–PF-07.9, PF-07.25–PF-07.27, PF-07.45 | especificada | DM-10, DM-11, DM-32, DM-34, D-07.1 |
| F-45 | 7 Administración | Catálogos | §9.3 | [07](07-administracion.md) | `catalogs`, `catalog_items` (17 `crm.*`), `system_parameters` (referencias) | Fase 0 (semilla, registro de semántica); PLAN-ADMIN catálogos | AC-07.18–AC-07.25 | PF-07.10, PF-07.11, PF-07.28–PF-07.33, PF-07.40, PF-07.46 | especificada | D-07.5, D-07.6, D-07.12 |
| F-46 | 7 Administración | Parámetros generales | §9.4 | [07](07-administracion.md) | `system_parameters` (`crm.*`, `seguridad.*`), `units_of_measure`, `product_families`, `products`, `unit_conversion_rules` | Fase 0 (semilla de parámetros y maestros); PLAN-ADMIN parámetros; ADR-019 | AC-07.26–AC-07.33 | PF-07.12–PF-07.16, PF-07.34–PF-07.36, PF-07.41, PF-07.42 | especificada | DM-6, DM-7, DM-23, DM-24, D-07.7, D-07.8, D-07.9, DC-3 |
| F-47 | 7 Administración | Auditoría e historial de cambios | §9.5 | [07](07-administracion.md) | `audit_logs` | PLAN-ADMIN auditoría; eventos de los módulos 2–6 | AC-07.34–AC-07.39 | PF-07.17, PF-07.18, PF-07.37–PF-07.39, PF-07.44, PF-07.46 | especificada | DM-29, D-07.10, D-07.11 (ADR) |

> Una fila pasa a `en desarrollo` cuando empieza su implementación y a `completada`
> solo cuando está implementada **y** validada por sus pruebas. Las filas
> `bloqueada` vuelven a `especificada` al aprobarse el ADR que las bloquea (sus tablas
> equivalentes pueden construirse antes).
