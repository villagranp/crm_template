# ADR-027 - SSO con Microsoft Entra ID: alta al primer ingreso sin permisos, vinculación por `oid` y corte directo

## Status

Accepted — 2026-10-15

Proyecto: Mi Cliente AG. Decisiones del responsable del proyecto (2026-10-15). Concreta el plan de
migración de [ADR-019](ADR-019-autenticacion-local-con-migracion-a-entra.md) y lo que
[ADR-007](ADR-007-entra-id.md) dejó abierto (cómo se traduce una identidad de Entra ID a una
cuenta local). Se relaciona con [ADR-006](ADR-006-authentication-architecture.md),
[ADR-008](ADR-008-authorization.md), [ADR-018](ADR-018-identity-access-model.md) y
[ADR-020](ADR-020-asignacion-de-accesos-exclusiva-del-administrador.md). Es un ADR nuevo que **aclara y
completa** a ADR-007, ADR-019 y ADR-020 mediante un addendum a cada uno (ver «Relación con otros ADR»); no
reescribe ni contradice ninguno.

## Context

ADR-019 arrancó el CRM con autenticación local (`AUTH_PROVIDER=local`) porque el equipo no administraba el
tenant, y fijó el destino: Microsoft Entra ID. Su plan de migración decía, en cuatro pasos, «crear la fila de
`user_identities` de cada usuario con su `oid`», «ventana con `AUTH_PROVIDER=hybrid` y su propio ADR» y
«revocar las credenciales locales». Dejó sin responder:

1. **Qué pasa con una persona del directorio que entra y no tiene cuenta.** El proveedor de Entra ID
   (`EntraIdAuthenticationProvider`) ya verifica firma, `iss`, `aud`, `exp`, `nbf` y `tid`, pero un token
   válido solo prueba *quién es*, no que tenga cuenta en el CRM. Hasta ahora el código no creaba usuarios
   («necesita su propio ADR») y, sin vínculo, **caía a buscar por correo** (`findUserIdForPrincipal` →
   `findUserByEmail`): útil en modo local, peligroso con un directorio externo (ver «Alternativas»).
2. **Si hace falta `hybrid`.** ADR-019 lo previó solo para la ventana de migración y exigía responder
   «precedencia entre proveedores, qué ocurre con un correo presente en ambos y duración de la ventana».
3. **Cómo se retiran las credenciales locales** sin dejar fuera a nadie.
4. **Quién da de baja** a quien sale de la organización.

El CRM es interno: sus usuarios son personal de Grupo AG con cuenta corporativa. Los permisos no salen del
token sino de la base (ADR-008, ADR-018), y asignarlos es exclusivo del administrador (ADR-020).

## Decision

Cuatro decisiones del responsable del proyecto, tomadas el 2026-10-15:

### 1. Alta al primer ingreso, **sin permisos**

Con `AUTH_PROVIDER=entra`, si un token válido trae un `oid` que no tiene vínculo, el backend **crea
automáticamente el usuario local sin roles, sin permisos directos, sin equipos y sin país**; el administrador
del CRM se los asigna después (ADR-020). Detalle:

- `UserIdentity` con `provider = ENTRA_ID`, `subject = oid` (en minúsculas) y `tenantId`; correo del claim
  `preferred_username` o, si no es un correo utilizable, `email`; nombre del claim `name` (sin él, la parte
  local del correo). Estado `ACTIVE`, `locale`/`timeZone` por defecto del sistema, **sin credencial local**.
- **Idempotente y a prueba de carreras.** Usuario e identidad se crean en una sola sentencia atómica. Con
  varias peticiones simultáneas del primer ingreso, la unicidad de la identidad (`provider`, `subject`) y del
  correo la resuelve la base: quien pierde recibe una violación de unicidad (`P2002`), **relee** y continúa.
  Nunca hay duplicados ni `500`.
- **Auditado:** evento `user.provisioned` con `metadata.source = 'ENTRA_ID'` y actor sistema (`actorId` y
  `actorEmail` nulos, `metadata.actor = 'system'`). Solo audita quien crea, no quien relee. Correo y nombre
  van enmascarados en la diferencia. Los logs registran el `userId` y el `correlationId`, nunca correo, nombre
  ni `oid`.
- **Dominios permitidos** (enmienda 2026-10-15, decisión del responsable): solo se da de alta a quien tenga un
  correo de un dominio de `seguridad.sso_dominios_permitidos` (STRING con dominios separados por comas,
  sembrado `somosgrupoag.com`, grupo `seguridad`, editarlo exige `parametros.configurar`). Comparación **sin
  distinguir mayúsculas y por dominio exacto**: `evil-somosgrupoag.com`, `somosgrupoag.com.evil.io` y un
  subdominio no valen. Una lista vacía o ilegible en la base no autoriza a nadie (la API no admite guardar
  un valor vacío; para frenar las altas se apaga el interruptor). Se comprueba **antes de crear** y no afecta
  a quien ya está vinculado.
- **Interruptor** `seguridad.sso_alta_automatica` (BOOLEAN, `true` por defecto, grupo `seguridad`; cambiarlo
  exige `parametros.editar` **y** `parametros.configurar`). Apagado, el primer ingreso de quien no tiene
  cuenta se rechaza con `403 SSO_PROVISIONING_DISABLED`. No afecta a quien ya está vinculado.
- **Dónde ocurre.** En `AuthenticationGuard`, justo después de verificar el token y antes de cualquier
  decisión de permiso, mediante el puerto `PrincipalAdmission` (implementado por `SsoProvisioningService`
  del módulo de acceso). El camino normal (identidad ya vinculada) cuesta **una consulta por el índice único**
  de la identidad; solo si no existe se evalúa lo demás. Así `GET /me`, `GET /me/menu` y todo endpoint ven una
  cuenta ya creada, y los errores de admisión salen como `403` de verdad, no como `401`.
- Un usuario recién provisionado llama a `GET /me` y `GET /me/menu` y recibe `roles: []`, `permissions: []`
  y solo las opciones de menú públicas (hoy «Panel de control»); todo endpoint protegido responde `403`.

Errores de admisión (todos `403`, con mensaje en español y `correlationId`):

| Código | Cuándo | Mensaje |
|---|---|---|
| `IDENTITY_DOMAIN_NOT_ALLOWED` | El `oid` no tiene vínculo y el dominio del correo no está en `seguridad.sso_dominios_permitidos` | «Tu correo no pertenece a un dominio autorizado. Contacta al administrador.» |
| `IDENTITY_NOT_LINKED` | El `oid` no tiene vínculo y **ya existe** un usuario local con ese correo | «Tu cuenta existe pero aún no está vinculada con tu identidad corporativa. Contacta al administrador.» |
| `IDENTITY_INCOMPLETE` | El `oid` no tiene vínculo y el token no trae un correo utilizable | «Tu identidad corporativa no incluye un correo electrónico utilizable, por lo que no se puede crear tu cuenta. Contacta al administrador.» |
| `SSO_PROVISIONING_DISABLED` | El `oid` no tiene vínculo, no hay usuario con ese correo y el interruptor está apagado | «El alta automática de cuentas está desactivada y tu identidad corporativa aún no tiene una cuenta en esta aplicación. Contacta al administrador.» |

Orden de evaluación cuando no hay vínculo: **correo utilizable → dominio permitido → correo ya existente →
interruptor → alta**. El dominio va antes que el correo existente: una cuenta ajena al dominio nunca se
describe como «existente». El correo es utilizable si es ASCII imprimible (o punycode) y no contiene
caracteres de control, de ancho cero ni bidireccionales; el UPN de un **invitado** (`preferred_username` con
`#EXT#`) no se sustituye por el claim `email`: el resultado es `IDENTITY_INCOMPLETE`.

Cada alta emite el log estructurado `sso_user_provisioned` (nivel `info`, solo `userId` y `correlationId`) para
poder alertar ráfagas (ver «Alerta recomendada» en `AUTHENTICATION.md` §4.1). No hay tope por código. Si
falla la auditoría tras el alta se registra `sso_provisioning_audit_failed` (nivel `error`, con el `userId`).

**Un usuario eliminado** (borrado lógico) conserva su correo reservado: la búsqueda por correo lo ignora pero la
unicidad de la base lo incluye, así que un primer ingreso con ese correo no se da de alta y responde
`IDENTITY_NOT_LINKED` (el administrador decide: restaurar la cuenta o liberar el correo).

**`pendingAccess` (definición única).** Cuenta `ACTIVE` sin **ningún rol vigente** (asignación sin caducar de un
rol activo y no borrado) **y sin permisos directos vigentes** (concesión `GRANT` sin caducar; una denegación no
da nada). Es lo que ven la lista (`GET /users`, su filtro `pendingAccess` y la exportación), `POST /users` y el
detalle (`GET /users/{id}`, y las respuestas de `PATCH`, `suspend`, `reactivate`), con una sola función
(`isPendingAccess`, `access-rules.ts`).

### 2. Corte directo: no se implementa `hybrid`

`AUTH_PROVIDER=hybrid` **sigue lanzando error al arrancar**. La migración es un corte: se vincula a todos por
`oid` (script `load:data entra-identities`), se cambia `AUTH_PROVIDER=entra` y se revocan las credenciales
locales (script `auth:revoke-local`). Con `entra`, los endpoints de autenticación local responden `404`
(`LocalAuthEnabledGuard`). Esto responde las preguntas de ADR-019: no hay dos proveedores simultáneos, luego
no hay precedencia ni correo presente en ambos ni ventana que medir.

### 3. Las bajas son solo manuales

No hay automatismo de baja. Quien sale de la organización se suspende en el CRM (`POST /users/{id}/suspend`,
que revoca sus sesiones) además de en Entra ID. El riesgo residual y el procedimiento de conciliación están
en «Riesgo residual de las bajas».

### 4. Vinculación a mano por `oid`, **nunca por correo**

La resolución por correo se **elimina para los principals de Entra ID**: `findUserIdForPrincipal` solo busca
por el vínculo `(ENTRA_ID, oid)`. Para `local` conserva el comportamiento anterior. Si llega un `oid` sin
vínculo y **ya existe** un usuario local con ese correo, **no se vincula ni se crea otro**: `403
IDENTITY_NOT_LINKED`, sin revelar datos de la cuenta. Un administrador la vincula explícitamente (carga por
script). Un usuario suspendido, bloqueado o eliminado que ya está vinculado autentica pero no recibe permisos
(comportamiento que ya existía).

Endurecimientos que acompañan a esta decisión en `EntraIdAuthenticationProvider` (revisión de seguridad,
2026-10-15):

- La identidad es **siempre el `oid`**, en forma de GUID y en minúsculas. Se elimina el respaldo al `sub`,
  que en Entra ID es *pairwise* (distinto por aplicación) y no sirve para vincular: un token sin `oid` válido
  se rechaza (`401`).
- Se fija `algorithms: ['RS256']` y se exige el claim `exp` (`requiredClaims`).
- **Solo tokens delegados de usuario v2.0:** `ver` debe ser `2.0` (un token v1 se rechaza) y `scp` no puede
  estar vacío (un token de aplicación, de *client credentials*, no trae `scp` y se rechaza aunque lo emita el
  tenant correcto para esta API).
- `ENTRA_REQUIRED_SCOPE`: si está configurado, el `scp` debe contenerlo. `ENTRA_ALLOWED_CLIENT_IDS` (lista
  separada por comas): si está configurada, el `azp` (cliente que pidió el token; con `ver` 2.0 exigido
  `appid` no se usa) debe estar en la lista. Se aplican siempre que estén configuradas, y con
  `NODE_ENV=production` y `AUTH_PROVIDER=entra` **ambas son obligatorias** (la API no arranca sin ellas).
  `env.schema.ts` valida además que `ENTRA_TENANT_ID` sea un GUID, `ENTRA_AUTHORITY` HTTPS con el tenant y
  terminada en `/v2.0` y `ENTRA_JWKS_URI` HTTPS.
- La búsqueda de la identidad incluye el tenant: una identidad guardada con **otro** tenant no coincide.
- El guard de autenticación registra solo el **código** del rechazo (`ERR_JWT_EXPIRED`, `ENTRA_SCOPE_MISSING`…),
  nunca el mensaje de `jose` (puede citar claims) ni el token.
- Para no repetir la consulta de la identidad en cada capa de la misma petición, el usuario local resuelto se
  recuerda por principal de Entra ID (vive lo que el objeto de la petición): la admisión, el guard de permisos y
  el controlador comparten una sola resolución.

### Vinculación en lote y revocación (herramientas)

- `load:data entra-identities` (mismo CLI y garantías que `projects`/`products`): plantilla con «Correo o
  código de colaborador» y «Object ID (oid)»; `validate` no escribe y es la omisión; `apply` exige `--actor`
  administrador con `usuarios.editar`; idempotente; informe sin datos de celdas, con aviso de cuántas filas apuntan a usuarios con rol de administrador. Crea **solo** `UserIdentity`
  (nunca roles ni permisos) y audita `user.identity_linked`. Reglas: usuario existente y no eliminado; `oid`
  en formato GUID; un `oid` ya vinculado a otro usuario es error (`IDENTITY_TAKEN`); el mismo `oid` ya
  vinculado al mismo usuario es «ya existe»; otro `oid` ya vinculado es advertencia `EXISTS_DIFFERENT` y se
  omite; los duplicados dentro del archivo son error.
- `auth:revoke-local`: `validate` (simulación) por omisión; `apply --confirm --actor <administrador>` borra
  `user_credentials` y revoca las sesiones locales de las cuentas con vínculo `ENTRA_ID` **y de las eliminadas**
  (borrado lógico, vinculadas o no); las demás cuentas vivas sin vínculo se listan por id y no se tocan.
  **Por defecto aborta sin tocar nada si queda alguna cuenta `ACTIVE`/`INVITED` sin vincular**
  (`--allow-unlinked` lo omite de forma explícita; `--require-all-linked` sigue aceptándose, es el valor por
  defecto). El actor debe ser administrador activo **y estar vinculado por `ENTRA_ID`** (si no, el corte lo
  dejaría fuera): se rechaza siempre. `apply` exige `AUTH_PROVIDER=entra`. Si falla escribir el informe tras
  aplicar, sale con el código 4 y un aviso de que la revocación **sí** se aplicó. Audita un resumen (`auth.local_credentials_revoked`) y un
  evento por cuenta (`user.local_credentials_revoked`). Cumple el paso 5 de ADR-019 («borrar
  `user_credentials`, no solo dejar de usarlas»).

## Requisitos del tenant y de la API (checklist del corte)

El backend solo valida lo que el token declara; que ese token sea el adecuado depende de cómo se configure
el tenant. Antes del corte, quien administra Entra ID debe confirmar:

1. **Tokens v2.** En el manifiesto del registro de la API: `accessTokenAcceptedVersion = 2` (si no, el
   tenant emite tokens v1 y la API los rechaza).
2. **Exponer un scope delegado** (p. ej. `access_as_user`) y fijarlo en `ENTRA_REQUIRED_SCOPE`; autorizar solo
   a la SPA (`ENTRA_ALLOWED_CLIENT_IDS`). El **consentimiento del scope lo da un administrador**.
3. **Aplicación empresarial** de la API (y de la SPA): «Asignación de usuarios requerida» = **Sí**, y solo se
   asigna a quien deba usar el CRM (limita quién puede obtener un token; el alta automática crea una cuenta por
   cada persona que lo consiga).
4. **Consentimiento de usuario desactivado** para estas aplicaciones: ningún usuario concede permisos por sí
   solo.
5. **MFA** exigido por política de acceso condicional para la aplicación (el CRM no aplica MFA: ADR-019).
6. **`preferred_username` debe ser el correo corporativo** (`@somosgrupoag.com`): es de donde sale el correo
   del alta. Si el UPN no es un correo utilizable, se usa el claim opcional `email` (habilitarlo en el token de
   acceso); un **invitado** (`#EXT#`) no entra por esa vía.
7. **Bajo `entra`, `POST /users` crea al usuario `INVITED` sin vínculo**: su primer ingreso responde
   `IDENTITY_NOT_LINKED` hasta que se vincule por script. **Vincular ANTES de que la persona entre**
   (`load:data entra-identities`), o la cuenta creada por el administrador queda bloqueada para esa persona.

## Alternatives

- **Habilitar `hybrid` durante la migración** (la ruta que preveía ADR-019). Descartada: obliga a definir
  precedencia y qué ocurre con un correo en ambos proveedores, mantiene vivas las credenciales locales durante
  la ventana y exige probar un modo de uso único. Con una organización pequeña y un `oid` por persona, un
  corte planificado es más simple y más seguro.
- **Vincular por correo la primera vez** (comportamiento anterior de `findUserIdForPrincipal`). Descartada: el
  correo/UPN de un directorio externo se puede reasignar, reutilizar o, según la configuración del tenant,
  coincidir con una cuenta ajena; vincular por él sin que un administrador lo confirme cede la cuenta —con sus
  roles— a quien reciba ese correo. El `oid` es el identificador estable e inmutable (ADR-007).
- **Alta manual previa (sin alta automática).** Descartada por el responsable: obliga al administrador a crear
  cada cuenta antes del primer ingreso y deja a la persona frente a un error opaco. El alta automática **sin
  permisos** no concede nada: solo evita ese paso, y el interruptor permite apagarla.
- **Roles y permisos desde Entra ID** (claims `roles`/`groups` mapeados al ingreso). Descartada: contradice
  ADR-008/018/020 (el administrador del CRM asigna el acceso; los permisos salen de la base), acopla el modelo
  de acceso al directorio y haría que un cambio en Entra ID cambiara permisos sin pasar por la bitácora de
  administración ni por las reglas de ADR-020.
- **Baja automática** (sincronizar el estado de la cuenta con el directorio, por ejemplo con SCIM o consultando
  Microsoft Graph). Descartada por ahora por el responsable: añade una integración y un secreto de aplicación
  que hoy no existen; se resuelve con conciliación periódica (abajo).
- **Provisionar de forma diferida** (la primera vez que se pide `/me`, no en cada petición). Descartada: deja
  dos caminos (endpoints con y sin permiso declarado) y haría que el primer endpoint distinto de `/me` viera
  una cuenta inexistente. Hacerlo en el guard de autenticación es un único punto, y su coste en el camino
  normal es una consulta por un índice único.

## Consequences

- **Positivas.** Cualquier persona de la organización entra sin que un administrador cree su cuenta, sin
  riesgo de escalada: nace sin acceso. El administrador ve a los pendientes con `GET /users?pendingAccess=true`
  y les asigna roles. Una cuenta existente nunca se vincula por coincidencia de correo. No hay modo `hybrid`
  que mantener ni credenciales locales que vigilar tras el corte.
- **Negativas.** Entra una cuenta nueva por cada persona del directorio que abra la aplicación, aunque no deba
  usarla: puede llenar la lista de usuarios (mitigable con el interruptor, con `pendingAccess` y con
  asignación de acceso por el administrador). Antes del corte hay que **vincular a todos** (si falta alguien,
  recibe `IDENTITY_NOT_LINKED`) y el administrador debe contar con su propio vínculo antes de cambiar
  `AUTH_PROVIDER`, o se queda fuera.
- **Contrato nuevo.** Errores `403 IDENTITY_NOT_LINKED`, `IDENTITY_INCOMPLETE`, `IDENTITY_DOMAIN_NOT_ALLOWED` y
  `SSO_PROVISIONING_DISABLED`; filtro `GET /users?pendingAccess` e indicador `pendingAccess` en
  `UserListItemDto` y en `UserDetailResponseDto`; parámetros `seguridad.sso_alta_automatica` y
  `seguridad.sso_dominios_permitidos`; variables `ENTRA_REQUIRED_SCOPE` y `ENTRA_ALLOWED_CLIENT_IDS`; eventos de auditoría `user.provisioned`, `user.identity_linked`,
  `auth.local_credentials_revoked` y `user.local_credentials_revoked`.
- **Qué queda habilitado y qué bloqueado.** Queda habilitado el alta sin permisos y la vinculación por lote.
  Sigue bloqueado `hybrid`, la vinculación por correo, la asignación de permisos desde el token y la baja
  automática.
- **Despliegue.** El parámetro nuevo lo crea la semilla (`prisma:seed`, idempotente, no pisa valores). Si no
  se ejecuta, el lector usa el defecto documentado (`true`) y deja un `warn` por lectura.

## Security Considerations

- **Autenticar no es autorizar.** El alta no concede nada: usuario `ACTIVE` sin roles, permisos directos ni
  equipos. El resolutor de permisos sigue leyendo la base; ningún claim del token concede acceso (ADR-008).
  Cualquier endpoint protegido responde `403` hasta que el administrador asigne acceso (ADR-020).
- **Verificación del token.** Sin cambios en lo que ya exigía ADR-007 (firma contra JWKS, `iss`, `aud`, `exp`,
  `nbf`, `tid` y tolerancia de reloj de 60 s), más `oid` obligatorio en forma de GUID y algoritmo fijo RS256.
  Un token de otra audiencia, otro tenant, expirado, sin `oid` o con firma ajena responde `401` y no crea nada.
- **Dominio.** Solo se dan de alta correos de `seguridad.sso_dominios_permitidos` (hoy `somosgrupoag.com`,
  comparación exacta). Es una barrera adicional a la asignación de usuarios del tenant, no un sustituto.
- **Alta de cuentas por ráfaga.** No hay tope por código; el log `sso_user_provisioned` permite alertar
  ráfagas, y el interruptor apaga las altas de inmediato.
- **Tokens de aplicación y de otros clientes.** `scp` obligatorio, `ver` 2.0, `ENTRA_REQUIRED_SCOPE` y
  `ENTRA_ALLOWED_CLIENT_IDS` (obligatorios en producción) impiden que un token de aplicación o pedido por otro
  cliente del tenant llegue a crear o usar una cuenta.
- **Sin escalada por correo.** El correo no identifica: ni al buscar la cuenta (solo `oid`) ni al decidir el
  alta (un correo ya existente detiene el alta). `IDENTITY_NOT_LINKED` no revela datos de la cuenta existente.
- **Carreras.** La unicidad de identidad y de correo la garantiza la base; el código relee ante `P2002`. Una
  carrera cuyo perdedor encuentra el correo ocupado por otro usuario responde `IDENTITY_NOT_LINKED`.
- **Sin PII en logs.** Se registran `userId`, `correlationId` y el código del rechazo, nunca correo, nombre ni
  `oid`. Los informes de las herramientas contienen conteos y ids internos, no datos de celdas.
- **Credenciales locales.** Tras el corte se **borran** (no solo se dejan de usar) en las cuentas vinculadas,
  y con `entra` los endpoints de autenticación local no existen (`404`). Las cuentas sin vínculo conservan una
  credencial inactiva: el script las lista para que no pasen desapercibidas.
- **MFA.** Llega con Entra ID (pendiente de ADR-019): lo aplica la política del tenant, no el CRM.
- **Lo que esta decisión no cubre.** La disponibilidad del tenant, la configuración del registro de aplicación
  y la caducidad del access token son de Entra ID.

## Riesgo residual de las bajas

Las bajas son manuales (decisión 3). Quitar a alguien de Entra ID **le impide obtener tokens nuevos**, pero:

1. **El access token vigente sigue siendo válido** hasta que expire (la vida útil de Entra ID, típicamente
   ~1 hora; hasta ~90 minutos según el tenant). El backend no consulta el directorio en cada petición.
2. **La cuenta del CRM sigue `ACTIVE`** y conserva sus roles hasta que un administrador la suspenda: si la
   persona sigue teniendo acceso a Entra ID por otra vía (p. ej. una cuenta restablecida, o un cambio de
   estado), vuelve a entrar con sus permisos.
3. **Un `oid` reactivado en el directorio** reconecta con la misma cuenta y los mismos permisos.

Mitigación. Dar de baja es **dos pasos**: deshabilitar en Entra ID y suspender en el CRM
(`POST /users/{id}/suspend`, que revoca las sesiones del usuario). Conciliación periódica recomendada
(mensual, o con cada baja de personal si es más frecuente):

1. Exportar los usuarios activos del CRM (`GET /users/export?status=ACTIVE`) y la lista de cuentas
   habilitadas del grupo correspondiente en Entra ID.
2. Cruzar por correo (solo para conciliar; la identidad sigue siendo el `oid`) y suspender en el CRM a quien
   ya no esté habilitado.
3. Revisar `GET /users?pendingAccess=true`: quien lleva tiempo sin acceso asignado y ya no pertenece a la
   organización se suspende.
4. Registrar la fecha y el responsable de la conciliación.

## Relación con otros ADR

Cada uno recibe un addendum aclaratorio con fecha **2026-10-15** que remite a este documento; ninguno se
reescribe.

- **ADR-007.** Cierra lo que dejaba implícito: cómo se traduce el `oid` a una cuenta local (vínculo por
  `oid`, alta sin permisos al primer ingreso, nunca por correo) y fija `oid` obligatorio y RS256.
- **ADR-019.** Sustituye el paso 4 de su plan de migración (ventana con `hybrid`) por un **corte directo**:
  `hybrid` no se habilita. Los pasos 3 y 5 se ejecutan con `load:data entra-identities` y `auth:revoke-local`.
  Lo demás de ADR-019 (autenticación local hasta el corte) no cambia.
- **ADR-020.** El alta automática no es asignación de acceso: crea la cuenta **sin** acceso, y todo lo que
  concede acceso (roles, permisos directos, equipos, país) sigue siendo exclusivo del administrador. Vincular
  una identidad (`load:data entra-identities`) lo ejecuta un administrador activo con `usuarios.editar`.
- **ADR-018.** Sin cambios en el modelo: usa `User`, `UserIdentity` y `UserCredential` existentes; el menú
  sigue saliendo de la base.
