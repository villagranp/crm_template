# ADR-029 - Teléfono con formato inválido: advertencia, no error, en la carga de clientes

## Status

Accepted — 2026-10-23

Proyecto: Mi Cliente AG. Decisión del responsable del proyecto (2026-10-23), a raíz de la primera carga real de
clientes (IMP-2026-0002), cuyos teléfonos traen valores como `0`, `0000`, texto añadido o puntos suspensivos.
Precisa la validación del teléfono (módulo 2) solo para la carga masiva (módulo 6). Complementa a
[ADR-028](ADR-028-paises-solo-clientes-y-lista-de-correos-en-la-carga.md).

## Context

El alta de un cliente rechaza un teléfono que no cumple el formato del país (`INVALID_PHONE_FORMAT`): dígitos,
espacios y `+ - ( )`, de 7 a 20 dígitos, o el patrón propio del país. En la carga de datos históricos, muchos
clientes válidos fallaban solo por un teléfono mal capturado en el origen, y el teléfono no identifica al cliente.

## Decision

1. **En la carga masiva**, un teléfono con formato inválido **ya no rechaza la fila**: pasa como **advertencia**
   (`INVALID_PHONE_FORMAT`, severidad `WARNING`) y se guarda **tal como llegó**. Se sigue la mecánica de las demás
   advertencias: la fila queda `VALID` y se importa solo si quien confirma marca «incluir filas con advertencias».
2. **No cambia el alta manual ni la edición:** la pantalla y la API de clientes siguen rechazando un teléfono
   inválido. La excepción es una opción explícita (`lenientPhone`) que solo la carga activa.
3. **No se relaja** la longitud máxima (40) ni la neutralización de fórmulas: siguen siendo errores.

## Consequences

- Entran clientes con teléfonos inservibles (p. ej. `0`). La advertencia queda en el historial de la carga y en
  el archivo de errores/vista previa para corregirlos después.
- Un cliente cargado así no se puede volver a guardar desde la edición sin corregir el teléfono.
- La advertencia no tiene la lista de candidatos de los duplicados: la confirmación con la marca la acepta sin más.

## Alternatives Considered

- **Relajar la validación en todo el sistema:** degradaría los datos que se capturan a mano.
- **Descartar el teléfono inválido (guardar vacío):** perdería el dato original que alguien podría interpretar.
- **Mantenerlo como error:** obliga a corregir miles de filas antes de poder cargar los clientes.
