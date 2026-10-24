# ADR-031 - Carga de proyectos con historial comercial y catálogos del negocio

## Status

Accepted — 2026-10-23

Proyecto: Mi Cliente AG. Decisiones del responsable del proyecto (2026-10-23): el responsable comercial de los
clientes **sigue siendo obligatorio** (en blanco se asigna a quien confirma la carga); la carga de proyectos debe
conservar **estados y datos** del CRM anterior para que los reportes no se vean afectados; los tipos de proyecto son
una **lista de parámetros editable** con los tipos que ya usa el negocio. Amplía la carga inicial por scripts
(`CARGA-INICIAL.md`) y [ADR-030](ADR-030-carga-masiva-de-usuarios-y-equipos-por-canal.md).

## Context

El negocio entregó la descarga de proyectos de su CRM anterior: además de los datos básicos trae cantidad y unidad,
fase del cliente y su avance, la etapa de la oportunidad (contactado, cotizando, ganado, perdido), si se adjudicó,
en qué porcentaje, el motivo de ganar o perder y fechas de decisión. La plantilla de proyectos solo admitía los datos
básicos, así que cargar los ~885 proyectos dejaba todos «abiertos» y sin resultado: los reportes de ganadas, perdidas
y tasa de éxito (que se calculan por `opportunity_results.decision_date` y `opportunities.opportunity_date`) saldrían
vacíos.

El modelo ya tiene dónde guardar casi todo: clasificación del proyecto (tipo, unidad, cantidad), fase del cliente
con avance e historial, oportunidad con etapa e historial y resultado con motivo, porcentaje y fecha de decisión.
Falta la vía de carga. Los tipos de proyecto ya son un catálogo editable (`crm.tipo_proyecto`), pero con valores
genéricos que no son los del negocio.

Además, la descarga identifica al cliente por su **nombre**, y la plantilla exige el código CRM que el sistema asigna
al crear el cliente (`CLI-…`), que no existe en ningún archivo del negocio.

## Decision

1. **Plantilla de proyectos versión 2** (`plantilla-proyectos`), todas las columnas nuevas opcionales:
   - **Código de cliente**: el código del cliente del sistema origen (`customers.customer_code`, el de la carga de
     clientes). Cada fila trae el código CRM **o** el código de cliente; con el código de cliente, si hay clientes con
     ese código en varios países, decide la columna País.
   - **Clasificación**: Unidad de medida (código de unidad activa) y Cantidad estimada (decimal ≥ 0, hasta 4
     decimales; exige unidad). Se guardan con la clasificación del proyecto sin estimar tonelaje (`tonnageMode = NONE`).
   - **Fase del cliente**: código de `crm.fase_cliente`, Avance de fase (0–100, hasta 2 decimales) y Comentario de
     fase. Se aplica con el cambio de fase del servicio (deja historial y respeta `crm.proyectos.reglas_avance`).
   - **Oportunidad** (una por fila, opcional): Etapa de oportunidad (código de `crm.etapa_oportunidad`), Fecha de
     oportunidad, y si la etapa es cerrada, Resultado (`WON`, `LOST`, `PARTIAL`), Motivo del resultado
     (`crm.motivo_resultado`), Porcentaje adjudicado, **Fecha de decisión** y Comentario del resultado. La
     oportunidad nace en su etapa si es abierta; si es cerrada nace en la etapa inicial y pasa a la cerrada con su
     resultado, con los servicios de oportunidades (folio, historial, auditoría, mapa de transiciones).
   - Las fechas de oportunidad y de decisión **se conservan históricas**: los reportes las usan para ubicar cada
     oportunidad y cada resultado en su período.
2. **Validar antes de escribir**: referencias, reglas del resultado (etapa ↔ resultado, motivo obligatorio en
   `LOST`, porcentaje en `PARTIAL`, `appliesTo` del motivo), transición desde la etapa inicial y reglas de avance se
   comprueban en `validate`; `apply` sigue siendo todo o nada respecto a la validación. Si un paso posterior a crear
   el proyecto falla en `apply` (clasificación, fase u oportunidad), el proyecto queda creado y la fila se reporta
   «creada con advertencia» con el paso que hay que completar a mano.
3. **El actor** de la carga de proyectos necesita además `oportunidades.crear`, `oportunidades.cerrar` y
   `oportunidades.administrar` (la oportunidad se asigna al responsable del proyecto).
4. **Catálogos y unidades del negocio en la semilla esencial** (crea lo que falta, nunca modifica ni reactiva):
   - `crm.tipo_proyecto`: los 16 tipos del CRM anterior (Living Places / Houses, Industrial Floors, Concrete
     Infrastructure, Concrete Buildings, Pro Enclosure, Gabion Stabilisation, Link Enclosure, Precast Bridges, Commerce,
     Metal Buildings, Metal Infrastructure, Tunnels, Slope Stabilization, Sanitary, Beam Enclosure, Mining). Los cinco
     genéricos siguen existiendo; Administración puede desactivarlos, renombrar o añadir tipos.
   - `crm.fase_cliente`: `INICIAL` y `PARALIZADO` (no finales).
   - `crm.etapa_oportunidad`: `SIN_CONTACTAR` (abierta, en el embudo).
   - Unidades de medida: `KM`, `PZA`, `ROL`, `CJS`, `PAQ`, `SET`, `SAC` (las que usan las plantillas de proyectos y
     de productos del negocio).
5. **La traducción** de los valores del CRM anterior a estos códigos (tipo, fase, etapa, motivos, unidades, cliente
   por nombre, responsable por nombre) se hace **fuera del sistema**, con un script de conversión que produce el
   archivo de la plantilla. El texto original del motivo y de la fase SWS se conserva en los comentarios del resultado
   y de la fase. Los datos reales no entran al repositorio.
6. **No se cargan**: forecast mensual (la descarga solo trae un total por proyecto, sin producto ni mes), volumen,
   pisos, espesor y tasa estimada de éxito, que no tienen campo en el modelo.

## Consequences

- Los reportes de ganadas, perdidas, embudo y tasa de éxito reflejan el historial desde la carga.
- La fecha del historial de etapas y de fase, `closed_at` y la auditoría son las del momento de la carga; los períodos
  de los reportes usan `opportunity_date` y `decision_date`, que sí son históricas.
- La plantilla cambia de versión: los archivos de `docs/templates/` se regeneran y un archivo de la versión 1 se
  rechaza por encabezados.
- `OpportunitiesService.defaultStage` pasa a ser público (la validación necesita la etapa inicial) y el puerto de
  consulta gana búsqueda de clientes por código de cliente.
- Hay que ejecutar `prisma:seed` en cada entorno para tener los tipos, fases, etapa y unidades nuevos.

## Alternatives Considered

- **Cargar solo los datos básicos y que los asesores actualicen el estado**: sin desarrollo, pero ~885 proyectos se
  verían abiertos y los reportes históricos quedarían vacíos hasta que alguien los corrija uno por uno.
- **Escribir directamente en la base** (sin servicios): permitiría fechas históricas en todo, pero salta folios,
  reglas, auditoría y visibilidad; contradice la carga inicial por servicios.
- **Traducir los tipos a los cinco genéricos**: pierde la clasificación que el negocio ya usa en sus reportes.
- **Catálogo nuevo por cada motivo del CRM anterior**: conserva el motivo como dato estructurado, pero añade ~25
  elementos sin validar por el negocio; se prefirió el catálogo existente más el texto original en el comentario.
