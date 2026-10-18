# ADR-019 - Autenticación local inicial con migración posterior a Entra ID

## Status
Accepted — 2026-10-02

Proyecto: Mi Cliente AG. Extiende ADR-006 (arquitectura de autenticación) y
ADR-007 (Entra ID) heredados de la plantilla.

## Context

El destino deseado es Microsoft Entra ID: los usuarios del CRM son personal de
Grupo AG, ya tienen cuenta corporativa, y delegar el ciclo de vida de las
cuentas al tenant es mejor que gestionarlo aquí.

El obstáculo no es técnico sino organizativo: el equipo del proyecto **no
administra el tenant** y hoy no puede crear el registro de aplicación, el
redirect URI ni el scope de API que Entra ID necesita. Esperar a tenerlo
bloquearía el desarrollo del CRM por tiempo indefinido.

La plantilla define tres modos (`local`, `entra`, `hybrid`), con `hybrid`
deliberadamente deshabilitado a la espera de un ADR que lo justifique.

## Decision

**Arrancar en `AUTH_PROVIDER=local` y migrar a `entra` cuando el registro de
aplicación exista. `hybrid` se habilitará únicamente durante la ventana de
migración, y no antes.**

Es decir: la secuencia es `local` → (`hybrid` solo mientras dure el corte) →
`entra`. No se implementa `hybrid` ahora.

### Por qué no empezar en `hybrid`

Lo que el proyecto necesita hoy es *secuencial*, no *simultáneo*: primero un
proveedor, después el otro. `hybrid` resuelve el caso de los dos proveedores
activos **a la vez**, que solo ocurre durante la migración. Habilitarlo antes
significaría mantener y probar un modo que nadie usa, con sus preguntas sin
responder (¿qué pasa si un correo existe en ambos?, ¿cuál gana?), y esas
respuestas se decidirían hoy con menos información de la que habrá entonces.

Cambiar de `local` a `entra` es cambiar una variable de entorno: la
arquitectura de puertos y adaptadores de ADR-006 existe precisamente para eso.

### Qué se implementa ahora

Módulo de autenticación local sobre las tablas que la plantilla ya trae:

- `POST /auth/login` — valida credencial, emite access token y cookie de
  refresco `HttpOnly` + `Secure` + `SameSite=Lax`
- `POST /auth/refresh` — rotación del refresh token (la sesión antigua queda
  encadenada con `replacedById`)
- `POST /auth/logout` — revoca la sesión
- `POST /auth/password/reset` y `POST /auth/password/change`
- Hashing con **Argon2id**; nunca se registra ni se devuelve el hash
- Bloqueo por intentos fallidos usando `login_attempts` y los parámetros
  `seguridad.intentos_fallidos_maximos` y `seguridad.minutos_bloqueo`
- Pantalla de acceso con React Hook Form + Zod, completando `LoginPage`
- `LocalAuthProvider.signIn()` del frontend

### Qué NO se implementa ahora

Autoservicio de registro: las cuentas las crea un administrador. El CRM es
interno y el alta libre no tiene sentido aquí.

## Plan de migración a Entra ID

Cuando exista el registro de aplicación:

1. Alta del registro en el tenant: redirect URI, scope de API, consentimiento.
2. Instalar `@azure/msal-browser` y completar `EntraAuthProvider`.
3. Para cada usuario existente, crear su fila en `user_identities` con
   `provider = ENTRA_ID` y `subject = oid` del tenant. **La cuenta, sus roles y
   sus permisos no se tocan**: `user_identities` existe justamente para esto.
4. Ventana de migración con `AUTH_PROVIDER=hybrid` y su propio ADR, que deberá
   responder: precedencia entre proveedores, qué ocurre con un correo presente
   en ambos, y duración de la ventana.
5. Cambiar a `AUTH_PROVIDER=entra` y **revocar las credenciales locales**:
   borrar `user_credentials`, no solo dejar de usarlas. Una credencial que
   sigue siendo válida pero que ya nadie vigila es peor que ninguna.

## Consequences

- El proyecto asume temporalmente la custodia de contraseñas: hashing, política
  de caducidad, bloqueo y restablecimiento. Es trabajo real y es riesgo real.
- Sin Entra, **no hay MFA**. Es una diferencia de seguridad significativa
  frente al destino, y debe conocerla quien aprueba el arranque.
- Una baja de personal no cierra el acceso automáticamente: hay que
  desactivarla también en el CRM hasta que se complete la migración.
- A cambio, el desarrollo del CRM no queda bloqueado por una dependencia
  organizativa fuera de su control.
- El coste de la migración es bajo por diseño: una variable de entorno, un
  adaptador y un alta en `user_identities` por usuario.

## Security Considerations

- Argon2id con los parámetros recomendados por OWASP vigentes a la fecha.
- El access token vive **solo en memoria** en el navegador; la continuidad de
  sesión depende de la cookie de refresco `HttpOnly`.
- Se guarda el **hash** del refresh token, nunca el token (la plantilla ya lo
  impone en el esquema).
- La respuesta de login no permite distinguir si el correo existe: mismo
  mensaje y mismo tiempo de respuesta para credencial inválida y usuario
  inexistente.
- Todo intento, correcto o fallido, queda en `login_attempts`.
- Mientras dure el modo local, revisar trimestralmente las cuentas activas
  contra la lista de personal vigente. Es un control manual, y es precisamente
  el que desaparece al migrar a Entra ID.

## Addendum 2026-10-15 — La migración es un corte directo, sin `hybrid`

**Estado:** Accepted — 2026-10-15 (decisión del responsable). Aclara el «Plan de migración a Entra ID»; no
reescribe el resto de este ADR. Detalle en
[ADR-027](ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md).

- El paso 4 (ventana con `AUTH_PROVIDER=hybrid` y su propio ADR) **se sustituye por un corte directo**:
  `hybrid` no se implementa y sigue lanzando error al arrancar. Se vincula a todos por `oid`, se cambia
  `AUTH_PROVIDER=entra` y se revocan las credenciales locales.
- El paso 3 se ejecuta con `load:data entra-identities` (vinculación por lote, solo por `oid`) y el paso 5
  con `auth:revoke-local` (borra `user_credentials` y revoca sesiones de las cuentas vinculadas).
- Las preguntas que este ADR dejaba al de `hybrid` (precedencia, correo en ambos proveedores, duración de la
  ventana) dejan de aplicar: nunca hay dos proveedores activos a la vez.
- Una baja de personal sigue sin cerrar el acceso automáticamente tras el corte (riesgo residual y
  conciliación periódica documentados en ADR-027).
