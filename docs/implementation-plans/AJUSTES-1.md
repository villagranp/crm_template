# Plan de implementación — Ajustes 1

- **Origen:** solicitud del responsable de negocio (2026-10-14).
- **Estado:** **aprobado (2026-10-14)**. Decisiones de §2 resueltas por el responsable de negocio: valores recomendados, salvo D-AJ1.1 (el dashboard se configura **por usuario**) y D-AJ1.4 (buscar y notificaciones **apagados**).
- **Decisiones que lo enmarcan:** [ADR-008](../adr/ADR-008-authorization.md) (permisos `recurso.accion`), [ADR-017](../adr/ADR-017-design-system-grupo-ag.md) (tokens), [ADR-018](../adr/ADR-018-identity-access-model.md) (menú desde la base), [ADR-019](../adr/ADR-019-autenticacion-local-con-migracion-a-entra.md), [ADR-020](../adr/ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md), [ADR-025](../adr/ADR-025-inmutabilidad-de-la-auditoria-con-disparadores.md); planes [PLAN-ADMIN](PLAN-ADMIN.md) y [CRM 01 — Inicio](crm/01-inicio-dashboard.md).
- **Skills aplicables:** `feature-development` (orquestador), `requirements-analysis`, `user-story`, `architecture`, `api-design`, `database`, `prisma`, `authorization`, `access-management`, `security`, `backend-nestjs`, `frontend-react`, `design-system`, `testing`, `observability`, `documentation`, `code-review`.
- **ADR:** no se requiere. No hay tecnología, librería ni patrón nuevo: una tabla y un permiso nuevos siguen patrones existentes, `user_preferences` ya existe y `/me/*` ya es el patrón de recursos del propio usuario (`@AuthenticatedOnly`).

> Este documento es una **especificación de brechas**: cada ajuste distingue lo que
> **existe** (con referencia a archivo), lo que **se añade** y lo que **se cambia**. Los
> identificadores son `AJ1-n` (ajuste), `RN-AJ1.n` (regla), `AC-AJ1.n` (criterio) y
> `PF-AJ1.n` (prueba).

---

## 1. Entendimiento

### 1.1 Requerimiento (tal como se recibió)

1. Que las tarjetas del dashboard sean parametrizables.
2. Una tarjeta nueva en el dashboard con el **«minuto de seguridad»**, con su mantenimiento: solo el **mensaje** y la **fecha en que se visualiza**. Debe crearse en el esquema de base de datos.
3. En el login, quitar el texto para que solo quede el nombre «Mi Cliente AG».
4. En el footer, cambiar «© 2026 Mi Cliente AG» por «© 2026 Grupo AG».
5. Un **informe de seguridad** basado en **OWASP ASVS** para dar tranquilidad al área de ciberseguridad.
6. Que los botones de la barra superior (buscar, pantalla completa, notificaciones) sean parametrizables.
7. Que cada usuario guarde en su configuración si usa el tema claro u oscuro.

### 1.2 Ajustes y qué existe hoy

| Ajuste | Existe hoy | Brecha |
|---|---|---|
| **AJ1-1** Tarjetas del dashboard parametrizables | La composición de Inicio está **fija en el código**: bloques `hero`, `mine`, `kpis`, `alerts`, `activity`, `access` (`frontend/src/routes/pages/HomePage.tsx:19-46`) y nueve indicadores K1–K9 (`frontend/src/features/dashboard/components/KpiGrid.tsx:237-347`, `TargetsCard.tsx`). Solo el **permiso** decide qué se monta (`dashboard.permissions.ts:82-151`). Los parámetros `crm.alertas.*` y `crm.inicio.visitas_proximas_dias` ajustan umbrales, no tarjetas | **Preferencia por usuario** de visibilidad y orden de bloques e indicadores (editor «Personalizar panel» en Inicio y «Restablecer»), con un parámetro del sistema como composición por defecto y un endpoint para que el frontend lo lea |
| **AJ1-2** Minuto de seguridad | No existe nada | Tabla `safety_minutes`, permisos `minuto_seguridad.*`, mantenimiento (API + pantalla en Administración), opción de menú y bloque nuevo en Inicio |
| **AJ1-3** Login solo con el nombre | El panel de marca muestra el nombre (`LoginPage.tsx:178`), `PANEL_DESCRIPTION` (`LoginPage.tsx:21-22`) y `PANEL_FEATURES` (`LoginPage.tsx:24-31`), pintados por `AuthLayout.tsx:113-180` | Quitar descripción y lista de características del panel de marca |
| **AJ1-4** Footer «Grupo AG» | `© {año} {brandIdentity.productName}` en `AppShell.tsx:88` y `AuthLayout.tsx:240`; `productName = 'Mi Cliente AG'` en `theme/tokens.ts:381-383` | Token `brandIdentity.companyName = 'Grupo AG'` y usarlo en los dos footers |
| **AJ1-5** Informe OWASP ASVS | `SECURITY.md` §3 tiene una tabla OWASP **Top 10**; `docs/security/` solo tiene `README.md` (anuncia `threat-model.md`, `review-<fecha>.md`, `data-classification.md`, que no existen). No hay informe ASVS | Informe de verificación ASVS 5.0 con evidencia, brechas y plan de remediación |
| **AJ1-6** Barra superior parametrizable | `Topbar.tsx`: pantalla completa **funcional** (261-272, `use-fullscreen.ts`); buscar **decorativo** (284-288, sin `onClick`); notificaciones **decorativo** (290-309, contador siempre 0; no hay backend de notificaciones, DM-27 las dejó fuera). Ninguna configuración los oculta | Tres parámetros booleanos y su lectura por `GET /me/ui-settings` |
| **AJ1-7** Tema por usuario | Store Zustand `stores/ui.store.ts` con `localStorage` (`'app-theme'`) y `prefers-color-scheme` de respaldo; aplicado en `app/AppProviders.tsx:23-36`. El backend **no** lo guarda. La tabla `user_preferences` (`schema.prisma:576-587`, `@@unique([userId, key])`) **ya existe migrada** (`20261002203700_init_management_core`) pero no la usa ningún código | Endpoints `/me/preferences` y sincronización del store con el servidor |

### 1.3 Fuera de alcance

- **Funcionalidad** de la búsqueda global y de las notificaciones: este ajuste solo decide si los botones se **muestran** (ver D-AJ1.4). Implementarlas es otra historia (notificaciones = DM-27, con planificador).
- Configuración del dashboard **por rol** (D-AJ1.1 resuelta: por usuario).
- Remediar las brechas que encuentre el informe ASVS: el informe las **documenta y prioriza**. Las de severidad alta abren historias propias.
- Cambiar el nombre del producto (`productName` sigue siendo «Mi Cliente AG», también en `<title>`).
- Otras preferencias de usuario (densidad, idioma, vistas guardadas).

---

## 2. Decisiones (resueltas el 2026-10-14)

Todas resueltas por el responsable de negocio: aprobó los valores recomendados salvo D-AJ1.1 y D-AJ1.4. D-AJ1.10 y D-AJ1.11 surgen de D-AJ1.1 y se resuelven con el valor recomendado, a confirmar en la revisión.

| Id | Pregunta | Valor final | Impacto si se cambia | Secciones |
|---|---|---|---|---|
| **D-AJ1.1** | ¿Quién parametriza las tarjetas del dashboard y con qué alcance? | **Resuelta, respuesta del responsable: cada usuario personaliza su propio dashboard** (visibilidad y orden), guardado como preferencia suya (`user_preferences`, clave `ui.inicio.tarjetas`). Sin personalización se usa la composición por defecto (D-AJ1.11) | Por rol: tabla `role_dashboard_cards` y editor en la ficha del rol. El contrato de `GET /me/ui-settings` no cambia | §3 HU-AJ1-1, §4, §5, §6, §8.1 |
| **D-AJ1.2** | ¿Qué granularidad tiene la parametrización? | **Resuelta (valor recomendado aprobado):** bloques (incluido el minuto de seguridad) **e indicadores K1–K9**, visibilidad y orden de ambos | Recortar el editor y el esquema | §4, §5, §8.1 |
| **D-AJ1.3** | ¿Cuántos mensajes de minuto de seguridad por fecha y qué pasa si hoy no hay? | **Resuelta (valor recomendado aprobado):** uno por fecha (único); sin mensaje hoy, el bloque no se muestra | Mostrar un texto vacío o varios mensajes por fecha cambia el contrato | §4 RN-AJ1.8–9, §5.1, §6, §8.2 |
| **D-AJ1.4** | Buscar y notificaciones no tienen función hoy: ¿qué hace el parámetro? | **Resuelta, respuesta del responsable: los botones quedan apagados.** Se parametrizan los tres; **buscar y notificaciones sembrados en `false`**; pantalla completa, que sí funciona, queda en `true` (cambiarlo a `false` es un solo valor de semilla). El editor avisa de que buscar y notificaciones aún no tienen función | Encenderlos muestra controles sin función, contra la decisión de 2026-10-09 (`Topbar.tsx:180-181`) | §4 RN-AJ1.14, §5.3, §8.4 |
| **D-AJ1.5** | ¿Se pueden editar o borrar mensajes de fechas pasadas? | **Resuelta (valor recomendado aprobado):** futuras, editar y borrar; hoy, solo editar; pasadas, solo lectura | Perder trazabilidad o impedir retirar un mensaje programado por error | §4 RN-AJ1.10–11, §6.2 |
| **D-AJ1.6** | Login: ¿qué textos se quitan? | **Resuelta (valor recomendado aprobado):** del panel de marca se quitan la descripción y la lista de características; el formulario conserva sus textos funcionales | Quitar también «Bienvenido de nuevo» y el subtítulo afecta E2E y orientación | §3 HU-AJ1-3, §8.5 |
| **D-AJ1.7** | Tema: ¿solo claro/oscuro o también «según el sistema»? | **Resuelta (valor recomendado aprobado):** solo `light` y `dark`; sin preferencia, `prefers-color-scheme` | Un tercer estado cambia el botón a un menú | §4 RN-AJ1.16, §8.6 |
| **D-AJ1.8** | ¿Nivel de verificación ASVS del informe? | **Resuelta (valor recomendado aprobado):** ASVS 5.0, Nivel 2 | Nivel 1: menos garantía; nivel 3: exige pruebas de penetración y revisión de terceros | §9.2 |
| **D-AJ1.9** | ¿El minuto de seguridad lo ven todos los usuarios autenticados? | **Resuelta (valor recomendado aprobado):** sí, por `/me/safety-minute` sin permiso adicional | Exigir `minuto_seguridad.ver` obliga a conceder el permiso a todos los roles | §6.3, §7 |
| **D-AJ1.10** | *(nueva, deriva de D-AJ1.1)* ¿Puede el usuario ocultar el minuto de seguridad? | **Resuelta (valor recomendado, a confirmar):** **no**. El bloque puede **reordenarse** pero no ocultarse: es un mensaje institucional. Su visibilidad solo depende de que haya mensaje hoy | Permitir ocultarlo haría que el mensaje pudiera no llegar a quien lo necesita | §4 RN-AJ1.3, §8.1, §8.2 |
| **D-AJ1.11** | *(nueva, deriva de D-AJ1.1)* ¿Qué pasa con el parámetro del sistema? | **Resuelta (valor recomendado, a confirmar):** `ui.inicio.tarjetas` se conserva como **composición por defecto** de quien no ha personalizado y como valor de «Restablecer». El administrador lo edita en Parámetros y afecta solo a quienes no personalizaron | Quitarlo: el valor por defecto quedaría fijo en el código, sin editor de administrador | §4 RN-AJ1.1, §5.3, §8.7 |

---

## 3. Historias de usuario y criterios de aceptación

### HU-AJ1-1 — Tarjetas del dashboard personalizables por usuario

**Como** usuario, **quiero** elegir qué bloques e indicadores muestra mi panel de Inicio y en qué orden, **para** ver primero lo que más uso.

- **AC-AJ1.1** Given un usuario autenticado, When abre «Personalizar panel» en Inicio, Then ve la lista de bloques y la de indicadores **a los que tiene acceso**, cada uno con un interruptor «Visible» (salvo el minuto de seguridad, D-AJ1.10) y botones para subir y bajar, con sus valores actuales.
- **AC-AJ1.2** Given que oculta «Oportunidades perdidas» y mueve «Forecast» al primer lugar, When guarda, Then `PUT /me/preferences/dashboard-cards` responde `200` y Inicio se muestra con ese orden de inmediato; When el mismo usuario entra desde otro navegador, Then ve el mismo panel.
- **AC-AJ1.3** Given una tarjeta visible por preferencia, When el usuario **no** tiene su permiso (p. ej. `forecast.ver`), Then no se muestra ni se pide: la preferencia solo puede **ocultar**, nunca conceder (RN-AJ1.3).
- **AC-AJ1.4** Given un cuerpo con una clave desconocida o repetida, o con una clave faltante, When se envía, Then `422 INVALID_DASHBOARD_CARDS` con `details[].issue`; sin cambios guardados.
- **AC-AJ1.5** Given que el usuario oculta todo lo que puede ocultar, When carga Inicio, Then ve lo que no es ocultable (el minuto de seguridad si hay mensaje hoy); Given que no queda nada visible, Then aparece el estado vacío «Tu panel no tiene bloques visibles» con la acción «Restablecer».
- **AC-AJ1.6** Given el orden guardado, Then se respeta en escritorio y en móvil (RN-AJ1.5).
- **AC-AJ1.7** Given «Restablecer», When el usuario confirma, Then `DELETE /me/preferences/dashboard-cards` responde `204` y Inicio vuelve a la composición por defecto (D-AJ1.11).
- **AC-AJ1.7b** Given un administrador con `parametros.editar`, When edita `ui.inicio.tarjetas` en Parámetros, Then cambia la composición por defecto: la ven quienes **no** personalizaron y no cambia el panel de quienes sí. Sin `parametros.editar`, `403`; sin token, `401`.

### HU-AJ1-2 — Minuto de seguridad

**Como** responsable de seguridad, **quiero** programar un mensaje de «minuto de seguridad» para una fecha, **para** que todos lo vean ese día en el panel de Inicio.

- **AC-AJ1.8** Given un usuario con `minuto_seguridad.crear`, When registra un mensaje para una fecha sin mensaje, Then `201`, aparece en la lista y queda `safety_minute.created`.
- **AC-AJ1.9** Given ya existe un mensaje para esa fecha, When registra otro, Then `409 SAFETY_MINUTE_DUPLICATE` con `details[0].field = "displayDate"`.
- **AC-AJ1.10** Given un mensaje vacío, solo espacios o de más de 1000 caracteres, When se guarda, Then `400 VALIDATION_FAILED`.
- **AC-AJ1.11** Given hoy es la fecha de un mensaje (zona `crm.zona_horaria_negocio`), When cualquier usuario autenticado abre Inicio y el bloque está visible por parámetro, Then ve el bloque «Minuto de seguridad» con el mensaje y la fecha; Given no hay mensaje para hoy, Then el bloque no aparece (D-AJ1.3).
- **AC-AJ1.12** Given un mensaje con `<script>` o HTML, When se muestra, Then se ve como texto literal (sin interpretar) y los saltos de línea se respetan (RN-AJ1.7).
- **AC-AJ1.13** Given un mensaje de una fecha **futura**, When se edita o se borra, Then `200` / `204` con su auditoría; Given uno de **hoy**, When se edita, Then `200`; When se borra, Then `409 SAFETY_MINUTE_LOCKED`; Given uno **pasado**, When se edita o se borra, Then `409 SAFETY_MINUTE_LOCKED` (D-AJ1.5).
- **AC-AJ1.14** Given la lista, When se filtra por rango de fechas, Then solo aparecen los mensajes de ese rango, ordenados por fecha descendente.
- **AC-AJ1.15** Given un usuario sin `minuto_seguridad.ver`, Then la opción «Minuto de seguridad» no aparece en su menú y `GET /safety-minutes` responde `403`; sin `crear`/`editar`/`eliminar`, la escritura correspondiente responde `403`; sin token, `401`.

### HU-AJ1-3 — Login solo con el nombre

**Como** usuario, **quiero** una pantalla de acceso limpia con solo el nombre de la aplicación en el panel de marca.

- **AC-AJ1.16** Given la pantalla `/acceso` en escritorio (`lg` o más), Then el panel de marca muestra solo «Mi Cliente AG» (y el fondo de marca), sin la descripción ni la lista «Acceso por roles y permisos / Administración centralizada / Auditoría de cambios».
- **AC-AJ1.17** Given el formulario, Then conserva sus textos funcionales (D-AJ1.6) y el inicio de sesión funciona igual.

### HU-AJ1-4 — Footer con Grupo AG

- **AC-AJ1.18** Given cualquier pantalla con footer (shell autenticado y pantalla de acceso), Then el texto es «© {año en curso} Grupo AG» (en 2026: «© 2026 Grupo AG»).

### HU-AJ1-5 — Informe de seguridad OWASP ASVS

**Como** área de ciberseguridad, **quiero** un informe de verificación contra OWASP ASVS con evidencia, **para** conocer el nivel de cumplimiento de la aplicación y sus brechas.

- **AC-AJ1.19** Given el informe `docs/security/asvs-5.0-L2-2026-10.md`, Then cubre **todos** los capítulos de ASVS 5.0 aplicables al nivel elegido, y cada requisito tiene estado (`Cumple` / `Parcial` / `No cumple` / `No aplica`), evidencia verificable (archivo:línea, configuración o prueba) y, si no cumple, la brecha y su remediación con prioridad.
- **AC-AJ1.20** Given el resumen ejecutivo, Then indica el nivel, la fecha, la versión del código (commit), el alcance, el porcentaje de cumplimiento por capítulo y las brechas de prioridad alta, en lenguaje para un lector no desarrollador.
- **AC-AJ1.21** Ningún requisito se marca `Cumple` sin evidencia; ningún dato real de clientes, colaboradores ni secretos aparece en el informe.

### HU-AJ1-6 — Botones de la barra superior parametrizables

- **AC-AJ1.22** Given el administrador con `parametros.editar`, When desactiva `ui.barra_superior.pantalla_completa`, Then tras recargar ningún usuario ve el botón de pantalla completa.
- **AC-AJ1.23** Given los valores sembrados (D-AJ1.4), Then en una instalación nueva buscar y notificaciones **no** se muestran y pantalla completa sí.
- **AC-AJ1.24** Given un parámetro activo, Then el botón se muestra solo si además se cumplen sus condiciones actuales (pantalla completa: navegador compatible y `lg` o más).

### HU-AJ1-7 — Tema por usuario

**Como** usuario, **quiero** que la aplicación recuerde si uso el tema claro u oscuro **en cualquier dispositivo**.

- **AC-AJ1.25** Given un usuario autenticado, When cambia el tema con el botón de la barra superior, Then se aplica al instante y `PUT /me/preferences/theme` guarda `dark` o `light`.
- **AC-AJ1.26** Given ese usuario entra desde otro navegador, When termina de cargar la sesión, Then se aplica el tema guardado.
- **AC-AJ1.27** Given un usuario sin preferencia guardada, Then se usa la del navegador (`localStorage` y, si no hay, `prefers-color-scheme`), como hoy.
- **AC-AJ1.28** Given el guardado falla (red o `5xx`), Then el tema queda aplicado en local y no se muestra un error bloqueante; el siguiente cambio vuelve a intentar.
- **AC-AJ1.29** Given un valor distinto de `light`/`dark`, When se envía, Then `400 VALIDATION_FAILED`; sin token, `401`. Un usuario no puede leer ni escribir preferencias de otro (no hay `{userId}` en la ruta).

---

## 4. Reglas de negocio

### Dashboard (AJ1-1)

| ID | Regla |
|---|---|
| RN-AJ1.1 | Cada usuario guarda su composición en `user_preferences` con `key = 'ui.inicio.tarjetas'` (D-AJ1.1). La **composición por defecto** es el parámetro del sistema `ui.inicio.tarjetas` (grupo `interfaz`, tipo `JSON`, editable con `parametros.editar`, D-AJ1.11). Sin preferencia del usuario, rige la composición por defecto |
| RN-AJ1.2 | Claves de bloque (lista cerrada): `safety-minute`, `hero`, `mine`, `kpis`, `alerts`, `activity`, `access`. Claves de indicador (lista cerrada): `projects-active` (K1), `opportunities-open` (K2), `opportunities-won` (K3), `opportunities-lost` (K4), `forecast` (K5), `visits-pending` (K6), `activities-pending` (K7), `activities-overdue` (K8), `targets` (K9). Cada clave aparece **exactamente una vez**; el orden del arreglo es el orden de pantalla. El mismo esquema vale para la preferencia y para el parámetro |
| RN-AJ1.3 | Un elemento se muestra solo si es **visible por preferencia (o por defecto)** y el usuario tiene su permiso actual (`dashboard.permissions.ts`); el minuto de seguridad, solo si hay mensaje hoy y **no es ocultable** (D-AJ1.10: su `visible` siempre es `true`; si llega `false` se normaliza a `true`). La preferencia nunca concede acceso |
| RN-AJ1.4 | Si el valor guardado (preferencia o parámetro) es ilegible o le faltan claves (p. ej. al añadir un indicador nuevo en una versión futura), el lector lo **normaliza**: descarta claves desconocidas y añade las que faltan al final como **visibles**, registra un aviso estructurado y nunca falla (mismo criterio que RN-07.35). Una preferencia ilegible cae a la composición por defecto |
| RN-AJ1.5 | Maquetación: en `md` o más, los bloques «medios» (`safety-minute`, `hero`, `mine`, `alerts`, `activity`) ocupan media fila y se emparejan con el siguiente bloque medio visible; `kpis` y `access` ocupan fila completa. En móvil, todos a ancho completo en el orden configurado. Sustituye a `rows(...)` y `MOBILE_ORDER` fijos de `HomePage.tsx` |
| RN-AJ1.6 | Valor por defecto sembrado = composición actual: bloques `safety-minute, hero, mine, kpis, alerts, activity, access` (todos visibles) e indicadores K1…K9 en su orden actual (todos visibles). La semilla no pisa un valor ya editado (comportamiento de `seedSystemParameters`) |
| RN-AJ1.6b | Personalizar el panel es una preferencia personal: no se audita ni se registra en logs (igual que el tema, RN-AJ1.18) |

### Minuto de seguridad (AJ1-2)

| ID | Regla |
|---|---|
| RN-AJ1.7 | El mensaje es **texto plano** de 1 a 1000 caracteres tras recortar; admite saltos de línea; no admite HTML (se guarda tal cual y se pinta como texto, nunca como HTML) |
| RN-AJ1.8 | Una fecha de visualización (`displayDate`, fecha sin hora) tiene **como máximo un mensaje** (índice único). Duplicado → `409 SAFETY_MINUTE_DUPLICATE` |
| RN-AJ1.9 | «Hoy» se calcula en la zona `crm.zona_horaria_negocio` (sembrada `America/Guatemala`), igual que los vencimientos del CRM |
| RN-AJ1.10 | Editables: mensajes de hoy y futuros (mensaje y fecha; la fecha nueva no puede ser pasada ni estar ocupada). Pasados: solo lectura → `409 SAFETY_MINUTE_LOCKED` (D-AJ1.5) |
| RN-AJ1.11 | Borrables: solo futuros (borrado físico). Hoy y pasados → `409 SAFETY_MINUTE_LOCKED`. El rastro queda en la auditoría |
| RN-AJ1.12 | No se puede crear un mensaje con fecha pasada → `422 SAFETY_MINUTE_PAST_DATE` |
| RN-AJ1.13 | Cada alta, edición y borrado queda auditado: `safety_minute.created`, `safety_minute.updated` (antes/después de `message` y `displayDate`), `safety_minute.deleted` (con el estado previo), `resourceType = 'safety_minute'` |

### Barra superior (AJ1-6)

| ID | Regla |
|---|---|
| RN-AJ1.14 | Parámetros booleanos del grupo `interfaz`: `ui.barra_superior.buscar` (sembrado `false`), `ui.barra_superior.pantalla_completa` (`true`), `ui.barra_superior.notificaciones` (`false`) (D-AJ1.4 a). Su descripción indica que buscar y notificaciones **aún no tienen función** |
| RN-AJ1.15 | El parámetro decide si el botón se **puede** mostrar; las condiciones técnicas actuales siguen aplicando (pantalla completa: API disponible y `lg` o más) |

### Tema (AJ1-7)

| ID | Regla |
|---|---|
| RN-AJ1.16 | Preferencia `ui.tema` en `user_preferences` (`value` JSON = `"light"` \| `"dark"`), una por usuario (`@@unique([userId, key])`). Sin fila = sin preferencia (D-AJ1.7 a) |
| RN-AJ1.17 | Precedencia al cargar: preferencia del servidor (con sesión) → `localStorage` (`app-theme`) → `prefers-color-scheme`. Al recibir la del servidor, también se escribe en `localStorage` para que la pantalla de acceso arranque con el mismo tema |
| RN-AJ1.18 | Cambiar el tema es una preferencia personal: **no** se audita (no cambia accesos ni datos de negocio) y no se registra en logs |

---

## 5. Modelo de datos

### 5.1 Tabla nueva `safety_minutes` (migración `<ts>_safety_minutes`, aditiva)

```prisma
/// Minuto de seguridad: un mensaje institucional por fecha de visualización (Ajustes 1, AJ1-2).
model SafetyMinute {
  id          String   @id @default(uuid()) @db.Uuid
  message     String   @db.VarChar(1000)
  displayDate DateTime @unique(map: "uq_safety_minutes_display_date") @map("display_date") @db.Date
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  updatedById String?  @map("updated_by_id") @db.Uuid

  createdBy User? @relation("SafetyMinuteCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User? @relation("SafetyMinuteUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@map("safety_minutes")
}
```

- Ajustar nombres, tipos de marca de tiempo y convención de relaciones a los modelos vecinos de `schema.prisma` (p. ej. `ExchangeRate`, `schema.prisma:944-963`).
- `CHECK` en SQL escrito a mano (como los del CRM): `ck_safety_minutes_message_not_blank` (`btrim(message) <> ''`).
- Rollback en `backend/prisma/rollbacks/<ts>_safety_minutes.down.sql` (`DROP TABLE safety_minutes`) y entrada en `backend/test/crm-rollbacks.e2e.spec.ts`, que exige un rollback por migración.
- Sin datos personales: el mensaje es institucional. Clasificación: interno.

### 5.2 Permisos y menú (semilla)

- Recurso `minuto_seguridad`, módulo `administracion`, acciones `ver`, `crear`, `editar`, `eliminar`, en `backend/prisma/seed/access-catalog.ts` (junto a `catalogos`, `parametros`…). El administrador los recibe por `'*'`.
- Opción de menú `admin-minuto-seguridad`: `{ moduleKey: 'administracion', label: 'Minuto de seguridad', icon: 'health_and_safety', path: '/administracion/minuto-seguridad', requiredPermission: 'minuto_seguridad.ver' }`, con un `sortOrder` coherente con las demás opciones de Administración.
- Ruta registrada en `backend/src/modules/access/app-routes.registry.json` (la semilla solo crea opciones con ruta registrada; una prueba compara el registro con `frontend/src/routes/app-routes.tsx`).
- Actualizar `backend/test/seeds.e2e.spec.ts` y los conteos de permisos que fije (el catálogo del CRM sigue en 41; el núcleo gana 4).

### 5.3 Parámetros nuevos (grupo `interfaz`, semilla esencial)

| Clave | Tipo | Valor sembrado | Regla (`parameter-rules.registry.ts`) | Editor |
|---|---|---|---|---|
| `ui.inicio.tarjetas` (composición **por defecto**, D-AJ1.11) | JSON | `{"blocks":[{"key":"safety-minute","visible":true},{"key":"hero","visible":true},{"key":"mine","visible":true},{"key":"kpis","visible":true},{"key":"alerts","visible":true},{"key":"activity","visible":true},{"key":"access","visible":true}],"kpis":[{"key":"projects-active","visible":true},…,{"key":"targets","visible":true}]}` | zod: dos arreglos de `{key, visible:boolean}`, claves de las listas cerradas de RN-AJ1.2, cada una exactamente una vez; `normalize` de RN-AJ1.4 para el lector | `dashboard-cards` |
| `ui.barra_superior.buscar` | BOOLEAN | `false` | booleano | — |
| `ui.barra_superior.pantalla_completa` | BOOLEAN | `true` | booleano | — |
| `ui.barra_superior.notificaciones` | BOOLEAN | `false` | booleano | — |

Ninguno exige `parametros.configurar` (no son estructurales ni de seguridad). Las listas cerradas de claves se definen **una sola vez** en el backend (constante exportada) y el editor las recibe por `GET /parameters` (`allowedValues` o metadatos del editor), sin copiarlas en el frontend.

### 5.4 Preferencias de usuario

Sin cambios de esquema: se usa `user_preferences` (`schema.prisma:576-587`, `@@unique([userId, key])`) con dos claves: `ui.tema` y `ui.inicio.tarjetas` (el `value` es JSON: `"light"`/`"dark"` y la composición de RN-AJ1.2). Hacen falta un puerto `UserPreferencesRepository` en `access` y su adaptador Prisma. El borrado de `ui.inicio.tarjetas` es físico (restablecer).

### 5.5 Documentación del modelo

`docs/database/data-model.md`: tabla `safety_minutes`, uso de `user_preferences` (`ui.tema`) y parámetros `ui.*`.

---

## 6. Contrato de API

Todo bajo `/api/v1`, con el formato de error de `API-STANDARDS.md`, documentado en OpenAPI y con DTOs (nunca el modelo Prisma).

### 6.1 Configuración de interfaz del usuario (nuevo)

`GET /me/ui-settings` — `@AuthenticatedOnly('El recurso es la configuración de interfaz de la sesión')`.

Respuesta `200`:

```json
{
  "dashboard": {
    "isCustomized": false,
    "blocks": [{ "key": "safety-minute", "visible": true }, { "key": "hero", "visible": true }],
    "kpis": [{ "key": "projects-active", "visible": true }]
  },
  "topbar": { "search": false, "fullscreen": true, "notifications": false }
}
```

- `dashboard` es la composición **efectiva del usuario**: su preferencia si existe y es válida, si no el parámetro por defecto; ya normalizada (RN-AJ1.4) y con `safety-minute` siempre visible (RN-AJ1.3). **No** filtra por permisos: el frontend combina visibilidad y permiso; el backend sigue protegiendo cada endpoint de datos.
- Incluye `dashboard.isCustomized: boolean` (si viene de la preferencia del usuario) para mostrar «Restablecer».
- No expone ningún otro parámetro. Errores: `401`.

### 6.2 Mantenimiento del minuto de seguridad (nuevo, módulo `safety-minutes`)

| Método | Ruta | Permiso | Contrato | Errores propios |
|---|---|---|---|---|
| GET | `/safety-minutes` | `minuto_seguridad.ver` | Query `from?`/`to?` (`YYYY-MM-DD`, `from ≤ to`), `page`, `pageSize`, `sortBy` (`displayDate` por defecto \| `createdAt` \| `updatedAt`), `sortOrder` (`desc` por defecto). Respuesta `{data, pagination}` de `SafetyMinuteResponseDto` | `400 VALIDATION_FAILED` |
| GET | `/safety-minutes/{id}` | `minuto_seguridad.ver` | `SafetyMinuteResponseDto` | `404` |
| POST | `/safety-minutes` | `minuto_seguridad.crear` | `CreateSafetyMinuteDto { message (1–1000, recortado), displayDate (YYYY-MM-DD) }` → `201` + `Location` | `409 SAFETY_MINUTE_DUPLICATE`, `422 SAFETY_MINUTE_PAST_DATE` |
| PATCH | `/safety-minutes/{id}` | `minuto_seguridad.editar` | `UpdateSafetyMinuteDto { message?, displayDate? }` → `200` | `404`, `409 SAFETY_MINUTE_DUPLICATE`, `409 SAFETY_MINUTE_LOCKED`, `422 SAFETY_MINUTE_PAST_DATE` |
| DELETE | `/safety-minutes/{id}` | `minuto_seguridad.eliminar` | `204` | `404`, `409 SAFETY_MINUTE_LOCKED` |

`SafetyMinuteResponseDto`: `{ id, message, displayDate, editable, deletable, createdAt, updatedAt, updatedBy: { id, displayName } | null }`. `editable` y `deletable` los calcula el servidor (RN-AJ1.10–11) para que la interfaz no duplique la regla.

### 6.3 Minuto de seguridad del día (nuevo)

`GET /me/safety-minute` — `@AuthenticatedOnly('Mensaje institucional visible para toda sesión')` (D-AJ1.9 a).

- `200 { "safetyMinute": { "displayDate": "2026-10-14", "message": "…" } }`, o `200 { "safetyMinute": null }` si hoy no hay mensaje. La ausencia no es un error.
- Respuesta mínima: sin autor ni identificadores internos.

### 6.4 Preferencias del usuario (nuevo)

| Método | Ruta | Acceso | Contrato |
|---|---|---|---|
| GET | `/me/preferences` | `@AuthenticatedOnly` | `200 { "theme": "light" \| "dark" \| null, "dashboardCards": { blocks, kpis } \| null }` (la preferencia cruda, `null` si no existe) |
| PUT | `/me/preferences/theme` | `@AuthenticatedOnly` | Cuerpo `{ "value": "light" \| "dark" }` → `200 { "theme": "dark" }` (crea o reemplaza). `400` si el valor no es válido |
| PUT | `/me/preferences/dashboard-cards` | `@AuthenticatedOnly` | Cuerpo `{ blocks: [{key, visible}], kpis: [{key, visible}] }` (RN-AJ1.2) → `200` con la composición guardada. `422 INVALID_DASHBOARD_CARDS` si hay claves desconocidas, repetidas o faltantes; `400` si el cuerpo no es válido |
| DELETE | `/me/preferences/dashboard-cards` | `@AuthenticatedOnly` | `204`; sin preferencia previa también `204` (idempotente) |

El usuario sale siempre de la sesión: no hay `{userId}` en la ruta (evita IDOR).

### 6.5 Cambios en endpoints existentes

- `GET /parameters` y `PATCH /parameters/{key}`: incluyen los parámetros de §5.3 sin cambiar el contrato. El parámetro `ui.inicio.tarjetas` (composición por defecto) trae `editor: "dashboard-cards"`.

### 6.6 Códigos de error nuevos

`INVALID_DASHBOARD_CARDS` (422, `details[].issue`: `unknown_key` \| `duplicated_key` \| `missing_key`), `SAFETY_MINUTE_DUPLICATE` (409), `SAFETY_MINUTE_LOCKED` (409, `details[0].reason`: `past` \| `today`), `SAFETY_MINUTE_PAST_DATE` (422). Se reutilizan `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `PERMISSION_DENIED` e `INVALID_PARAMETER_VALUE`. Todos con mensaje en español en `describeApiError` (`frontend/src/features/admin/common/admin-api.ts`).

---

## 7. Autorización

| Operación | Decisión | Prueba obligatoria |
|---|---|---|
| `GET /me/ui-settings`, `GET /me/safety-minute`, `GET`/`PUT`/`DELETE /me/preferences*` | Autenticado, recurso del propio usuario o mensaje institucional (`@AuthenticatedOnly` con justificación, D-AJ1.9) | `401` sin token |
| Mantenimiento de minutos de seguridad | `minuto_seguridad.ver/crear/editar/eliminar` con `@RequirePermission` (deny-by-default) | `401` y `403` por operación |
| Parámetros `ui.*` (incluida la composición por defecto) | `parametros.ver` / `parametros.editar` (existentes) | `403` sin `parametros.editar` |
| Visibilidad de tarjetas | La preferencia del usuario y el parámetro por defecto solo ocultan; cada tarjeta sigue exigiendo su permiso en el frontend (`useCan`) y su endpoint en el backend | Prueba de que una tarjeta visible sin permiso no se pinta ni se pide |

Sin cambios en roles ni en ADR-020: no es asignación de acceso.

---

## 8. Frontend

Todo con el shell, `PageHeader`, los cuatro estados (cargando, vacío, error, sin permiso), RHF + Zod, TanStack Query y valores del tema (**ni un hex, duración ni píxel a mano**, ADR-017).

### 8.1 Inicio (`HomePage.tsx`)

- Nuevo hook `useUiSettings()` (`GET /me/ui-settings`, `staleTime` de 5 minutos; se invalida al guardar o restablecer la personalización del panel y al guardar un parámetro `ui.*` en Parámetros).
- Sustituir `rows(...)` y `MOBILE_ORDER` fijos por una composición derivada de `dashboard.blocks` (RN-AJ1.5) filtrada por permiso (RN-AJ1.3). Mientras carga la configuración, el orden por defecto (RN-AJ1.6); si falla, también el orden por defecto, sin bloquear el panel.
- `KpiGrid.tsx`: orden y visibilidad de K1–K9 desde `dashboard.kpis`, combinados con el permiso de cada indicador.
- Estado vacío nuevo (AC-AJ1.5) con la acción «Restablecer».
- **Personalizar panel** (nuevo, D-AJ1.1): botón en la cabecera de Inicio que abre un diálogo (`DashboardCustomizeDialog.tsx`) con dos listas, Bloques e Indicadores, solo con los elementos a los que el usuario tiene acceso; cada fila con etiqueta legible, interruptor «Visible» (el minuto de seguridad, sin interruptor y con la nota «Mensaje institucional: siempre visible», D-AJ1.10) y botones subir/bajar accesibles (sin arrastrar y soltar, que exigiría librería y ADR). Guardar = `PUT /me/preferences/dashboard-cards` con la lista **completa** (las claves a las que el usuario no tiene acceso se conservan tal cual, para que un cambio posterior de permisos no las pierda). «Restablecer» = `DELETE` tras confirmación, solo si `dashboard.isCustomized`. Cuatro estados, móvil primero, foco gestionado al abrir y cerrar.

### 8.2 Bloque «Minuto de seguridad» (`features/dashboard/components/SafetyMinuteCard.tsx`, nuevo)

- `GET /me/safety-minute`; no se pinta si `safetyMinute` es `null` (D-AJ1.3 a) ni mientras carga (sin salto de maquetación: reservar el hueco solo cuando haya dato).
- Título «Minuto de seguridad», fecha formateada en español y mensaje como **texto** (`Typography` con `white-space: pre-line` vía `sx` del tema); prohibido `dangerouslySetInnerHTML`.
- Icono y color de acento del tema (p. ej. `health_and_safety` con el color de advertencia/información de `tokens.ts`); `role="region"` con `aria-labelledby`.

### 8.3 Mantenimiento (`features/admin/safety-minutes/`, nuevo)

Estructura igual que `features/admin/exchange-rates/`: `SafetyMinutesPage.tsx`, `safety-minutes.api.ts`, `.queries.ts`, `.schemas.ts`, `.permissions.ts`, `.errors.ts`, `components/SafetyMinuteFormDialog.tsx` y specs.

- Lista con filtros Desde/Hasta en la URL; columnas Fecha, Mensaje (truncado con el texto completo en el detalle), Actualizado por y fecha; tarjetas por debajo de `sm`.
- Alta y edición: `displayDate` (`<input type="date">` nativo, sin librería, como D-04.1), `message` multilínea con contador de 1000.
- Acciones según `editable`/`deletable` del servidor; borrar con diálogo de confirmación.
- Ruta `/administracion/minuto-seguridad` en `admin-routes.ts` y `route-paths.ts`, con permiso `minuto_seguridad.ver` y carga diferida.

### 8.4 Barra superior (`Topbar.tsx`)

- Leer `topbar` de `useUiSettings()`: cada botón se pinta solo si su parámetro es `true` (y sus condiciones actuales, RN-AJ1.15). Mientras carga, se ocultan buscar y notificaciones y se muestra pantalla completa (valores sembrados) para evitar parpadeo.
- Sin cambios en la función de los botones (fuera de alcance, §1.3).

### 8.5 Login (`LoginPage.tsx`, `AuthLayout.tsx`)

- Eliminar `PANEL_DESCRIPTION` y `PANEL_FEATURES` y las props o secciones de `AuthLayout` que solo existían para ellos; el panel de marca conserva el nombre y el fondo.
- Revisar los E2E y specs que buscan esos textos.

### 8.6 Footer y tema

- `theme/tokens.ts`: `brandIdentity.companyName = 'Grupo AG'`. `AppShell.tsx:88` y `AuthLayout.tsx:240`: `© {new Date().getFullYear()} {brandIdentity.companyName}`.
- `stores/ui.store.ts` y un hook `useThemePreferenceSync()` montado en el shell autenticado: tras cargar la sesión, `GET /me/preferences`; si trae `theme`, aplicarlo y escribir `localStorage` (RN-AJ1.17). `toggleThemeMode` aplica en local al instante y lanza `PUT /me/preferences/theme` (mutación sin bloqueo; si falla, se registra en consola de desarrollo y se reintenta en el siguiente cambio, AC-AJ1.28).
- Actualizar el comentario de `ui.store.ts:6-9`, que anticipaba el paso a `UserPreference`.

### 8.7 Parámetros (`features/admin/parameters/`)

- Nuevo editor `components/editors/DashboardCardsEditor.tsx` para `editor = "dashboard-cards"` (composición **por defecto**, D-AJ1.11): reutiliza la lista reordenable del diálogo de personalización (`DashboardCardsList`, componente compartido), con todos los bloques e indicadores y una nota: «Es la composición de quienes no personalizaron su panel». El minuto de seguridad aparece sin interruptor.
- Grupo visual «Interfaz» en `parameter-sections.ts` con los cuatro parámetros; la descripción de buscar y notificaciones avisa de que aún no tienen función.

---

## 9. Seguridad

### 9.1 Revisión del cambio (skill `security`)

- **XSS:** el mensaje del minuto de seguridad es entrada de usuario mostrada a **todos**: solo texto, nunca HTML (RN-AJ1.7, AC-AJ1.12); prueba RTL con `<img src=x onerror=…>` que verifica que no se crea el elemento.
- **IDOR:** preferencias sin `{userId}` en la ruta; el usuario sale del token.
- **Autorización:** deny-by-default en el mantenimiento; los parámetros `ui.*` no conceden acceso a datos (RN-AJ1.3).
- **Validación:** DTOs con `whitelist` y `forbidNonWhitelisted` (global), longitudes máximas, fechas `YYYY-MM-DD`, valores cerrados del tema.
- **Exposición:** `GET /me/ui-settings` y `/me/safety-minute` devuelven solo lo necesario, sin identificadores internos ni autores.
- **Auditoría:** RN-AJ1.13; sin PII en logs.

### 9.2 Informe OWASP ASVS (entregable AJ1-5)

**Archivo:** `docs/security/asvs-5.0-L2-2026-10.md` (y enlazarlo desde `docs/security/README.md` y `SECURITY.md`). **Estándar:** OWASP ASVS **5.0**, **Nivel 2** (D-AJ1.8). El informe se redacta **para el área de ciberseguridad**, no para desarrolladores.

**Estructura obligatoria:**

1. **Resumen ejecutivo** (una página): alcance, nivel, fecha, commit verificado, porcentaje de cumplimiento por capítulo, brechas de prioridad alta y conclusión.
2. **Alcance y método:** componentes (SPA React, API NestJS, PostgreSQL, NGINX, despliegue Docker y QA en Windows Server, ADR-026), qué se revisó (código, configuración, pruebas automatizadas existentes), qué **no** (pruebas de penetración externas, infraestructura de producción no disponible) y cómo se determinó cada estado.
3. **Matriz de verificación por capítulo de ASVS 5.0:** V1 Encoding and Sanitization, V2 Validation and Business Logic, V3 Web Frontend Security, V4 API and Web Service, V5 File Handling, V6 Authentication, V7 Session Management, V8 Authorization, V9 Self-contained Tokens, V10 OAuth and OIDC, V11 Cryptography, V12 Secure Communication, V13 Configuration, V14 Data Protection, V15 Secure Coding and Architecture, V16 Security Logging and Error Handling, V17 WebRTC (previsiblemente `No aplica`). Una fila por requisito de nivel ≤ 2 con: identificador ASVS, requisito resumido, estado, evidencia (archivo:línea, configuración o prueba que lo demuestra) y observación.
4. **Brechas y plan de remediación:** por brecha, riesgo, prioridad (Alta / Media / Baja), remediación propuesta y responsable sugerido. Las de prioridad alta se proponen como historias.
5. **Riesgos aceptados:** p. ej. el de QA documentado en ADR-025 (rol de la aplicación propietario de `audit_logs`).
6. **Anexo:** inventario de controles con referencia (ver abajo) y relación con la tabla OWASP Top 10 de `SECURITY.md` §3.

**Punto de partida verificado** (el informe debe **comprobar** cada punto en el commit que analiza, no copiarlo):

| Control | Evidencia actual |
|---|---|
| Hash de contraseñas Argon2id | `backend/src/modules/auth/password.service.ts` |
| Bloqueo de cuenta y caducidad de contraseña | parámetros `seguridad.*`, `AuthRepository.getSecuritySettings` (ADR-019) |
| Límite de peticiones (API y login) | `app.module.ts:45-53` (Throttler), `auth.controller.ts:32`; NGINX `limit_req` (`infrastructure/nginx/nginx.conf:68`, `conf.d/app.conf:34`) |
| Cabeceras de seguridad y CSP | `infrastructure/nginx/conf.d/security-headers.conf` (HSTS **comentado** en la línea 18; CSP con `style-src 'unsafe-inline'`), `helmet()` en `backend/src/main.ts:27` |
| CORS con lista blanca | `backend/src/main.ts:29-34`, `CORS_ALLOWED_ORIGINS` |
| Autorización deny-by-default | `PermissionsGuard`, `@RequirePermission`, `@RequireAnyPermission`, `@AuthenticatedOnly` (ADR-008) |
| Asignación de accesos solo por administrador | ADR-020 y addendum |
| Bitácora inmutable | disparadores de ADR-025; recomendación de roles en `docs/deployment/environments.md` |
| Adjuntos | ADR-021 (firma verificada, tamaño, descarga solo por API tras autorizar) |
| Validación de entrada | `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted` |
| Exportaciones CSV | neutralización de fórmulas y entrecomillado (`backend/src/common/csv.ts`) |
| Secretos | `.env.example` sin valores reales; `SECURITY.md` §4 |
| `Cache-Control: no-store` en la API | `infrastructure/nginx/conf.d/app.conf:55` |

**Reglas del informe:** ningún `Cumple` sin evidencia comprobada; nada de datos reales de clientes, colaboradores o proveedores, ni secretos, ni URLs internas sensibles; los requisitos que no se puedan verificar desde el repositorio (p. ej. TLS de producción) se marcan `Parcial` o `No verificable` con la acción para verificarlos. Cuando termine, actualizar `docs/security/README.md` (índice) y el changelog.

---

## 10. Plan de pruebas

Niveles según `TESTING.md`. Integración siempre con un `INTEGRATION_SCHEMA` propio.

### Positivas

| ID | Caso | Nivel | AC |
|---|---|---|---|
| PF-AJ1.1 | Regla de `ui.inicio.tarjetas`: valor válido, normalización con claves faltantes y desconocidas | Unitaria (registro) | AC-AJ1.4, RN-AJ1.4 |
| PF-AJ1.2 | `GET /me/ui-settings`: por defecto, tras editar el parámetro (quien no personalizó lo ve), con preferencia propia (prevalece y `isCustomized = true`) y con preferencia ilegible (cae al valor por defecto) | Integración | AC-AJ1.2, AC-AJ1.7b, AC-AJ1.22 |
| PF-AJ1.3 | Composición de Inicio por orden y visibilidad, en escritorio y móvil; indicador visible sin permiso no se pinta ni se pide | RTL | AC-AJ1.3, AC-AJ1.5, AC-AJ1.6 |
| PF-AJ1.4 | Diálogo «Personalizar panel»: ocultar, reordenar, guardar y restablecer; el minuto no se puede ocultar; solo lista lo permitido y conserva las claves sin acceso | RTL | AC-AJ1.1, AC-AJ1.2, AC-AJ1.7 |
| PF-AJ1.4b | `PUT`/`DELETE /me/preferences/dashboard-cards`: guardar, reemplazar, restablecer (idempotente) y aislamiento entre usuarios (el panel de uno no cambia el de otro) | Integración | AC-AJ1.2, AC-AJ1.7 |
| PF-AJ1.4c | Editor `DashboardCardsEditor` del parámetro por defecto | RTL | AC-AJ1.7b |
| PF-AJ1.5 | Ciclo de vida de un minuto de seguridad futuro: alta, edición, borrado, con auditoría | Integración | AC-AJ1.8, AC-AJ1.13 |
| PF-AJ1.6 | `GET /me/safety-minute` hoy (zona de negocio) y sin mensaje | Integración (+ unitaria del cálculo de "hoy") | AC-AJ1.11 |
| PF-AJ1.7 | Bloque del minuto: se muestra con mensaje, no se muestra sin él, el HTML se ve como texto | RTL | AC-AJ1.11, AC-AJ1.12 |
| PF-AJ1.8 | Pantalla de mantenimiento: filtros, alta, edición y borrado según `editable`/`deletable` | RTL | AC-AJ1.13, AC-AJ1.14 |
| PF-AJ1.9 | Login: el panel de marca solo muestra el nombre | RTL | AC-AJ1.16 |
| PF-AJ1.10 | Footer «© {año} Grupo AG» en shell y login | RTL | AC-AJ1.18 |
| PF-AJ1.11 | Barra superior según `topbar` | RTL | AC-AJ1.22–24 |
| PF-AJ1.12 | `GET`/`PUT /me/preferences/theme` crea y reemplaza la fila | Integración | AC-AJ1.25 |
| PF-AJ1.13 | Sincronización del tema: aplica la del servidor, cae a local, no bloquea si el guardado falla | Unitaria (store) + RTL | AC-AJ1.26–28 |

### Negativas

| ID | Caso | Esperado | AC |
|---|---|---|---|
| PF-AJ1.14 | Minuto duplicado por fecha (alta y edición) | `409 SAFETY_MINUTE_DUPLICATE` | AC-AJ1.9 |
| PF-AJ1.15 | Mensaje vacío, solo espacios o de 1001 caracteres; fecha inválida | `400` | AC-AJ1.10 |
| PF-AJ1.16 | Crear con fecha pasada | `422 SAFETY_MINUTE_PAST_DATE` | RN-AJ1.12 |
| PF-AJ1.17 | Editar uno pasado; borrar uno de hoy o pasado | `409 SAFETY_MINUTE_LOCKED` | AC-AJ1.13 |
| PF-AJ1.18 | `401` y `403` en cada endpoint de `/safety-minutes`; `401` en los cuatro de `/me/*` nuevos | `401` / `403` | AC-AJ1.15, AC-AJ1.29 |
| PF-AJ1.19 | `PATCH /parameters/ui.inicio.tarjetas` y `PUT /me/preferences/dashboard-cards` con clave desconocida, repetida o faltante; el `PATCH` sin `parametros.editar` | `422` (`INVALID_PARAMETER_VALUE` / `INVALID_DASHBOARD_CARDS`) / `403` | AC-AJ1.4, AC-AJ1.7b |
| PF-AJ1.20 | `PUT /me/preferences/theme` con `"blue"` o campos extra | `400` | AC-AJ1.29 |
| PF-AJ1.21 | Disparo concurrente de dos altas para la misma fecha | Una `201` y otra `409` (índice único) | RN-AJ1.8 |

### Migración y semillas

- PF-AJ1.22: la migración `safety_minutes` y su rollback (en `crm-rollbacks.e2e.spec.ts`); `prisma migrate diff` sin deriva.
- PF-AJ1.23: la semilla crea los cuatro permisos, la opción de menú (solo con la ruta registrada) y los cuatro parámetros, y es idempotente sin pisar valores editados (`seeds.e2e.spec.ts`).

### E2E (Playwright, entorno aislado como los de los módulos)

- PF-AJ1.24: el administrador registra el minuto de seguridad de hoy; un asesor entra y lo ve, personaliza su panel (oculta un indicador y sube el minuto al primer lugar), recarga y lo conserva, entra desde un contexto de navegador nuevo y lo ve igual; otro usuario conserva el panel por defecto; el asesor restablece y vuelve a la composición por defecto.
- PF-AJ1.25: un usuario cambia a tema oscuro, cierra sesión, entra en un contexto de navegador nuevo y el tema oscuro se aplica.
- Ajustar los E2E existentes que busquen los textos retirados del login o el footer anterior (`admin-access`, `auth-local`, `smoke`).

---

## 11. Observabilidad

- Aviso estructurado (`warn`, sin PII) cuando el lector normaliza un `ui.inicio.tarjetas` ilegible (RN-AJ1.4), con la clave del parámetro y el motivo.
- Eventos de auditoría de RN-AJ1.13 y `parameter.updated` (existente) para los parámetros `ui.*`.
- Ningún log con el contenido de preferencias ni con el mensaje completo.

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Parpadeo del dashboard o de la barra superior mientras carga `ui-settings` | Valores por defecto = valores sembrados; `staleTime` de 5 minutos |
| Un administrador oculta todo el panel | Estado vacío explícito (AC-AJ1.5); el parámetro se puede revertir |
| Mostrar botones sin función si se activan buscar o notificaciones | Sembrados en `false` y aviso en el editor (D-AJ1.4) |
| Zona horaria: «hoy» distinto entre servidor y usuario | Siempre la zona de negocio (RN-AJ1.9), igual que el CRM |
| El informe ASVS se percibe como certificación | El resumen deja claro que es autoverificación interna de nivel 2 sin prueba de penetración externa |
| E2E rotos por textos del login y el footer | Ajustarlos en el mismo cambio |

---

## 13. Pasos (orden de implementación)

Cada paso termina con `typecheck`, `lint` y las pruebas de su nivel en verde.

1. **Cosméticos (Fast Path, CLAUDE.md §9):** AJ1-3 (login) y AJ1-4 (footer), con sus specs y E2E ajustados.
2. **Base de datos y semilla:** migración `safety_minutes` + rollback; permisos, opción de menú, ruta registrada y parámetros `ui.*` con sus reglas en el registro.
3. **Backend:** módulo `safety-minutes` (puerto, adaptador Prisma, servicio con RN-AJ1.7–13, controlador, DTOs, OpenAPI); `GET /me/ui-settings`, `GET /me/safety-minute`, `GET`/`PUT /me/preferences*` en el módulo `access` (puertos `UserPreferencesRepository` y lectura de parámetros por `ParameterReader`). Unitarias e integración.
4. **Frontend:** `useUiSettings`, composición de Inicio y `KpiGrid`, diálogo «Personalizar panel», `SafetyMinuteCard`, barra superior, sincronización del tema, mantenimiento de minutos de seguridad, `DashboardCardsEditor` (valor por defecto) y grupo «Interfaz» en Parámetros. Specs RTL.
5. **E2E** PF-AJ1.24 y PF-AJ1.25.
6. **Informe ASVS** (AJ1-5): puede hacerse en paralelo a los pasos 2–5, pero se **cierra** sobre el commit final para que la evidencia corresponda al código entregado.
7. **Revisión de código y de seguridad** (skills `code-review` y `security`) y correcciones.
8. **Documentación:** `docs/api/README.md` (endpoints y códigos nuevos), `docs/database/data-model.md`, `frontend/src/features/admin/README.md`, `docs/security/README.md`, `SECURITY.md` (enlace al informe), `CHANGELOG.md`, y §14 de este documento (desviaciones).

---

## 14. Archivos

### Backend — nuevos

| Archivo | Contenido |
|---|---|
| `backend/prisma/migrations/<ts>_safety_minutes/migration.sql` + `backend/prisma/rollbacks/<ts>_safety_minutes.down.sql` | Tabla, índice único, `CHECK` |
| `backend/src/modules/safety-minutes/` (`safety-minutes.module.ts`, `safety-minutes.controller.ts`, `safety-minutes.service.ts` + spec, `safety-minute-rules.ts` + spec, `dto/safety-minute.dto.ts`, `ports/safety-minute.repository.port.ts`) | Mantenimiento y lectura del día |
| `backend/src/infrastructure/database/prisma/repositories/prisma-safety-minutes.repository.ts` | Adaptador (`P2002` → `409 SAFETY_MINUTE_DUPLICATE`) |
| `backend/src/modules/access/user-preferences.service.ts` + spec, `ports/user-preferences.repository.port.ts`, `dto/user-preferences.dto.ts`, `dto/ui-settings.dto.ts` | Preferencias y configuración de interfaz |
| `backend/src/infrastructure/database/prisma/repositories/prisma-user-preferences.repository.ts` | Adaptador |
| `backend/test/safety-minutes.e2e.spec.ts`, `backend/test/me-settings.e2e.spec.ts` | Integración |

### Backend — modificar

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema.prisma` | Modelo `SafetyMinute` y relaciones en `User` |
| `backend/src/modules/access/me.controller.ts` | `GET /me/ui-settings`, `GET /me/safety-minute`, `GET /me/preferences`, `PUT /me/preferences/theme`, `PUT`/`DELETE /me/preferences/dashboard-cards` |
| `backend/src/modules/parameters/parameter-rules.registry.ts` (+ spec) | Reglas de los cuatro parámetros `ui.*` y editor `dashboard-cards` |
| `backend/prisma/seed/access-catalog.ts` | Recurso `minuto_seguridad`, opción `admin-minuto-seguridad`, parámetros `ui.*` |
| `backend/src/modules/access/app-routes.registry.json` | `/administracion/minuto-seguridad` |
| `backend/src/app.module.ts` | Registro del módulo `safety-minutes` |
| `backend/test/seeds.e2e.spec.ts`, `backend/test/crm-rollbacks.e2e.spec.ts`, `backend/test/parameters.e2e.spec.ts` | Semilla, rollback y parámetros nuevos |

### Frontend — nuevos

| Archivo | Contenido |
|---|---|
| `frontend/src/features/dashboard/components/SafetyMinuteCard.tsx` (+ spec) | Bloque del minuto de seguridad |
| `frontend/src/features/dashboard/dashboard-layout.ts` (+ spec) | Composición por orden y visibilidad (RN-AJ1.5) |
| `frontend/src/services/ui-settings/` (`ui-settings.api.ts`, `use-ui-settings.ts`) | Lectura de `/me/ui-settings` |
| `frontend/src/services/preferences/` (`preferences.api.ts`, `use-theme-preference-sync.ts` + spec) | Tema por usuario |
| `frontend/src/features/admin/safety-minutes/` (página, api, queries, schemas, permissions, errors, `components/SafetyMinuteFormDialog.tsx`, specs) | Mantenimiento |
| `frontend/src/features/dashboard/components/DashboardCustomizeDialog.tsx` + `DashboardCardsList.tsx` (+ specs) | Personalización por usuario y lista reordenable compartida |
| `frontend/src/features/admin/parameters/components/editors/DashboardCardsEditor.tsx` (+ spec) | Editor del parámetro por defecto |
| `frontend/tests/e2e/ajustes-1.e2e.spec.ts` | PF-AJ1.24, PF-AJ1.25 |

### Frontend — modificar

| Archivo | Cambio |
|---|---|
| `frontend/src/routes/pages/HomePage.tsx` | Composición desde `ui-settings` |
| `frontend/src/features/dashboard/components/KpiGrid.tsx` | Orden y visibilidad de K1–K9 |
| `frontend/src/components/layout/Topbar.tsx` | Botones según `topbar` |
| `frontend/src/components/layout/AppShell.tsx`, `frontend/src/features/auth/AuthLayout.tsx`, `frontend/src/theme/tokens.ts` | Footer con `companyName` |
| `frontend/src/routes/pages/LoginPage.tsx`, `frontend/src/features/auth/AuthLayout.tsx` | Panel de marca solo con el nombre |
| `frontend/src/stores/ui.store.ts` | Sincronización con el servidor |
| `frontend/src/features/admin/parameters/parameter-sections.ts`, `components/ParameterEditDialog.tsx` | Grupo «Interfaz» y editor `dashboard-cards` |
| `frontend/src/features/admin/admin-routes.ts`, `frontend/src/routes/route-paths.ts` | Ruta del mantenimiento |
| `frontend/src/features/admin/common/admin-api.ts` | Mensajes de los códigos nuevos |
| `frontend/tests/e2e/*` afectados | Textos del login y footer |

### Documentación

`docs/security/asvs-5.0-L2-2026-10.md` (nuevo), `docs/security/README.md`, `SECURITY.md`, `docs/api/README.md`, `docs/database/data-model.md`, `frontend/src/features/admin/README.md`, `CHANGELOG.md`.

---

## 15. Definition of Ready y Definition of Done

**Ready** (antes de empezar): decisiones de §2 resueltas y anotadas aquí con fecha; este documento pasa a «aprobado».

**Done** (CLAUDE.md §7): todos los AC verificados por pruebas; `pnpm build`, `typecheck`, `lint`, unitarias, integración y E2E en verde; `401`/`403` probados en cada endpoint nuevo; OpenAPI y documentación actualizados; migración con rollback; revisión de código y de seguridad hechas; informe ASVS entregado sobre el commit final; sin secretos ni datos personales en código, pruebas o informe.

---

## 16. Desviaciones de la implementación

*(Se completa al implementar.)*
