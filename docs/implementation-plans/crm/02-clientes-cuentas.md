# 02 — Módulo 2: Clientes / Cuentas

- **Fuente del alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md) §4 (4.1–4.5), con §1, §2, §8.1, §9.2–§9.5 y §10–§13
- **Contrato de datos:** [`00-modelo-de-datos.md`](00-modelo-de-datos.md) (entidades, catálogos, permisos, visibilidad y decisiones `DM-n`)
- **Funcionalidades:** F-05, F-06, F-07, F-08, F-09 ([matriz](matriz-trazabilidad.md))
- **Decisiones que lo enmarcan:** [ADR-004](../../adr/ADR-004-data-access-abstraction.md), [ADR-005](../../adr/ADR-005-rest-api-standard.md),
  [ADR-008](../../adr/ADR-008-authorization.md), [ADR-014](../../adr/ADR-014-modular-clean-architecture.md),
  [ADR-017](../../adr/ADR-017-design-system-grupo-ag.md), [ADR-018](../../adr/ADR-018-identity-access-model.md),
  [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md) (con su addendum de 2026-10-10),
  [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md)
- **Estado:** **backend implementado (2026-10-11)**: endpoints F1–F20, servicios reutilizables de
  F.6 y pruebas unitarias y de integración (§K.3 pasos 1–7). **Frontend pendiente** (paso 8) y E2E
  (paso 9). Todas las decisiones que lo afectaban quedaron **resueltas por el responsable de negocio
  el 2026-10-10** (ver [Decisiones del módulo](#decisiones-del-módulo-resueltas-el-2026-10-10)); las
  precisiones técnicas de la implementación están en
  [Precisiones de implementación](#precisiones-de-implementación-2026-10-11).
- **Skills aplicables:** `feature-development`, `requirements-analysis`, `user-story`, `api-design`, `authorization`,
  `access-management`, `backend-nestjs`, `database`, `prisma`, `frontend-react`, `design-system`, `security`,
  `testing`, `observability`, `documentation`, `code-review`

> **Primer módulo que se implementa después de la Fase 0** (alcance §11). Además de
> su funcionalidad, deja listas piezas que reutilizan los demás módulos: el filtro de
> visibilidad aplicado a una entidad comercial, la asignación de códigos CRM, la guarda
> de valores de catálogo, el servicio de adjuntos y la detección de duplicados guiada
> por parámetros. Este documento las especifica como **servicios reutilizables**, con
> su dueño (este módulo o transversal, según `00` §11).
>
> No redefine entidades: todo nombre de modelo, tabla, catálogo, parámetro o permiso
> que aparece aquí está definido en `00`. Donde `00` no decidía algo que este módulo
> necesita, se abrió una decisión `D-02.n`; todas quedaron aprobadas con su valor
> recomendado el 2026-10-10.

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
- [Precisiones de implementación (2026-10-11)](#precisiones-de-implementación-2026-10-11)
- [Decisiones del módulo (resueltas el 2026-10-10)](#decisiones-del-módulo-resueltas-el-2026-10-10)
- [Filas para la matriz](#filas-para-la-matriz)

---

## A. Objetivo funcional

El módulo **Clientes / Cuentas** es el **dueño** de las cuentas comerciales (`Customer`) y de
sus contactos (`Contact`) registrados localmente en el CRM. Resuelve:

1. **Encontrar** un cliente con filtros combinables, dentro de lo que el usuario está autorizado a ver.
2. **Registrar** clientes nuevos con identificador CRM automático, validaciones de formato,
   unicidad configurable del código de cliente y detección de duplicados antes de guardar
   (incluido el aviso de NIT repetido, que no bloquea: varios establecimientos de un mismo
   cliente comparten NIT, DM-4).
3. **Consultar y mantener** la ficha de la cuenta: editar según permisos y campo, desactivar,
   eliminar lógicamente sin perder historia, administrar adjuntos.
4. **Mostrar** los proyectos de la cuenta consultando al Módulo de Proyectos, sin poseer sus datos.
5. **Administrar los contactos** de la cuenta, con un contacto principal activo como máximo.

Responsabilidades frente al resto del CRM (alcance §4 "Relaciones del módulo"):

| Responsabilidad | Consecuencia |
|---|---|
| Única fuente de verdad de clientes y contactos | Ningún otro módulo crea, copia ni modifica clientes o contactos fuera de los servicios de este módulo |
| Reglas de validación y alta de clientes | Expuestas como servicio de aplicación (`CustomerValidationService`, `CustomerCreationService`) que el Módulo 6 reutiliza **tal cual** |
| Identificadores | `customers.id` (UUID) es la referencia de Proyectos, Actividad, Reportes, Inicio e Integraciones; `crmCode` es el identificador humano |
| Reglas de uso por otros módulos | Proporciona las guardas "cliente utilizable" y "contacto de este cliente" para que Proyectos y Actividad validen sus relaciones |

**Fuera de este módulo:** integración con SAP (prohibida, §4.1), la funcionalidad de proyectos,
actividades y visitas (solo se consumen o se ofrece el punto de entrada), la carga masiva
(Módulo 6, que reutiliza los servicios de aquí), las pantallas de mantenimiento de catálogos,
parámetros y usuarios (Módulo 7) y la consulta de auditoría (Módulo 7, F-47).

---

## B. Alcance completo

Inventario sin omisiones de §4. Cada fila se desarrolla en E, F, I y J.

### B.1 Búsqueda de clientes (F-05, §4.1)

| Elemento | Detalle |
|---|---|
| Origen | Solo clientes registrados localmente en el CRM. **Sin SAP** |
| Filtros combinables | Código de cliente · Código interno CRM · Razón social · País · Ciudad · Estado · Responsable de ventas |
| Operaciones | Búsqueda libre · filtros · ordenamiento · paginación · selección de un cliente · navegación a su ficha |
| Reutilización | Selector de cliente (`CustomerPicker`) para los formularios de Proyectos y Actividad, que usa el mismo contrato de búsqueda |

### B.2 Creación de clientes (F-06, §4.2)

| Campo (§4.2) | Columna de `Customer` (00 §2.4) | Origen del valor |
|---|---|---|
| Código de cliente | `customerCode` (+ `customerCodeNormalized`) | Usuario (DM-18): opcional, único por país; identifica cada establecimiento (DM-4) |
| Identificador interno CRM | `crmCode` | **Generado** con `Sequence` `crm.cliente` (`CLI-000123`), inmutable |
| Razón social | `legalName` (+ `legalNameNormalized`) | Usuario |
| Nombre comercial | `tradeName` | Usuario |
| País | `countryId` → `Country` | Tabla `countries` (activos): Guatemala, El Salvador, Honduras, Costa Rica, Venezuela y Ecuador (DM-2) |
| Ciudad | `city` | Texto libre (DM-19) |
| Dirección | `address` | Usuario |
| Teléfono | `phone` | Usuario, validado por país |
| Correo electrónico | `email` | Usuario, validado |
| Tipo de empresa | `companyTypeId` → catálogo `crm.tipo_empresa` | Catálogo |
| Estado | `statusId` → catálogo `crm.estado_cliente` | Catálogo; por defecto `crm.valores_por_defecto["customer.statusId"]` |
| Calificación | `ratingId` → catálogo `crm.calificacion_cliente` | Catálogo |
| Responsable de ventas | `salesOwnerId` → `User` | Usuarios elegibles (D-02.2) |
| NIT | `taxId` (+ `taxIdNormalized`); etiqueta `Country.taxIdLabel` (GT NIT, SV NIT, HN RTN, CR Cédula jurídica, VE RIF, EC RUC) | Usuario, validado por país (DM-3). **No es único**: NIT repetido en el mismo país = aviso no bloqueante (DM-4) |
| Archivos adjuntos | `Attachment` (con `customerId`) + `StoredFile` | Subida al almacenamiento de [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md) (DM-8 resuelta) |

Reglas de §4.2 cubiertas en C: identificador único, obligatorios, correo y teléfono, duplicados
antes de guardar, unicidad configurada (código de cliente único por país, endurecible a global;
NIT sin unicidad, con aviso de repetido, DM-4), existencia del asesor, valores de catálogo,
usuario y fecha de creación, auditoría.

**Establecimientos (DM-4, respuesta del responsable: "puede ser el mismo cliente pero con dos
establecimientos").** Cada establecimiento (sucursal) es un cliente propio en `customers`, con su
propio código de cliente cuando se informa (único por país, es lo que lo identifica) y su propio
`crmCode`. Varios establecimientos pueden compartir NIT: el NIT compartido es el vínculo entre
ellos y la búsqueda por NIT los muestra juntos. No existe una entidad "grupo de empresa" (00 §2.4).

### B.3 Ficha del cliente (F-07, §4.3)

| Operación (§4.3) | Cómo |
|---|---|
| Consultar | Ficha con información general y comercial, trazabilidad (creado/actualizado por y cuándo) |
| Editar | Campos editables según permiso y propiedad (`capabilities.editableFields`) |
| Eliminar, solo si el rol lo permite | `clientes.eliminar`; **lógica** (`deletedAt`), bloqueada si hay dependencias activas (DM-33) |
| Desactivación lógica | Cambio de estado a un elemento de `crm.estado_cliente` con `metadata.isActive = false` |
| Administrar adjuntos | Listar, subir, descargar, eliminar (lógico) |
| Consultar contactos | Sección de contactos (F-09) |
| Consultar proyectos relacionados | Sección de proyectos (F-08) |
| No eliminar información histórica | Nada asociado se borra; el cliente eliminado se puede restaurar (D-02.6) |
| Punto de entrada a Actividad Comercial | Botón "Nueva actividad" con el cliente preseleccionado (§6.6.1; la funcionalidad es del Módulo 4) |

### B.4 Proyectos asociados al cliente (F-08, §4.4)

| Elemento | Detalle |
|---|---|
| Columnas | Código de proyecto · Nombre · Ubicación · Fase · Oportunidad o estado comercial · Asesor responsable · Fecha estimada de decisión |
| Operaciones | Buscar · filtrar · ordenar · navegar al detalle del proyecto |
| Visibilidad | Solo proyectos autorizados para el usuario (regla del Módulo 3) |
| Propiedad | **Consulta** el contrato del Módulo de Proyectos. No administra ni duplica proyectos |
| Antes del Módulo 3 | Estado "disponible con el módulo de Proyectos" (G.4, D-02.10) |

### B.5 Contactos (F-09, §4.5)

| Campo (§4.5) | Columna |
|---|---|
| Nombre | `Contact.firstName` |
| Apellidos | `Contact.lastName` |
| Cargo | `Contact.jobTitle` |
| Teléfono | `Contact.phone` |
| Correo electrónico | `Contact.email` (+ `emailNormalized`) |
| Cliente | `Contact.customerId` |
| Indicador de contacto principal | **Derivado** de `Customer.primaryContactId` (00 §2.5); en la API se expone como `isPrimary` |
| Estado | `Contact.isActive` |
| Comentarios | `Contact.comments` |

Funcionalidades: crear · consultar · editar · eliminar o desactivar según permisos ·
seleccionar contacto principal · mostrar contactos dentro de la ficha.

---

## C. Reglas de negocio

Numeradas `RN-02.n`. Las que dependen de una decisión citan su id; todas esas decisiones
quedaron resueltas el 2026-10-10 (ver la sección de decisiones).

### C.1 Identidad y códigos

- **RN-02.1** Todo cliente recibe un `crmCode` único con la secuencia `crm.cliente`
  (`{prefix}-{seq}`, padding 6, `CLI-000123`), asignado por `SequenceGenerator.next('crm.cliente')`
  **en la misma transacción** del alta. Nunca `MAX()+1`. Es inmutable: ningún DTO de edición lo acepta.
- **RN-02.2** El código de cliente (`customerCode`) es opcional, lo introduce el usuario y solo se
  edita con `clientes.administrar` (DM-18). Se normaliza a mayúsculas sin espacios ni guiones
  (00 §6.2.4). Es único por país (RN-02.13) y es el dato que identifica a cada establecimiento
  de un cliente que comparte NIT con otros (DM-4).
- **RN-02.3** Los datos de demostración usan códigos `DEMO-CLI-…` y no consumen la secuencia (00 §8.1);
  la API no permite fijar `crmCode`.

### C.2 Validación de datos (compartida con el Módulo 6)

- **RN-02.4** Obligatorios: los que exige la base (`legalName`, `countryId`, `statusId`, `salesOwnerId`)
  **más** los que añada `crm.campos_obligatorios.customer`. El parámetro solo puede **añadir**
  obligatorios; una clave desconocida en el parámetro se ignora y se registra como advertencia en el log.
  `statusId` omitido se rellena con `crm.valores_por_defecto["customer.statusId"]` **antes** de
  comprobar obligatorios.
- **RN-02.5** Correo: formato válido (RFC 5322 simplificado, como `class-validator` `IsEmail`), máximo
  320, guardado recortado; la comparación usa minúsculas.
- **RN-02.6** Teléfono: si `Country.phonePattern` existe, debe cumplirlo; si no, solo dígitos, espacios,
  `+`, `-`, `(`, `)`, con entre 7 y 20 dígitos (DM-3).
- **RN-02.7** NIT (identificador fiscal del país, etiqueta `Country.taxIdLabel`): si
  `Country.taxIdPattern` existe, el valor normalizado debe cumplirlo; si no, alfanumérico de 4 a 30
  caracteres tras normalizar (mayúsculas, sin espacios, guiones ni puntos) (DM-3). El NIT **no es
  único** (DM-4): repetirlo en el mismo país solo genera el aviso de RN-02.14.
- **RN-02.8** País: debe existir y estar activo para un alta o para cambiar el país. Un cliente ya
  asociado a un país desactivado lo conserva al editar otros campos.
- **RN-02.9** Valores de catálogo (`companyTypeId`, `statusId`, `ratingId`): cada uno debe pertenecer a
  **su** catálogo (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`) según
  `CatalogReferenceValidator` (00 §3.5). En el alta se exige elemento activo; en la edición, un valor
  ya desactivado se conserva si no cambia. Error `422 INVALID_CATALOG_VALUE` con el campo.
- **RN-02.10** Responsable de ventas: debe existir, estar `ACTIVE` y ser **elegible** (D-02.2: permiso
  efectivo `clientes.ver` y dentro del conjunto de usuarios que el actor puede asignar). Error
  `422 INVALID_SALES_OWNER`.
- **RN-02.11** Asignación del responsable: sin `clientes.administrar`, el actor solo puede crear
  clientes cuyo responsable sea él mismo y no puede cambiar el responsable de uno existente
  (`403 FIELD_NOT_EDITABLE`, campo `salesOwnerId`) (DM-34).
- **RN-02.12** Las validaciones anteriores viven en **un solo servicio** (`CustomerValidationService`)
  usado por el alta, la edición y la importación (§8.1 "reutilizar las validaciones"). El servicio
  acepta referencias por `id` (pantalla) o por clave natural (importación: `code` de catálogo,
  `isoCode` de país, código de colaborador o correo del responsable, D-02.17) y devuelve **todos** los
  errores de la entrada, no solo el primero.
- **RN-02.32** Contenido peligroso en texto libre (D-06.11, aprobada el 2026-10-10): en el alta y en
  la edición manual, un valor de razón social, nombre comercial, ciudad o dirección que, tras
  recortar, empieza por `=`, `@`, tabulador o retorno de carro se rechaza con
  `422 FORMULA_NOT_ALLOWED` y el campo en `details[].field`. Es la misma regla que aplica la carga
  masiva al leer (06 RN-06.11), de modo que ambos caminos aceptan exactamente lo mismo; vive en
  `CustomerValidationService` (RN-02.12). En la edición se evalúa solo sobre los campos enviados.
  El mensaje nunca repite el valor. Evita guardar cargas útiles que una hoja de cálculo ejecutaría
  al exportar (la neutralización de la exportación sigue existiendo como segunda defensa).

### C.3 Unicidad y duplicados

- **RN-02.13** Unicidad dura **solo del código de cliente** (00 §6.2, DM-4 resuelta): único **por
  país** (lo garantiza la base: `uq_customers_country_customer_code`; los nulos no colisionan porque
  el código es opcional, DM-18). Con `crm.clientes.unicidad_codigo = GLOBAL`, el servicio comprueba
  además en todos los países bajo `pg_advisory_xact_lock` por valor normalizado. Error
  `409 CUSTOMER_CODE_TAKEN`. Un cliente eliminado lógicamente **sigue ocupando** su código: el error
  lo indica (`details.isDeleted = true`) para que quien tenga permiso lo restaure (D-02.6). La
  violación del índice único por carrera se traduce al mismo `409`, nunca a `500`.
  El **NIT no es único** (respuesta del responsable: los establecimientos de un mismo cliente pueden
  compartir NIT): no existe `uq_customers_country_tax_id` ni el parámetro
  `crm.clientes.unicidad_nit` (ambos eliminados de 00); `idx_customers_country_id_tax_id` es solo un
  índice de búsqueda para el aviso de RN-02.14. Ningún error de la API bloquea por NIT repetido.
- **RN-02.14** Duplicados blandos de clientes según `crm.clientes.reglas_duplicidad` (DM-4), cuyo
  valor por defecto es `{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}`. Claves admitidas:
  `razonSocialNormalizada`, `nombreComercialNormalizado`, `correo`, `telefono` (valores
  `NO | AVISAR | BLOQUEAR`) y `nit` (solo `AVISAR | NO`: el registro de parámetros rechaza
  `BLOQUEAR` para esta clave, 00 §6.2; si aun así el servicio leyera otro valor, lo trata como
  `AVISAR` y lo registra como advertencia en el log, nunca bloquea). Ámbito: **mismo país**
  (D-02.4). Incluye clientes eliminados lógicamente (marcados como tales): su NIT sigue contando
  para el aviso.
  - **Cuándo se evalúa:** en el alta, todas las claves; en la edición, solo las claves cuyo valor
    cambia, y todas si cambia el país (que cambia el ámbito, D-02.5). En particular, el aviso de NIT
    repetido se evalúa en el alta y en la edición **cuando cambia el NIT** (o el país); una edición
    que no toca el NIT no vuelve a avisar.
  - `AVISAR` → `409 POSSIBLE_DUPLICATE` con los candidatos y el motivo de cada uno (`reason`, F.3;
    `TAX_ID` para el NIT); el usuario reenvía con el indicador explícito de confirmación
    `acknowledgedDuplicateIds`, que debe contener **todos** los candidatos devueltos. Si aparece un
    candidato nuevo no reconocido, vuelve el `409`. Es el mismo mecanismo para la razón social y
    para el NIT.
  - *Aclaración (2026-10-11, implementación):* los candidatos fuera del alcance llegan con
    `id = null` (RN-02.15) y no pueden enumerarse. La confirmación es la **presencia** de
    `acknowledgedDuplicateIds` (puede ser `[]`): debe contener todos los candidatos **visibles**;
    los no visibles quedan confirmados por la presencia del campo. Un candidato visible nuevo no
    incluido devuelve el `409`.
  - `BLOQUEAR` → `409 DUPLICATE_BLOCKED` sin opción de confirmar (nunca para `nit`).
  - Clave desconocida en el parámetro → se ignora con advertencia en el log.
  - En la carga masiva el aviso de NIT repetido es la advertencia `DUPLICATE_TAX_ID` de la fila
    (06 RN-06.18, D-06.6): la fila queda válida y se importa solo si la confirmación incluye las
    filas con advertencias.
- **RN-02.15** Candidatos fuera del alcance del usuario: se informan con datos mínimos (`crmCode`,
  `legalName`, país, nombre del responsable, `isVisible = false`) y sin enlace (D-02.3).
- **RN-02.16** Contactos: el mismo correo normalizado en el **mismo cliente** se bloquea siempre (índice
  `uq_contacts_customer_email`, `409 CONTACT_EMAIL_TAKEN`; incluye contactos eliminados). Las demás
  reglas salen de `crm.contactos.reglas_duplicidad` (DM-5): `nombreCompleto` (nombre + apellidos
  normalizados) y `telefono`, con los mismos valores y el mismo flujo de confirmación que RN-02.14,
  limitados al mismo cliente. El parámetro solo puede endurecer: `correo` siempre bloquea.
- **RN-02.17** Normalización única (función pura de dominio compartida por alta, edición, búsqueda,
  detección de duplicados e importación): código → mayúsculas sin espacios ni guiones; NIT →
  mayúsculas sin espacios, guiones ni puntos; razón social y nombre comercial → minúsculas, sin
  acentos, espacios colapsados; correo → minúsculas recortado; teléfono para comparar → solo dígitos.

### C.4 Visibilidad, edición y eliminación

- **RN-02.18** Visibilidad de un cliente (00 §4.2): `OWN` → `salesOwnerId = yo`; `TEAM` →
  `salesOwnerId` ∈ miembros y responsables de mis equipos, **incluidos los subequipos** (DM-12
  resuelta; cambiar miembros, responsable o jerarquía de un equipo, o el país de un usuario, es
  asignación de acceso exclusiva del administrador, addendum de ADR-020); `COUNTRY` →
  `countryId = users.country_id` (DM-14; usuario sin país → D-02.8); `ORGANIZATION` → todos. Además,
  **herencia** (DM-13): visible si el usuario ve al menos un proyecto no eliminado del cliente. Los
  clientes eliminados no aparecen en ninguna consulta salvo `deleted=true` con `clientes.eliminar`.
- **RN-02.19** Fuera del alcance → `404` (no se revela existencia, ADR-008). Dentro del alcance sin el
  permiso de la operación → `403`.
- **RN-02.20** Editar (DM-34): `clientes.editar` **y** cliente propio (`salesOwnerId = yo`).
  `clientes.administrar` **y** cliente en el alcance **directo** (no heredado, D-02.9) → editar
  clientes ajenos, reasignar responsable, editar `customerCode` (DM-18) y cambiar el país (D-02.5).
  Un cliente visible solo por herencia es de solo lectura.
- **RN-02.21** Desactivar = cambiar `statusId` a un estado con `metadata.isActive = false`. El cliente
  sigue visible, consultable y editable; no se ofrece en el selector para registros nuevos y los
  servicios de otros módulos lo rechazan como destino de proyectos, visitas o actividades nuevas
  (`422 CUSTOMER_INACTIVE`, D-02.16). Reactivar = volver a un estado activo.
- **RN-02.22** Eliminar (DM-33, alcance §4.3): siempre **lógica** (`deletedAt`), con `clientes.eliminar`
  y cliente en el alcance directo. Se bloquea con `409 CUSTOMER_HAS_DEPENDENCIES` (detalle con
  conteos) si el cliente tiene proyectos no eliminados, actividades abiertas no eliminadas
  (`crm.estado_actividad.metadata.isOpen`) o visitas pendientes (`crm.estado_visita.metadata.isPending`)
  (D-02.16 fija el conjunto). Al eliminar, contactos, adjuntos, historial y auditoría se conservan
  intactos; nada se borra físicamente.
- **RN-02.23** Restaurar un cliente eliminado (D-02.6): `clientes.eliminar` y cliente que estaría en
  el alcance directo; revalida la unicidad del código de cliente (RN-02.13) por si otro cliente lo
  ocupó con `GLOBAL` activado después. El NIT no se revalida como bloqueo (no es único, DM-4).

### C.5 Contactos y contacto principal

- **RN-02.24** Todo contacto pertenece a un cliente existente, no eliminado y visible para el actor.
  El `customerId` sale de la ruta; no se acepta en el cuerpo ni se puede cambiar.
- **RN-02.25** Editar contactos (D-02.7): `contactos.editar` y cliente editable por el actor según
  RN-02.20 (propio, o ajeno en el alcance directo con `clientes.administrar`). Lo mismo para crear
  (`contactos.crear`) y para elegir el contacto principal.
- **RN-02.26** **Como máximo un contacto principal activo por cliente**: el principal es
  `Customer.primaryContactId` (estructural, 00 §2.5). Elegir otro sustituye al anterior en la misma
  operación. Marcar como principal un contacto inactivo → `422 CONTACT_INACTIVE`. Desactivar o
  eliminar el contacto principal limpia `primaryContactId` **en la misma transacción**. La FK
  compuesta impide apuntar a un contacto de otro cliente.
- **RN-02.27** Desactivar un contacto (`isActive = false`) está permitido siempre con
  `contactos.editar`. Eliminar (lógico, `deletedAt`) exige `contactos.eliminar` y que el contacto
  **no** esté referenciado por `interaction_participants`; si lo está → `409 CONTACT_HAS_HISTORY`
  y la interfaz ofrece desactivar (§4.5 "proteger los contactos relacionados con registros históricos").
- **RN-02.28** Un contacto eliminado sigue ocupando su correo en el cliente; se restaura (D-02.6), no
  se recrea.

### C.6 Adjuntos

- **RN-02.29** Los adjuntos del cliente son filas de `Attachment` con `customerId` y un `StoredFile`
  (00 §2.11). Tamaño máximo `crm.adjuntos.max_mb` (10); tipos de `crm.adjuntos.tipos_permitidos`
  (PDF, JPEG, PNG, Word `.docx` y Excel `.xlsx`) comprobados por la **firma del contenido** (magic
  bytes), cotejada con la extensión y con la lista blanca; el `Content-Type` del navegador no se
  usa. Exceso de tamaño → `413 ATTACHMENT_TOO_LARGE` (el tamaño se corta en streaming al superar
  el máximo); tipo no admitido → `422 ATTACHMENT_TYPE_NOT_ALLOWED` (DC-4). Nombre de archivo
  saneado (sin separadores de ruta ni caracteres de control, máx. 255), guardado solo para mostrar
  y para `Content-Disposition`. Subir y eliminar exigen poder editar el cliente (RN-02.20); listar
  y descargar exigen verlo. Eliminar = `deletedAt` en `attachments` y `stored_files`; el binario
  se purga después según la retención.
- **RN-02.30** Almacenamiento y descarga (DM-8 resuelta, [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md)):
  el binario se guarda con el puerto `FileStorage` y su adaptador `LocalFileSystemStorage` bajo la
  ruta base `ATTACHMENTS_STORAGE_PATH` (por defecto `./storage/attachments`, carpeta ignorada por
  Git, montada como volumen Docker hacia el almacenamiento del servidor). La clave
  `stored_files.storage_key` la genera el servidor (`<año>/<mes>/<uuid>`, sin el nombre ni la
  extensión del usuario); el adaptador rechaza cualquier ruta resuelta fuera de la base (*path
  traversal*) y no sigue enlaces simbólicos; escribe a un temporal y renombra al final, y si la
  transacción de base falla borra el binario. El adjunto **nunca** se sirve como estático (ni NGINX
  ni `express.static`): la descarga se transmite por la API (`GET /customers/{customerId}/attachments/{attachmentId}/content`,
  rutas por dueño, DC-2) **después** de comprobar permiso y visibilidad del cliente, con
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y el `Content-Type`
  detectado al guardar. Sin URL firmada, sin vista previa en línea y sin antivirus (mitigación:
  lista blanca por firma y descarga como `attachment`). El respaldo es responsabilidad del
  almacenamiento del servidor.

### C.7 Trazabilidad

- **RN-02.31** Toda mutación registra `createdById`/`updatedById` y fechas, y un evento en `audit_logs`
  vía `AuditService.record` con `resourceType` `crm.customer`, `crm.contact` o `crm.attachment` y la
  diferencia `{campo: {antes, después}}`. Los datos personales de contactos (nombre, apellidos,
  correo, teléfono) se registran **enmascarados** (DM-29). Una edición sin cambios no deja registro.
  Eventos: `crm.customer.created|updated|deleted|restored`, `crm.customer.primary_contact_changed`,
  `crm.contact.created|updated|deactivated|activated|deleted|restored`,
  `crm.attachment.added|removed`. El evento de alta guarda `metadata.source = UI | IMPORT`.

---

## D. Modelo de datos utilizado

Todo definido en `00`. Este módulo **no** crea tablas, columnas ni catálogos.

### D.1 Entidades propias (este módulo es dueño de su escritura)

| Entidad (tabla) | Referencia en 00 | Uso |
|---|---|---|
| `Customer` (`customers`) | §2.4 | Alta, edición, desactivación, eliminación lógica, restauración, búsqueda |
| `Contact` (`contacts`) | §2.5 | Alta, edición, activación/desactivación, eliminación lógica, restauración |
| `Attachment` (`attachments`) con `customerId` | §2.11 | Adjuntos del cliente. La tabla es compartida; este módulo escribe solo filas con `customerId` |

### D.2 Entidades compartidas (se leen o se usan, no se poseen)

| Entidad | Dueño | Uso en este módulo |
|---|---|---|
| `Country` | Fase 0 / Módulo 7 | Opciones del formulario, patrones de NIT y teléfono, etiqueta del identificador fiscal, filtro COUNTRY |
| `Catalog`, `CatalogItem` | Fase 0 / Módulo 7 | Tipo de empresa, estado, calificación |
| `User`, `TeamMember`, `Team`, `Role`, `UserRole` | Plantilla (Admin) | Responsable de ventas, elegibilidad, resolución del alcance |
| `SystemParameter` | Fase 0 / Módulo 7 | Unicidad, duplicidad, obligatorios, valores por defecto, adjuntos |
| `Sequence` | Fase 0 | Folio `crm.cliente` |
| `StoredFile` | Plantilla | Metadatos del binario del adjunto: `storage_key` generado, `file_name` saneado, `mime_type` detectado, `checksum` SHA-256 (ADR-021) |
| `AuditLog` | Plantilla | Rastro de mutaciones |
| `Project` | Módulo 3 | **Lectura** para herencia de visibilidad (RN-02.18), conteo de dependencias (RN-02.22) y la sección F-08 (vía contrato del Módulo 3) |
| `Visit`, `Activity` | Módulo 4 | **Lectura** de conteos para el bloqueo de eliminación (RN-02.22) |
| `InteractionParticipant` | Módulo 4 | **Lectura**: ¿el contacto tiene historia? (RN-02.27) |
| `CustomerImport` | Módulo 6 | `Customer.sourceImportId` se rellena cuando el alta llega desde la importación |

Las tablas de los módulos 3, 4 y 6 existen desde la Fase 0 (alcance §1 regla 2), así que las
lecturas anteriores funcionan aunque esos módulos no estén implementados: devuelven cero filas.

### D.3 Claves y relaciones

| Relación | Mecanismo (00) |
|---|---|
| Cliente → país | `customers.country_id` → `countries.id`, `Restrict` |
| Cliente → catálogos | `company_type_id`, `status_id`, `rating_id` → `catalog_items.id`, `Restrict`; pertenencia al catálogo correcto por `CatalogReferenceValidator` |
| Cliente → responsable | `sales_owner_id` → `users.id`, `Restrict` |
| Cliente → contacto principal | `(primary_contact_id, id)` → `contacts(id, customer_id)`, `NoAction` (solo contactos del mismo cliente) |
| Contacto → cliente | `contacts.customer_id` → `customers.id`, `Restrict` |
| Adjunto → cliente | `attachments.customer_id` → `customers.id`, `Restrict`; `CHECK num_nonnulls(...) = 1` |
| Proyecto/visita/actividad → cliente | FK `Restrict` desde los otros módulos: impiden borrar físicamente un cliente con historia |
| Cliente → importación | `customers.source_import_id` → `customer_imports.id`, `SetNull` |

### D.4 Catálogos utilizados

| `Catalog.key` | Columna | Semántica usada (`metadata`) |
|---|---|---|
| `crm.tipo_empresa` | `customers.company_type_id` | — |
| `crm.estado_cliente` | `customers.status_id` | `isActive` (desactivación lógica, RN-02.21) |
| `crm.calificacion_cliente` | `customers.rating_id` | `rank` (orden de presentación) |
| `crm.estado_actividad` | (lectura) | `isOpen` (dependencias, RN-02.22) |
| `crm.estado_visita` | (lectura) | `isPending` (dependencias, RN-02.22) |

El código nunca compara etiquetas ni UUID: pregunta por la semántica (00 §3.3).

### D.5 Parámetros utilizados (00 §8.2)

`crm.clientes.unicidad_codigo`, `crm.clientes.reglas_duplicidad` (por defecto
`{"razonSocialNormalizada":"AVISAR","nit":"AVISAR"}`), `crm.contactos.reglas_duplicidad`,
`crm.campos_obligatorios` (clave `customer`), `crm.valores_por_defecto` (clave
`customer.statusId`), `crm.adjuntos.max_mb`, `crm.adjuntos.tipos_permitidos`.
`crm.clientes.unicidad_nit` **ya no existe** (DM-4: un parámetro no puede imponer una unicidad
que el negocio descartó).

Configuración de despliegue (no es parámetro): `ATTACHMENTS_STORAGE_PATH` (ADR-021, 00 §8.2), que
este módulo añade a `.env.example` y a la validación de configuración al implementarse.

### D.6 Restricciones de integridad relevantes

| Restricción | Garantiza |
|---|---|
| `crm_code` único | RN-02.1 |
| `uq_customers_country_customer_code` | Mínimo de RN-02.13 (código de cliente único por país) |
| `idx_customers_country_id_tax_id` (índice, **no** único) | Búsqueda del aviso de NIT repetido (RN-02.14); el NIT no es único (DM-4) |
| `ck_customers_customer_code_normalized`, `ck_customers_tax_id_normalized` | Valor y normalizado van juntos |
| `uq_contacts_customer_email` | RN-02.16 (correo por cliente) |
| `uq_contacts_id_customer` + FK compuesta del principal | RN-02.26 ("de este cliente", "como máximo uno") |
| FK `Restrict` de participantes hacia contactos | RN-02.27 (no se borra físicamente un contacto con historia) |
| `ck_attachments_single_owner` | Un adjunto, un dueño |

---

## E. Pantallas y componentes

Frontend en `frontend/src/features/crm/customers/` (D-02.11). React + MUI + TanStack Query +
React Hook Form + Zod, con el sistema de diseño (ADR-017): sin hex, duraciones ni píxeles a mano,
encabezado `PageHeader`, mobile-first (tabla → tarjetas por debajo de `sm`), accesibilidad de
`docs/design/DESIGN-SYSTEM.md` §7. Toda lista de valores sale de la API (alcance §1 regla 8).

### E.1 Rutas

| Ruta | Pantalla | Permiso de la ruta | ¿Opción de menú? |
|---|---|---|---|
| `/clientes` | `CustomersPage` (búsqueda) | `clientes.ver` | Sí: `clientes-buscar` (módulo `clientes`) |
| `/clientes/nuevo` | `CustomerCreatePage` | `clientes.crear` | No (botón "Nuevo cliente") |
| `/clientes/:customerId` | `CustomerDetailPage` (ficha) | `clientes.ver` | No (ruta hija, 00 §5.3) |

Las tres se registran en `app-routes.registry.json` porque `route-registry.spec.ts` compara el
router entero con el registro; las rutas con parámetro no deben poder usarse como destino de una
opción de menú (D-02.12).

### E.2 `CustomersPage` — búsqueda (F-05)

| Parte | Contenido |
|---|---|
| Encabezado | `PageHeader` "Clientes"; acción "Nuevo cliente" solo con `clientes.crear` |
| Búsqueda libre | Campo con debounce de 300 ms (`table.searchInput`): busca en código CRM, código de cliente, razón social, nombre comercial y NIT |
| Filtros | Código de cliente (texto) · Código CRM (texto) · Razón social (texto) · País (selector de `form-options.countries`) · Ciudad (texto) · Estado (selector de `crm.estado_cliente`) · Responsable de ventas (autocompletar de `sales-owner-options`). Combinables (AND); chips de filtros activos con "Limpiar". Viven en la URL |
| Tabla (`DataTable`) | Código CRM (`primary`) · Razón social (+ nombre comercial secundario) · Código de cliente · País · Ciudad · Estado (chip; atenuado si `isActive=false`) · Responsable · Actualizado. Columnas secundarias `hideOnMobile` |
| Orden | Columnas ordenables = lista blanca del backend (F.2). Por defecto razón social ascendente |
| Paginación | 20 por página, opciones 10/20/50/100 |
| Selección | Clic o `Enter` sobre la fila → `/clientes/:customerId`. Fila con `role="link"` accesible |
| Filtro de eliminados | Interruptor "Ver eliminados" visible solo con `clientes.eliminar` (D-02.6); en esa vista cada fila ofrece "Restaurar" |
| Estados | **Cargando:** esqueleto de `DataTable`. **Vacío sin filtros:** "Todavía no hay clientes visibles para ti" + "Nuevo cliente" si puede crear. **Vacío con filtros:** "Ningún cliente coincide" + "Limpiar filtros". **Error:** mensaje de `describeApiError` con correlation ID y "Reintentar". **Sin permiso:** la ruta la protege `RequirePermission` → `AccessDeniedPage` |

### E.3 `CustomerCreatePage` — alta (F-06)

| Parte | Contenido |
|---|---|
| Formulario (`CustomerForm`) | Secciones (`FormSection`): **Identificación** (código de cliente, razón social, nombre comercial, NIT con la etiqueta `taxIdLabel` del país elegido) · **Ubicación y contacto** (país, ciudad, dirección, teléfono con prefijo del país como ayuda, correo) · **Clasificación comercial** (tipo de empresa, estado con su valor por defecto, calificación, responsable de ventas) · **Adjuntos** |
| Código CRM | Texto informativo "Se asigna al guardar"; no es un campo |
| Obligatorios | Marcados según `form-options.requiredFields` (base + parámetro); `RequiredNote` |
| Responsable | Sin `clientes.administrar`: fijo en el usuario actual, no editable. Con él: autocompletar de `sales-owner-options` |
| Validación de cliente | Zod (`customers.schemas.ts`): obligatorios, longitudes, formato de correo; patrón de teléfono y NIT del país si viene en `form-options`; texto libre que no empiece por `=`, `@`, tabulador o retorno de carro (RN-02.32). Es UX: el backend valida de nuevo |
| Posible duplicado | Ante `409 POSSIBLE_DUPLICATE`, `PossibleDuplicateDialog` lista los candidatos con su motivo (p. ej. "Mismo NIT" para `reason = TAX_ID`, "Razón social parecida"; con enlace solo si `isVisible`) y ofrece "Revisar" o "Guardar de todos modos" (reenvía con `acknowledgedDuplicateIds`). Para el NIT el texto aclara que puede tratarse de otro establecimiento del mismo cliente (DM-4). Ante `DUPLICATE_BLOCKED` o `CUSTOMER_CODE_TAKEN`: error en el campo; si `isDeleted` y el usuario tiene `clientes.eliminar`, enlace a restaurar |
| Errores por campo | `details[].field` del `400 VALIDATION_FAILED` (DC-6) y del `422` (incluido `FORMULA_NOT_ALLOWED`) se pintan bajo cada campo |
| Adjuntos | Selección de archivos con validación previa de tamaño (`form-options.attachments.maxMb`) y tipo (`allowedTypes`), solo como ayuda; se suben **después** del `201` (D-02.15); un fallo por archivo (`413 ATTACHMENT_TOO_LARGE`, `422 ATTACHMENT_TYPE_NOT_ALLOWED`) se muestra en la ficha sin deshacer el cliente |
| Al guardar | Navega a la ficha del cliente creado, con aviso "Cliente CLI-000123 creado" |
| Estados | **Cargando opciones:** esqueleto del formulario. **Error al cargar opciones:** mensaje + "Reintentar" (no se puede guardar sin opciones). **Enviando:** botón con progreso, formulario bloqueado. **Sin permiso:** `RequirePermission` |

### E.4 `CustomerDetailPage` — ficha (F-07, F-08, F-09)

| Parte | Contenido |
|---|---|
| Encabezado | Razón social, `crmCode`, chip de estado, responsable. Acciones según `capabilities`: "Editar" (`canEdit`), "Eliminar" (`canDelete`), "Nueva actividad" (G.4), "Restaurar" si está eliminado y `canRestore` |
| Sección General (`CustomerGeneralSection`) | `DetailList` con todos los campos de B.2 y sus etiquetas; NIT con la etiqueta del país; trazabilidad: creado por/el, actualizado por/el; origen "Carga masiva IMP-…" si `sourceImportId`. Acceso heredado: aviso "Lo ves porque participas en un proyecto de este cliente" (solo lectura) |
| Editar (`CustomerEditDrawer`) | `EntityDrawer` (`@/components/data`) con `CustomerForm` en modo edición; campos fuera de `capabilities.editableFields` deshabilitados con explicación. Mismo manejo de duplicados que el alta: el aviso de NIT repetido aparece solo si se cambia el NIT o el país (RN-02.14) |
| Eliminar | `ConfirmDialog` `destructive` que explica que la eliminación es lógica y conserva la historia. Ante `409 CUSTOMER_HAS_DEPENDENCIES` muestra los conteos (proyectos, actividades abiertas, visitas pendientes) y sugiere desactivar |
| Sección Contactos (`CustomerContactsSection`) | Ver E.5 |
| Sección Proyectos (`CustomerProjectsSection`) | Ver E.6 |
| Sección Adjuntos (`CustomerAttachmentsSection`, de `crm/common`) | Lista (nombre, tipo, tamaño, subido por, fecha) con descarga; "Subir" y "Eliminar" con `canManageAttachments`. La descarga usa `httpClient.download` + `saveFile` contra F19 (el token no viaja en un `<a href>` y el archivo nunca se abre en línea). Estados: cargando, vacío ("Este cliente no tiene adjuntos"), error con reintento, subida con progreso y error por archivo |
| Estados | **Cargando:** esqueleto por sección (cada sección carga por separado). **No encontrado (404):** "Este cliente no existe o no tienes acceso" + volver a la búsqueda. **Error:** por sección, con "Reintentar"; un error en Proyectos no rompe la ficha. **Sin permiso:** ruta protegida; secciones sin permiso (contactos sin `contactos.ver`, proyectos sin `proyectos.ver`) no se muestran |

### E.5 Contactos dentro de la ficha (F-09)

| Parte | Contenido |
|---|---|
| Lista | Nombre completo (con insignia "Principal") · Cargo · Teléfono · Correo · Estado. Búsqueda (nombre, apellidos, correo, cargo) y filtro Activos/Inactivos/Todos (por defecto Activos). Paginada en el servidor |
| Crear / editar (`ContactFormDialog`, `EntityDialog` (`@/components/data`)) | Nombre, apellidos, cargo, teléfono, correo, estado, comentarios, "Marcar como principal". Cliente fijo (el de la ficha), mostrado como texto |
| Elegir principal | Acción de fila "Marcar como principal" (deshabilitada en inactivos, con explicación) |
| Activar / desactivar | Acción de fila; desactivar el principal avisa de que quedará sin principal |
| Eliminar | Con `contactos.eliminar`; `ConfirmDialog` `destructive`. Ante `409 CONTACT_HAS_HISTORY`: "Este contacto participa en visitas o actividades; puedes desactivarlo" con botón "Desactivar" |
| Duplicados | `CONTACT_EMAIL_TAKEN` en el campo correo; `POSSIBLE_DUPLICATE` con el mismo diálogo de confirmación |
| Estados | Cargando, vacío ("Este cliente no tiene contactos" + "Nuevo contacto" si puede), error con reintento; oculta sin `contactos.ver` |

### E.6 Proyectos dentro de la ficha (F-08)

| Parte | Contenido |
|---|---|
| Tabla | Código · Nombre · Ubicación (ciudad, país) · Fase (etiqueta + % avance) · Estado comercial (DM-16) · Asesor responsable · Fecha estimada de decisión |
| Buscar / filtrar / ordenar | Búsqueda (código, nombre) · filtros fase, asesor, estado comercial · orden por las columnas que el Módulo 3 declare ordenables. Estado en la URL con prefijo `projects.` para no chocar con otros parámetros |
| Navegación | Fila → `/proyectos/:projectId` (ruta del Módulo 3) |
| Disponibilidad (D-02.10) | Con la opción de menú de Proyectos presente en `GET /me/menu` → tabla. Sin ella y con `proyectos.ver` → estado informativo "Los proyectos del cliente se mostrarán cuando el módulo de Proyectos esté disponible". Sin `proyectos.ver` → sección oculta |
| Estados | Cargando, vacío ("Este cliente no tiene proyectos visibles para ti"), error con reintento, no disponible |

### E.7 `CustomerPicker` (componente reutilizable, F-05)

Autocompletar exportado por `features/crm/customers/index.ts` para los formularios de Proyectos y
Actividad: llama a `GET /customers?search=…&pageSize=10&activeOnly=true`, muestra `crmCode` y razón
social, y devuelve `{ id, crmCode, legalName, countryId }`. Acepta `value` preseleccionado (p. ej.
desde la ficha) y lo resuelve con `GET /customers/{id}`. Estados: cargando, sin resultados, error.

---

## F. Servicios y contratos

Todos bajo `/api/v1`, formato de error de `API-STANDARDS.md` §8, DTO de entrada con
`whitelist` + `forbidNonWhitelisted`, fechas ISO 8601 UTC, colecciones `{ data, pagination }`
(`PaginatedResponseDto`), `page` base 1 y `pageSize` ≤ 100. Todo endpoint declara
`@RequirePermission`. Swagger con `@ApiTags('Clientes')` / `('Clientes · Contactos')`.

### F.1 Operaciones propias — clientes

| # | Método | Ruta | Permiso | Request | Respuesta | Errores |
|---|---|---|---|---|---|---|
| F1 | GET | `/customers` | `clientes.ver` | `ListCustomersQueryDto` (F.2) | `200 { data: CustomerListItemDto[], pagination }` | 400 `VALIDATION_FAILED` (incl. `sortBy` fuera de lista blanca), 401, 403 `PERMISSION_DENIED` (también `deleted=true` sin `clientes.eliminar`) |
| F2 | GET | `/customers/form-options` | `clientes.ver` | — | `200 CustomerFormOptionsDto` (F.3) | 401, 403 |
| F3 | GET | `/customers/sales-owner-options` | `clientes.ver` | `search?`, `page`, `pageSize` | `200 { data: SalesOwnerOptionDto[], pagination }` | 400, 401, 403 |
| F4 | GET | `/customers/{id}` | `clientes.ver` | `id` UUID | `200 CustomerResponseDto` (F.3) | 400 (UUID), 401, 403, 404 `RESOURCE_NOT_FOUND` (inexistente, fuera de alcance o eliminado sin `clientes.eliminar`) |
| F5 | POST | `/customers` | `clientes.crear` | `CreateCustomerDto` | `201 CustomerResponseDto` + `Location` | 400 `VALIDATION_FAILED` (DC-6), 401, 403 `PERMISSION_DENIED` / `FIELD_NOT_EDITABLE` (`salesOwnerId` ajeno sin `clientes.administrar`), 409 `CUSTOMER_CODE_TAKEN` / `POSSIBLE_DUPLICATE` (incluye NIT repetido, motivo `TAX_ID`) / `DUPLICATE_BLOCKED`, 422 `REQUIRED_FIELD_MISSING` / `INVALID_CATALOG_VALUE` / `INVALID_COUNTRY` / `INVALID_SALES_OWNER` / `INVALID_PHONE_FORMAT` / `INVALID_TAX_ID_FORMAT` / `FORMULA_NOT_ALLOWED` |
| F6 | PATCH | `/customers/{id}` | `clientes.editar` o `clientes.administrar` (ver H) | `UpdateCustomerDto` (parcial; omitido = sin cambio, `null` = borrar opcional) | `200 CustomerResponseDto` | 400, 401, 403 `PERMISSION_DENIED` / `FIELD_NOT_EDITABLE` (con `details[].field`), 404, 409 (como F5), 422 (como F5) |
| F7 | DELETE | `/customers/{id}` | `clientes.eliminar` | — | `204` | 401, 403, 404, 409 `CUSTOMER_HAS_DEPENDENCIES` (`details: [{ dependency: 'projects'|'openActivities'|'pendingVisits', count }]`) |
| F8 | POST | `/customers/{id}/restore` | `clientes.eliminar` | — | `200 CustomerResponseDto` | 401, 403, 404, 409 `CUSTOMER_NOT_DELETED` / `CUSTOMER_CODE_TAKEN` |

Notas:

- El permiso de F6 se declara como `@RequirePermission('clientes.editar')` y el servicio exige
  además `clientes.administrar` para registros ajenos y para los campos reservados (H.2). Un usuario
  con `clientes.administrar` pero sin `clientes.editar` no edita (la matriz 00 §5.4 siempre concede ambos).
- F2 y F3 se declaran **antes** que `/:id` en el controlador; `ParseUUIDPipe` en `:id` rechaza igualmente
  rutas no UUID.
- Desactivar no tiene endpoint propio: es `PATCH { statusId }` (RN-02.21).

### F.2 Consulta de la búsqueda — `ListCustomersQueryDto`

Extiende `PaginationQueryDto`.

| Parámetro | Tipo | Semántica |
|---|---|---|
| `search` | string ≤ 200 | Contiene (normalizado, RN-02.17) en razón social y nombre comercial; prefijo en `crmCode`, `customerCode` normalizado y `taxId` normalizado (D-02.14) |
| `customerCode` | string ≤ 40 | Prefijo sobre `customerCodeNormalized` |
| `crmCode` | string ≤ 30 | Prefijo, sin distinguir mayúsculas |
| `legalName` | string ≤ 200 | Contiene sobre `legalNameNormalized` |
| `countryId` | UUID | Igualdad |
| `city` | string ≤ 120 | Contiene, normalizado (DM-19: texto libre) |
| `statusId` | UUID | Igualdad (elemento de `crm.estado_cliente`) |
| `salesOwnerId` | UUID | Igualdad |
| `activeOnly` | boolean | Solo estados con `metadata.isActive = true` (lo usa `CustomerPicker`) |
| `deleted` | boolean | `true` = solo eliminados; exige `clientes.eliminar` (D-02.6) |
| `sortBy` | lista blanca | `crmCode`, `customerCode`, `legalName`, `city`, `country`, `status`, `salesOwner`, `createdAt`, `updatedAt`. Defecto `legalName` |
| `sortOrder` | `asc`/`desc` | Defecto `asc` cuando `sortBy` se omite |

Los filtros se traducen a condiciones del adaptador Prisma con valores parametrizados (nunca SQL
concatenado) y siempre se combinan con el predicado de visibilidad (H.1).

### F.3 DTOs

`CustomerListItemDto`

```text
id, crmCode, customerCode|null, legalName, tradeName|null,
country { id, isoCode, name }, city|null,
status { id, code, label, isActive }, rating { id, code, label }|null,
salesOwner { id, displayName }, access: 'DIRECT' | 'INHERITED',
isDeleted, updatedAt
```

`CustomerResponseDto` (recurso único, sin envoltorio)

```text
id, crmCode, customerCode|null, legalName, tradeName|null, taxId|null,
country { id, isoCode, name, taxIdLabel }, city|null, address|null, phone|null, email|null,
companyType { id, code, label, isActive }|null, status { id, code, label, isActive },
rating { id, code, label, isActive }|null, salesOwner { id, displayName, isActive },
primaryContact { id, fullName }|null      ← solo si el actor tiene contactos.ver
sourceImport { id, code }|null, access: 'DIRECT' | 'INHERITED', isDeleted, deletedAt|null,
createdAt, createdBy { id, displayName }|null, updatedAt, updatedBy { id, displayName }|null,
capabilities { canEdit, canDelete, canRestore, canManageAttachments, canManageContacts,
               canReassignOwner, editableFields: string[] }
```

`capabilities` lo calcula el backend con la misma política que hace cumplir las operaciones
(`CustomerAccessPolicy`); el frontend solo lo usa para mostrar u ocultar (alcance §4.3 "los campos
editables deben depender de los permisos del usuario").

`CreateCustomerDto`

```text
customerCode?: string ≤40     legalName: string 1..200     tradeName?: string ≤200
taxId?: string ≤30            countryId: UUID              city?: string ≤120
address?: string ≤300         phone?: string ≤40           email?: email ≤320
companyTypeId?: UUID          statusId?: UUID (defecto por parámetro)   ratingId?: UUID
salesOwnerId?: UUID (defecto: el actor)
acknowledgedDuplicateIds?: UUID[] ≤ 50
```

`UpdateCustomerDto`: los mismos campos opcionales salvo `crmCode` (inexistente en el DTO, se rechaza
por `forbidNonWhitelisted`), más `acknowledgedDuplicateIds`.

`CustomerFormOptionsDto`

```text
countries:     [{ id, isoCode, name, phonePrefix|null, taxIdLabel, taxIdPattern|null, phonePattern|null }]   (activos)
companyTypes:  [{ id, code, label, sortOrder }]   (activos de crm.tipo_empresa)
statuses:      [{ id, code, label, sortOrder, isActive }]   (activos de crm.estado_cliente)
ratings:       [{ id, code, label, sortOrder }]   (activos de crm.calificacion_cliente)
defaults:      { statusId|null, companyTypeId|null, ratingId|null }   (de crm.valores_por_defecto; un código inactivo → null)
requiredFields: string[]                          (base + crm.campos_obligatorios.customer)
attachments:   { enabled: boolean, maxMb, allowedTypes: string[] }   (enabled = true: almacenamiento de ADR-021;
                                                                     maxMb y allowedTypes de crm.adjuntos.*)
```

Para mostrar en edición un valor ya desactivado, la ficha usa la etiqueta que trae
`CustomerResponseDto` (no necesita que el elemento esté en las opciones). D-02.1 decide que las
opciones se sirven por módulo.

`SalesOwnerOptionDto`: `{ id, displayName, employeeCode|null, country { id, name }|null }` — sin
correo ni teléfono.

Semántica de `isActive` en los DTO (implementación, 2026-10-11): en `status` (lista, ficha y
`form-options.statuses`) es `metadata.isActive` del estado (`false` = cliente desactivado,
RN-02.21); en `companyType` y `rating` es si el **elemento** del catálogo sigue activo (un valor ya
desactivado se conserva en el cliente); en `salesOwner` es usuario `ACTIVE` y no eliminado.

`CUSTOMER_CODE_TAKEN` (`409`): `details: [{ field: 'customerCode', customerId: uuid|null, crmCode,
isDeleted }]`; `customerId` solo si el cliente que ocupa el código es visible para el actor (D-02.3),
para ofrecer la restauración (D-02.6).

`422` de validación (F5, F6): `details[]` trae **todas** las incidencias `{ field, code, message }`
(más `catalogKey` y `reason` en `INVALID_CATALOG_VALUE`); el `code` de la respuesta es el de la
primera según este orden: `FORMULA_NOT_ALLOWED`, `REQUIRED_FIELD_MISSING`, `INVALID_COUNTRY`,
`INVALID_PHONE_FORMAT`, `INVALID_TAX_ID_FORMAT`, `INVALID_CATALOG_VALUE`, `INVALID_SALES_OWNER`.

`PossibleDuplicateErrorDetails` (en `details` del `409 POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED`)

```text
[{ rule: 'razonSocialNormalizada'|'nombreComercialNormalizado'|'correo'|'telefono'|'nit',
   reason: 'LEGAL_NAME'|'TRADE_NAME'|'EMAIL'|'PHONE'|'TAX_ID',
   candidate: { id|null, crmCode, customerCode|null, legalName, country { isoCode, name },
                salesOwnerName, isVisible, isDeleted } }]
```

`id` es `null` cuando `isVisible = false` (RN-02.15). `reason` es el motivo legible por máquina
de la coincidencia (uno por regla; `TAX_ID` = NIT repetido en el mismo país, DM-4). Un mismo
candidato puede aparecer con varios motivos. `customerCode` permite distinguir establecimientos
que comparten NIT (es dato de empresa, D-02.3).

### F.4 Operaciones propias — contactos

| # | Método | Ruta | Permiso | Request | Respuesta | Errores |
|---|---|---|---|---|---|---|
| F9 | GET | `/customers/{customerId}/contacts` | `contactos.ver` | `ListContactsQueryDto`: `search` (nombre, apellidos, correo, cargo), `status` = `ACTIVE`\|`INACTIVE`\|`ALL` (defecto `ACTIVE`), `sortBy` ∈ `lastName`, `firstName`, `jobTitle`, `createdAt` (defecto `lastName asc`), paginación | `200 { data: ContactResponseDto[], pagination }` | 400, 401, 403, 404 (cliente inexistente, fuera de alcance o eliminado) |
| F10 | GET | `/customers/{customerId}/contacts/{contactId}` | `contactos.ver` | — | `200 ContactResponseDto` | 401, 403, 404 (también contacto de otro cliente) |
| F11 | POST | `/customers/{customerId}/contacts` | `contactos.crear` | `CreateContactDto` | `201 ContactResponseDto` + `Location` | 400, 401, 403 (`PERMISSION_DENIED`; cliente no editable por el actor), 404, 409 `CONTACT_EMAIL_TAKEN` / `POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED`, 422 `INVALID_PHONE_FORMAT` / `CONTACT_INACTIVE` (alta inactiva marcada como principal) |
| F12 | PATCH | `/customers/{customerId}/contacts/{contactId}` | `contactos.editar` | `UpdateContactDto` (incluye `isActive`) | `200 ContactResponseDto` | 400, 401, 403, 404, 409 (como F11), 422 |
| F13 | PUT | `/customers/{customerId}/primary-contact` | `contactos.editar` | `{ contactId: UUID }` | `200 { primaryContact: { id, fullName } }` | 400, 401, 403, 404 (contacto inexistente o de otro cliente), 422 `CONTACT_INACTIVE` |
| F14 | DELETE | `/customers/{customerId}/primary-contact` | `contactos.editar` | — | `204` | 401, 403, 404 |
| F15 | DELETE | `/customers/{customerId}/contacts/{contactId}` | `contactos.eliminar` | — | `204` | 401, 403, 404, 409 `CONTACT_HAS_HISTORY` |
| F16 | POST | `/customers/{customerId}/contacts/{contactId}/restore` | `contactos.eliminar` | — | `200 ContactResponseDto` | 401, 403, 404, 409 `CONTACT_NOT_DELETED` / `CONTACT_EMAIL_TAKEN` |

`ContactResponseDto`: `id, customerId, firstName, lastName, fullName, jobTitle|null, phone|null,
email|null, isActive, isPrimary, comments|null, hasHistory, isDeleted, createdAt, updatedAt`
(`isDeleted` añadido en la implementación para la lista de eliminados).

`ListContactsQueryDto` admite además `deleted=true` (solo eliminados), que exige
`contactos.eliminar` (D-02.6: "listado de eliminados con `deleted=true` y el mismo permiso").

Detalles de error de contactos (implementación, 2026-10-11):

```text
409 CONTACT_EMAIL_TAKEN   details: [{ field: 'email', contactId: uuid|null, isDeleted: boolean|null }]
409 POSSIBLE_DUPLICATE /  details: [{ rule: 'nombreCompleto'|'telefono', reason: 'FULL_NAME'|'PHONE',
    DUPLICATE_BLOCKED               candidate: { id, fullName, jobTitle|null, isDeleted } }]
```

Los candidatos de contacto son siempre del mismo cliente (que el actor ya ve), así que llevan `id`;
la confirmación sigue la misma regla que los clientes (RN-02.14).
`CreateContactDto`: `firstName 1..80`, `lastName 1..80`, `jobTitle? ≤120`, `phone? ≤40`,
`email? ≤320`, `isActive? (defecto true)`, `comments? ≤1000`, `isPrimary? (defecto false)`,
`acknowledgedDuplicateIds?`. `UpdateContactDto`: los mismos opcionales salvo `isPrimary` (el
principal se cambia con F13/F14).

### F.5 Operaciones propias — adjuntos del cliente (ADR-021)

Rutas por dueño (DC-2): la autorización la decide este módulo sobre el cliente; el
`AttachmentsService` transversal solo opera sobre `owner = { type: 'customer', id }`.

| # | Método | Ruta | Permiso | Request | Respuesta | Errores |
|---|---|---|---|---|---|---|
| F17 | GET | `/customers/{customerId}/attachments` | `clientes.ver` | paginación | `200 { data: AttachmentResponseDto[], pagination }` | 401, 403, 404 |
| F18 | POST | `/customers/{customerId}/attachments` | `clientes.editar` (+ política de edición) | `multipart/form-data`: `file` (uno), `description? ≤300` | `201 AttachmentResponseDto` + `Location` | 400 `VALIDATION_FAILED` (falta `file`, más de un archivo, campos extra), 401, 403, 404, 413 `ATTACHMENT_TOO_LARGE`, 422 `ATTACHMENT_TYPE_NOT_ALLOWED`, 429 |
| F19 | GET | `/customers/{customerId}/attachments/{attachmentId}/content` | `clientes.ver` | — | `200` flujo binario transmitido por la API **después** de autorizar, con `Content-Type` = tipo detectado al guardar, `Content-Disposition: attachment; filename*=UTF-8''<nombre saneado y codificado>`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` | 401, 403, 404 (también adjunto de otro cliente o eliminado) |
| F20 | DELETE | `/customers/{customerId}/attachments/{attachmentId}` | `clientes.editar` (+ política de edición) | — | `204` | 401, 403, 404 |

`AttachmentResponseDto`: `id, fileName, contentType, sizeBytes, description|null,
createdAt, createdBy { id, displayName }|null`. Nunca expone `storageKey` ni rutas del
almacenamiento. Los cuatro endpoints se registran desde la primera entrega (DM-8 resuelta).

- F18: interceptor de subida con almacenamiento **en memoria acotada o streaming** hacia
  `FileStorage.save` (nunca un temporal fuera de la base del almacenamiento), `files: 1`, corte al
  superar `crm.adjuntos.max_mb`; NGINX limita antes el cuerpo (`client_max_body_size`), y
  `crm.adjuntos.max_mb` no puede superarlo (00 §8.2). El `413` de NGINX puede llegar sin cuerpo
  JSON: el frontend lo trata igual. Tipo por firma (RN-02.29). Límite de tasa de la configuración
  global (`429` documentado).
- F19: el binario se lee con `FileStorage.openRead(storageKey)` y se transmite; si falta en el
  almacenamiento (fila sin binario), `500` registrado con correlation ID, nunca otro archivo. El
  adjunto **nunca** se publica como recurso estático ni con URL firmada (ADR-021).
- `413` se añade a la tabla de API-STANDARDS §3 al implementar (DC-4 y D-06.13 resueltas el
  2026-10-10).

### F.6 Servicios de aplicación reutilizables (contratos internos, sin HTTP)

Exportados por su módulo Nest para que otros módulos los inyecten. Firmas orientativas en TypeScript.

#### F.6.1 `CustomerValidationService` (dueño: este módulo; consumidor: Módulo 6)

```ts
type CustomerRefMode = 'BY_ID' | 'BY_NATURAL_KEY';      // pantalla | importación
interface CustomerDraft {                                 // valores crudos, ya recortados
  customerCode?: string | null; legalName?: string | null; tradeName?: string | null;
  taxId?: string | null; country?: string | null;        // id o isoCode según el modo
  city?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  companyType?: string | null; status?: string | null; rating?: string | null;   // id o code
  salesOwner?: string | null;                            // id, o código de colaborador / correo (D-02.17)
}
interface FieldIssue { field: string; code: string; message: string }   // misma forma que customer_import_rows.errors
interface ValidationOutcome {
  errors: FieldIssue[];                         // todos, no solo el primero
  duplicates: DuplicateCandidate[];             // blandos (AVISAR), cada uno con rule y reason (TAX_ID para el NIT)
  blockingDuplicates: DuplicateCandidate[];     // BLOQUEAR o código de cliente ocupado (nunca por NIT, DM-4)
  normalized: NormalizedCustomer | null;        // ids resueltos + valores normalizados si no hay errores
}
validate(draft, { mode: CustomerRefMode, actor: CustomerActor,
                  existing?: CustomerRecord, tx?: TransactionContext }): Promise<ValidationOutcome>
  // implementado (2026-10-11): `existing` es el registro actual (no su id) y el alcance lo
  // resuelve el servicio con `CustomerActorResolver`; ValidationOutcome añade
  // `codeConflict: { customerId|null, crmCode, isDeleted } | null` (código de cliente ocupado,
  // separado de `blockingDuplicates`)
duplicateKeys(draft): CustomerDuplicateKeys     // claves normalizadas para detectar duplicados dentro de un archivo:
                                                //   blocking: código de cliente (en el ámbito de unicidad_codigo)
                                                //   warning:  NIT, solo si la regla 'nit' vale AVISAR (mismo país)
```

Aplica RN-02.4 a RN-02.17 y RN-02.32. No escribe nada. Los códigos de `FieldIssue.code` son los
mismos que los códigos de error HTTP de F5 para que la importación muestre el mismo error por
fila. Con `existingCustomerId` (edición) evalúa los duplicados blandos solo para las claves que
cambian (RN-02.14).

#### F.6.2 `CustomerCreationService` (dueño: este módulo; consumidor: Módulo 6)

```ts
create(draft, ctx: { actor: Principal; audit: AuditContext; mode: CustomerRefMode;
                     source: 'UI' | 'IMPORT'; sourceImportId?: string;
                     acknowledgedDuplicateIds?: string[] }): Promise<CustomerRecord>
```

Un único caso de uso de alta: valida (F.6.1), aplica valores por defecto, asigna `crmCode` con
`SequenceGenerator` en la transacción, inserta, audita (`metadata.source`). La importación lo invoca
fila a fila en su propia transacción (00 §2.14) y **nunca** sobrescribe un cliente existente.
En modo `IMPORT` no hay confirmación interactiva: un `AVISAR` se trata como advertencia de la
fila, según D-06.6 (aprobada): la fila queda válida y solo se importa si la confirmación de la
carga incluye las filas con advertencias, que el Módulo 6 traduce en `acknowledgedDuplicateIds`.
El NIT repetido se muestra en la carga con el código `DUPLICATE_TAX_ID` (06 RN-06.18); el resto de
avisos, con `POSSIBLE_DUPLICATE`.

#### F.6.3 `CustomerReferenceGuard` (dueño: este módulo; consumidores: Módulos 3 y 4)

```ts
assertUsableCustomer(customerId, actor, { requireActive: boolean }): Promise<CustomerSummary>
  // 404 si no existe, está eliminado o no es visible; 422 CUSTOMER_INACTIVE si requireActive y el estado no está activo (D-02.16)
assertContactOfCustomer(contactId, customerId, { requireActive: boolean }): Promise<ContactSummary>
  // 422 INVALID_CONTACT si no pertenece al cliente o está eliminado; 422 CONTACT_INACTIVE si requireActive
```

#### F.6.4 `DuplicateRules` (dueño: este módulo)

Funciones puras: `parseDuplicateRules(json, allowedKeys)` → `{ key → 'NO'|'AVISAR'|'BLOQUEAR' }`
con advertencias de claves desconocidas y con la clave `nit` limitada a `AVISAR | NO` (otro valor
→ `AVISAR` con advertencia, RN-02.14); `evaluate(rules, matches)` → avisos y bloqueos. Las usan
`CustomerValidationService` y `ContactsService`. La búsqueda de coincidencias la hace el
repositorio (`findDuplicateCandidates`) con índices de 00.

#### F.6.5 Piezas transversales que este módulo consume (y entrega si la Fase 0 no lo hizo)

| Pieza | Dueño (00 §11) | Contrato usado aquí |
|---|---|---|
| `SequenceGenerator` | Fase 0, `infrastructure/database` | `next(key: string, tx): Promise<string>`; `SELECT … FOR UPDATE` sobre `sequences`; aplica `prefix`, `pattern`, `padding`, `resetPolicy` |
| `CatalogReferenceValidator` | Fase 0, extensión de `catalogs` | `assertItem(catalogKey, itemIdOrCode, { by: 'id'|'code', requireActive, field }) → CatalogItemRef`; `422 INVALID_CATALOG_VALUE` |
| `VisibilityScopeResolver` | Fase 0, `access` | `resolve(principal) → { kind: 'ALL' } \| { kind: 'FILTERED', ownerIds?: string[], countryIds?: string[] }` (00 §4.2) |
| `ParameterReader` | Fase 0, `parameters` | `get<T>(key): Promise<T>` tipado, **sin caché o con caché invalidada** al editar el parámetro (DC-3, regla de 07 RN-07.35: un cambio surte efecto inmediato). Hoy `ParametersService` no expone lectura por clave: se añade |
| `AttachmentsService` + `FileStorage` | Transversal nuevo, **este módulo lo entrega**: `AttachmentsService` en `modules/attachments`; puerto `FileStorage` y adaptador `LocalFileSystemStorage` en `infrastructure/storage` (ADR-021, 00 §2.11) | `list(owner, page)`, `add(owner, stream, meta, ctx)`, `open(owner, attachmentId) → { stream, fileName, contentType, sizeBytes }`, `remove(owner, attachmentId, ctx)`; `owner = { type: 'customer'|'project'|'visit'|'visitEvent'|'activity', id }`. La autorización sobre el dueño la decide el módulo que llama. `FileStorage`: `save(stream, { storageKey, maxBytes }) → { sizeBytes, checksum }`, `openRead(storageKey) → stream`, `delete(storageKey)`; el dominio no conoce rutas |
| `AuditService` | Plantilla | `record(event, ctx, { resourceType, resourceId, before, after, metadata })` + enmascarado de PII de contactos (DM-29) |

Si al empezar este módulo la Fase 0 no entregó alguna de las cuatro primeras, se implementa en su
ubicación transversal (sección L), **no** dentro de `customers/`.

### F.7 Consultas a otros módulos

| Consulta | Dueño | Contrato requerido | Uso |
|---|---|---|---|
| Proyectos de un cliente (F-08) | Módulo 3 | `GET /api/v1/projects?customerId={id}&search&phaseId&ownerId&commercialStatus&page&pageSize&sortBy&sortOrder`, permiso `proyectos.ver`, filtrado por la visibilidad de proyectos, respuesta `Paginated<ProjectListItemDto>` de 03 F.1 (se usan `id, code, name, city, country { name }, phase { id, code, label, progress }, commercialStatus { kind, label, stage }, owner { id, displayName }, estimatedDecisionDate`) | Lo llama **el frontend** directamente; el backend de Clientes no lo reexpone. Parámetros y forma **alineados en la consolidación** con el contrato del dueño (03 F.1, "Contrato para Clientes F-08") |
| Ruta de detalle de proyecto | Módulo 3 | `/proyectos/:projectId` | Navegación desde E.6 |
| Alta de actividad con cliente preseleccionado | Módulo 4 | Ruta `/actividad/actividades/nueva?customerId={id}` (fijada por 04 E.1). El Módulo 4 entrega los componentes `NewActivityButton`, `PlanVisitButton` y `CommercialActivitySection` (04 E.11), que la ficha monta cuando el módulo está disponible (D-02.10) | Botón "Nueva actividad" de la ficha |
| Menú del usuario | Plantilla (ADR-018) | `GET /api/v1/me/menu` | Disponibilidad de Proyectos y Actividad (D-02.10) |

Las lecturas de **conteos** (proyectos, actividades abiertas, visitas pendientes, participaciones
de contactos) y la herencia de visibilidad se hacen en el adaptador Prisma de este módulo sobre
las tablas de 00, sin llamar a otros módulos: son reglas de integridad del cliente, no
funcionalidad de esos módulos.

---

## G. Relaciones e integraciones internas

### G.1 Consume

| De | Qué |
|---|---|
| Fase 0 / Administración | Países, catálogos, parámetros, usuarios y equipos, secuencia `crm.cliente`, permisos `clientes.*` y `contactos.*` sembrados, `DataScope` con `COUNTRY` |
| Plantilla | `AuditService`, `PermissionsGuard` + `@RequirePermission`, `AccessService` (permisos efectivos para elegibilidad), `/me/menu` |
| Módulo 3 | Lista de proyectos del cliente (F.7); tabla `projects` para herencia y conteos |
| Módulo 4 | Tablas `visits`, `activities`, `interaction_participants` para conteos e historia de contactos; ruta de alta de actividad |

### G.2 Proporciona

| A | Qué | Identificadores |
|---|---|---|
| Módulo 3 Proyectos | `CustomerReferenceGuard.assertUsableCustomer`; `CustomerPicker`; `GET /customers` para búsqueda | `customers.id` en `projects.customer_id` |
| Módulo 4 Actividad | `assertUsableCustomer`, `assertContactOfCustomer`; `GET /customers/{id}/contacts?status=ACTIVE` para elegir participantes; `CustomerPicker` | `customers.id`, `contacts.id` en `visits`, `activities`, `interaction_participants` |
| Módulo 1 Inicio y Módulo 5 Reportes | Datos de cliente por lectura directa de `customers` en sus modelos de lectura, **aplicando el mismo predicado de visibilidad** de H.1 (expuesto como función del adaptador, D-02.12); etiqueta "razón social + código CRM" | `customers.id`, `crm_code` |
| Módulo 6 Integraciones | `CustomerValidationService`, `CustomerCreationService`, `DuplicateRules`, normalización | `customers.source_import_id` |
| Módulo 7 Administración | Eventos de auditoría `crm.customer.*`, `crm.contact.*`, `crm.attachment.*` para la consulta F-47 | `audit_logs.resource_type/resource_id` |

### G.3 Identificadores utilizados

`customers.id` (UUID, contrato de API), `customers.crm_code` (humano, inmutable),
`customers.customer_code` (del negocio, opcional), `contacts.id`, `attachments.id`,
`catalog_items.id` / `code`, `countries.id` / `iso_code`, `users.id` / `employee_code`.

### G.4 Comportamiento mientras un módulo dependiente no existe

| Situación | Comportamiento |
|---|---|
| Módulo 3 no implementado | Sección de proyectos en estado "disponible con el módulo de Proyectos" (D-02.10); herencia de visibilidad y bloqueo de eliminación funcionan igual sobre `projects` (vacía). F-08 queda `bloqueada` en la matriz hasta que el Módulo 3 entregue su contrato |
| Módulo 4 no implementado | Botón "Nueva actividad" oculto (no hay opción de menú de actividades); conteos de actividades y visitas = 0; ningún contacto tiene historia (se pueden eliminar lógicamente) |
| Módulo 6 no implementado | `sourceImportId` siempre nulo; los servicios F.6.1/F.6.2 existen y se prueban de forma unitaria con modo `BY_NATURAL_KEY` |
| Módulo 7 no implementado | Catálogos, parámetros y usuarios se cargan por semilla (00 §8); la auditoría se escribe aunque aún no haya la pantalla de consulta del CRM (la de PLAN-ADMIN ya la muestra) |
| Adjuntos | Sin dependencia pendiente: DM-8 resuelta por ADR-021; este módulo entrega `FileStorage`, `LocalFileSystemStorage` y `AttachmentsService`, que luego reutilizan Proyectos y Actividad |

---

## H. Seguridad

### H.1 Visibilidad (00 §4)

Predicado de visibilidad de clientes, construido por el adaptador a partir del `VisibilityScope`
(nunca por el cliente HTTP):

```text
deleted_at IS NULL                                   (salvo deleted=true con clientes.eliminar)
AND ( scope = ALL
      OR sales_owner_id IN (:ownerIds)               (OWN, TEAM)
      OR country_id IN (:countryIds)                 (COUNTRY)
      OR EXISTS (SELECT 1 FROM projects p             (herencia, DM-13)
                 WHERE p.customer_id = customers.id AND p.deleted_at IS NULL
                   AND <mismo predicado de alcance sobre p.owner_id / p.country_id>) )
```

`access = 'DIRECT'` si cumple por alcance propio; `'INHERITED'` si solo por la herencia. El mismo
predicado se usa en listas, detalle, contactos (visibilidad del cliente), adjuntos y en la guarda
`assertUsableCustomer`. `TEAM` se resuelve antes a una lista acotada de usuarios, con los
subequipos incluidos (00 §4.2; DM-12 resuelta, H.4).

### H.2 Permiso por operación

| Operación | Permiso declarado | Regla adicional en el servicio |
|---|---|---|
| Buscar / ver ficha / opciones | `clientes.ver` | Visibilidad H.1; `deleted=true` exige `clientes.eliminar` |
| Crear cliente | `clientes.crear` | Responsable ≠ actor exige `clientes.administrar` |
| Editar cliente propio | `clientes.editar` | `salesOwnerId = actor`, acceso `DIRECT` |
| Editar cliente ajeno | `clientes.editar` + `clientes.administrar` | Acceso `DIRECT` (D-02.9) |
| Campos `customerCode`, `salesOwnerId`, `countryId` | `clientes.administrar` | `403 FIELD_NOT_EDITABLE` si se envían con valor distinto y sin el permiso |
| Desactivar / reactivar | Como editar | — |
| Eliminar / restaurar / ver eliminados | `clientes.eliminar` | Acceso `DIRECT`; dependencias (RN-02.22) |
| Ver contactos | `contactos.ver` | Cliente visible |
| Crear / editar contacto, elegir principal | `contactos.crear` / `contactos.editar` | Cliente editable por el actor (D-02.7) |
| Eliminar / restaurar contacto | `contactos.eliminar` | Cliente editable por el actor; sin historia (RN-02.27) |
| Listar / descargar adjuntos | `clientes.ver` | Cliente visible |
| Subir / eliminar adjuntos | `clientes.editar` | Cliente editable por el actor |
| Ver sección de proyectos | `proyectos.ver` (lo exige el Módulo 3) | — |

Roles (00 §5.4, DM-11): `asesor` (OWN) ve/crea/edita sus clientes y contactos, sin eliminar ni
administrar; `manager` (TEAM) y `responsable-pais` (COUNTRY) además eliminan y administran;
`administrador` todo. ADR-020: solo el administrador asigna roles.

### H.3 Aplicación en el backend

- `@RequirePermission` en cada endpoint (`PermissionsGuard`, deny-by-default) y `CustomerAccessPolicy`
  (pura, con pruebas unitarias) para propiedad, alcance directo/heredado y campos editables. El
  frontend solo oculta (alcance §9.2 "no limitar la seguridad a ocultar botones").
- Fuera de alcance → `404`; dentro sin permiso → `403` (ADR-008). Un contacto o adjunto de otro
  cliente bajo la ruta de este → `404`.
- DTO con `whitelist` + `forbidNonWhitelisted` (sin asignación masiva de `crmCode`, `deletedAt`,
  `createdById`, `sourceImportId`, `primaryContactId`).
- Ningún valor del usuario se concatena en SQL; búsquedas con parámetros de Prisma; `ILIKE` con
  comodines escapados.
- Adjuntos (ADR-021): tipo por firma, tamaño máximo cortado en streaming, nombre saneado, clave de
  almacenamiento generada por el servidor, ruta resuelta dentro de la base (sin *path traversal* ni
  enlaces simbólicos), descarga transmitida por la API tras autorizar con `Content-Disposition:
  attachment` y `nosniff`; nunca servido como estático ni con el tipo declarado por el usuario.

### H.4 Decisiones de seguridad (resueltas el 2026-10-10)

Ya no hay bloqueantes de seguridad abiertos para este módulo:

- **DM-12 resuelta:** el alcance `TEAM` incluye a los miembros y responsables del equipo y de sus
  **subequipos**, sin foto histórica del equipo. Cambiar miembros, responsable o jerarquía de un
  equipo, o el país de un usuario, es asignación de acceso y es **exclusivo del administrador**
  (`403 ADMIN_ONLY` para cualquier otro; addendum de 2026-10-10 a
  [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md), D-07.2). Este
  módulo no cambia equipos ni países de usuarios: solo los lee para resolver el alcance.
- **DM-10 aprobada:** el alcance `COUNTRY` (antes `TERRITORY`) queda aprobado con el addendum de
  2026-10-10 a [ADR-018](../../adr/ADR-018-identity-access-model.md); la migración
  `RENAME VALUE 'TERRITORY' TO 'COUNTRY'` es de la Fase 0 (requisito K.1.1).
- **DM-8 resuelta:** controles de adjuntos de H.3 y RN-02.30 (ADR-021). Sin antivirus: mitigación
  por lista blanca de firmas y descarga como `attachment`.

### H.5 Datos sensibles y auditoría

- Contactos (nombre, correo, teléfono) son PII (00 §4.5): solo con `contactos.ver` y cliente visible;
  `primaryContact` del cliente solo se incluye con `contactos.ver`; en `audit_logs.changes` van
  enmascarados (DM-29); nunca en logs de aplicación.
- Correo y teléfono de la empresa: dato de empresa, tratamiento normal.
- Logs estructurados con correlation ID (`observability`): eventos de negocio por id, nunca con
  valores de campos personales. La exportación de clientes no existe en este módulo (solo Reportes, §7.6).
- Auditoría de toda mutación (RN-02.31). Compromiso vigente de `AuditService`: se escribe tras la
  mutación, fuera de su transacción (PLAN-ADMIN §10); se hereda sin cambios.

---

## I. Criterios de aceptación

Formato Given/When/Then. Cada uno cita su funcionalidad.

### F-05 Búsqueda de clientes

- **AC-02.1** (F-05) **Given** un asesor (OWN) con `clientes.ver` y clientes propios y ajenos, **When**
  llama a `GET /customers` sin filtros, **Then** recibe `200` con solo sus clientes no eliminados,
  ordenados por razón social ascendente, 20 por página y `pagination` correcta.
- **AC-02.2** (F-05) **Given** clientes visibles con distintos códigos, países, ciudades, estados y
  responsables, **When** combina `customerCode`, `crmCode`, `legalName`, `countryId`, `city`,
  `statusId` y `salesOwnerId`, **Then** solo recibe los que cumplen **todos** los filtros enviados.
- **AC-02.3** (F-05) **Given** un cliente "Constructora Peña S.A.", **When** busca `search=construc pena`
  o `search=CLI-0001`, o su NIT con guiones, **Then** el cliente aparece (normalización sin acentos ni
  mayúsculas; prefijo en códigos y NIT).
- **AC-02.4** (F-05) **Given** la lista, **When** ordena por cada campo de la lista blanca en ambos
  sentidos, **Then** el orden es correcto; **When** envía `sortBy=taxIdNormalized` o `pageSize=101`,
  **Then** recibe `400 VALIDATION_FAILED`.
- **AC-02.5** (F-05) **Given** un manager (TEAM) de un equipo con un subequipo, un responsable de país
  (COUNTRY) y un administrador, **When** cada uno lista clientes, **Then** el manager ve los de los
  miembros y responsables de su equipo y subequipos, el responsable de país los de su país y el
  administrador todos.
- **AC-02.6** (F-05) **Given** un asesor dueño de un proyecto cuyo cliente pertenece a otro asesor,
  **When** lista clientes, **Then** ese cliente aparece con `access = INHERITED`.
- **AC-02.7** (F-05) **Given** un cliente eliminado lógicamente, **When** cualquier usuario lista sin
  `deleted`, **Then** no aparece; **When** un usuario sin `clientes.eliminar` envía `deleted=true`,
  **Then** recibe `403`; con el permiso recibe solo los eliminados de su alcance.
- **AC-02.8** (F-05) **Given** un usuario sin sesión o sin `clientes.ver`, **When** llama a
  `GET /customers`, **Then** recibe `401` o `403`, y la opción "Clientes" no aparece en su menú.
- **AC-02.9** (F-05) **Given** la pantalla de búsqueda con filtros aplicados, **When** el usuario
  recarga o comparte la URL, **Then** se restauran los filtros, el orden y la página; **When** pulsa
  una fila, **Then** navega a `/clientes/:customerId`.
- **AC-02.10** (F-05) **Given** el `CustomerPicker` en un formulario, **When** escribe parte de la razón
  social, **Then** ve hasta 10 clientes visibles con estado activo y al elegir uno el formulario
  recibe su `id`, `crmCode` y razón social.
- **AC-02.11** (F-05) **Given** la búsqueda, **When** la API tarda, no devuelve filas o falla, **Then**
  se muestran respectivamente el estado de carga, el vacío adecuado (con o sin filtros) y el error
  con correlation ID y "Reintentar".

### F-06 Creación de clientes

- **AC-02.12** (F-06) **Given** un usuario con `clientes.crear` y datos válidos, **When** envía
  `POST /customers`, **Then** recibe `201` con `Location`, `crmCode` con formato `CLI-NNNNNN`,
  `createdBy` = el usuario, `createdAt`, responsable = el usuario si no lo indicó, y queda un evento
  `crm.customer.created` con `metadata.source = UI`.
- **AC-02.13** (F-06) **Given** un alta sin razón social o sin país, **When** la envía, **Then** recibe
  `400` con el campo en `details`; **Given** `crm.campos_obligatorios.customer` incluye `email`,
  **When** omite el correo, **Then** recibe `422 REQUIRED_FIELD_MISSING` con `field = email`.
- **AC-02.14** (F-06) **Given** un correo mal formado, **When** lo envía, **Then** `400`; **Given** un
  país con `phonePattern` y un teléfono que no lo cumple, **Then** `422 INVALID_PHONE_FORMAT`.
- **AC-02.15** (F-06) **Given** un país con `taxIdPattern`, **When** envía un NIT que no lo cumple tras
  normalizar, **Then** `422 INVALID_TAX_ID_FORMAT`; con un NIT válido escrito con guiones y puntos se
  guarda y su normalizado no los tiene.
- **AC-02.16** (F-06) **Given** un cliente con código `AB-12` en GT, **When** se crea otro en GT con
  `ab12`, **Then** `409 CUSTOMER_CODE_TAKEN`; en SV se permite con `unicidad_codigo = PAIS` y se
  rechaza con `GLOBAL`.
- **AC-02.17** (F-06) **Given** la regla por defecto `nit = AVISAR` y un NIT ya usado en el mismo
  país (incluido un cliente eliminado), **When** se crea otro cliente con ese NIT escrito con otro
  formato (guiones, puntos), **Then** `409 POSSIBLE_DUPLICATE` con el candidato, `reason = TAX_ID`
  e `isDeleted` informado; **When** reenvía con `acknowledgedDuplicateIds` con ese candidato,
  **Then** `201` y ambos clientes conservan el mismo NIT; **Given** el mismo NIT en otro país,
  **Then** se crea sin aviso; **Given** `nit = NO`, **Then** se crea sin aviso. Nunca se devuelve un
  error que bloquee por NIT.
- **AC-02.18** (F-06) **Given** `reglas_duplicidad = {"razonSocialNormalizada":"AVISAR"}` y un cliente
  "Ferretería El Sol", **When** se crea "FERRETERIA  el sol" en el mismo país, **Then**
  `409 POSSIBLE_DUPLICATE` con el candidato; **When** reenvía con `acknowledgedDuplicateIds` con ese
  id, **Then** `201`; con `BLOQUEAR` recibe `409 DUPLICATE_BLOCKED` y no puede confirmar; con `NO` se
  crea sin aviso.
- **AC-02.19** (F-06) **Given** un candidato a duplicado fuera del alcance del actor, **When** recibe el
  `409`, **Then** el candidato trae `isVisible = false`, `id = null` y solo código CRM, razón social,
  país y nombre del responsable.
- **AC-02.20** (F-06) **Given** un `statusId` que pertenece a `crm.prioridad`, o un elemento de
  `crm.tipo_empresa` desactivado, **When** crea el cliente, **Then** `422 INVALID_CATALOG_VALUE` con
  el campo; **Given** que omite `statusId`, **Then** se asigna el estado de
  `crm.valores_por_defecto["customer.statusId"]`.
- **AC-02.21** (F-06) **Given** un `salesOwnerId` inexistente, suspendido o sin `clientes.ver`, **When**
  crea el cliente, **Then** `422 INVALID_SALES_OWNER`; **Given** un asesor sin
  `clientes.administrar` que indica otro responsable, **Then** `403 FIELD_NOT_EDITABLE`
  (`field = salesOwnerId`).
- **AC-02.22** (F-06) **Given** dos altas simultáneas, **When** se confirman, **Then** reciben `crmCode`
  distintos y consecutivos; **Given** dos altas simultáneas con el mismo código de cliente en el
  mismo país, **Then** una recibe `201` y la otra `409 CUSTOMER_CODE_TAKEN` (nunca `500`).
- **AC-02.23** (F-06) **Given** que un administrador desactiva un tipo de empresa en el catálogo,
  **When** un usuario abre el formulario de alta, **Then** ese valor ya no se ofrece, sin desplegar
  nada (las opciones vienen de `GET /customers/form-options`).
- **AC-02.24** (F-06) **Given** el almacenamiento de ADR-021 configurado, **When** el usuario crea un
  cliente con dos archivos y uno excede `crm.adjuntos.max_mb`, **Then** el cliente se crea, un
  archivo se adjunta y el otro muestra el error `413 ATTACHMENT_TOO_LARGE` en la ficha, sin
  deshacer el alta (D-02.15); y `form-options.attachments` trae `enabled = true`, `maxMb` y
  `allowedTypes` de los parámetros.
- **AC-02.25** (F-06) **Given** el mismo conjunto de datos inválidos, **When** se valida en modo
  `BY_ID` (pantalla) y en modo `BY_NATURAL_KEY` (importación), **Then** ambos devuelven los mismos
  códigos de error por campo, y `CustomerCreationService` es el único camino de alta de clientes.

### F-07 Ficha del cliente

- **AC-02.26** (F-07) **Given** un cliente visible, **When** se abre `GET /customers/{id}`, **Then**
  devuelve todos los campos de B.2 con etiquetas de catálogo, país con `taxIdLabel`, trazabilidad de
  creación y modificación, `access` y `capabilities` coherentes con los permisos del actor.
- **AC-02.27** (F-07) **Given** un id inexistente, de un cliente fuera de alcance o eliminado (sin
  `clientes.eliminar`), **When** se consulta, **Then** `404 RESOURCE_NOT_FOUND`, sin distinguir el caso.
- **AC-02.28** (F-07) **Given** un asesor con `clientes.editar`, **When** edita su cliente, **Then**
  `200`, `updatedBy` = él y evento `crm.customer.updated` con solo los campos cambiados; **When**
  edita un cliente ajeno o heredado, **Then** `403`; **Given** un manager con `clientes.administrar`,
  **When** edita un cliente de su equipo y reasigna el responsable, **Then** `200`.
- **AC-02.29** (F-07) **Given** un usuario sin `clientes.administrar`, **When** envía `customerCode`,
  `salesOwnerId` o `countryId` con valor distinto, **Then** `403 FIELD_NOT_EDITABLE` con esos campos;
  **When** envía `crmCode`, **Then** `400` (campo no permitido); y la interfaz muestra esos campos
  deshabilitados según `capabilities.editableFields`.
- **AC-02.30** (F-07) **Given** un cliente activo, **When** se cambia su estado a `INACTIVO`, **Then**
  sigue visible y editable, el filtro por estado lo encuentra, `CustomerPicker` (`activeOnly`) no lo
  ofrece y `assertUsableCustomer(..., { requireActive: true })` lo rechaza con `422 CUSTOMER_INACTIVE`.
- **AC-02.31** (F-07) **Given** un manager con `clientes.eliminar` y un cliente sin dependencias,
  **When** lo elimina, **Then** `204`, el cliente desaparece de las búsquedas, sus contactos, adjuntos
  y auditoría siguen en la base, su código sigue ocupado, su NIT sigue contando para el aviso de
  NIT repetido y queda `crm.customer.deleted`.
- **AC-02.32** (F-07) **Given** un cliente con un proyecto no eliminado, una actividad abierta o una
  visita pendiente, **When** se intenta eliminar, **Then** `409 CUSTOMER_HAS_DEPENDENCIES` con los
  conteos; **Given** un asesor sin `clientes.eliminar`, **Then** `403` y el botón no se muestra.
- **AC-02.33** (F-07) **Given** un cliente eliminado y un usuario con `clientes.eliminar`, **When**
  `POST /customers/{id}/restore`, **Then** `200`, vuelve a las búsquedas y queda
  `crm.customer.restored`; sobre un cliente no eliminado → `409 CUSTOMER_NOT_DELETED`.
- **AC-02.34** (F-07) **Given** un cliente editable, **When** se sube un PDF, una imagen JPEG o PNG,
  un `.docx` o un `.xlsx` dentro del límite, **Then** `201`, aparece en la lista y se puede
  descargar por quien ve el cliente; **When** se sube un ejecutable renombrado a `.pdf`, **Then**
  `422 ATTACHMENT_TYPE_NOT_ALLOWED`; **When** se sube un archivo mayor que `crm.adjuntos.max_mb`,
  **Then** `413 ATTACHMENT_TOO_LARGE` y no queda binario ni fila; **When** se elimina, **Then**
  `204` y desaparece de la lista, con `deletedAt` en ambas tablas.
- **AC-02.35** (F-07) **Given** la ficha, **When** carga, falla una sección o el cliente no existe,
  **Then** cada sección muestra su propio estado de carga o error y la ficha completa muestra "no
  existe o no tienes acceso" ante `404`.

### F-08 Proyectos asociados al cliente

- **AC-02.36** (F-08) **Given** el Módulo 3 disponible y un usuario con `proyectos.ver`, **When** abre la
  ficha, **Then** la sección lista solo los proyectos del cliente que el usuario puede ver, con código,
  nombre, ubicación, fase, estado comercial, asesor y fecha estimada de decisión.
- **AC-02.37** (F-08) **Given** la sección con proyectos, **When** busca, filtra por fase o asesor u
  ordena, **Then** la consulta va al contrato del Módulo 3 con esos parámetros; **When** pulsa una
  fila, **Then** navega a `/proyectos/:projectId`.
- **AC-02.38** (F-08) **Given** el Módulo 3 aún no entregado (sin su opción en `/me/menu`) y un usuario
  con `proyectos.ver`, **When** abre la ficha, **Then** la sección muestra el estado informativo y no
  hace ninguna llamada a `/projects`; el backend de Clientes no expone ni escribe proyectos.
- **AC-02.39** (F-08) **Given** un usuario sin `proyectos.ver`, **When** abre la ficha, **Then** la
  sección de proyectos no aparece y el resto de la ficha funciona.

### F-09 Contactos

- **AC-02.40** (F-09) **Given** un cliente editable por el actor con `contactos.crear`, **When** crea un
  contacto válido, **Then** `201` con `customerId` de la ruta, `isActive = true` por defecto y evento
  `crm.contact.created` con nombre, correo y teléfono enmascarados.
- **AC-02.41** (F-09) **Given** un cliente inexistente, eliminado o fuera de alcance, **When** se crea o
  lista un contacto bajo él, **Then** `404`; **When** se envía `customerId` en el cuerpo, **Then** `400`.
- **AC-02.42** (F-09) **Given** un correo mal formado o un teléfono que no cumple el patrón del país del
  cliente, **When** crea o edita el contacto, **Then** `400` o `422 INVALID_PHONE_FORMAT`.
- **AC-02.43** (F-09) **Given** un contacto con correo `ana@empresa.example` en el cliente A, **When** se
  crea otro con `ANA@empresa.example` en A, **Then** `409 CONTACT_EMAIL_TAKEN`; en el cliente B se
  permite; **Given** `nombreCompleto = AVISAR`, **When** se crea otro "Ana López" en A, **Then**
  `409 POSSIBLE_DUPLICATE` y se crea al confirmar.
- **AC-02.44** (F-09) **Given** un cliente con contacto principal P1, **When** se marca P2 (activo) como
  principal, **Then** el cliente tiene solo P2 como principal; **When** se intenta marcar un contacto
  inactivo, **Then** `422 CONTACT_INACTIVE`; **When** se desactiva o elimina P2, **Then** el cliente
  queda sin principal en la misma operación; **When** se envía un contacto de otro cliente a
  `PUT /primary-contact`, **Then** `404`.
- **AC-02.45** (F-09) **Given** un cliente con contactos activos e inactivos, **When** se consulta la
  lista, **Then** por defecto ve solo activos, puede filtrar inactivos o todos, buscar por nombre,
  apellidos, correo o cargo, y ve `isPrimary` y `hasHistory`; sin `contactos.ver` → `403` y la sección
  no aparece en la ficha.
- **AC-02.46** (F-09) **Given** `contactos.editar`, **When** edita un contacto de un cliente propio,
  **Then** `200` y evento con diferencias enmascaradas; **When** edita uno de un cliente ajeno sin
  `clientes.administrar` o heredado, **Then** `403`.
- **AC-02.47** (F-09) **Given** un contacto sin participaciones y un usuario con `contactos.eliminar`,
  **When** lo elimina, **Then** `204` y deja de listarse (eliminación lógica); **Given** un contacto
  referenciado por `interaction_participants`, **Then** `409 CONTACT_HAS_HISTORY` y desactivarlo sí
  funciona; sin `contactos.eliminar` → `403`; un contacto eliminado se restaura con F16.
- **AC-02.48** (F-09) **Given** el Módulo 4, **When** valida un participante con
  `assertContactOfCustomer`, **Then** acepta solo contactos no eliminados del mismo cliente (y activos
  si lo pide), y `GET /customers/{id}/contacts?status=ACTIVE` le sirve para elegirlos.

### Transversales

- **AC-02.49** (F-07) **Given** el Módulo 4 disponible y un usuario con `actividades.crear`, **When**
  pulsa "Nueva actividad" en la ficha, **Then** navega al alta de actividad con `customerId`
  preseleccionado; sin el permiso o sin el módulo, el botón no aparece.
- **AC-02.50** (F-05, F-06, F-07, F-09) **Given** cualquier mutación de clientes, contactos o adjuntos,
  **When** termina con éxito, **Then** existe su evento en `audit_logs` con actor, correlation ID y
  diferencia; una edición sin cambios no deja registro.
- **AC-02.51** (F-05) **Given** la semilla del módulo aplicada, **When** un usuario con `clientes.ver`
  pide `GET /me/menu`, **Then** recibe el módulo "Clientes" con la opción `clientes-buscar` → `/clientes`,
  y `route-registry.spec.ts` pasa con las tres rutas registradas.

### Añadidos por las respuestas del responsable (2026-10-10)

- **AC-02.52** (F-07) **Given** la regla `nit = AVISAR` y un cliente A cuyo NIT coincide con el de
  otro cliente B del mismo país, **When** se edita A sin tocar el NIT ni el país (p. ej. solo la
  dirección), **Then** `200` sin aviso; **When** se cambia el NIT de A a uno que ya tiene otro
  cliente del mismo país, o se cambia su país a uno donde ese NIT ya existe, **Then**
  `409 POSSIBLE_DUPLICATE` con `reason = TAX_ID`, y con `acknowledgedDuplicateIds` **Then** `200`.
- **AC-02.53** (F-06, F-07) **Given** una razón social, nombre comercial, ciudad o dirección que
  empieza por `=`, `@`, tabulador o retorno de carro, **When** se crea o edita el cliente, **Then**
  `422 FORMULA_NOT_ALLOWED` con ese campo en `details` y sin repetir el valor; **Given** un
  teléfono `+502 …`, **Then** se acepta (la regla solo afecta al texto libre).
- **AC-02.54** (F-07) **Given** un adjunto de un cliente visible, **When** se descarga por F19,
  **Then** la respuesta es un flujo `200` con `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff` y el tipo detectado al guardar; **Given** un usuario que no ve
  el cliente, o un `attachmentId` de otro cliente bajo la ruta de este, **Then** `404`; **And** no
  existe ninguna URL estática que sirva el archivo, y ninguna respuesta expone `storageKey` ni rutas
  del almacenamiento.
- **AC-02.55** (F-05, F-06) **Given** un cliente con dos establecimientos registrados como clientes
  distintos con el mismo NIT y códigos de cliente distintos (`EST-01`, `EST-02`) en GT, **When** se
  busca por ese NIT, **Then** aparecen ambos; **When** se intenta crear un tercero con el código
  `EST-01` en GT, **Then** `409 CUSTOMER_CODE_TAKEN` (el código sigue siendo único por país); **When**
  se crea un tercero sin código de cliente, **Then** se permite tras confirmar el aviso de NIT.

---

## J. Pruebas funcionales

Niveles (TESTING.md, ADR-013): **U** = unitaria (Jest, sin base), **I** = integración backend contra
PostgreSQL real (`backend/test/*.e2e.spec.ts`, Supertest, cada prueba con datos únicos
`uniqueCode`), **FE** = componente frontend (Vitest + RTL, `mockApi`), **E2E** = Playwright
(`frontend/tests/e2e`). Toda ruta nueva tiene prueba de `401` y `403`.

| ID | AC | Tipo | Nivel | Caso |
|---|---|---|---|---|
| PF-02.1 | AC-02.1 | Positivo | I | Asesor lista: solo propios, orden y paginación por defecto |
| PF-02.2 | AC-02.2 | Positivo | I | Cada filtro aislado y combinación de los siete |
| PF-02.3 | AC-02.3 | Positivo | U, I | Normalización (acentos, mayúsculas, espacios, guiones) en `search`, código y NIT |
| PF-02.4 | AC-02.4 | Negativo | I | `sortBy` fuera de lista blanca y `pageSize=101` → `400`; cada `sortBy` válido ordena bien |
| PF-02.5 | AC-02.5 | Integración | I | Alcances OWN, TEAM (con subequipo y responsable de equipo), COUNTRY y ORGANIZATION sobre el mismo juego de datos |
| PF-02.6 | AC-02.6 | Integración | I | Herencia por proyecto: visible con `INHERITED`; deja de verse al eliminar el proyecto |
| PF-02.7 | AC-02.7 | Negativo | I | Eliminados ocultos; `deleted=true` sin permiso → `403`; con permiso, solo eliminados del alcance |
| PF-02.8 | AC-02.8 | Negativo | I | `401` sin token y `403` sin `clientes.ver` en F1–F8 |
| PF-02.9 | AC-02.9 | Positivo | FE | Filtros y orden en la URL; recarga restaura; clic y `Enter` en fila navegan |
| PF-02.10 | AC-02.10 | Positivo | FE | `CustomerPicker`: búsqueda, selección, valor preseleccionado, `activeOnly` |
| PF-02.11 | AC-02.11 | Positivo | FE | Estados de carga, vacío sin filtros, vacío con filtros y error con reintento |
| PF-02.12 | AC-02.12 | Positivo | I | Alta válida: `201`, `Location`, `crmCode` con formato, responsable por defecto, auditoría |
| PF-02.13 | AC-02.13 | Negativo | U, I | Obligatorios de base (`400`) y del parámetro (`422 REQUIRED_FIELD_MISSING`); clave desconocida en el parámetro se ignora |
| PF-02.14 | AC-02.14 | Negativo | U, I | Correo inválido; teléfono contra patrón del país y contra la regla genérica |
| PF-02.15 | AC-02.15 | Negativo | U, I | NIT contra `taxIdPattern`; normalización guardada |
| PF-02.16 | AC-02.16 | Negativo | I | Código duplicado mismo país; distinto país con `PAIS` y con `GLOBAL` |
| PF-02.17 | AC-02.17 | Positivo / negativo | I | NIT repetido en el mismo país (incl. eliminado, `isDeleted`; formato distinto que normaliza igual) → `409 POSSIBLE_DUPLICATE` con `reason = TAX_ID` → confirmación → `201`; mismo NIT en otro país sin aviso; `nit = NO` sin aviso; ninguna respuesta bloqueante por NIT |
| PF-02.18 | AC-02.18 | Positivo / negativo | U, I | `AVISAR` → `409` → confirmación → `201`; candidato nuevo no reconocido → `409`; `BLOQUEAR`; `NO` |
| PF-02.19 | AC-02.19 | Negativo | I | Candidato fuera de alcance con datos mínimos e `id = null` |
| PF-02.20 | AC-02.20 | Negativo | I | Elemento de otro catálogo y elemento inactivo → `422 INVALID_CATALOG_VALUE` (una prueba por columna); estado por defecto |
| PF-02.21 | AC-02.21 | Negativo | I | Responsable inexistente, suspendido, sin `clientes.ver` → `422`; asesor asigna a otro → `403 FIELD_NOT_EDITABLE` |
| PF-02.22 | AC-02.22 | Integración | I | Concurrencia: 10 altas en paralelo → `crmCode` únicos y consecutivos; mismo código en paralelo → un `201` y un `409` |
| PF-02.23 | AC-02.23 | Integración | I, FE | `form-options` refleja un elemento desactivado; el formulario no lo ofrece |
| PF-02.24 | AC-02.24 | Positivo / negativo | FE, I | Subida posterior al alta con fallo parcial (`413` en un archivo, el cliente se conserva); `form-options.attachments` con `enabled = true` y valores de los parámetros |
| PF-02.25 | AC-02.25 | Integración | U | Mismo `CustomerDraft` inválido en `BY_ID` y `BY_NATURAL_KEY` → mismos códigos; resolución por `code`, `isoCode` y código de colaborador |
| PF-02.26 | AC-02.26 | Positivo | I | Detalle completo; `capabilities` para asesor dueño, asesor heredado, manager y administrador |
| PF-02.27 | AC-02.27 | Negativo | I | Inexistente, fuera de alcance y eliminado → mismo `404` |
| PF-02.28 | AC-02.28 | Positivo / negativo | U, I | `CustomerAccessPolicy`; editar propio `200` con diferencia auditada; ajeno/heredado `403`; manager reasigna `200` |
| PF-02.29 | AC-02.29 | Negativo | I, FE | Campos reservados sin `administrar` → `403`; `crmCode` → `400`; campos deshabilitados en el formulario |
| PF-02.30 | AC-02.30 | Integración | I | Desactivar: visible, filtrable, excluido con `activeOnly`, rechazado por `assertUsableCustomer` |
| PF-02.31 | AC-02.31 | Positivo | I | Eliminación lógica: `204`, oculto, hijos intactos, código ocupado, auditoría |
| PF-02.32 | AC-02.32 | Negativo | I | Dependencias (proyecto, actividad abierta, visita pendiente; insertadas en las tablas de 00) → `409` con conteos; sin permiso `403` |
| PF-02.33 | AC-02.33 | Positivo / negativo | I | Restaurar eliminado `200`; no eliminado `409`; con `GLOBAL` y código de cliente ocupado por otro → `409 CUSTOMER_CODE_TAKEN`; NIT compartido con otro cliente no impide restaurar |
| PF-02.34 | AC-02.34 | Positivo / negativo | I | Subida de cada tipo permitido, descarga por quien ve, firma de contenido falsa → `422 ATTACHMENT_TYPE_NOT_ALLOWED`, exceso de tamaño → `413` sin binario huérfano, eliminación lógica (almacenamiento en un directorio temporal de la prueba) |
| PF-02.35 | AC-02.35 | Positivo | FE | Estados por sección; `404` de la ficha |
| PF-02.36 | AC-02.36 | Integración | FE (contrato simulado); E2E al entregar el Módulo 3 | Sección con columnas del contrato F.7 |
| PF-02.37 | AC-02.37 | Positivo | FE | Búsqueda, filtros y orden envían los parámetros del contrato; navegación a `/proyectos/:id` |
| PF-02.38 | AC-02.38 | Integración | FE | Sin la opción de menú de Proyectos: estado informativo y ninguna llamada a `/projects` |
| PF-02.39 | AC-02.39 | Negativo | FE | Sin `proyectos.ver`: sección oculta |
| PF-02.40 | AC-02.40 | Positivo | I | Alta de contacto, valores por defecto y auditoría enmascarada |
| PF-02.41 | AC-02.41 | Negativo | I | Cliente inexistente/eliminado/fuera de alcance → `404`; `customerId` en el cuerpo → `400` |
| PF-02.42 | AC-02.42 | Negativo | U, I | Correo y teléfono del contacto (patrón del país del cliente) |
| PF-02.43 | AC-02.43 | Negativo | I | Correo repetido en el cliente (mayúsculas distintas) `409`; en otro cliente `201`; nombre completo `AVISAR` |
| PF-02.44 | AC-02.44 | Integración | I | Cambio de principal, inactivo `422`, desactivar/eliminar limpia el principal en la misma transacción, contacto de otro cliente `404`; FK compuesta rechaza un `UPDATE` directo cruzado |
| PF-02.45 | AC-02.45 | Positivo | I, FE | Lista por defecto activos, filtros, búsqueda, `isPrimary`, `hasHistory`; sin `contactos.ver` `403` y sección oculta |
| PF-02.46 | AC-02.46 | Positivo / negativo | I | Editar contacto de cliente propio `200`; ajeno sin `administrar` o heredado `403` |
| PF-02.47 | AC-02.47 | Positivo / negativo | I | Eliminar sin historia `204`; con participación (insertada en `interaction_participants`) `409`; desactivar `200`; sin permiso `403`; restaurar |
| PF-02.48 | AC-02.48 | Integración | U, I | `assertContactOfCustomer` y `assertUsableCustomer` con contacto ajeno, eliminado, inactivo |
| PF-02.49 | AC-02.49 | Positivo | FE | Botón "Nueva actividad" según permiso y disponibilidad; URL con `customerId` |
| PF-02.50 | AC-02.50 | Integración | I | Cada mutación (F5–F8, F11–F16, F18, F20) deja su evento; edición sin cambios no lo deja |
| PF-02.51 | AC-02.51 | Integración | I, FE | `/me/menu` con `clientes-buscar`; `route-registry.spec.ts` verde |
| PF-02.52 | AC-02.1, AC-02.12, AC-02.26, AC-02.28, AC-02.40, AC-02.44 | Recorrido | E2E | Asesor: busca → crea cliente (con aviso de duplicado y confirmación) → ficha → crea dos contactos → cambia principal → edita el cliente |
| PF-02.53 | AC-02.5, AC-02.31, AC-02.32 | Recorrido | E2E | Manager: ve clientes del equipo, intenta eliminar uno con dependencias (`409` visible), desactiva otro y elimina uno sin dependencias |
| PF-02.54 | AC-02.8, AC-02.27 | Negativo | E2E | Asesor sin el menú de otro: la URL directa de un cliente ajeno muestra "no existe o no tienes acceso" |
| PF-02.55 | AC-02.12, AC-02.22 | Unitario | U | `SequenceGenerator`: formato `{prefix}-{seq}`, padding, `resetPolicy`; nunca reutiliza valores tras un rollback de la transacción del alta (huecos aceptados) |
| PF-02.56 | AC-02.17, AC-02.18, AC-02.43 | Unitario | U | `DuplicateRules`: parseo, claves desconocidas, precedencia `BLOQUEAR` > `AVISAR` > `NO`, clave `nit` limitada a `AVISAR`/`NO` (`BLOQUEAR` → `AVISAR` con advertencia), correo de contacto siempre bloquea |
| PF-02.57 | AC-02.5, AC-02.6 | Unitario | U | `VisibilityScopeResolver`: OWN, TEAM con subequipos y responsable, COUNTRY con y sin país (D-02.8), ORGANIZATION, rol más amplio |
| PF-02.58 | AC-02.52 | Positivo / negativo | U, I | Edición sin cambio de NIT ni país → sin aviso; cambio de NIT a uno repetido → `409 POSSIBLE_DUPLICATE` (`TAX_ID`) → confirmación → `200`; cambio de país a uno donde el NIT existe → aviso |
| PF-02.59 | AC-02.53 | Negativo | U, I, FE | `=`, `@`, tabulador y retorno de carro al inicio de razón social, nombre comercial, ciudad y dirección → `422 FORMULA_NOT_ALLOWED` en alta y edición (una prueba por campo); teléfono con `+` aceptado; el mensaje no contiene el valor; Zod muestra el mismo error |
| PF-02.60 | AC-02.54 | Negativo / seguridad | I | Descarga: cabeceras `Content-Disposition: attachment`, `nosniff`, `Content-Type` detectado, `no-store`; usuario sin visibilidad y adjunto de otro cliente → `404`; `401`/`403` en F17–F20; ninguna ruta estática (NGINX ni `express.static`) devuelve el binario; ningún DTO contiene `storageKey` |
| PF-02.61 | AC-02.55 | Positivo / negativo | I, E2E | Dos establecimientos con el mismo NIT y códigos distintos: búsqueda por NIT devuelve ambos; tercer alta con código repetido → `409 CUSTOMER_CODE_TAKEN`; sin código → aviso de NIT y `201` al confirmar |
| PF-02.62 | AC-02.34, AC-02.54 | Unitario | U | `LocalFileSystemStorage`: clave `<año>/<mes>/<uuid>`; rechazo de rutas fuera de la base (`../`, absolutas, enlaces simbólicos); escritura a temporal + `rename`; corte en streaming al superar `maxBytes` sin dejar archivo; `checksum` SHA-256. Detección de tipo por firma (PDF, JPEG, PNG, DOCX, XLSX; ZIP sin `[Content_Types].xml` o con macros rechazado) |

---

## K. Dependencias y orden

### K.1 Requisitos previos (bloquean el inicio)

| # | Requisito | Origen |
|---|---|---|
| 1 | Migraciones 1, 2, 4 de 00 §9 aplicadas (`COUNTRY`, `countries` + `users.country_id/employee_code`, `customers`/`contacts`) y, por las FK y lecturas, el resto de la Fase 0 (proyectos, actividad, adjuntos, importaciones) | 00 §9 |
| 2 | Semilla esencial: países, catálogos `crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente` (y los de estado de actividad y visita), secuencia `crm.cliente`, parámetros de D.5, permisos `clientes.*`/`contactos.*`, roles `asesor`/`manager`/`responsable-pais` y acciones `administrar`/`cerrar` | 00 §8.2, DM-32 |
| 3 | DM-12 resuelta el 2026-10-10 (TEAM con subequipos; cambiar equipos o país de un usuario es exclusivo del administrador, addendum de ADR-020): requisito **cumplido**; solo falta que el `VisibilityScopeResolver` de la Fase 0 resuelva los subequipos | 00 §4.2 |
| 4 | DM-10 aprobada el 2026-10-10 (addendum de ADR-018): requisito **cumplido**; la migración `TERRITORY → COUNTRY` va en el punto 1 | 00 §4.1 |
| 5 | `SequenceGenerator`, `CatalogReferenceValidator`, `VisibilityScopeResolver`, `ParameterReader` disponibles (o se construyen al inicio de este módulo en su ubicación transversal) | 00 §11 |
| 6 | Registro de semántica de catálogos (`catalog-semantics.registry.ts`) con `crm.estado_cliente.isActive` obligatorio | 00 §3.3 |
| 7 | D-02.11 aprobada el 2026-10-10 (componentes compartidos movidos a `frontend/src/components/data/`): el movimiento se hace en la Fase 0 o al inicio de este módulo | Este documento |

### K.2 Bloqueos parciales (no detienen el módulo; se conserva el alcance)

| Bloqueo | Afecta | Mientras tanto |
|---|---|---|
| ~~DM-8~~ (resuelta el 2026-10-10, ADR-021) | — | Sin bloqueo: los adjuntos de F-06 y F-07 se entregan completos |
| Módulo 3 | F-08 (sección de proyectos) | Estado informativo (D-02.10); F-08 `bloqueada` hasta que exista el contrato |
| Módulo 4 | Botón "Nueva actividad" (AC-02.49) | Oculto |

### K.3 Orden interno de implementación

1. Piezas transversales pendientes (K.1.5), con sus pruebas unitarias y de integración.
2. Dominio de clientes: normalización, `DuplicateRules`, `CustomerAccessPolicy` (unitarias).
3. Puerto y adaptador `CustomersRepository` (visibilidad, búsqueda, duplicados, dependencias).
4. `CustomerValidationService` y `CustomerCreationService`; endpoints F1–F8 con OpenAPI.
5. Contactos: puerto, adaptador, servicio, endpoints F9–F16.
6. Puerto `FileStorage` y adaptador `LocalFileSystemStorage` (ADR-021), configuración `ATTACHMENTS_STORAGE_PATH` (`env.schema.ts`, `.env.example`, `.gitignore`, volumen de `docker-compose`), `AttachmentsService` y endpoints F17–F20.
7. Semilla del módulo `clientes` y de la opción `clientes-buscar`; registro de rutas.
8. Frontend: rutas, búsqueda, alta, ficha, contactos, proyectos (con disponibilidad), adjuntos (subida, descarga y eliminación), `CustomerPicker`.
9. E2E, documentación (`docs/api/README.md`, CHANGELOG, matriz), revisión (`code-review`).

### K.4 Dependencias futuras (quién depende de este módulo)

Módulo 3 (cliente del proyecto, `CustomerPicker`, `assertUsableCustomer`), Módulo 4 (clientes y
contactos de visitas, actividades y participantes), Módulo 1 y 5 (lectura de clientes con el mismo
predicado de visibilidad), Módulo 6 (validación y alta), Módulo 7 (consulta de la auditoría generada;
mantenimiento de los catálogos y parámetros que usa este módulo). Proyectos y Actividad reutilizan
`AttachmentsService` y `FileStorage` (ADR-021) con sus propias rutas por dueño (DC-2).

---

## L. Archivos de código a implementar

Rutas reales del repositorio. Convenciones: módulo Nest por carpeta en `backend/src/modules/`
(nombres en inglés como `catalogs`, `teams`), puertos en `ports/`, DTO en `dto/`, adaptadores en
`backend/src/infrastructure/database/prisma/repositories/prisma-<x>.repository.ts`, pruebas de
integración en `backend/test/<x>.e2e.spec.ts`; frontend por área como `features/admin/<area>/`.

### L.1 Backend — módulo `customers` (nuevo)

| Archivo | Contenido |
|---|---|
| `backend/src/modules/customers/customers.module.ts` | Enlaza puertos y adaptadores; importa `PrismaModule`, `AuditModule`, `AccessModule`, `CatalogsModule`, `ParametersModule`, `AttachmentsModule`; exporta `CustomerValidationService`, `CustomerCreationService`, `CustomerReferenceGuard` |
| `backend/src/modules/customers/customers.controller.ts` | F1–F8 |
| `backend/src/modules/customers/customer-contacts.controller.ts` | F9–F16 |
| `backend/src/modules/customers/customer-attachments.controller.ts` | F17–F20 (rutas por dueño, DC-2; descarga en flujo con las cabeceras de F.5) |
| `backend/src/modules/customers/customers.service.ts` (+ `.spec.ts`) | Consulta, detalle, edición, desactivación, eliminación, restauración, opciones |
| `backend/src/modules/customers/customer-creation.service.ts` (+ `.spec.ts`) | F.6.2 |
| `backend/src/modules/customers/customer-validation.service.ts` (+ `.spec.ts`) | F.6.1 |
| `backend/src/modules/customers/customer-reference.guard.ts` (+ `.spec.ts`) | F.6.3 |
| `backend/src/modules/customers/contacts.service.ts` (+ `.spec.ts`) | Contactos y principal |
| `backend/src/modules/customers/customer-access-policy.ts` (+ `.spec.ts`) | Propiedad, alcance directo/heredado, `capabilities`, campos editables |
| `backend/src/modules/customers/customer-normalization.ts` (+ `.spec.ts`) | RN-02.17 (puro) |
| `backend/src/modules/customers/duplicate-rules.ts` (+ `.spec.ts`) | F.6.4 (puro) |
| `backend/src/modules/customers/dto/customer.dto.ts` | `ListCustomersQueryDto`, `CreateCustomerDto`, `UpdateCustomerDto`, `CustomerListItemDto`, `CustomerResponseDto`, `PaginatedCustomersResponseDto`, `CustomerFormOptionsDto`, `SalesOwnerOptionDto` |
| `backend/src/modules/customers/dto/contact.dto.ts` | `ListContactsQueryDto`, `CreateContactDto`, `UpdateContactDto`, `SetPrimaryContactDto`, `ContactResponseDto`, `PaginatedContactsResponseDto` |
| `backend/src/modules/customers/ports/customers.repository.port.ts` | `CUSTOMERS_REPOSITORY`: `search`, `findById`, `create(tx)`, `update`, `softDelete`, `restore`, `findDuplicateCandidates`, `countDependencies`, `listEligibleSalesOwners`, `formOptions` |
| `backend/src/modules/customers/ports/contacts.repository.port.ts` | `CONTACTS_REPOSITORY`: `list`, `findById`, `create`, `update`, `setPrimary`, `clearPrimary`, `softDelete`, `restore`, `hasHistory`, `findDuplicateCandidates` |
| `backend/src/infrastructure/database/prisma/repositories/prisma-customers.repository.ts` | Adaptador; predicado de visibilidad H.1 como función exportada reutilizable por los modelos de lectura de Inicio y Reportes (D-02.12) |
| `backend/src/infrastructure/database/prisma/repositories/prisma-contacts.repository.ts` | Adaptador; principal y limpieza en la misma transacción |
| `backend/src/app.module.ts` | Registrar `CustomersModule` y `AttachmentsModule` |

### L.2 Backend — piezas transversales (si la Fase 0 no las entregó)

| Archivo | Contenido |
|---|---|
| `backend/src/infrastructure/database/ports/sequence-generator.port.ts` | `SEQUENCE_GENERATOR` |
| `backend/src/infrastructure/database/prisma/prisma-sequence-generator.ts` (+ `.spec.ts`) | `SELECT … FOR UPDATE` |
| `backend/src/modules/catalogs/ports/catalog-reference.port.ts`, `backend/src/modules/catalogs/catalog-reference.validator.ts` (+ `.spec.ts`) | 00 §3.5; `CatalogsModule` lo exporta |
| `backend/src/modules/catalogs/catalog-semantics.registry.ts` | 00 §3.3 (Fase 0) |
| `backend/src/modules/access/ports/visibility-scope.port.ts`, `backend/src/modules/access/visibility-scope.resolver.ts` (+ `.spec.ts`) | 00 §4.2; `AccessModule` lo exporta |
| `backend/src/modules/parameters/parameter-reader.ts` (+ `.spec.ts`) | Lectura tipada por clave; la exporta `ParametersCoreModule` (global, `parameters-core.module.ts`): no hace falta importar `ParametersModule` |
| `backend/src/modules/attachments/attachments.module.ts`, `attachments.service.ts` (+ `.spec.ts`), `attachment-policy.ts` (+ `.spec.ts`), `ports/attachments.repository.port.ts` | Servicio transversal de adjuntos (límites de `crm.adjuntos.*`, nombre saneado, alta/baja coordinada de fila y binario) |
| `backend/src/modules/attachments/attachment-content-type.ts` (+ `.spec.ts`) | Detección del tipo por firma (PDF, JPEG, PNG; DOCX y XLSX como ZIP con `[Content_Types].xml` y su parte principal) y cotejo con extensión y lista blanca (RN-02.29) |
| `backend/src/infrastructure/storage/file-storage.port.ts` | `FILE_STORAGE`: `save`, `openRead`, `delete` (00 §2.11, ADR-021) |
| `backend/src/infrastructure/storage/local-file-system.storage.ts` (+ `.spec.ts`) | Adaptador `LocalFileSystemStorage` sobre `ATTACHMENTS_STORAGE_PATH`: clave generada, ruta segura, temporal + `rename`, corte por tamaño, SHA-256 |
| `backend/src/infrastructure/storage/storage.module.ts` | Proveedor de `FILE_STORAGE`; lo importa `AttachmentsModule` |
| `backend/src/config/env.schema.ts`, `backend/src/config/app-config.service.ts` | `ATTACHMENTS_STORAGE_PATH` (defecto `./storage/attachments`) validado al arrancar |
| `.env.example`, `.gitignore`, `docker-compose.yml` | Variable con valor de ejemplo, carpeta `storage/` ignorada, volumen montado en la ruta del contenedor (ADR-021; 00 §8.2) |
| `infrastructure/nginx/nginx.conf` | Verificar que `client_max_body_size` ≥ `crm.adjuntos.max_mb` y que no existe ninguna `location` que sirva la carpeta de adjuntos |
| `backend/src/infrastructure/database/prisma/repositories/prisma-attachments.repository.ts` | Adaptador de `attachments` + `stored_files` |
| `backend/src/modules/audit/` (extensión) | Enmascarado de PII en `changes` (DM-29), p. ej. opción `maskedFields` en `AuditEventOptions` |
| `backend/src/modules/access/route-registry.ts` / `menu-options.service.ts` (extensión) | Rechazar rutas con parámetro (`:`) como destino de opción de menú (D-02.12) |

### L.3 Backend — semilla y registro

| Archivo | Cambio |
|---|---|
| `backend/prisma/seed/access-catalog.ts` | `MODULES`: `clientes` (Clientes, icono `business`, orden 20). `MENU_OPTIONS`: `clientes-buscar` → `/clientes`, `requiredPermission: 'clientes.ver'`. Asignación de la opción a `asesor`, `manager`, `responsable-pais` (el `administrador` la recibe con `'*'`). Permisos y roles ya sembrados en la Fase 0 |
| `backend/src/modules/access/app-routes.registry.json` | `/clientes` "Clientes", `/clientes/nuevo` "Nuevo cliente", `/clientes/:customerId` "Ficha de cliente" |
| `backend/prisma/seed/demo/…` | Clientes y contactos de demostración (00 §8.3) — los entrega la Fase 0; aquí solo se verifica que la ficha los muestra |

### L.4 Backend — pruebas de integración

| Archivo | Cubre |
|---|---|
| `backend/test/customers.e2e.spec.ts` | PF-02.1–4, 7–8, 12–23, 26–33, 50 |
| `backend/test/customers-visibility.e2e.spec.ts` | PF-02.5, 6, 19, 27 (alcances y herencia) |
| `backend/test/customer-contacts.e2e.spec.ts` | PF-02.40–48 |
| `backend/test/customer-attachments.e2e.spec.ts` | PF-02.24, 34, 60 (con `ATTACHMENTS_STORAGE_PATH` apuntando a un directorio temporal de la prueba) |
| `backend/test/support/test-app.ts` (extensión) | Ayudantes para crear usuarios con país y equipo, clientes, proyectos/actividades/visitas mínimos y participaciones |

### L.5 Frontend

| Archivo | Contenido |
|---|---|
| `frontend/src/routes/route-paths.ts` | `ROUTE_PATHS.crm.customers`, `customerNew`, `customerDetail` |
| `frontend/src/features/crm/crm-routes.ts` | Como `admin-routes.ts`: ruta + permiso + página lazy |
| `frontend/src/routes/app-routes.tsx` | Añadir `...CRM_ROUTES` a `shellRoutes` con `RequirePermission` |
| `frontend/src/features/crm/README.md` | Convenciones del área CRM (espejo de `features/admin/README.md`) |
| `frontend/src/features/crm/common/use-module-availability.ts` (+ `.spec.ts`) | D-02.10: disponibilidad por `/me/menu` |
| `frontend/src/features/crm/common/AttachmentsSection.tsx` (+ `.spec.tsx`) | Lista, subida con progreso, descarga (`httpClient.download`), eliminación y errores `413`/`422`; reutilizable por Proyectos y Actividad |
| `frontend/src/features/crm/common/PossibleDuplicateDialog.tsx` (+ `.spec.tsx`) | Confirmación de duplicados (clientes y contactos) |
| `frontend/src/features/crm/customers/CustomersPage.tsx` (+ `.spec.tsx`) | E.2 |
| `frontend/src/features/crm/customers/CustomerCreatePage.tsx` (+ `.spec.tsx`) | E.3 |
| `frontend/src/features/crm/customers/CustomerDetailPage.tsx` (+ `.spec.tsx`) | E.4 |
| `frontend/src/features/crm/customers/customers.api.ts` | Llamadas a F1–F20 con `httpClient`; tipos que reflejan los DTO |
| `frontend/src/features/crm/customers/customers.queries.ts` | Hooks TanStack Query (`createQueryKeys('customers')`), invalidaciones tras mutación |
| `frontend/src/features/crm/customers/customers.schemas.ts` (+ `.spec.ts`) | Zod de cliente y contacto |
| `frontend/src/features/crm/customers/customers.permissions.ts` | Constantes `clientes.*`, `contactos.*`, `proyectos.ver`, `actividades.crear` |
| `frontend/src/features/crm/customers/customers.errors.ts` | Mensajes en español de los códigos de F (overrides de `describeApiError`) |
| `frontend/src/features/crm/customers/customer-format.ts` (+ `.spec.ts`) | Etiquetas, nombre completo, ubicación |
| `frontend/src/features/crm/customers/components/CustomerFilters.tsx` | Filtros de E.2 |
| `frontend/src/features/crm/customers/components/CustomerForm.tsx` (+ `.spec.tsx`) | Alta y edición |
| `frontend/src/features/crm/customers/components/CustomerEditDrawer.tsx` | Edición en la ficha |
| `frontend/src/features/crm/customers/components/CustomerGeneralSection.tsx` | Datos generales |
| `frontend/src/features/crm/customers/components/CustomerContactsSection.tsx` (+ `.spec.tsx`) | E.5 |
| `frontend/src/features/crm/customers/components/ContactFormDialog.tsx` (+ `.spec.tsx`) | Alta y edición de contacto |
| `frontend/src/features/crm/customers/components/CustomerProjectsSection.tsx` (+ `.spec.tsx`) | E.6 contra el contrato F.7 |
| `frontend/src/features/crm/customers/components/CustomerPicker.tsx` (+ `.spec.tsx`) | E.7 |
| `frontend/src/features/crm/customers/index.ts` | Barril público: `CustomerPicker` y tipos para otros módulos |
| `frontend/src/components/layout/MaterialSymbol.tsx` | Icono `business` si no existe |
| Componentes compartidos (D-02.11) | `DataTable`, `ConfirmDialog`, `ListToolbar`, `EmptyState`, `FormSection`, `EntityDialog` (`@/components/data`), `EntityDrawer` (`@/components/data`), `use-table-query-state`, `describeApiError`/`createQueryKeys` accesibles fuera de `features/admin` |
| `frontend/tests/e2e/crm-customers.e2e.spec.ts` | PF-02.52–54 |

### L.6 Documentación

`docs/api/README.md` (endpoints y códigos nuevos), `CHANGELOG.md`, `matriz-trazabilidad.md`
(F-05…F-09), `.claude/skills/access-management` si cambia el procedimiento de rutas con parámetro,
`DEVELOPMENT.md` (variable `ATTACHMENTS_STORAGE_PATH` y volumen de adjuntos, ADR-021),
`API-STANDARDS.md` §3 (`413`, DC-4) y ADR o addendum si D-02.11/D-02.12 resultan tener impacto
estructural al implementarse.

### L.7 Códigos de error nuevos

`CUSTOMER_CODE_TAKEN` (409), `POSSIBLE_DUPLICATE` (409; `details[].reason`, `TAX_ID` para el NIT), `DUPLICATE_BLOCKED` (409),
`CUSTOMER_HAS_DEPENDENCIES` (409), `CUSTOMER_NOT_DELETED` (409), `CONTACT_EMAIL_TAKEN` (409),
`CONTACT_HAS_HISTORY` (409), `CONTACT_NOT_DELETED` (409), `REQUIRED_FIELD_MISSING` (422),
`INVALID_CATALOG_VALUE` (422, de 00), `INVALID_COUNTRY` (422), `INVALID_SALES_OWNER` (422),
`INVALID_PHONE_FORMAT` (422), `INVALID_TAX_ID_FORMAT` (422), `CONTACT_INACTIVE` (422),
`INVALID_CONTACT` (422), `CUSTOMER_INACTIVE` (422), `FORMULA_NOT_ALLOWED` (422, D-06.11; mismo
código que la incidencia de la carga masiva), `ATTACHMENT_TOO_LARGE` (**413**, DC-4),
`ATTACHMENT_TYPE_NOT_ALLOWED` (422, DC-4), `FIELD_NOT_EDITABLE` (403). Se reutilizan
`VALIDATION_FAILED` (400, DC-6: el `ValidationPipe` lo emite desde la Fase 0), `RESOURCE_NOT_FOUND`,
`PERMISSION_DENIED`. `TAX_ID_TAKEN` **se elimina** (DM-4: el NIT no es único).

---

## Precisiones de implementación (2026-10-11)

Criterios técnicos aplicados al construir el backend donde el contrato no decía nada. Ninguno cambia
una regla de negocio escrita; los que afinan una regla lo dicen.

| Tema | Precisión |
|---|---|
| Herencia de visibilidad (H.1, DM-13) | El `EXISTS` sobre `projects` usa el alcance de **`proyectos.ver`** del usuario (no el de `clientes.ver`): "ve al menos un proyecto" se evalúa con el permiso de proyectos. Para los roles de sistema ambos alcances coinciden; un usuario sin `proyectos.ver` no hereda. El predicado se exporta como `customerVisibilitySql(alias, visibility)` y `customerVisibilityWhere(visibility)` desde `prisma-customers.repository.ts` (D-02.12) |
| Responsables asignables (D-02.2) | Con `clientes.administrar`, el conjunto asignable es el alcance de **`clientes.administrar`** del actor sobre `users.id` / `users.country_id`; sin él, solo el actor. Elegible = `ACTIVE`, no eliminado y con `clientes.ver` efectivo (roles vigentes y activos, concesiones directas, denegación directa gana) |
| Valores por defecto (RN-02.4) | En el alta se aplican los tres de `crm.valores_por_defecto` (`customer.statusId`, `customer.companyTypeId`, `customer.ratingId`) cuando el campo se omite o llega nulo; un código inexistente o inactivo se ignora con advertencia en el log |
| Obligatorios (RN-02.4) | Un campo de `crm.campos_obligatorios.customer` que no existe en la entrada del alta (`primaryContactId`, que se elige después) se ignora con advertencia. En la edición solo se comprueban los campos enviados (enviar vacío un obligatorio → `422`); un cliente antiguo sin un campo que pasó a ser obligatorio se sigue pudiendo editar |
| Fórmulas (RN-02.32) | Razón social, nombre comercial, ciudad y dirección **no** se recortan en el DTO: el servicio comprueba el valor crudo (ignorando solo espacios iniciales) y después lo recorta para guardarlo. Un valor de solo espacios da `422 REQUIRED_FIELD_MISSING` en lugar de `400` |
| Validación en la importación | `CustomerValidationService` comprueba también longitudes y formato de correo (código `VALIDATION_FAILED` en `FieldIssue`), que en la API ya rechaza el DTO con `400`; así el modo `BY_NATURAL_KEY` no depende del DTO |
| Responsable por clave natural (D-02.17) | Se busca por `employee_code` exacto y, si no hay coincidencia, por correo normalizado; después se exige elegibilidad |
| Edición del país (D-02.5) | Cambiar el país revalida teléfono y NIT existentes con los patrones del país nuevo, la unicidad del código y todas las reglas de duplicado |
| Edición sin cambios | No escribe ni audita (RN-02.31); tampoco cambia `updatedBy` |
| Concurrencia del código | Con `PAIS` lo garantiza el índice único (la violación se traduce a `409 CUSTOMER_CODE_TAKEN`); con `GLOBAL`, `pg_advisory_xact_lock(hashtext('crm:customer-code:' || código))` dentro de la transacción del alta, la edición o la restauración |
| Contacto: correo al restaurar | El índice único incluye eliminados, así que restaurar no puede chocar; la comprobación se conserva por defensa (`409 CONTACT_EMAIL_TAKEN`) |
| Auditoría de contactos | `crm.contact.updated` lleva los cambios de datos; el cambio de `isActive` va en `crm.contact.activated|deactivated`. Limpiar el principal al desactivar o eliminar registra además `crm.customer.primary_contact_changed` |
| Nombres de archivo de adjuntos | El interceptor de subida decodifica el `filename` del `multipart` como UTF-8 (`defParamCharset: 'utf8'`); antes, un nombre con tildes llegaba como latin1 |
| Pruebas | PF-02.19 vive en `customers.e2e.spec.ts` (y no en `customers-visibility.e2e.spec.ts`) porque depende de las reglas de duplicidad que ese archivo cambia y restaura; los ayudantes de L.4 están en `backend/test/support/crm-fixtures.ts` |

## Decisiones del módulo (resueltas el 2026-10-10)

Todas las decisiones que afectaban a este módulo quedaron **resueltas por el responsable de negocio
el 2026-10-10**: las que tuvieron respuesta expresa se marcan **Respuesta del responsable**; el resto
quedó aprobado con su valor recomendado. Se conservan todos los identificadores.

### Decisiones de 00 que afectan a este módulo

| Id | Tema | Efecto aquí | Estado |
|---|---|---|---|
| DM-2 | Países | Contenido de `form-options.countries`: GT, SV, HN, CR, VE, EC, con su etiqueta fiscal (NIT, NIT, RTN, Cédula jurídica, RIF, RUC) | **Resuelta (2026-10-10).** Respuesta del responsable: Guatemala, El Salvador, Honduras, Costa Rica, Venezuela y Ecuador; no Nicaragua ni Panamá |
| DM-3 | Validación de NIT y teléfono por país | RN-02.6, RN-02.7 | **Resuelta (2026-10-10).** Valor recomendado aprobado: patrones por país; en Fase 0 longitud y caracteres permitidos |
| DM-4 | Duplicidad de clientes | RN-02.13, RN-02.14, AC-02.17, AC-02.52, AC-02.55: código de cliente único por país (identifica cada establecimiento; opcional); NIT sin único, aviso `409 POSSIBLE_DUPLICATE` (`TAX_ID`) en el alta y en la edición si cambia el NIT; se eliminan `uq_customers_country_tax_id`, `crm.clientes.unicidad_nit` y `TAX_ID_TAKEN` | **Resuelta (2026-10-10).** Respuesta del responsable: los establecimientos de un mismo cliente pueden compartir NIT |
| DM-5 | Duplicidad de contactos | RN-02.16 | **Resuelta (2026-10-10).** Valor recomendado aprobado: correo único por cliente (bloquea); nombre completo avisa |
| DM-8 | Almacenamiento de adjuntos (ADR) | RN-02.29, RN-02.30, F.5, AC-02.24, AC-02.34, AC-02.54; F18 y F19 desbloqueados | **Resuelta (2026-10-10).** Respuesta del responsable: carpeta del proyecto mapeada al almacenamiento del servidor ([ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md)) |
| DM-10 | `TERRITORY → COUNTRY` | Alcance COUNTRY (H.4) | **Resuelta (2026-10-10).** Valor recomendado aprobado (addendum a ADR-018) |
| DM-11 | Roles y matriz | H.2 | **Resuelta (2026-10-10).** Valor recomendado aprobado: roles CRM de sistema con permisos fijos |
| DM-12 | Alcance TEAM y ADR-020 | RN-02.18, H.1, H.4; ya no bloquea el inicio (K.1.3) | **Resuelta (2026-10-10).** Valor recomendado aprobado: TEAM incluye subequipos; cambiar equipos o el país de un usuario es exclusivo del administrador (addendum de ADR-020) |
| DM-13 | Herencia de visibilidad | RN-02.18, `access = INHERITED` | **Resuelta (2026-10-10).** Valor recomendado aprobado: herencia de solo lectura (00 §4.2) |
| DM-14 | Un país por usuario | Filtro COUNTRY | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-16 | Estado comercial del proyecto | Columna de F-08 (la calcula el Módulo 3) | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-18 | Código de cliente opcional y editable con `administrar` | RN-02.2 | **Resuelta (2026-10-10).** Valor recomendado aprobado (reafirmado en la respuesta a DM-4) |
| DM-19 | Ciudad texto libre | Filtro `city` por "contiene" | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-29 | Enmascarado de PII en auditoría | RN-02.31 | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-30 | País y código de colaborador obligatorios para usuarios del CRM | Elegibilidad del responsable, D-02.8 | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-32 | Siembra del menú con el módulo | L.3 | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-33 | Eliminación lógica bloqueada por dependencias | RN-02.22, D-02.16 | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DM-34 | `editar` = propios; `administrar` = ajenos | RN-02.20, H.2 | **Resuelta (2026-10-10).** Valor recomendado aprobado |

### Decisiones de otros módulos y de la consolidación que afectan a este módulo

| Id | Tema | Efecto aquí | Estado |
|---|---|---|---|
| D-06.11 | Valores que empiezan por `=`, `@`, tabulador o retorno de carro | RN-02.32, AC-02.53, `422 FORMULA_NOT_ALLOWED` en el alta y la edición manual | **Resuelta (2026-10-10).** Valor recomendado aprobado: se rechazan también en el alta manual |
| D-06.6 | Avisos de duplicado en la carga masiva | F.6.2 (modo `IMPORT`) | **Resuelta (2026-10-10).** Valor recomendado aprobado; el NIT repetido es la advertencia `DUPLICATE_TAX_ID` |
| DC-2 | Forma de las rutas de adjuntos | F.5: rutas por dueño (`/customers/{id}/attachments/{aid}/content`) | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DC-3 | Caché del lector de parámetros | F.6.5: sin caché o invalidada al editar | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DC-4 | Status de tamaño y tipo de adjunto | `413 ATTACHMENT_TOO_LARGE`, `422 ATTACHMENT_TYPE_NOT_ALLOWED` | **Resuelta (2026-10-10).** Valor recomendado aprobado |
| DC-6 | Código de los errores de validación | `400 VALIDATION_FAILED` en todos los endpoints | **Resuelta (2026-10-10).** Valor recomendado aprobado (`exceptionFactory` del `ValidationPipe` en la Fase 0) |

### Decisiones nuevas

| Id | Pregunta | Valor final (resuelta 2026-10-10) | Impacto si cambia |
|---|---|---|---|
| **D-02.1** | ¿Cómo leen los formularios los catálogos y países sin permisos de administración (`/catalogs` exige `catalogos.ver`)? | **Resuelta (2026-10-10): valor recomendado aprobado.** Un endpoint de opciones **por módulo** con el permiso de ver del módulo (`GET /customers/form-options`, `clientes.ver`). No se crea un endpoint genérico con `@AuthenticatedOnly` (reservado al autoservicio) | Un endpoint genérico requeriría un mapa catálogo → permiso o un decorador "cualquiera de" (convención nueva, ADR) |
| **D-02.2** | ¿Quién puede ser responsable de ventas? | **Resuelta (2026-10-10): valor recomendado aprobado.** Usuario `ACTIVE`, con permiso efectivo `clientes.ver` y, si el actor tiene `clientes.administrar`, dentro de los usuarios de su alcance (TEAM: miembros y responsables, con subequipos; COUNTRY: usuarios de su país; ORGANIZATION: todos). Sin `administrar`, solo el propio actor | Cambia `listEligibleSalesOwners` y RN-02.10; sin cambio de esquema |
| **D-02.3** | ¿Qué se revela de un candidato a duplicado fuera del alcance? | **Resuelta (2026-10-10): valor recomendado aprobado.** Código CRM, código de cliente, razón social, país y nombre del responsable; sin id ni enlace. Razón social y códigos son datos de empresa, no PII | Si se prefiere no revelar nada, solo "existe un posible duplicado" (peor experiencia: el usuario no puede coordinarse) |
| **D-02.4** | Ámbito y claves de los duplicados blandos | **Resuelta (2026-10-10): valor recomendado aprobado, ajustado a DM-4.** Mismo país (la extensión "todos los países si `unicidad_nit = GLOBAL`" desaparece con el parámetro); claves `razonSocialNormalizada`, `nombreComercialNormalizado`, `correo`, `telefono` y `nit` (solo `AVISAR`/`NO`) para clientes, y `nombreCompleto`, `telefono` para contactos (el correo de contacto siempre bloquea) | Solo parámetro y adaptador |
| **D-02.5** | ¿Se puede cambiar el país de un cliente? | **Resuelta (2026-10-10): valor recomendado aprobado.** Sí, solo con `clientes.administrar`; revalida la unicidad del código, los formatos y los avisos (incluido el de NIT) con el país nuevo. Los proyectos conservan su propio país | Si se prohíbe, `countryId` sale del DTO de edición |
| **D-02.6** | ¿Cómo se recupera un cliente o contacto eliminado que sigue ocupando código o correo? | **Resuelta (2026-10-10): valor recomendado aprobado.** `POST …/restore` con `clientes.eliminar` / `contactos.eliminar`; listado de eliminados con `deleted=true` y el mismo permiso | Sin restauración, un código eliminado quedaría inutilizable para siempre (la base lo sigue ocupando) |
| **D-02.7** | ¿Quién edita los contactos de un cliente ajeno pero visible? | **Resuelta (2026-10-10): valor recomendado aprobado.** Quien puede editar el cliente: cliente propio con `contactos.editar`, o ajeno en el alcance directo con `clientes.administrar` + `contactos.editar`. Los heredados son de solo lectura | Si se permite editar contactos de cualquier cliente visible, solo cambia `CustomerAccessPolicy` |
| **D-02.8** | Usuario con alcance COUNTRY sin `country_id` | **Resuelta (2026-10-10): valor recomendado aprobado.** Se degrada a OWN y se registra una advertencia en el log | Si se prefiere que no vea nada, cambia el resolver |
| **D-02.9** | ¿`clientes.administrar` alcanza a clientes visibles solo por herencia (DM-13)? | **Resuelta (2026-10-10): valor recomendado aprobado.** No: la herencia da solo lectura | Si sí, cambia la política y se amplía lo que un asesor puede modificar |
| **D-02.10** | ¿Cómo sabe la ficha si Proyectos y Actividad ya existen? | **Resuelta (2026-10-10): valor recomendado aprobado.** Por el menú del usuario (`GET /me/menu`): si contiene la opción del módulo (`proyectos-buscar`, `actividad-actividades`), se activa la sección o el botón. Coherente con ADR-018 y DM-32 | Alternativas: constante de compilación (acopla áreas del frontend) o manejar el `404` de la API (frágil) |
| **D-02.11** | Componentes compartidos del frontend (`DataTable`, `ConfirmDialog`…) viven en `features/admin/common` y "un área no importa de otra" | **Resuelta (2026-10-10): valor recomendado aprobado.** Moverlos a `frontend/src/components/data/` y dejar `features/admin/common/index.ts` reexportándolos, sin tocar las áreas de admin. El área CRM vive en `frontend/src/features/crm/<submódulo>/` con `crm-routes.ts` | Si se decide importar de `features/admin/common`, se rompe la regla del README de admin |
| **D-02.12** | Rutas con parámetro en el registro y predicado de visibilidad compartido | **Resuelta (2026-10-10): valor recomendado aprobado.** Registrar `/clientes/nuevo` y `/clientes/:customerId` (la prueba del router lo exige) y hacer que el servicio de opciones de menú rechace destinos con `:`. El predicado de visibilidad de clientes se exporta desde el adaptador Prisma para los modelos de lectura de Inicio y Reportes | Si la prueba del router excluyera rutas con parámetro, no se registran (cambio en `route-tree.ts`) |
| **D-02.13** | Concurrencia en la edición | **Resuelta (2026-10-10): valor recomendado aprobado.** Última escritura gana, como el resto de la plantilla; la auditoría conserva la diferencia | Bloqueo optimista (`updatedAt` esperado → `409`) añadiría un campo al DTO de edición |
| **D-02.14** | Semántica de la búsqueda | **Resuelta (2026-10-10): valor recomendado aprobado.** Prefijo en códigos y NIT normalizados; "contiene" en razón social, nombre comercial y ciudad normalizados. Sin `pg_trgm` | Búsqueda difusa requeriría extensión de PostgreSQL y ADR |
| **D-02.15** | Adjuntos en el alta | **Resuelta (2026-10-10): valor recomendado aprobado.** Se suben después del `201`, uno a uno; un fallo no deshace el cliente | Alta y archivos atómicos exigirían un `multipart` único y almacenamiento temporal |
| **D-02.16** | Uso de clientes inactivos y conjunto de dependencias que bloquean la eliminación | **Resuelta (2026-10-10): valor recomendado aprobado.** Inactivo: no se ofrece ni se acepta como cliente de proyectos, visitas o actividades **nuevos** (`422 CUSTOMER_INACTIVE`); los existentes no cambian. Bloquean la eliminación: proyectos no eliminados (cualquier fase), actividades abiertas no eliminadas, visitas pendientes | Permitir clientes inactivos en registros nuevos cambia solo la guarda; ampliar o reducir dependencias cambia el conteo |
| **D-02.17** | ¿Cómo identifica la importación al responsable comercial y los catálogos? | **Resuelta (2026-10-10): valor recomendado aprobado.** Catálogos por `code`, país por `isoCode`, responsable por código de colaborador o, si no hay, por correo. El servicio admite ambos; el Módulo 6 fija la columna de la plantilla | Solo resolución de referencias en modo `BY_NATURAL_KEY` |

---

## Filas para la matriz

| F-xx | Entidades | Dependencias | AC ids | PF ids |
|---|---|---|---|---|
| F-05 | `Customer`, `Country`, `CatalogItem` (`crm.estado_cliente`), `User`, `TeamMember`, `Project` (herencia) | Fase 0 (modelo, semilla, `VisibilityScopeResolver`), DM-10, DM-12, DM-13, DM-14, D-02.8, D-02.11, D-02.14 (todas resueltas el 2026-10-10) | AC-02.1–AC-02.11, AC-02.50, AC-02.51, AC-02.55 | PF-02.1–PF-02.11, PF-02.50–PF-02.52, PF-02.54, PF-02.57, PF-02.61 |
| F-06 | `Customer`, `Sequence`, `Country`, `CatalogItem` (`crm.tipo_empresa`, `crm.estado_cliente`, `crm.calificacion_cliente`), `User`, `SystemParameter`, `Attachment`, `StoredFile`, `AuditLog` | `SequenceGenerator`, `CatalogReferenceValidator`, `ParameterReader`, `FileStorage` (ADR-021), DM-2, DM-3, DM-4, DM-18, DM-8, D-06.11, DC-4, DC-6, D-02.1–D-02.4, D-02.15, D-02.17 (todas resueltas el 2026-10-10) | AC-02.12–AC-02.25, AC-02.50, AC-02.53, AC-02.55 | PF-02.12–PF-02.25, PF-02.50, PF-02.52, PF-02.55, PF-02.56, PF-02.59, PF-02.61 |
| F-07 | `Customer`, `Contact`, `Attachment`, `StoredFile`, `AuditLog`, `Project`/`Activity`/`Visit` (conteos) | `FileStorage` (ADR-021), DM-4, DM-8, DM-29, DM-33, DM-34, D-06.11, DC-2, DC-4, D-02.5, D-02.6, D-02.9, D-02.10, D-02.13, D-02.16 (todas resueltas el 2026-10-10); Módulo 4 (botón de actividad) | AC-02.26–AC-02.35, AC-02.49, AC-02.50, AC-02.52–AC-02.54 | PF-02.26–PF-02.35, PF-02.49, PF-02.50, PF-02.52–PF-02.54, PF-02.58–PF-02.60, PF-02.62 |
| F-08 | `Project`, `CatalogItem` (`crm.fase_cliente`), `Opportunity` (estado comercial) — lectura vía contrato del Módulo 3 | **Módulo 3** (`GET /projects?customerId`, `/proyectos/:id`), DM-16, D-02.10 | AC-02.36–AC-02.39 | PF-02.36–PF-02.39 |
| F-09 | `Contact`, `Customer.primaryContactId`, `InteractionParticipant` (lectura), `AuditLog` | DM-5, DM-29, D-02.4, D-02.6, D-02.7 (todas resueltas el 2026-10-10) | AC-02.40–AC-02.48, AC-02.50 | PF-02.40–PF-02.48, PF-02.50, PF-02.52, PF-02.56 |

Estado en la matriz: F-05, F-06, F-07 y F-09 `especificada`, sin decisiones abiertas (los adjuntos de
F-06/F-07 quedan desbloqueados por ADR-021); F-08 `especificada` con dependencia del Módulo 3 (pasa
a `bloqueada` si el Módulo 3 no ha entregado su contrato cuando se implemente este módulo).
