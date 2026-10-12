# ADR-021 - Almacenamiento de adjuntos en un sistema de archivos montado

## Status
Accepted — 2026-10-10

Proyecto: Mi Cliente AG. Resuelve DM-8 y D-06.8 del CRM
(`docs/implementation-plans/crm/decisiones-pendientes.md`). Complementa ADR-004
(puertos y adaptadores), ADR-010 (Docker) y ADR-011 (NGINX).

## Context

Clientes, proyectos, visitas (y sus eventos) y actividades admiten adjuntos
(ALCANCE §4.3, §5.1, §6.5, §6.6). El modelo ya separa el vínculo (`attachments`,
con una FK por dueño) de los metadatos del binario (`stored_files`, existente en
la plantilla), pero **no existía ningún adaptador de almacenamiento**: sin esta
decisión no se podía subir ningún archivo en ningún módulo.

La propuesta de la consolidación era Azure Blob Storage en Azure y disco en
desarrollo. El responsable de negocio respondió el 2026-10-10: **"una carpeta
dentro del proyecto que se mapeará a un almacenamiento en el servidor"**. Es
decir, el despliegue objetivo dispone de un almacenamiento de servidor montable
y no se quiere depender de un servicio de objetos en la nube.

Restricciones: el frontend nunca accede a nada que no sea la API (CLAUDE.md
§8.1); el dominio no conoce infraestructura (ADR-004); NGINX ya limita el cuerpo
a 10 MB; los adjuntos pueden contener datos personales de contactos.

## Decision

**Los binarios de los adjuntos se guardan en un sistema de archivos cuya ruta
base se configura con `ATTACHMENTS_STORAGE_PATH`, detrás del puerto
`FileStorage`, y en Docker esa ruta es un volumen montado sobre el
almacenamiento del servidor. Los archivos solo se entregan a través de la API,
después de autorizar.**

| Aspecto | Regla |
|---|---|
| Puerto | `FileStorage` en `backend/src/infrastructure/storage/`: `save(stream, { storageKey, maxBytes })`, `openRead(storageKey)`, `delete(storageKey)`. Los casos de uso dependen del puerto, no de `fs` |
| Adaptador | `LocalFileSystemStorage`. Ruta base `ATTACHMENTS_STORAGE_PATH`; por defecto `./storage/attachments` relativa al directorio de trabajo del backend. Esa carpeta se añade a `.gitignore` y la variable a `.env.example` (con el valor de ejemplo) y a la validación de configuración al arrancar: si la ruta no existe o no es escribible, el backend no arranca |
| Docker | `docker-compose` monta un volumen en la ruta del contenedor (p. ej. `/app/storage/attachments`). En el servidor, ese volumen apunta al almacenamiento definitivo. La imagen no contiene adjuntos y el contenedor sigue sin root (ADR-010): el usuario del proceso necesita lectura y escritura solo en esa ruta |
| Clave | `stored_files.storage_key` = ruta relativa **generada por el servidor**: `<año>/<mes>/<uuid>`. Nunca incluye el nombre, la extensión ni ninguna parte de la ruta que envía el usuario |
| Nombre | `stored_files.file_name` guarda el nombre original saneado (sin separadores de ruta ni caracteres de control, máx. 255) **solo** para mostrarlo y para `Content-Disposition` |
| Tamaño | `crm.adjuntos.max_mb` = 10. Se corta en streaming al superarlo (`413`). El `client_max_body_size` de NGINX para las rutas de subida debe admitir 10 MB más la sobrecarga de `multipart` |
| Tipos | Lista blanca `crm.adjuntos.tipos_permitidos`: PDF, JPEG, PNG, Word (`.docx`) y Excel (`.xlsx`). El tipo se **detecta por la firma del contenido** y se coteja con la extensión; el `Content-Type` del navegador no se usa para decidir. No admitido: `422 ATTACHMENT_TYPE_NOT_ALLOWED` |
| Integridad | SHA-256 en `stored_files.checksum` |
| Escritura | A un temporal dentro de la ruta base y `rename` al terminar. Si falla la transacción de base se elimina el binario; un binario huérfano o una fila sin binario se registran como error para su limpieza |
| Descarga | Por las rutas de cada módulo dueño (`GET …/{id}/attachments/{aid}/content`, DC-2), que comprueban permiso y visibilidad del dueño y transmiten el archivo con `Content-Disposition: attachment`, el `Content-Type` guardado y `X-Content-Type-Options: nosniff`. **Nunca** como estático (ni NGINX ni `express.static`), ni con URL firmada |
| Borrado | Lógico (`deletedAt` en `attachments` y `stored_files`); el binario se purga después, por retención |
| Respaldo | Responsabilidad del almacenamiento del servidor, coordinado con el respaldo de PostgreSQL (un respaldo de la base sin el de los archivos deja adjuntos rotos, y viceversa) |
| Carga masiva | **No** guarda el archivo original ni el de errores (D-06.8, valor recomendado aprobado): menos retención de datos personales. Podrá activarse más adelante sin cambiar el esquema |

## Alternatives

- **Azure Blob Storage detrás del mismo puerto.** Era la propuesta inicial:
  durable, con réplicas y sin gestionar disco. Descartada por el responsable: el
  despliegue objetivo tiene almacenamiento de servidor y no se quiere añadir un
  servicio de nube ni sus credenciales. Sigue siendo posible como **otro
  adaptador** de `FileStorage` con un ADR nuevo, sin tocar el esquema ni los
  casos de uso.
- **Guardar el binario en PostgreSQL (`bytea` o large objects).** Una sola copia
  de seguridad y transacciones atómicas, pero infla la base, encarece respaldos y
  restauraciones y mezcla datos transaccionales con documentos. Rechazada.
- **Servir los archivos como estáticos desde NGINX.** Más eficiente, pero la
  autorización por registro (alcance OWN/TEAM/COUNTRY) quedaría fuera de la API;
  cualquier URL filtrada daría acceso. Rechazada.

## Consequences

- Se desbloquean los adjuntos de los Módulos 2, 3 y 4 (F-06, F-07, F-10, F-11,
  F-21, F-25…F-33).
- El backend pasa a tener **estado en disco**: escalar a varias réplicas exige
  que todas monten el mismo almacenamiento compartido (p. ej. NFS/SMB del
  servidor). Con una sola réplica no hay impacto.
- La disponibilidad y el respaldo de los archivos dependen de la operación del
  servidor, no de la aplicación; debe documentarse en `docs/deployment/`.
- Toda descarga pasa por Node: con el límite de 10 MB y transmisión en
  *streaming* el coste es aceptable.
- Cambiar de almacenamiento más adelante es un adaptador nuevo y una migración
  de binarios, no un cambio de modelo.

## Security Considerations

- **Path traversal:** las claves son generadas; aun así el adaptador resuelve
  `path.resolve(base, storageKey)`, rechaza cualquier resultado fuera de la base
  y no sigue enlaces simbólicos.
- **Contenido activo:** lista blanca por firma, descarga siempre como
  `attachment` y `nosniff`; nunca vista previa en línea de HTML o SVG (no están
  en la lista blanca).
- **Antivirus:** no hay servicio aprobado; queda fuera de esta versión. Añadirlo
  sería un adaptador nuevo con su ADR. La mitigación es la lista blanca y que el
  servidor nunca ejecuta ni interpreta los archivos.
- **Confidencialidad:** la autorización es la del dueño del adjunto (permiso del
  módulo + alcance; fuera del alcance `404`). Los permisos del sistema de
  archivos del servidor deben limitar el acceso al usuario del contenedor.
- Los nombres de archivo y rutas no se registran en logs con datos personales;
  se registra el `storedFileId`.
