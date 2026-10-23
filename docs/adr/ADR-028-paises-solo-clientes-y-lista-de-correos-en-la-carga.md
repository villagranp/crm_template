# ADR-028 - Países «solo clientes» y lista de correos en la carga de clientes

## Status

Accepted — 2026-10-23

Proyecto: Mi Cliente AG. Decisiones del responsable del proyecto (2026-10-23), tomadas al ver el archivo de
errores de la primera carga real de clientes (IMP-2026-0002). Precisa DM-2 (los países operativos) y el
contrato de la carga masiva de clientes (módulo 6, RN-06.6 y RN-06.12). No reemplaza a ningún ADR.

## Context

La primera carga real de clientes se rechazó en su mayoría. Entre las causas, dos requieren decisión de
producto:

1. **Países.** La semilla trae solo los seis países donde se opera (GT, SV, HN, CR, VE, EC; DM-2). Los
   clientes de la carga incluyen sociedades de otros países (Estados Unidos, Puerto Rico, Panamá, México,
   Colombia, Perú, Chile, Brasil, Jamaica, Bélgica, China, Indonesia, entre otros) que no son mercados donde se
   opere: solo son clientes. Esas filas fallaban con `INVALID_COUNTRY`.
2. **Correos.** La columna «Correo» trae a menudo varios correos separados por coma. El cliente admite uno
   solo (`email`), así que esas filas fallaban con `VALIDATION_FAILED`.

El modelo de `countries` ata el país a la moneda local, el prefijo telefónico y la etiqueta del identificador
fiscal, y lo referencian usuarios, clientes, proyectos y metas.

## Decision

1. **Se siembran como países activos los países «solo clientes»** (22 en esta versión, `sortOrder` ≥ 100 detrás
   de los operativos), con su moneda local, prefijo, zona horaria y etiqueta fiscal. Se activan con la semilla
   (`prisma:seed`, idempotente). No se añade un indicador «operativo / solo clientes» al modelo: es la opción
   más simple y no cambia el esquema. Se añaden también sus monedas (`currencies`), sin tipos de cambio.
2. **La celda «Correo» admite una lista** separada por coma o punto y coma. El **primer** correo queda en el
   cliente; los **demás** se guardan como **contactos** del cliente (nombre «Contacto», apellido = parte local del
   correo, comentario con el código de la carga), sin repetir (sin distinguir mayúsculas). Los adicionales que no
   tienen forma de correo se descartan.
3. **Un fallo al crear un contacto no rechaza la fila**: el cliente ya está importado. Se registra el recuento
   (`customer_import_email_contacts`: creados y fallidos), nunca los correos.

## Consequences

- **Positivo:** los clientes del exterior se pueden cargar sin cambiar el esquema; ninguna fila pierde sus
  correos adicionales; el archivo de errores corregido sigue siendo reutilizable.
- **Negativo, aceptado:** los países nuevos aparecen también donde se eligen países de forma general (asignar el
  país de un usuario, metas, filtros). Asignar un usuario a uno de ellos es posible aunque no sea la intención.
  Si molesta, el siguiente paso es el indicador «operativo / solo clientes» (opción descartada hoy).
- Los nombres de los contactos generados son provisionales: el equipo comercial los completa después.
- La validación del identificador fiscal y del teléfono en esos países es la genérica (sin patrón propio): solo
  longitud y caracteres permitidos.
- **Qué hay que hacer al desplegar:** ejecutar la semilla en cada entorno (`prisma:seed`); no hay migración.
- La carga con **responsable en blanco** sigue asignando los clientes a quien confirma la carga; el alta de los
  usuarios responsables y su reasignación es un trabajo aparte.

## Alternatives Considered

- **Indicador «solo clientes» en `countries`:** separa mejor los usos, pero cambia el esquema y las pantallas;
  se difiere hasta que haga falta.
- **País nulo o «Otro» para clientes del exterior:** pierde el formato del NIT y los reportes por país.
- **Rechazar las listas de correos y exigir un correo por celda:** descarta datos que el negocio ya capturó.
