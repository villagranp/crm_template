# Matriz de trazabilidad del CRM

Cobertura de las **47 funcionalidades** del documento de alcance
([`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md)), agrupadas en sus siete
módulos. Cada fila apunta a la especificación que la desarrolla.

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
| `bloqueada` | Depende de una decisión pendiente ([`decisiones-pendientes.md`](decisiones-pendientes.md)); el alcance se conserva |
| `en desarrollo` | Implementación en curso |
| `completada` | Implementada **y** validada por sus pruebas (alcance §12) |

Las columnas *Criterios* y *Pruebas* citan los identificadores de la sección I y J
de cada especificación (`AC-<módulo>.<n>`, `PF-<módulo>.<n>`).

## Matriz

| ID | Módulo | Funcionalidad | Alcance | Especificación | Entidades | Dependencias | Criterios | Pruebas | Estado | Decisión pendiente |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | 1 Inicio | Dashboard general | §3.1 | [01](01-inicio-dashboard.md) | | | | | pendiente | |
| F-02 | 1 Inicio | Indicadores clave | §3.2 | [01](01-inicio-dashboard.md) | | | | | pendiente | |
| F-03 | 1 Inicio | Resumen de actividad | §3.3 | [01](01-inicio-dashboard.md) | | | | | pendiente | |
| F-04 | 1 Inicio | Alertas y pendientes | §3.4 | [01](01-inicio-dashboard.md) | | | | | pendiente | |
| F-05 | 2 Clientes | Búsqueda de clientes | §4.1 | [02](02-clientes-cuentas.md) | | | | | pendiente | |
| F-06 | 2 Clientes | Creación de clientes | §4.2 | [02](02-clientes-cuentas.md) | | | | | pendiente | |
| F-07 | 2 Clientes | Ficha del cliente | §4.3 | [02](02-clientes-cuentas.md) | | | | | pendiente | |
| F-08 | 2 Clientes | Proyectos asociados al cliente | §4.4 | [02](02-clientes-cuentas.md) | | | | | pendiente | |
| F-09 | 2 Clientes | Contactos | §4.5 | [02](02-clientes-cuentas.md) | | | | | pendiente | |
| F-10 | 3 Proyectos | Crear proyecto | §5.1 | [03](03-proyectos.md) | | | | | pendiente | |
| F-11 | 3 Proyectos | Consultar y editar proyectos | §5.2 | [03](03-proyectos.md) | | | | | pendiente | |
| F-12 | 3 Proyectos | Duplicar proyecto | §5.3 | [03](03-proyectos.md) | | | | | pendiente | |
| F-13 | 3 Proyectos | Buscar proyectos | §5.4 | [03](03-proyectos.md) | | | | | pendiente | |
| F-14 | 3 Proyectos | Visualización de proyectos del equipo | §5.5 | [03](03-proyectos.md) | | | | | pendiente | |
| F-15 | 3 Proyectos | Clasificación de proyectos | §5.6 | [03](03-proyectos.md) | | | | | pendiente | |
| F-16 | 3 Proyectos | Fase del cliente | §5.7 | [03](03-proyectos.md) | | | | | pendiente | |
| F-17 | 3 Proyectos | Oportunidades comerciales | §5.8 | [03](03-proyectos.md) | | | | | pendiente | |
| F-18 | 3 Proyectos | Resultado de oportunidades | §5.9 | [03](03-proyectos.md) | | | | | pendiente | |
| F-19 | 3 Proyectos | Productos asociados | §5.10 | [03](03-proyectos.md) | | | | | pendiente | |
| F-20 | 3 Proyectos | Forecast comercial M+6 | §5.11 | [03](03-proyectos.md) | | | | | pendiente | |
| F-21 | 4 Actividad | Agenda general | §6.1 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-22 | 4 Actividad | Actividades pendientes | §6.2 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-23 | 4 Actividad | Seguimiento comercial | §6.3 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-24 | 4 Actividad | Historial de interacciones | §6.4 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-25 | 4 Actividad | Visitas comerciales (gestión) | §6.5 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-26 | 4 Actividad | Planificar visita | §6.5.1 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-27 | 4 Actividad | Registrar visita realizada | §6.5.2 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-28 | 4 Actividad | Confirmar visita | §6.5.3 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-29 | 4 Actividad | Reprogramar o cancelar visita | §6.5.4 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-30 | 4 Actividad | Actividades comerciales (entidad) | §6.6 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-31 | 4 Actividad | Crear actividad | §6.6.1 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-32 | 4 Actividad | Llamadas, reuniones y correos | §6.6.2 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-33 | 4 Actividad | Confirmar realización de actividad | §6.6.3 | [04](04-actividad-comercial.md) | | | | | pendiente | |
| F-34 | 5 Reportes | Reporte de proyectos | §7.1 | [05](05-reportes.md) | | | | | pendiente | |
| F-35 | 5 Reportes | Reporte de oportunidades | §7.2 | [05](05-reportes.md) | | | | | pendiente | |
| F-36 | 5 Reportes | Reporte de forecast | §7.3 | [05](05-reportes.md) | | | | | pendiente | |
| F-37 | 5 Reportes | Reporte de visitas | §7.4 | [05](05-reportes.md) | | | | | pendiente | |
| F-38 | 5 Reportes | Reporte de actividades | §7.5 | [05](05-reportes.md) | | | | | pendiente | |
| F-39 | 5 Reportes | Exportación a Excel | §7.6 | [05](05-reportes.md) | | | | | pendiente | |
| F-40 | 5 Reportes | Dashboard comercial | §7.7 | [05](05-reportes.md) | | | | | pendiente | |
| F-41 | 5 Reportes | Embudo comercial | §7.8 | [05](05-reportes.md) | | | | | pendiente | |
| F-42 | 6 Integraciones | Carga masiva de clientes (CSV/XLSX) | §8.1 | [06](06-integraciones.md) | | | | | pendiente | |
| F-43 | 7 Administración | Usuarios | §9.1 | [07](07-administracion.md) | | | | | pendiente | |
| F-44 | 7 Administración | Roles y permisos | §9.2 | [07](07-administracion.md) | | | | | pendiente | |
| F-45 | 7 Administración | Catálogos | §9.3 | [07](07-administracion.md) | | | | | pendiente | |
| F-46 | 7 Administración | Parámetros generales | §9.4 | [07](07-administracion.md) | | | | | pendiente | |
| F-47 | 7 Administración | Auditoría e historial de cambios | §9.5 | [07](07-administracion.md) | | | | | pendiente | |

> Las columnas vacías las completa cada especificación al escribirse; la fila no
> pasa a `especificada` hasta que su archivo exista con criterios y pruebas.
