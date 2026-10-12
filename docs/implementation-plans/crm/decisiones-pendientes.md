# Decisiones del CRM (resueltas el 2026-10-10)

- **Fuentes:** `00-modelo-de-datos.md` §10 (DM-1…DM-36) y la sección "Decisiones
  pendientes del módulo" de `01-…` a `07-…` (D-0X.n). Los `DC-n` los añade esta
  consolidación (incoherencias entre especificaciones que necesitan una decisión).
- **Alcance:** [`ALCANCE-CRM.md`](../../requirements/crm/ALCANCE-CRM.md). Contradicciones del alcance: §6 de este documento.
- **Fecha de consolidación:** 2026-10-10.
- **Estado (2026-10-10):** **todas las decisiones están resueltas.** El responsable de
  negocio respondió el 2026-10-10: contestó expresamente cinco temas (países; NIT de
  establecimientos; moneda base y tipo de cambio; quién confirma visitas; almacenamiento de
  adjuntos) y **aprobó el valor recomendado de todas las demás** (T0, T1, ADR y T2). La
  respuesta sobre moneda crea una decisión nueva, **DM-36**. Los ADR correspondientes están
  aprobados (ADR-021 a ADR-025 y addenda a ADR-008, ADR-018 y ADR-020). El archivo conserva
  su nombre para no romper enlaces.

## Cómo leer este documento

Cada decisión trae su **valor final** y una columna **Estado**:

- *Resuelta 2026-10-10 · **respuesta del responsable***: el responsable de negocio dio una
  respuesta expresa; el valor final es esa respuesta (puede diferir de la recomendación).
- *Resuelta 2026-10-10 · recomendado aprobado*: el responsable aprobó el valor recomendado.

El **nivel** (T0, T1, ADR, T2) se conserva como clasificación histórica: indica qué
habría bloqueado la decisión y sigue siendo útil para saber qué cambiar si alguna se
reabre. Significado original de los niveles:

| Nivel | Significado | Qué pasa si no hay respuesta a tiempo |
|---|---|---|
| **T0** | Fija la forma del esquema, de la migración o de la semilla de la **Fase 0** | Se migra con el valor recomendado; cambiarlo después exige migración con datos o resiembra |
| **T1** | No toca el esquema, pero fija el contrato o el comportamiento de **un módulo concreto**; cambiarlo tras implementarlo es retrabajo | Se implementa el módulo con el valor recomendado |
| **ADR** | Incorpora una librería, un almacenamiento o un patrón nuevo (CLAUDE.md §8.6, §11): **sin ADR aprobado no se construye** la parte afectada | La parte afectada queda `bloqueada` (o se usa la alternativa sin dependencia, si existe) |
| **T2** | No bloquea: el cambio posterior es un parámetro, un texto, una constante o algo aditivo | Se aplica el valor recomendado |

**Quién decide:** *negocio* (responsable funcional del CRM), *arquitectura-ADR* (ADR o
addendum aprobado por el humano responsable, CLAUDE.md §8.6/§11), *técnico* (equipo de
desarrollo, sin cambio de alcance).

**Duplicados:** cuando varias especificaciones plantean la misma pregunta (o una aplica a
su módulo una decisión de `00`), se fusionan en una sola fila; el primer identificador es
el principal y los demás figuran como alias. El índice del §8 lleva cada identificador a
su fila.

### Conteo

| Nivel | Filas | Identificadores que cubre |
|---|---|---|
| T0 | 23 | 29 (21 DM + 8 D) |
| T1 | 34 (Módulo 2: 17 · Módulo 3: 4 · Módulo 4: 3 · Módulo 1: 2 · Módulo 5: 2 · Módulo 6: 5 · Módulo 7: 1) | 54 (8 DM + 43 D + 3 DC) |
| ADR | 6 (además, DM-10 y DM-12 de T0 requieren addendum) | 8 (1 DM + 7 D) |
| T2 | 51 | 52 (5 DM + 44 D + 3 DC) |
| Resueltas en la consolidación | 5 | 7 (5 D + DC-1, DC-8) |
| **Total** | **119** | **150** (35 DM + 107 D + 8 DC) |
| Nueva el 2026-10-10 (T0) | 1 | 1 (DM-36) |
| **Total tras la respuesta** | **120** | **151**, todas **resueltas** (6 filas con respuesta expresa del responsable: DM-1, DM-2, DM-4, DM-8, DM-20, DM-36; el resto, valor recomendado aprobado) |

---

## 0. Respuesta del responsable de negocio (2026-10-10)

| # | Tema | Respuesta (vinculante) | Ids | Dónde se aplica |
|---|---|---|---|---|
| 1 | Países | Guatemala, El Salvador, Honduras, Costa Rica, Venezuela y Ecuador (**no** Nicaragua ni Panamá). Hora y formato de Guatemala por defecto (`America/Guatemala`, `es-GT`); el default de usuarios nuevos deja de ser `es-MX`/`America/Mexico_City` | DM-2, C12 | 00 §1.1, §2.2, §8.2, §9; 02, 06, 07 |
| 2 | NIT de establecimientos | "Puede ser el mismo cliente pero con dos establecimientos": el **NIT no es único**; un NIT repetido es un **aviso** de posible duplicado (no bloquea) en alta, edición e importación. El código de cliente sigue único por país (identifica cada establecimiento) y opcional; correo de contacto único por cliente | DM-4 (y DM-18, DM-5 con su recomendación) | 00 §2.4, §6.2, §8.2; 02; 06 |
| 3 | Moneda | **Moneda base USD**, con capacidad de usar un **tipo de cambio** a la moneda del país. La estimación guarda monto, moneda, tasa aplicada y equivalente en USD; indicadores y reportes en USD; las tasas se siembran y se mantienen en Administración (extensión de F-46) | DM-1, DM-35, **DM-36 (nueva)** | ADR-024; 00 §2.2, §2.7, §2.16; 03, 05, 01, 07 |
| 4 | Visitas | Cinco estados (programada, reprogramada, realizada, confirmada, cancelada). **La confirma el mismo asesor dueño de la visita**, no el manager | DM-20, D-04.3, D-01.14 | 00 §2.10, §5.4; 04; 01; 05 |
| 5 | Adjuntos | "Una carpeta dentro del proyecto que se mapeará a un almacenamiento en el servidor": sistema de archivos con ruta configurable (`ATTACHMENTS_STORAGE_PATH`) montada como volumen; 10 MB; PDF, imágenes, Word y Excel; descarga solo por la API tras autorizar | DM-8, D-06.8 | ADR-021; 00 §2.11; 02, 03, 04, 06 |
| 6 | Todo lo demás | **Aprobado el valor recomendado** de cada decisión, incluidas las de arquitectura: `exceljs` (ADR-022), `@mui/x-charts` Community (ADR-023), `TERRITORY` → `COUNTRY` (addendum ADR-018), `@RequireAnyPermission` (addendum ADR-008), cambiar equipo o país de un usuario solo el administrador (addendum ADR-020), disparadores de auditoría (ADR-025), calendario sin librería, fechas `date`, menú por módulo, roles CRM de sistema (variar = duplicar), manager ve subequipos, un país por persona, parcial = ganada, metas mensuales de toneladas por persona (tabla vacía) | Resto | Todas las especificaciones |

### Lo que sigue abierto

**Ninguna decisión queda abierta.** Quedan **entregas de datos** del negocio, que no son
decisiones pero sin ellas no se pasa a producción:

| Entrega | Necesaria para | Origen |
|---|---|---|
| Tipos de cambio iniciales (GTQ, HNL, CRC, VES) con fecha de vigencia y fuente | Primer despliegue: sin tasa no se puede registrar una estimación en moneda local | DM-36, 00 §8.2 |
| Catálogo real de productos y familias y factores de conversión a toneladas | Forecast y tonelaje en producción (F-15, F-19, F-20, F-36) | DM-23, DM-24 |
| Estructura real de equipos comerciales | Alcance `TEAM` en producción (la demo trae equipos ficticios) | DM-12, 00 §8.2 |
| Aprobación para habilitar la carga masiva en producción (`crm.importaciones.habilitada`) | Uso productivo de F-42 | DM-28 |

### Criterios fijados al actualizar las especificaciones (2026-10-10)

Al incorporar las respuestas del responsable, quienes redactaron las especificaciones
fijaron estos criterios menores que ninguna decisión cubría expresamente. No son
decisiones nuevas de negocio: cada uno es un **valor técnico aprobado por defecto,
revisable** si el responsable indica otra cosa.

| # | Módulo | Criterio | Estado |
|---|---|---|---|
| a | 03 (RN-03.78) | Cambiar el país de un proyecto **no** recalcula las estimaciones ya guardadas de sus oportunidades: se conserva la foto (monto, moneda, tasa y equivalente en USD) | Valor técnico aprobado por defecto, revisable |
| b | 07 | Desactivar un equipo (`PATCH /teams/{id}` con `isActive`) sigue bajo `equipos.editar`; no es exclusivo del administrador | Valor técnico aprobado por defecto, revisable |
| c | 07 | Un tipo de cambio inválido responde `422 INVALID_EXCHANGE_RATE` con `issue`; editar `crm.moneda_base` responde `409 SYSTEM_RESOURCE_READ_ONLY` | Valor técnico aprobado por defecto, revisable |
| d | 07 | Enviar `teamIds` en `POST /users` y cambiar el manager o el equipo padre de un equipo exigen administrador (addendum de ADR-020) | Valor técnico aprobado por defecto, revisable |
| e | 02 | Valores de `reason` de posible duplicado: `LEGAL_NAME`, `TRADE_NAME`, `EMAIL`, `PHONE`, `TAX_ID`; la búsqueda de duplicados se limita siempre al mismo país | Valor técnico aprobado por defecto, revisable |
| f | 06 | Dos filas de una misma importación con el mismo NIT pueden importarse ambas cuando se confirma con avisos | Valor técnico aprobado por defecto, revisable |
| g | 04 | Adjuntar a un evento de visita registrado por otro usuario → `403`; hacerlo pasada la ventana de 15 minutos → `409 RECORD_READ_ONLY` | Valor técnico aprobado por defecto, revisable |
| h | 01 | Las metas comerciales (`sales_targets`) admiten granularidad por usuario, equipo o país en el esquema, aunque DM-9 siembra solo metas mensuales de toneladas por persona | Valor técnico aprobado por defecto, revisable |

---

## 1. Resumen ejecutivo — lo que había que contestar primero

Preguntas de nivel T0 y ADR, en lenguaje no técnico, con la respuesta del 2026-10-10.

| # | Pregunta | Si no se dice nada | Por qué urge | Ids | Respuesta (2026-10-10) |
|---|---|---|---|---|---|
| 1 | ¿En qué países opera el CRM? | Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica y Panamá; hora y formato de Guatemala por defecto | Es lo primero que se carga; cada cliente, proyecto y usuario lleva país | DM-2, C12 | **Respuesta del responsable:** Guatemala, El Salvador, Honduras, Costa Rica, Venezuela y Ecuador; hora y formato de Guatemala |
| 2 | ¿Qué perfiles existen y quién ve qué? ¿El administrador puede ajustar los permisos de cada perfil? | Asesor (ve lo suyo), Manager (ve su equipo; cubre Jefe y Supervisor), Responsable de país (ve su país) y Administrador. Los permisos de esos perfiles los fija el sistema; para variarlos se copia el perfil | Define la matriz de permisos que se carga al inicio | DM-11, D-07.1, D-03.10, C2 | Recomendado aprobado (roles CRM de sistema; para variar se duplica el perfil) |
| 3 | ¿Un manager ve también los subequipos? ¿Solo el administrador puede mover a alguien de equipo o de país? ¿Una persona cubre un solo país? | Sí ve subequipos; sí, solo el administrador (porque cambia lo que esa persona ve); un país por persona | Hay que decidirlo **antes de Clientes**; mover de equipo amplía o reduce lo que alguien ve | DM-12, D-07.2, DM-14 | Recomendado aprobado (sí ve subequipos; solo el administrador mueve de equipo o país; un país por persona) |
| 4 | ¿Puede haber dos clientes con el mismo NIT en el mismo país (p. ej. sucursales)? ¿El código de cliente es obligatorio? ¿Dos contactos de un cliente pueden compartir correo? | NIT y código únicos por país; código opcional; correo de contacto único por cliente | La base de datos lo garantiza desde el primer día; quitarlo después cuesta una migración | DM-4, DM-18, DM-5 | **Respuesta del responsable:** sí, dos establecimientos pueden compartir NIT (aviso, no bloqueo); código único por país y opcional; correo único por cliente |
| 5 | ¿La ciudad se escribe libremente o se elige de una lista por país? | Texto libre | Una lista exige una tabla de ciudades y cargarla | DM-19 | Recomendado aprobado (texto libre) |
| 6 | La "estimación" de una oportunidad, ¿es dinero, toneladas o ambas? ¿En qué moneda? ¿La "fecha" de la oportunidad es la fecha en que se identificó? | Monto con moneda (USD por defecto) y toneladas opcionales, sin convertir monedas; la fecha es la de identificación | Define columnas de la base y cómo se suman los reportes | DM-1, DM-35 | **Respuesta del responsable:** moneda base USD con tipo de cambio a la moneda del país (DM-36); toneladas opcionales; la fecha es la de identificación |
| 7 | Una venta **parcial**, ¿cuenta como ganada en el inicio y en los reportes? Al cerrar, ¿etapa y resultado se registran juntos? | Sí: "ganadas" incluye parciales (con su desglose); etapa y resultado se guardan juntos; "Parcial" vive bajo la etapa Ganado | Cambia todos los indicadores de ventas | DM-15, C1 | Recomendado aprobado |
| 8 | Visitas: ¿"Reprogramada" es un estado? ¿Quién confirma una visita (el asesor o su manager)? ¿El resultado se elige de una lista? | Cinco estados (programada, reprogramada, realizada, confirmada, cancelada); confirma el manager; resultado de lista + texto | Define la lista de estados que se carga y una regla de la base | DM-20, D-04.3, DM-21 | **Respuesta del responsable:** cinco estados; **confirma el mismo asesor dueño de la visita** (no el manager); resultado de lista + texto |
| 9 | ¿De dónde sale el catálogo real de productos y los factores de conversión a toneladas? ¿Se permite escribir toneladas a mano en productos o forecast? | Los entrega el negocio en un archivo y se cargan por script; mantenimiento desde Administración; toneladas siempre calculadas (a mano solo la estimación del proyecto) | Sin productos ni factores reales no hay forecast en toneladas | DM-23, DM-24, D-07.9 | Recomendado aprobado |
| 10 | ¿Existen metas comerciales? ¿Por persona, equipo o país? ¿De qué (toneladas, monto, visitas…)? | Se crea el espacio para metas mensuales de toneladas por persona, vacío; el inicio muestra "Sin metas configuradas" | Cambiar la forma después de cargar metas exige rehacer la tabla | DM-9 | Recomendado aprobado (metas mensuales de toneladas por persona, tabla vacía) |
| 11 | ¿Código de colaborador y país son obligatorios para todo usuario comercial? ¿El código de proyecto lo genera el sistema? | Obligatorios para quien tenga un perfil comercial (no para el administrador); el código de proyecto se genera solo | Afecta al alta de usuarios y a la numeración que se carga al inicio | DM-30, D-07.3, DM-17 | Recomendado aprobado |
| 12 | ¿Dónde se guardan los archivos adjuntos (Azure u otro), con qué tamaño y tipos? | Azure Blob Storage en Azure y disco en desarrollo; 10 MB; PDF, imágenes, Word y Excel | **Sin esta decisión no se puede subir ningún adjunto** en ningún módulo | DM-8, D-06.8 (ADR) | **Respuesta del responsable:** carpeta del proyecto mapeada a un almacenamiento del servidor; 10 MB; PDF, imágenes, Word y Excel (ADR-021) |
| 13 | ¿Se aprueba incorporar un componente para generar y leer **Excel** y otro para dibujar **gráficas**? | `exceljs` para Excel; `@mui/x-charts` (edición gratuita) para gráficas | Sin ellos no hay exportación a Excel, ni carga XLSX, ni dashboard/embudo con gráficas | D-05.1, D-06.1, D-05.2 (ADR) | Aprobado: `exceljs` (ADR-022) y `@mui/x-charts` Community (ADR-023) |
| 14 | Aprobaciones técnicas de arquitectura (no cambian lo que ve el negocio): renombrar el alcance "Territorio" a "País", permiso "uno de varios", auditoría inalterable en la base, calendario sin librería, fechas sin hora, cuándo se carga el menú | Todas con su valor recomendado | Varias se necesitan antes de la Fase 0 o del Módulo 4 | DM-10, D-01.1, D-07.11, D-04.1, DM-31, DM-32 (ADR / técnico) | Aprobadas todas (addenda a ADR-018 y ADR-008; ADR-025) |
| 15 | Contenido inicial de listas que la lógica usa (campos de cada tipo de actividad) y protecciones de catálogos desde el inicio | Valores recomendados por 04 y 07 | Se cargan con la semilla de la Fase 0 | D-04.8, D-07.6 | Recomendado aprobado |

---

## 2. T0 — bloquea la Fase 0

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-1** | ¿Qué es la "estimación" de una oportunidad (monto, toneladas o ambos)? ¿En qué moneda? | a) Monto + moneda + tonelaje opcional; b) solo toneladas; c) multimoneda con totales convertidos | **Respuesta del responsable: c) con base USD.** `estimated_amount NUMERIC(19,4)` + `currency_code` (USD o la moneda del país del proyecto) + `exchange_rate` (foto) + `exchange_rate_date` + `estimated_amount_usd`, y `estimated_tonnage` opcional; reportes e indicadores totalizan en USD (DM-36, ADR-024) | Cambia KPI-10 `AMOUNT` y RN-05.13 (en USD) | Negocio | Migración 5 (`opportunities`); F-17, F-35, KPI-10 | Resuelta 2026-10-10 · **respuesta del responsable** |
| **DM-2** · C12 | Lista de países de Grupo AG; zona y locale por defecto de `users` (hoy `es-MX`/`America/Mexico_City`) | Lista cerrada a confirmar | **Respuesta del responsable:** GT, SV, HN, CR, **VE**, **EC** (no NI ni PA) con prefijo, etiqueta fiscal (NIT, NIT, RTN, Cédula jurídica, RIF, RUC) y moneda (GTQ, USD, HNL, CRC, VES, USD) (00 §8.2); defaults `es-GT` / `America/Guatemala` para usuarios nuevos (migración aditiva de default) | Solo datos de semilla; el default de `users` es un cambio aditivo | Negocio | Semilla esencial de países (migración 2); formularios de 02, 03, 06, 07 | Resuelta 2026-10-10 · **respuesta del responsable** |
| **DM-4** | Unicidad de código de cliente y NIT (ámbito) y criterios blandos de duplicado | a) Único por país en base + parámetro `PAIS`/`GLOBAL`; b) sin unicidad de NIT (sucursales comparten NIT) | **Respuesta del responsable: b) para el NIT** ("puede ser el mismo cliente pero con dos establecimientos"): se quita `uq_customers_country_tax_id` (queda el índice `idx_customers_country_id_tax_id`) y el parámetro `crm.clientes.unicidad_nit`; NIT repetido en el mismo país = aviso no bloqueante (`409 POSSIBLE_DUPLICATE` motivo `TAX_ID` en alta/edición; `WARNING DUPLICATE_TAX_ID` en la carga, D-06.6). Código: `uq_customers_country_customer_code` y parámetro `PAIS` (a). Razón social normalizada → aviso | Volver a exigir NIT único: depurar datos y añadir el único | Negocio | Migración 4 (`customers`); F-06, F-42 | Resuelta 2026-10-10 · **respuesta del responsable** |
| **DM-5** | Duplicidad de contactos | a) Mismo correo en el mismo cliente bloquea (único en base) y mismo nombre avisa; b) se permite el mismo correo | a) | b) se quita `uq_contacts_customer_email` | Negocio | Migración 4 (`contacts`); F-09 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-9** | Metas comerciales: ¿existen?, ¿sujeto (usuario/equipo/país)?, ¿métrica?, ¿quién las carga? | a) Tabla `sales_targets` vacía, mensual, métrica `TONNAGE` por usuario, carga por script; b) sin metas; c) otra granularidad | a); con cero filas la tarjeta K9 muestra "Sin metas configuradas" | b) se elimina la tabla y la tarjeta se oculta; c) cambia la tabla antes de usarla. Ver también D-01.7, D-01.8 | Negocio | Migración 7 (`sales_targets`, enum `sales_target_metric`); KPI-10 (F-02) | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-10** | `DataScope.TERRITORY` → `COUNTRY` | a) `ALTER TYPE … RENAME VALUE` + addendum a ADR-018 + CHANGELOG; b) mantener `TERRITORY` interpretado como país (solo etiquetas) | a) (el sistema no está en producción) | b) sin migración; deuda de nombre permanente. a) cambia el contrato público (`dataScope` en DTOs y frontend) | Arquitectura-ADR (addendum ADR-018) | Migración 1 (única no aditiva); F-44; etiqueta "País" en Inicio y filtros COUNTRY de todos los módulos | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-11** · D-07.1 · D-03.10 · C2 | Roles iniciales frente a perfiles de §5.5; qué hacer con `gestor-accesos`, `auditor`, `usuario`; ¿los roles CRM son de sistema (`isSystem`, matriz de solo lectura)?; ¿el asesor ve en "Proyectos del equipo" los de sus compañeros? | a) `asesor` (OWN), `manager` (TEAM, cubre Jefe y Supervisor), `responsable-pais` (COUNTRY), reutilizar `administrador`; conservar los tres existentes. Sobre `isSystem`: a1) `true` (00 §4.4); a2) `false` y sembrados solo en el alta (D-07.1). Sobre el asesor: OWN o TEAM | a) + **a1**: roles CRM de sistema (`isSystem = true`, 00 §4.4; la personalización se hace con "Duplicar" rol); asesor con alcance OWN (D-03.10) | a2) enmendar 00 §4.4 y la semilla (no repone asignaciones de esos roles); asesor TEAM: solo semilla y pruebas (DM-34 ya impide que edite ajenos) | Negocio (perfiles, alcance del asesor) + Arquitectura (`isSystem`, contradice 00 §4.4) | Semilla de roles y matriz 00 §5.4 (Fase 0); F-14, F-44 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-12** · D-07.2 | Alcance TEAM: ¿miembros, responsable, subequipos?; ¿cambiar miembros de un equipo o el país de un usuario es "asignar acceso" (pregunta abierta de ADR-020)?; ¿foto histórica del equipo en los registros? | a) Miembros + responsable + subequipos; cambiar equipo o país = exclusivo del administrador (addendum ADR-020); sin foto histórica; b) gestor de accesos también puede; c) foto histórica | a) | b) un no administrador ampliaría lo que otro ve; c) `team_id` en 5 tablas (migración). Afecta a `PUT /teams/{id}/members`, `PUT /users/{id}/teams` (D-07.4) y edición de país | Negocio + Arquitectura-ADR (addendum ADR-020) | **Bloqueante antes del Módulo 2** (00 §4.4, 02 K.1.3); `VisibilityScopeResolver` (Fase 0); F-05, F-14, F-21, F-43 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-14** | ¿Un responsable de país puede cubrir varios países? | a) Un país (`users.country_id`); b) varios (`user_countries`) | a) | b) tabla aditiva y cambio del resolver y de 07 | Negocio | Migración 2 (`users.country_id`); `VisibilityScopeResolver` | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-15** · C1 | Relación etapa ↔ resultado; ¿un parcial cuenta como ganada?; ¿WON implica 100 %? | a) Etapa cerrada y resultado se registran juntos; PARTIAL bajo la etapa Ganado; "ganadas" = WON + PARTIAL con desglose; WON sin porcentaje (100 % implícito); b) etapa "Parcial" propia; c) parcial no cuenta como ganada | a) | b) catálogo y semántica nuevos; c) fórmulas KPI-03/KPI-10 y RN-05.22 (deben seguir idénticas en Inicio y Reportes) | Negocio | `CHECK` de `opportunity_results` y metadata `stageOutcome`/`outcome` (migración 5, semilla de catálogos); F-17, F-18, F-02, F-35, F-41 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-17** | Código de proyecto: ¿generado o introducido? (§5.3 pide "nuevo nombre o código" al duplicar) | a) Generado por la secuencia `crm.proyecto`, editable solo con `proyectos.administrar`, único; b) manual | a) | b) se quita la secuencia; el único se mantiene | Negocio | Semilla de secuencias (Fase 0); F-10, F-12 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-18** | Código de cliente: ¿obligatorio?, ¿de dónde sale (sin SAP)?, ¿editable? | a) Opcional, introducido por el usuario, editable con `clientes.administrar`; b) obligatorio | a) | b) `customer_code` no nulo (decidir antes de tener datos) y columna obligatoria en la plantilla de carga | Negocio | Migración 4; F-06, F-42 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-19** | Ciudad: ¿texto libre o catálogo por país? | a) Texto libre; b) tabla `cities` con FK | a) | b) tabla, carga de datos por país, resolución en la importación | Negocio | Migración 4 (`customers.city`, `projects.city`); F-05, F-06, F-42 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-20** · D-04.3 | Estados de visita (¿`REPROGRAMADA` es estado o solo evento?); ¿quién confirma?; ¿confirmar exige realización previa?; ¿cómo identifica el código el estado reprogramado? | a) 5 estados; confirma quien tenga `visitas.cerrar` (manager; asesor sin él); confirmar exige realización (CHECK); `REPROGRAMADA` por su `code` (D-04.3); b) añadir `isRescheduled` al `metadata` de `crm.estado_visita` | **Respuesta del responsable:** 5 estados; **confirma el mismo asesor dueño de la visita**, no el manager (el asesor recibe `visitas.cerrar`; `visitas.administrar` no confirma visitas ajenas; CHECK `ck_visits_confirmed_by_owner`); confirmar exige realización (`ck_visits_confirm_requires`); D-04.3 b) `isRescheduled` adoptado | Matriz de permisos y dos `CHECK` | Negocio (estados, confirmador) + Técnico (D-04.3) | Semilla `crm.estado_visita` y registro de semántica (Fase 0); migración 6; F-25, F-28, F-29, AL-2 de Inicio | Resuelta 2026-10-10 · **respuesta del responsable** |
| **DM-21** | Resultado de visitas y actividades: ¿catálogo o texto? | a) Catálogo `crm.resultado_interaccion` opcional + texto; completar exige uno de los dos; b) solo texto | a) | Catálogo y `CHECK` | Negocio | Semilla de catálogos y migración 6; F-27, F-33 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-23** · D-07.9 | Catálogo real de productos y familias (origen, carga, mantenimiento); estados del producto asociado; ¿dónde se mantienen productos, unidades y conversiones? | a) Carga por script versionado desde un archivo del negocio; mantenimiento con `productos.configurar` en pantallas de Administración "Productos y unidades" y "Conversiones" (D-07.9); estados `PROPUESTO/COTIZADO/ADJUDICADO/DESCARTADO`; b) solo por script | a) | b) "conversiones y estimaciones" (§9.4) sin mantenimiento; otros estados = solo semilla | Negocio | Semilla `crm.estado_producto_asociado` (Fase 0); carga de productos antes de F-19/F-20 en producción; pantallas de 07 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-24** | Factores de conversión reales; ¿tonelaje manual sin regla? | a) Factores del negocio; sin tonelaje manual en líneas (CHECK `tonnage ⇔ regla`); estimación manual solo en el proyecto; b) tonelaje manual en líneas | a) | b) se relaja el `CHECK` y se añade `is_manual_tonnage` (migración) | Negocio | `CHECK` de `project_products`/`forecast_lines` (migración 5); reglas reales para F-15, F-19, F-20, F-36 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-30** · D-07.3 | ¿`employeeCode` y `countryId` obligatorios para todo usuario? ¿Cuándo se exigen? | a) Nulos en base; obligatorios para usuarios con un rol comercial (rol que concede algún permiso de recursos del CRM), salvo `administrador`; se comprueba al asignar roles, en el alta y al editar; b) obligatorios en base para todos | a) | b) migración con relleno previo de usuarios existentes y del administrador sembrado | Negocio | Migración 2 (nulabilidad); F-43 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-31** | Fechas de calendario como `date` | a) `@db.Date` para fechas sin hora + aclaración en CODING-STANDARDS; b) `timestamptz` a medianoche de la zona de negocio | a) | b) cambia columnas y la lógica de "hoy" | Técnico (convención; se documenta) | Migraciones 4–7 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-32** | Momento de sembrar el menú del CRM | a) Permisos y roles en Fase 0; opciones y rutas con cada módulo; b) todo al inicio con `isActive=false` | a) | b) la semilla tendría que gestionar `isActive` | Técnico | Semilla de acceso (Fase 0) y de cada módulo | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-35** | "Fecha" de la oportunidad (§5.8) | a) Fecha de identificación (`opportunity_date`); b) otra | a) | Renombrar la columna (antes de migrar) y la base `IDENTIFIED` de Reportes | Negocio | Migración 5; F-17, F-35 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-36** *(nueva, 2026-10-10)* | Moneda base y conversión de la estimación a la moneda del país | a) Totalizar por moneda sin convertir; b) base USD con tipos de cambio y foto de la tasa en la oportunidad; c) convertir al consultar con la tasa del día | **Respuesta del responsable: b)** "moneda base USD con capacidad de usar tipo de cambio a la moneda del país". Tablas `currencies` y `exchange_rates` (tasa por 1 USD, fecha de vigencia, fuente, única por moneda y fecha); `countries.currency_code`; la oportunidad guarda tasa, fecha de la tasa y equivalente USD; tasa = última vigente ≤ `opportunity_date`, sin tasa `422 EXCHANGE_RATE_NOT_FOUND`, antigua → aviso `EXCHANGE_RATE_STALE`; `crm.moneda_base` = USD (solo lectura); mantenimiento en Administración dentro de F-46 (**extensión de alcance aprobada**, `parametros.*`). [ADR-024](../../adr/ADR-024-moneda-base-usd-y-tipos-de-cambio.md), 00 §2.16 | Cambiar la base exige recalcular todos los equivalentes | Negocio + Arquitectura-ADR | Migraciones 2 y 5; F-17, F-35, F-40, KPI-10, F-46 | Resuelta 2026-10-10 · **respuesta del responsable** |
| **D-04.8** | `metadata.fields` e `isInteraction` de `crm.tipo_actividad` | Lista de campos por tipo propuesta en 04 | `LLAMADA`/`REUNION`: `scheduledAt, durationMinutes, participants, summary, resultId, resultNotes, nextAction, nextActionDate`; `CORREO`: igual sin duración; `TAREA`: `scheduledAt, resultId, resultNotes`; `isInteraction` = `true` salvo `TAREA` | Solo datos de la semilla (editables después desde catálogos) | Negocio | Semilla de catálogos (Fase 0); F-32, DEF-F | Resuelta 2026-10-10 · recomendado aprobado |
| **D-07.6** | ¿Cuándo se entregan las protecciones de catálogos y parámetros (registro de semántica, reglas de parámetros, bloqueo de desactivación de códigos referenciados)? | a) Con la semilla en la Fase 0; b) con el Módulo 7 | a) | b) durante las fases 1–6 un administrador puede romper invariantes desde las pantallas ya publicadas | Técnico | Alcance de la Fase 0 (`catalog-semantics.registry.ts`, `parameter-rules.registry.ts`) | Resuelta 2026-10-10 · recomendado aprobado |

---

## 3. T1 — bloquea un módulo concreto

En orden de implementación (alcance §11): 2 → 3 → 4 → 1 → 5 → 6 → 7.

### 3.1 Módulo 2 — Clientes / Cuentas

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-13** · D-02.9 | Herencia de visibilidad (¿ve el asesor el cliente de su proyecto, la oportunidad de un proyecto que ve?); ¿`clientes.administrar` alcanza a lo visible solo por herencia? | a) Herencias de 00 §4.2, de **solo lectura**; b) sin herencia; c) herencia con edición | a) | Solo repositorios y políticas; c) amplía lo que un asesor puede modificar | Negocio | `VisibilityScopeResolver` y repositorios de 02, 03, 04; F-05, F-07 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-29** | ¿Se enmascaran los datos personales de contactos en `audit_logs`? | a) Sí, campo cambiado + valor enmascarado (`a***@d***.com`); b) no | a) | Implementación de `AuditService` | Negocio (privacidad) | Auditoría de contactos (02, 04, 07 F-47) | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-33** · D-02.16 · D-03.4 · D-03.12 · C9 | Eliminación: ¿siempre lógica?, ¿bloqueada si hay historia?; uso de clientes inactivos en registros nuevos; ¿se eliminan oportunidades cerradas? | a) Siempre lógica; `409` si tiene hijos activos (proyectos no eliminados, actividades abiertas, visitas pendientes); cliente inactivo no admite proyectos, visitas ni actividades **nuevos** (`422 CUSTOMER_INACTIVE`), prospecto sí; oportunidad cerrada no se elimina (`409 OPPORTUNITY_CLOSED`) | a) | Solo casos de uso y conteos; permitir inactivos o borrar cerradas altera conteos históricos | Negocio | `CustomerReferenceGuard` (02 F.6.3, usado por 03 y 04); F-07, F-10, F-17, F-30 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-34** · D-02.7 | Significado de `editar` frente a `administrar`; ¿quién edita contactos de un cliente ajeno visible? | a) `editar` = propios; `administrar` = ajenos dentro del alcance (y reasignar); contactos: quien puede editar el cliente; heredados de solo lectura | a) | Matriz de permisos y guardas de todos los casos de uso | Negocio | Políticas de acceso de 02, 03, 04 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.1** · D-03.1 · D-04.10 · D-07.12 | ¿Cómo leen los formularios catálogos, países, usuarios y parámetros sin permisos de administración? | a) Endpoint `form-options` / `owner-options` **por módulo** con el permiso de ver del módulo, implementado con `CatalogLookupService`/`ParameterReader` (Fase 0); b) endpoint genérico `@AuthenticatedOnly`; c) genérico con guard "cualquiera de" | a) | b/c) convención nueva (ADR o addendum ADR-008) y se sustituyen los `*.api.ts` | Técnico (b/c: arquitectura-ADR) | Contratos `GET /customers/form-options`, `/projects/form-options`, `/visits/form-options`, `/activities/form-options`, `/reports/filter-options`… | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.2** · D-03.16 | ¿A quién se puede asignar como responsable (cliente, proyecto)? | a) Usuario `ACTIVE`, con permiso efectivo del recurso (rol CRM), dentro del alcance de quien asigna; sin `administrar`, solo uno mismo; b) cualquier usuario activo | a) | `listEligibleSalesOwners`, `INVALID_SALES_OWNER`/`INVALID_OWNER`, RN-04.5 | Negocio | F-06, F-10, F-26, F-31 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.5** | ¿Se puede cambiar el país de un cliente? | a) Sí, con `clientes.administrar`, revalidando unicidad y formatos; los proyectos conservan su país; b) prohibido | a) | b) `countryId` sale del DTO de edición | Negocio | `UpdateCustomerDto` (F-07) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.6** | Recuperar un cliente o contacto eliminado que sigue ocupando código, NIT o correo | a) `POST …/restore` y listado `deleted=true` con `clientes.eliminar`/`contactos.eliminar`; b) sin restauración | a) | b) un código eliminado quedaría inutilizable | Negocio | Endpoints F8 y F16 de 02 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.8** | Usuario con alcance COUNTRY sin `country_id` | a) Se degrada a OWN y se registra advertencia; b) no ve nada | a) | Cambia el resolver | Técnico (seguridad) | `VisibilityScopeResolver` | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.10** | ¿Cómo sabe una pantalla si otro módulo ya existe? | a) Por `GET /me/menu` (opción `proyectos-buscar`, `actividad-actividades`…); b) constante de compilación; c) manejar `404` | a) | b) acopla áreas; c) frágil | Técnico | Secciones de fichas de 02 y 03 (F-08, F-11) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.11** · D-03.3 · D-04.11 | Componentes compartidos del frontend (`DataTable`, `ConfirmDialog`…) en `features/admin/common` y área del CRM | a) Moverlos a `frontend/src/components/data/` con reexportación desde `features/admin/common`; CRM en `frontend/src/features/crm/<submódulo>/` con `crm-routes.ts` (05 alineado en la consolidación) | a) | Si no se mueven: cada módulo duplica o se rompe la regla "un área no importa de otra" | Técnico | Estructura del frontend de 02–06 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.12** · D-03.2 · D-04.13 | Rutas con parámetro en `app-routes.registry.json` | a) Registrarlas (la prueba del router compara todo) y que el servicio de opciones de menú rechace destinos con `:`; b) excluirlas del cotejo | a) | b) cambio en `route-tree.ts`/`collectNavigablePaths` | Técnico | Registro de rutas de 02, 03, 04 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-02.17** · D-06.4 | ¿Cómo se identifican en la importación el responsable, el país y los catálogos? | a) Catálogos por `code`, país por `isoCode`, responsable por código de colaborador o correo (una sola columna); b) aceptar etiquetas/nombres (se haría en 02) | a) | Resolución `BY_NATURAL_KEY` del Módulo 2 | Negocio | `CustomerValidationService` (02) y plantilla (06) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-06.11** | Valores que empiezan por `=`, `@`, tab o CR en texto libre | a) Rechazar en la importación (`FORMULA_NOT_ALLOWED`) **y** en el alta manual de 02, para que ambos caminos acepten lo mismo; b) aceptarlos y neutralizar solo al exportar | a) — alineado en 02 (alta y edición manual) | b) se confía solo en la neutralización de la exportación | Técnico (seguridad) | `CustomerValidationService` (02), F-42 | Resuelta 2026-10-10 · recomendado aprobado |
| **DC-2** | Forma de las rutas de adjuntos: 02 y 03 usan rutas por dueño (`/customers/{id}/attachments/{aid}/content`, `/projects/{id}/attachments/{aid}/content`; 03 alineado en la consolidación), 04 propone rutas genéricas `/attachments/{aid}/download` y `DELETE /attachments/{aid}` | a) Rutas por dueño para listar, subir, descargar y borrar (la autorización la decide el módulo dueño); b) genéricas para descargar y borrar | a) | b) un controlador genérico tendría que resolver el dueño y su política (acoplamiento entre módulos) | Técnico | `AttachmentsService` (02) y F.4 de 04 (04 alineado a rutas por dueño) | Resuelta 2026-10-10 · recomendado aprobado |
| **DC-4** · D-06.13 | Status del exceso de tamaño y tipo no admitido: 02 `422 ATTACHMENT_TOO_LARGE`, 03 `413/422`, 04 `413` (códigos alineados a los de 02 en la consolidación), 06 `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_FILE_TYPE`; API-STANDARDS §3 no lista 413/415 | a) `413` para tamaño (NGINX ya responde 413) y `415` o `422` para tipo, añadiendo 413/415 a API-STANDARDS; b) todo `422` | a) con `422 ATTACHMENT_TYPE_NOT_ALLOWED` para adjuntos (validación de lista blanca) y `415` para el archivo de importación | b) el `413` de NGINX seguiría existiendo | Técnico (contrato) | Contratos de subida de 02, 03, 04, 06 | Resuelta 2026-10-10 · recomendado aprobado |
| **DC-6** | Código de los errores de validación: 02, 03, 04 y 06 documentan `400 VALIDATION_FAILED` (como `ErrorResponseDto` y `catalogs.controller.ts`), pero el filtro global actual (`all-exceptions.filter.ts`) emite `BAD_REQUEST` para los errores del `ValidationPipe`; 05 decía `BAD_REQUEST` (alineado a `VALIDATION_FAILED` en la consolidación) | a) `exceptionFactory` en el `ValidationPipe` que emita `VALIDATION_FAILED`, en la Fase 0; b) documentar `BAD_REQUEST` en todas las especificaciones | a) | a) cambia el `code` de los 400 de los endpoints existentes (sin producción aún; CHANGELOG); b) editar 02–06 | Técnico (contrato) | Pruebas de contrato de todos los módulos desde el 2 | Resuelta 2026-10-10 · recomendado aprobado |

### 3.2 Módulo 3 — Proyectos

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-16** · D-05.15 | Definiciones de "proyecto activo", "estado comercial", "última actualización"; coherencia de la fecha de decisión; ¿vista SQL para el estado comercial? | a) Activo = no eliminado y fase `isFinal=false`; estado comercial = etapa abierta de mayor `order`, si no "Ganado" si alguna WON/PARTIAL, si no "Perdido", "Sin oportunidades"; última actualización = `last_activity_at`; fecha de decisión sin restricción; sin vista en v1 (subconsulta en `commercial-metrics`) | a) | Fórmulas DEF-A/B/C de `metric-definitions.ts` (Inicio, Proyectos y Reportes a la vez); una vista se definiría en 00 | Negocio (definiciones) + Técnico (vista) | `metric-definitions.ts` (lo crea el Módulo 3); F-11, F-13, F-02, F-34 | Resuelta 2026-10-10 · recomendado aprobado |
| **DM-25** · D-03.5 · C11 | Forecast: ¿producto asociado obligatorio?, ¿asesor de la línea distinto del del proyecto?, ¿meses pasados editables?, ¿el mes en curso es editable? | a) Asociación obligatoria; asesor = el del proyecto salvo `forecast.administrar`; visibilidad sigue al proyecto (y al dueño de la línea); ventana editable M+1…M+6, M y pasados de solo lectura | a) | Solo casos de uso y `forecast-window.ts` | Negocio | F-20, F-36 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-03.6** | Concurrencia en la matriz de forecast | a) Optimista por línea con `expectedUpdatedAt` y `409 FORECAST_LINE_STALE`; b) gana el último | a) | Campo del contrato `PUT /forecast/lines` | Técnico | F-20 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-03.13** | Redondeo del tonelaje calculado | a) 4 decimales `HALF_UP`, aritmética decimal en backend; Inicio y Reportes usan el valor guardado | a) | Totales de Inicio y Reportes | Negocio (precisión) + Técnico | F-15, F-19, F-20 (y totales de F-02, F-36) | Resuelta 2026-10-10 · recomendado aprobado |

### 3.3 Módulo 4 — Actividad comercial

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-22** | ¿Qué entra en el historial de interacciones? | a) Visitas realizadas/confirmadas y actividades completadas de tipos con `isInteraction=true`; cancelaciones y reprogramaciones en el historial de la visita; b) incluir tareas o cancelaciones | a) | Solo la consulta (DEF-F, RN-04.33) | Negocio | F-23, F-24, F-03 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-01.6** · D-05.5 | ¿"Actividades pendientes" incluye las vencidas? | a) Disjuntas: pendientes = abiertas no vencidas (incluye "por vencer"); vencidas aparte; b) inclusivas | a). La bandeja de 04 (buckets `DUE_SOON` + `PENDING`) y KPI-08 de Inicio usan la misma definición (alineado en la consolidación, DC-1) | `metric-definitions.ts` y textos de Inicio, Actividad y Reportes a la vez | Negocio | F-22 (primer consumidor), F-02, F-38 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-04.9** | Fórmula de "próxima acción" en el seguimiento | a) Próxima `next_action_date ≥ hoy` (00 §2.12) con respaldo a la `next_action` sin fecha de la última interacción; b) contar también visitas pendientes y actividades abiertas futuras | a) | `InteractionReadModel` y la consulta de Inicio (deben coincidir) | Negocio | F-23 (y F-03) | Resuelta 2026-10-10 · recomendado aprobado |

> El Módulo 4 también depende del **ADR D-01.1** (§4): sus endpoints de lectura admiten
> `actividades.ver` **o** `visitas.ver` (04 H.1).

### 3.4 Módulo 1 — Inicio / Dashboard

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **D-01.8** | Fórmula del "logrado" por métrica y sujeto de la meta según el ámbito | a) KPI-10: OWN → meta del usuario; TEAM → metas de los equipos donde es responsable o miembro principal; COUNTRY → su país; ORGANIZATION → suma de metas de país | a) | Solo `targetCompliance`; depende de DM-9 | Negocio | K9 (F-02) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-01.13** · D-05.12 | ¿Cuentan en los indicadores los registros cuyo proyecto o cliente está eliminado lógicamente? | a) No (RN-01.13, RN-05.5); b) sí, para conservar históricos | a) | Universo de `metric-definitions.ts` para Inicio y Reportes | Negocio | F-02, F-34…F-38 | Resuelta 2026-10-10 · recomendado aprobado |

### 3.5 Módulo 5 — Reportes

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **D-05.3** | Tope de exportación XLSX frente a "el conjunto completo" (§7.6) y al tope de la casa (10 000) | a) Parámetro nuevo `crm.reportes.max_filas_exportacion` = 100 000 (anotado en 00 §8.2 como propuesto); por encima `422 EXPORT_TOO_LARGE`, nunca archivo truncado; streaming | a) | Tope menor: más `422`; cualquier tamaño: exportación asíncrona (D-05.14, ADR) | Negocio | F-39 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-05.11** | ¿Basta `reportes.ver` o se exige también el `.ver` de cada entidad de origen? | a) Basta `reportes.ver`; la navegación a la ficha exige el permiso de origen; b) exigir ambos | a) | b) un reporte daría `403` aunque el menú lo muestre | Negocio (seguridad) | F-34…F-41 | Resuelta 2026-10-10 · recomendado aprobado |

### 3.6 Módulo 6 — Integraciones

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-28** · D-06.9 · C10 | Habilitación productiva de la carga masiva, sobrescritura, retención; ¿quién cambia `crm.importaciones.habilitada` y qué ve el usuario deshabilitado? | a) `false` en producción hasta aprobación; nunca sobrescribe; filas purgadas a 90 días; cambiarlo exige `parametros.configurar`; deshabilitado → `409 IMPORTS_DISABLED` en subir/confirmar/cancelar, consulta disponible | a) | Solo parámetros y una guarda | Negocio | Uso productivo de F-42 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-06.2** | ¿Lector CSV propio o librería? | a) Propio (`common/csv-reader.ts`, RFC 4180 acotado, sin conversión de tipos); b) `csv-parse`/`papaparse` | a) | b) ADR + adaptador | Técnico (b: arquitectura-ADR) | F-42 (CSV) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-06.6** | Duplicados blandos en una carga: ¿cómo se confirman? | a) Advertencia (`severity: WARNING`) en fila `VALID`; se importan solo con `includeRowsWithWarnings = true`; si no, `REJECTED` (anotado en 00 §2.14); b) confirmación fila a fila | a) | b) más pantalla y otro endpoint | Negocio | Contrato `POST /customer-imports/{id}/confirmation` | Resuelta 2026-10-10 · recomendado aprobado |
| **D-06.7** | ¿Procesamiento síncrono, en segundo plano o en cola? | a) Validación síncrona; confirmación `202` en segundo plano en el mismo proceso, exclusividad por transición condicional; b) cola | a) | b) ADR, infraestructura y reintentos (el contrato no cambia) | Técnico (b: arquitectura-ADR) | F-42 | Resuelta 2026-10-10 · recomendado aprobado |
| **D-06.12** | Mecanismo de purga de `raw_data` (no hay planificador) | a) Script versionado `purge-customer-import-rows.ts` ejecutado por la operación; b) planificador en la aplicación | a) | b) ADR | Técnico | Retención de F-42 (DM-28) | Resuelta 2026-10-10 · recomendado aprobado |

### 3.7 Módulo 7 — Administración

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **D-07.4** | ¿Cómo se asigna equipo desde Usuarios sin duplicar Equipos? | a) `PUT /users/{id}/teams` servido por el módulo `teams` con las mismas reglas (y `ADMIN_ONLY` si DM-12); b) solo desde Equipos | a) | b) el alcance §9.1 pide "asignar equipo" en usuarios | Negocio | F-43 | Resuelta 2026-10-10 · recomendado aprobado |

---

## 4. ADR — librerías, almacenamiento y patrones nuevos

Todas aprobadas el 2026-10-10: DM-8 → [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md);
D-05.1 · D-06.1 → [ADR-022](../../adr/ADR-022-exceljs-para-generar-y-leer-xlsx.md); D-05.2 →
[ADR-023](../../adr/ADR-023-mui-x-charts-community-para-graficas.md); D-01.1 → addendum de
[ADR-008](../../adr/ADR-008-authorization.md); D-07.11 →
[ADR-025](../../adr/ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md); D-04.1 → sin ADR
(opción a, sin librería). DM-36 → [ADR-024](../../adr/ADR-024-moneda-base-usd-y-tipos-de-cambio.md).

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| **DM-8** · D-06.8 | Almacenamiento de adjuntos (local, Azure Blob…), tamaño, tipos, antivirus; ¿se guardan el archivo original y el de errores de una carga? | a) Puerto `FileStorage`: sistema de archivos (volumen Docker) en desarrollo y Azure Blob Storage en Azure; 10 MB; lista blanca de tipos; descarga por URL firmada de corta duración; mientras tanto, la importación no guarda binarios (`source_file_id`/`error_file_id` nulos) | **Respuesta del responsable:** "una carpeta dentro del proyecto que se mapeará a un almacenamiento en el servidor": puerto `FileStorage` + adaptador de sistema de archivos con ruta base `ATTACHMENTS_STORAGE_PATH` (carpeta ignorada por Git) y volumen Docker hacia el almacenamiento del servidor; 10 MB; PDF, imágenes, Word y Excel (firma verificada); descarga **solo por la API tras autorizar** (sin estático ni URL firmada); claves generadas y protección *path traversal*; respaldo a cargo del servidor; sin antivirus. **D-06.8:** la importación sigue sin guardar binarios (valor recomendado aprobado). [ADR-021](../../adr/ADR-021-almacenamiento-de-adjuntos-en-sistema-de-archivos-montado.md) | Otro almacenamiento = otro adaptador; el esquema no cambia | Arquitectura-ADR | Desbloquea la subida/descarga de adjuntos de F-06, F-07, F-10, F-11, F-21, F-25…F-33 | Resuelta 2026-10-10 · **respuesta del responsable** |
| **D-05.1** · D-06.1 | Librería XLSX (exportar y leer archivos no confiables) | a) `exceljs` (MIT, streaming de lectura y escritura) detrás de `backend/src/common/xlsx.ts`, con guardia ZIP propia; b) SheetJS (npm congelado con avisos de seguridad; descartada); c) `read-excel-file` + `write-excel-file`; d) escritor/lector propio | a) — **un solo ADR para 05 y 06**, que verifique `pnpm audit`, mantenimiento, que el parser XML no resuelve entidades externas, y fije versión | Otra librería: solo cambia el adaptador | Arquitectura-ADR | **F-39 (`bloqueada`)**; variante XLSX de F-42 (CSV no se bloquea) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-05.2** | Librería de gráficas | a) `@mui/x-charts` Community (MIT), embudo con barras horizontales (no el `FunnelChart` Pro), carga diferida, "Ver como tabla"; b) Recharts; c) Chart.js; d) Nivo/ECharts | a) | b) adaptador de tema; sin librería: solo tablas | Arquitectura-ADR | **F-40 y F-41 (`bloqueada`** en su parte visual; las tablas equivalentes pueden construirse) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-01.1** | Endpoints que mezclan fuentes con permisos alternativos (`@RequirePermission` exige todos) | a) Decorador `@RequireAnyPermission(...)` + soporte en `PermissionsGuard` (deny-by-default) + filtro por fuente en el caso de uso — **addendum a ADR-008**; b) un endpoint por fuente con `@RequirePermission` y fusión en el frontend | a) | b) más peticiones; paginación por tipo; el alcance no cambia | Arquitectura-ADR | **Módulo 4** (agenda, interacciones, seguimiento, owner-options, schedule-conflicts; se implementa antes que Inicio) y Módulo 1 (actividad reciente, alertas) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-07.11** | Garantía en la base de que la auditoría no se modifica ni se borra | a) Disparadores `BEFORE UPDATE/TRUNCATE` que rechazan y `BEFORE DELETE` que rechaza filas dentro de `auditoria.dias_retencion`; `REVOKE UPDATE, DELETE` al rol de la aplicación como recomendación de despliegue; b) solo código | a) | b) la restricción depende solo del código; un `REVOKE` total impediría la purga | Arquitectura-ADR (patrón nuevo: disparadores) | F-47 (migración de auditoría) | Resuelta 2026-10-10 · recomendado aprobado |
| **D-04.1** | Vista calendario sin librería de calendario ni de fechas | a) Calendario propio con MUI + `Intl.DateTimeFormat` (mes, semana, día), `datetime-local` nativo — **sin ADR**; b) FullCalendar / MUI X Scheduler o Date Pickers (requieren ADR) | a) | b) ADR y sustituir `Calendar*View`; contratos y backend no cambian | Técnico (b: arquitectura-ADR) | F-21 solo si se elige b) | Resuelta 2026-10-10 · recomendado aprobado |

**Addenda aprobados (están en T0):** DM-10 (addendum a [ADR-018](../../adr/ADR-018-identity-access-model.md))
y DM-12 · D-07.2 (addendum a [ADR-020](../../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md)).

**Habrían pasado a ADR solo con otro valor** (se aprobó el recomendado, así que no hay ADR) (están en T2 o T1): D-02.14
(`pg_trgm`), DM-27 (planificador de notificaciones), D-05.13 (instantáneas con
planificador), D-05.14 (exportación asíncrona), D-06.2 (librería CSV), D-06.7 (cola),
D-06.12 (planificador), D-02.1 (endpoint genérico).

---

## 5. T2 — no bloquea (se aplica el valor recomendado)

| Id(s) | Pregunta | Opciones | Valor final | Impacto si se cambia | Quién decide | Qué bloquea | Estado |
|---|---|---|---|---|---|---|---|
| DM-3 | Validación de NIT y teléfono por país | Patrones por país / solo longitud | Patrones en `countries`; en Fase 0 solo longitud y caracteres (NIT GT con módulo 11 si se confirma) | Datos y una función | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DM-6 · D-03.8 | Transiciones de etapa; reapertura (destino, permiso, justificación) | Libre / restringida | Desde abierta a cualquiera; desde cerrada solo reabrir con `oportunidades.administrar` y comentario; anula el resultado (`CLEARED`) | Solo parámetro `crm.oportunidades.transiciones_etapa` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DM-7 | Umbrales y prioridades de alertas | Valores | 48 h por vencer, 48 h sin confirmar, 30 días sin actualizar; prioridades de 00 §8.2 | Solo parámetros | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DM-26 | Alertas calculadas o persistidas; ¿se descartan? | Calculadas / con descarte | Calculadas, sin descarte | Tabla aditiva `alert_acknowledgements` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DM-27 | Recordatorio de visita: ¿notificación?, ¿canal? | Aviso en Inicio / correo con planificador | `reminder_minutes_before` + aviso en Inicio; sin correo ni planificador | Planificador (posible ADR) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.5 | Horizonte de "visitas próximas" | Parámetro / constante | Parámetro `crm.inicio.visitas_proximas_dias` = 7 (1–60), sembrado (00 §8.2); Reportes lo reutiliza (D-05.6 resuelta) | Constante de 7 días si no se aprueba un parámetro nuevo | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.7 | Metas sin configurar: ¿tarjeta oculta o con mensaje? | Oculta / visible | Visible con "Sin metas configuradas" si tiene `metas.ver` | Solo UI | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.9 | Orden y ventana de la actividad reciente | — | Pasado descendente (30 días, máx. 90); próximas visitas aparte | Consulta y UI | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.10 | Cambios "relevantes" para el resumen de actividad | — | Proyecto: alta y fase/avance; oportunidad: alta, etapa, resultado y "actualizada"; sin `audit_logs` | Más tipos exigen historial funcional | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.11 | ¿Siguiente acción con fecha pasada = "sin siguiente acción"? | Sí / no | No (AL-4 solo si falta el texto) | Nueva alerta = parámetro y regla | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.12 | "Funcionalidades frecuentes" de los accesos rápidos | Por menú / por uso | Opciones de `/me/menu` de los módulos operativos primero (máx. 8) | Por uso: registrar navegación (fuera de alcance) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-01.14 | Responsable mostrado en la alerta de visita sin confirmar | Asesor / confirmador | El dueño de la visita; la ven también quienes la pueden ver (manager) | Regla de confirmador (DM-20) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-02.3 | ¿Qué se revela de un duplicado fuera del alcance? | Datos mínimos / nada | Código CRM, razón social, país y nombre del responsable; sin id ni enlace | Solo mensaje | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-02.4 | Ámbito y claves de duplicados blandos | — | Mismo país; razón social, nombre comercial, correo, teléfono (clientes); nombre y teléfono (contactos) | Parámetro y adaptador | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-02.13 | Concurrencia en la edición de clientes | Última escritura / optimista | Última escritura gana (como la plantilla) | Campo `updatedAt` esperado en el DTO | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-02.14 | Semántica de la búsqueda | Prefijo y "contiene" / difusa | Sin `pg_trgm` | Difusa: extensión + ADR | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-02.15 | Adjuntos en el alta | Después del `201` / multipart atómico | Uno a uno después del `201` | Almacenamiento temporal | Técnico | Nada (DM-8 resuelta) | Resuelta 2026-10-10 · recomendado aprobado |
| D-03.7 | ¿Crear oportunidad directamente cerrada? | Sí / no | No (`INVALID_INITIAL_STAGE`) | Resultado en el alta | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-03.9 | Duplicar: ¿adjuntos?, ¿productos? | — | Adjuntos nunca; productos solo si se marca | Copiar binarios (DM-8) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-03.11 | Cambio de cliente de un proyecto | Permitido condicionado / prohibido | Permitido sin visitas ni actividades vinculadas (`409 PROJECT_CUSTOMER_LOCKED`) | Simplificación si se prohíbe | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-03.14 | Unidades admitidas en asociación o forecast | Cualquiera activa / misma dimensión | Cualquier unidad activa; sin regla, sin tonelaje | Una validación | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-03.15 | ¿Retroceder de fase? | Sí / no | Sí, queda en el historial | Regla con `metadata.order` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.2 | Regla de conflictos horarios | — | Solo visitas del mismo responsable, no canceladas, con solape; modo `AVISAR`; `BLOQUEAR` implementado sin activar | Parámetro o `findOverlapping` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.4 | Obligatorios al registrar visita realizada | — | Solo fecha real; si se quiere más, clave `visitCompletion` en `crm.campos_obligatorios` (anotada en 00 §8.2) | Validación y formulario | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.5 | Fechas pasadas y futuras | — | Planificar en pasado permitido con aviso; reprogramar no pasada; fechas reales no futuras | Validaciones | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.6 | Edición tras cerrar y reapertura | — | Realización corregible hasta confirmar; terminales de solo lectura; sin reabrir | Reabrir: nuevo `VisitEventType` (aditivo en 00) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.7 | Motivo al cancelar actividad; eliminar completadas | — | Comentario opcional en auditoría; eliminar solo abiertas o canceladas | Columnas `cancellation_reason*` (aditivo en 00) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.12 | Calendario sin paginar | — | 42 días y 500 eventos con `truncated` | Constante | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.14 | Registrar una gestión ya realizada en un paso | Sí / no | Sí, bloque `completion` con `actividades.cerrar` | Dos llamadas | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.15 | ¿La próxima acción crea una tarea? | Sí / no | No | Regla en el caso de uso | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.16 | Visitas pendientes cuya hora pasó | Etiqueta / alerta | Etiqueta "Sin registrar", sin alerta | Alerta nueva en Inicio con parámetro | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.17 | Zona horaria de presentación | — | Instantes en la zona del usuario; fechas y "hoy" en `crm.zona_horaria_negocio` | Solo frontend | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-04.18 | Adjuntar a un evento ya ocurrido | — | Solo quien lo ejecutó, en los 15 minutos siguientes | Ventana o multipart | Negocio | Nada (DM-8 resuelta) | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.4 | Columna de período de cada reporte y período por defecto | — | Tabla C.2 de 05, seleccionable con `dateBasis` | Resultados por defecto | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.8 | "Tipo de cliente" del embudo | Tipo de empresa / estado del cliente | `crm.tipo_empresa` | Una columna del filtro | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.9 | Porcentajes del embudo "con información suficiente" | — | Participación si total > 0; conversión con historial completo y muestra ≥ 5 | Solo `funnel()` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.10 | Filtro por producto/familia en oportunidades | Sí / no | Sí, con `EXISTS` | Quitar filtro | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.13 | Tendencia de proyectos activos | Sin tendencia / reconstrucción / instantáneas | Sin tendencia | Reconstrucción o instantáneas (ADR si hay planificador) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-05.14 | Exportaciones mayores que el tope | `422` / asíncrona | `422` y acotar filtros (fuera de v1) | Asíncrona: DM-8 + planificador (ADR) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-06.3 | Codificación y delimitador del CSV | — | Solo UTF-8 (con o sin BOM); `,` o `;` detectado | Adivinar codificación | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-06.5 | Duplicados dentro del archivo | Rechazar todas / conservar la primera | Rechazar todas | Una regla y AC-06.10 | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-06.10 | ¿Quién confirma o cancela una carga? | Autor / autor u ORGANIZATION | Autor, o `importaciones.crear` con alcance ORGANIZATION | Una guarda | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.5 | ¿Qué es "duplicado" en un catálogo? | — | Mismo `code` o misma etiqueta normalizada (incluye inactivos) | Solo `code` | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.7 | Validación de parámetros JSON y de lista | — | Registro por clave con `zod` (ya dependencia), `requiresConfigure` para estructurales | Sin registro, un valor mal formado rompe al lector | Técnico | Nada (se entrega en Fase 0 con D-07.6) | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.8 · C6 | "Tipo de autenticación o ingreso permitido" | Solo lectura / editable | Solo lectura desde `AUTH_PROVIDER` (`GET /parameters/authentication`); login funcional = `seguridad.*` existentes | Editable = sistema paralelo prohibido (ADR) | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.10 | Vista de auditoría por campo | — | Presentación de `changes` + filtro `field`; sin tabla nueva | Tabla duplicada | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.13 | ¿Mantenimiento de países? | Sí / no | No; semilla (DM-2) | Pantalla aditiva | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| D-07.14 | Desactivar un asesor con registros abiertos | Bloquear / reasignar / nada | Ni bloquea ni reasigna; se reasigna en cada módulo con `administrar` | Administración consultaría a todos los módulos | Negocio | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DC-3 | Caché del lector de parámetros: 02 F.6.5 dice "caché corta", 07 RN-07.35 "sin caché o invalidada al editar" (y PF-07.41 exige efecto inmediato) | Sin caché / invalidada / TTL | Sin caché o invalidada en `PATCH /parameters/{key}` (regla de 07) | Con TTL, un cambio tarda en verse | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DC-5 | 05 devuelve `422 INVALID_CATALOG_SEMANTICS` al **leer** si el catálogo de etapas no cumple la semántica; 00 §3.3 y 07 lo impiden al **escribir** (`422 INVALID_CATALOG_METADATA`, `409 CATALOG_INVARIANT`) | Mantener la salvaguarda / quitarla | Que el registro de semántica declare `order` e `inFunnel` obligatorios en `crm.etapa_oportunidad`; la salvaguarda de lectura queda como defensa y se documenta como error del servidor (no de la petición) | PF-05.32 tendría que sembrar el catálogo saltándose el registro | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |
| DC-7 | Inicio vive en `frontend/src/features/dashboard/` y el resto del CRM en `features/crm/` (D-02.11) | `features/dashboard/` / `features/crm/dashboard/` | Mantener `features/dashboard/` (la ruta `/` es del shell); navega a las pantallas CRM solo por ruta (`source-routes.ts`) y usa los componentes compartidos de `components/data/`, sin importar de `features/crm/*` | Mover carpeta | Técnico | Nada | Resuelta 2026-10-10 · recomendado aprobado |

---

## 6. Contradicciones del alcance (00 §12)

| # | Contradicción | Dónde | Resolución (aprobada el 2026-10-10) | Decisión asociada |
|---|---|---|---|---|
| C1 | Ganado/Perdido son etapas **y** resultados; "Parcial" no tiene etapa | §5.8 vs §5.9 | Etapa cerrada y resultado se registran juntos; Parcial vive bajo la etapa Ganado | DM-15 (T0) |
| C2 | §9.2 fija 3 roles; §5.5 habla de 5 perfiles | §5.5 vs §9.2 | Tres roles + `responsable-pais`; Jefe y Supervisor = `manager` | DM-11 (T0) |
| C3 | "Administración al final" pero usuarios, roles, catálogos, parámetros y auditoría ya existen (PLAN-ADMIN), sin código de colaborador ni país | §1 regla 7, §11 | El Módulo 7 **extiende** lo existente; sus protecciones se entregan en la Fase 0 | D-07.6 (T0) |
| C4 | Siempre "NIT", pero cada país tiene su identificador (RTN, RUC, cédula jurídica) | §4.2, §8.1 | `customers.tax_id` + `countries.tax_id_label` | DM-2, DM-3 |
| C5 | Existe `DataScope.TERRITORY`; el alcance pide "País" | §9.2 vs ADR-018 | Renombrar a `COUNTRY` | DM-10 (T0, addendum ADR-018) |
| C6 | "Tipo de autenticación" como parámetro editable, cuando el proveedor es de despliegue y el alcance prohíbe un sistema paralelo | §9.4 | Solo lectura; el login funcional usa `seguridad.*` | D-07.8 (T2) |
| C7 | "Fecha estimada de decisión" (proyecto) y "fecha de decisión" (resultado); el reporte muestra "fecha de decisión" | §5.1, §5.9, §7.2 | Son dos datos; el reporte muestra la real y, sin resultado, la estimada identificada como tal | — (resuelta en 00/05) |
| C8 | "Actividades vencidas" como si fuera un estado | §2.1, §6.2 | "Vencida" es derivada (abierta + vencimiento pasado) | D-01.6 (T1) |
| C9 | "Eliminar cliente" frente a "no eliminar información histórica" | §4.3 | Eliminación siempre lógica | DM-33 (T1) |
| C10 | Carga masiva completa, pero con "aprobación para habilitación productiva" | §8.1 vs §1 regla 9 | Se implementa entera detrás de `crm.importaciones.habilitada` (`false` en producción) | DM-28 (T1) |
| C11 | "Asesor responsable" por línea de forecast distinto del del proyecto, sin regla de visibilidad | §5.11, §2 | Por defecto el del proyecto; la visibilidad sigue al proyecto (y al dueño de la línea) | DM-25 (T1) |
| C12 | `users.locale = es-MX` y `time_zone = America/Mexico_City` por defecto | `schema.prisma` | Defaults `es-GT` / `America/Guatemala` para usuarios nuevos (respuesta del responsable) | DM-2 (T0) |

### 6.1 Contradicciones entre especificaciones (detectadas en la consolidación)

| # | Contradicción | Estado |
|---|---|---|
| E1 | 07 D-07.1 (roles CRM con `isSystem = false`) contradice 00 §4.4 (`isSystem`) | **Resuelta (2026-10-10)** → DM-11: roles de sistema (`isSystem = true`); 07 alineado |
| E2 | 05 G.3 decía que Inicio crea primero el módulo de métricas y usaba otros nombres de archivo y métodos que 01 | Corregida: el Módulo 3 crea `metric-definitions.ts`, el 1 el módulo y el servicio (firma de 01 F.2), Reportes añade sus agregaciones; nombres de 01 L.1 |
| E3 | KPI-08 de Inicio ("pendientes" incluye "por vencer") frente al bucket `PENDING` de la bandeja de 04 (lo excluye); 01 usaba `state=` y `status=PENDING`, inexistentes en 04 | Corregida (DC-1): `bucket` repetible en `/activities/pending`, `statusGroup[]` en `/visits`; 01 E.3 apunta a esos filtros |
| E4 | 02 consumía F-08 con `commercialStatus { code, label }`; 03 define `{ kind, label, stage }` | Corregida: 02 F.7 alineado a `ProjectListItemDto` de 03 |
| E5 | 04 usaba códigos propios para lo que valida `CustomerReferenceGuard` de 02 (`UNKNOWN_REFERENCE` para cliente no visible, `CONTACT_CUSTOMER_MISMATCH`, `INACTIVE_REFERENCE` para contactos), `REQUIRED_FIELDS_MISSING` y `FILE_*` para adjuntos; además no aplicaba D-02.16 (cliente inactivo) | Corregida: 04 usa `404`/`CUSTOMER_INACTIVE`/`INVALID_CONTACT`/`CONTACT_INACTIVE`, `REQUIRED_FIELD_MISSING`, `ATTACHMENT_*`. El status 413/422 queda en DC-4 |
| E6 | Errores de validación documentados como `VALIDATION_FAILED` frente al `BAD_REQUEST` que emite el filtro actual | **Resuelta (2026-10-10)** → DC-6: `exceptionFactory` que emite `VALIDATION_FAILED` en la Fase 0 |
| E7 | Lector de parámetros con cuatro nombres (`ParameterReader`, `SystemParameterReader`, `ParametersService`, `ParametersRepository.findByKey`) y política de caché distinta | Nombres corregidos a `ParameterReader` (02 F.6.5; añadido a 00 §11). Caché **resuelta (2026-10-10)** → DC-3: sin caché o invalidada al editar |
| E8 | La importación rechaza valores que empiezan por `=`/`@` y el alta manual de 02 los acepta | **Resuelta (2026-10-10)** → D-06.11: 02 rechaza `FORMULA_NOT_ALLOWED` también en el alta manual |
| E9 | 04 necesita permisos "uno de varios" (`actividades.ver` o `visitas.ver`) pero el decorador lo propone 01, que se implementa después | **Resuelta (2026-10-10)** → D-01.1: addendum a ADR-008, se entrega con el Módulo 4 |
| E10 | 05 ubicaba el frontend en `features/reports/` con su propio `reports-routes.ts`, fuera del área CRM de D-02.11; 01 usa `features/dashboard/` | 05 corregido a `features/crm/reports/` + `crm-routes.ts`. Inicio **resuelta (2026-10-10)** → DC-7: se mantiene `features/dashboard/` |
| E11 | Rutas de adjuntos: `/content` (02), `/download` por dueño (03) y genéricas `/attachments/{id}` (04) | 03 alineado a `/content`. Rutas genéricas de 04 **resuelta (2026-10-10)** → DC-2: rutas por dueño; 04 alineado |
| E12 | 03 escribía `/projects/{id}/attachments/{aid}/download`; 01 E.7 enviaba las alertas de oportunidad "a la ficha del proyecto" aunque 03 define `/proyectos/oportunidades/:opportunityId` | Corregidas |

---

## 7. Resueltas en la consolidación

No cambian alcance ni reglas de negocio; las cerró la coordinación técnica.

| Id(s) | Resolución |
|---|---|
| D-01.2 | Módulo compartido `backend/src/modules/commercial-metrics/` (`CommercialMetricsService`, `metric-definitions.ts`). El Módulo 3 crea DEF-A/B/C/G; el Módulo 1 lo completa; Reportes lo consume y amplía. Anotado en 00 §11 |
| D-01.3 · D-05.7 | Período por defecto de ganadas/perdidas: mes en curso (zona de negocio) por `decision_date`, con selector mes/trimestre/año; Reportes lo reproduce |
| D-05.6 | "Visitas próximas" usa el parámetro de D-01.5 (`crm.inicio.visitas_proximas_dias`); no se crea otro. (Que exista como parámetro o constante sigue en D-01.5, T2) |
| D-01.4 · DC-1 | Filtros de destino de las tarjetas alineados con los contratos de 03 (`active`, `status`, `outcome`, `decisionFrom/To`) y 04 (`statusGroup` en `/visits`, `bucket` repetible en `/activities/pending`) |
| DC-8 | API de `CommercialMetricsService`: métodos de indicadores con la firma de 01 F.2; Reportes añade agregaciones con filtro (05 G.3). Una sola implementación de cada predicado |

---

## 8. Índice de identificadores

Cada identificador → nivel original y fila donde se trata (la fila principal es el primer
id). **Todos están resueltos el 2026-10-10**; la columna "Nivel" es la clasificación
original. Respuesta expresa del responsable: DM-1, DM-2, DM-4, DM-8 (y su alias D-06.8),
DM-20 (y su alias D-04.3), DM-36; el resto, valor recomendado aprobado.

| Id | Nivel | Fila | Id | Nivel | Fila | Id | Nivel | Fila |
|---|---|---|---|---|---|---|---|---|
| DM-1 | T0 | DM-1 | DM-2 | T0 | DM-2 | DM-3 | T2 | DM-3 |
| DM-4 | T0 | DM-4 | DM-5 | T0 | DM-5 | DM-6 | T2 | DM-6 |
| DM-7 | T2 | DM-7 | DM-8 | ADR | DM-8 | DM-9 | T0 | DM-9 |
| DM-10 | T0 + ADR | DM-10 | DM-11 | T0 | DM-11 | DM-12 | T0 + ADR | DM-12 |
| DM-13 | T1 (M2) | DM-13 | DM-14 | T0 | DM-14 | DM-15 | T0 | DM-15 |
| DM-16 | T1 (M3) | DM-16 | DM-17 | T0 | DM-17 | DM-18 | T0 | DM-18 |
| DM-19 | T0 | DM-19 | DM-20 | T0 | DM-20 | DM-21 | T0 | DM-21 |
| DM-22 | T1 (M4) | DM-22 | DM-23 | T0 | DM-23 | DM-24 | T0 | DM-24 |
| DM-25 | T1 (M3) | DM-25 | DM-26 | T2 | DM-26 | DM-27 | T2 | DM-27 |
| DM-28 | T1 (M6) | DM-28 | DM-29 | T1 (M2) | DM-29 | DM-30 | T0 | DM-30 |
| DM-31 | T0 | DM-31 | DM-32 | T0 | DM-32 | DM-33 | T1 (M2) | DM-33 |
| DM-34 | T1 (M2) | DM-34 | DM-35 | T0 | DM-35 | D-01.1 | ADR | D-01.1 |
| D-01.2 | Resuelta | D-01.2 | D-01.3 | Resuelta | D-01.3 | D-01.4 | Resuelta | D-01.4 |
| D-01.5 | T2 | D-01.5 | D-01.6 | T1 (M4) | D-01.6 | D-01.7 | T2 | D-01.7 |
| D-01.8 | T1 (M1) | D-01.8 | D-01.9 | T2 | D-01.9 | D-01.10 | T2 | D-01.10 |
| D-01.11 | T2 | D-01.11 | D-01.12 | T2 | D-01.12 | D-01.13 | T1 (M1) | D-01.13 |
| D-01.14 | T2 | D-01.14 | D-02.1 | T1 (M2) | D-02.1 | D-02.2 | T1 (M2) | D-02.2 |
| D-02.3 | T2 | D-02.3 | D-02.4 | T2 | D-02.4 | D-02.5 | T1 (M2) | D-02.5 |
| D-02.6 | T1 (M2) | D-02.6 | D-02.7 | T1 (M2) | DM-34 | D-02.8 | T1 (M2) | D-02.8 |
| D-02.9 | T1 (M2) | DM-13 | D-02.10 | T1 (M2) | D-02.10 | D-02.11 | T1 (M2) | D-02.11 |
| D-02.12 | T1 (M2) | D-02.12 | D-02.13 | T2 | D-02.13 | D-02.14 | T2 | D-02.14 |
| D-02.15 | T2 | D-02.15 | D-02.16 | T1 (M2) | DM-33 | D-02.17 | T1 (M2) | D-02.17 |
| D-03.1 | T1 (M2) | D-02.1 | D-03.2 | T1 (M2) | D-02.12 | D-03.3 | T1 (M2) | D-02.11 |
| D-03.4 | T1 (M2) | DM-33 | D-03.5 | T1 (M3) | DM-25 | D-03.6 | T1 (M3) | D-03.6 |
| D-03.7 | T2 | D-03.7 | D-03.8 | T2 | DM-6 | D-03.9 | T2 | D-03.9 |
| D-03.10 | T0 | DM-11 | D-03.11 | T2 | D-03.11 | D-03.12 | T1 (M2) | DM-33 |
| D-03.13 | T1 (M3) | D-03.13 | D-03.14 | T2 | D-03.14 | D-03.15 | T2 | D-03.15 |
| D-03.16 | T1 (M2) | D-02.2 | D-04.1 | ADR | D-04.1 | D-04.2 | T2 | D-04.2 |
| D-04.3 | T0 | DM-20 | D-04.4 | T2 | D-04.4 | D-04.5 | T2 | D-04.5 |
| D-04.6 | T2 | D-04.6 | D-04.7 | T2 | D-04.7 | D-04.8 | T0 | D-04.8 |
| D-04.9 | T1 (M4) | D-04.9 | D-04.10 | T1 (M2) | D-02.1 | D-04.11 | T1 (M2) | D-02.11 |
| D-04.12 | T2 | D-04.12 | D-04.13 | T1 (M2) | D-02.12 | D-04.14 | T2 | D-04.14 |
| D-04.15 | T2 | D-04.15 | D-04.16 | T2 | D-04.16 | D-04.17 | T2 | D-04.17 |
| D-04.18 | T2 | D-04.18 | D-05.1 | ADR | D-05.1 | D-05.2 | ADR | D-05.2 |
| D-05.3 | T1 (M5) | D-05.3 | D-05.4 | T2 | D-05.4 | D-05.5 | T1 (M4) | D-01.6 |
| D-05.6 | Resuelta | D-05.6 | D-05.7 | Resuelta | D-01.3 | D-05.8 | T2 | D-05.8 |
| D-05.9 | T2 | D-05.9 | D-05.10 | T2 | D-05.10 | D-05.11 | T1 (M5) | D-05.11 |
| D-05.12 | T1 (M1) | D-01.13 | D-05.13 | T2 | D-05.13 | D-05.14 | T2 | D-05.14 |
| D-05.15 | T1 (M3) | DM-16 | D-06.1 | ADR | D-05.1 | D-06.2 | T1 (M6) | D-06.2 |
| D-06.3 | T2 | D-06.3 | D-06.4 | T1 (M2) | D-02.17 | D-06.5 | T2 | D-06.5 |
| D-06.6 | T1 (M6) | D-06.6 | D-06.7 | T1 (M6) | D-06.7 | D-06.8 | ADR | DM-8 |
| D-06.9 | T1 (M6) | DM-28 | D-06.10 | T2 | D-06.10 | D-06.11 | T1 (M2) | D-06.11 |
| D-06.12 | T1 (M6) | D-06.12 | D-06.13 | T1 (M2) | DC-4 | D-07.1 | T0 | DM-11 |
| D-07.2 | T0 + ADR | DM-12 | D-07.3 | T0 | DM-30 | D-07.4 | T1 (M7) | D-07.4 |
| D-07.5 | T2 | D-07.5 | D-07.6 | T0 | D-07.6 | D-07.7 | T2 | D-07.7 |
| D-07.8 | T2 | D-07.8 | D-07.9 | T0 | DM-23 | D-07.10 | T2 | D-07.10 |
| D-07.11 | ADR | D-07.11 | D-07.12 | T1 (M2) | D-02.1 | D-07.13 | T2 | D-07.13 |
| D-07.14 | T2 | D-07.14 | DC-1 | Resuelta | D-01.4 | DC-2 | T1 (M2) | DC-2 |
| DC-3 | T2 | DC-3 | DC-4 | T1 (M2) | DC-4 | DC-5 | T2 | DC-5 |
| DC-6 | T1 (M2) | DC-6 | DC-7 | T2 | DC-7 | DC-8 | Resuelta | DC-8 |
| DM-36 | T0 (nueva 2026-10-10) | DM-36 | | | | | | |
