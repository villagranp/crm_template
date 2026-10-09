# Plan de implementación — Autenticación local

- **Decisión que lo origina:** [ADR-019](../adr/ADR-019-autenticacion-local-con-migracion-a-entra.md)
- **Estado:** aprobado con cambios (2026-10-08): D9 sustituida por D11 y D12; sin correo (§3)
- **Skills aplicables:** `authentication`, `security`, `api-design`,
  `backend-nestjs`, `frontend-react`, `testing`

> Esto es infraestructura de acceso, no funcionalidad de negocio: habilita el
> camino de entrada que el esquema de la plantilla ya contempla. No introduce
> ninguna entidad del dominio del CRM.

---

## 1. Entendimiento

Hoy el CRM tiene el modelo de identidad completo y **ningún camino de entrada**:
el administrador sembrado está en `INVITED` y sin credencial utilizable.

Hay que implementar inicio de sesión con credencial local, de forma que al
migrar a Entra ID (ADR-019) solo cambie el adaptador y la variable
`AUTH_PROVIDER`, sin tocar cuentas, roles ni asignaciones.

### Fuera de alcance

- Autoservicio de registro: las cuentas las crea un administrador.
- MFA: no se implementa; llega con Entra ID.
- Entra ID y modo `hybrid`: ADR-019 los sitúa en la ventana de migración.
- Pantallas de administración de usuarios: plan aparte.

---

## 2. Decisiones que requieren aprobación

Se proponen valores; si no se objetan, se implementan tal cual.

| # | Decisión | Propuesta | Razón |
|---|---|---|---|
| D1 | Vida del access token | 15 minutos | Corta, porque vive en memoria y se renueva solo |
| D2 | Vida del refresh token | 8 horas, sin deslizamiento | Cubre una jornada; al día siguiente se vuelve a entrar |
| D3 | Rotación del refresh | En cada uso, encadenando `replacedById` | Permite detectar reutilización de un token robado |
| D4 | Reutilización de un refresh ya rotado | Revocar **todas** las sesiones del usuario | Señal inequívoca de robo; el coste es volver a entrar |
| D5 | Argon2id | `memoryCost 19 MiB`, `timeCost 2`, `parallelism 1` | Mínimos vigentes de OWASP |
| D6 | Longitud mínima de contraseña | 12 caracteres, sin exigir composición | Longitud > complejidad; la composición empuja a `P@ssw0rd!` |
| D7 | Contraseñas comunes | Rechazar una lista corta embebida | Evita lo trivial sin dependencias nuevas |
| D8 | Bloqueo | 5 intentos → 15 min, desde `system_parameters` | Ya está sembrado y es ajustable sin desplegar |
| ~~D9~~ | ~~Alta de usuario por enlace de invitación~~ | **Sustituida por D11/D12** a petición del responsable | No hay infraestructura de correo |
| D10 | Caducidad de contraseña | Desactivada (`seguridad.dias_caducidad_password = 0`) | La rotación forzada empeora las contraseñas; además es temporal hasta Entra |
| D11 | Contraseña inicial del administrador | `SEED_ADMIN_PASSWORD` (solo `.env`, nunca Git). La semilla la aplica si el admin no tiene credencial; nunca la sobrescribe. **Exenta de la política D6/D7** por decisión del responsable; el cambio en el primer acceso sí la cumple | Decisión del responsable (2026-10-08) |
| D12 | Contraseña inicial del resto de usuarios | `AUTH_DEFAULT_PASSWORD` (solo `.env`, ≥ 12 caracteres). Se asigna al dar de alta y al restablecer por administrador | Decisión del responsable; sustituye a D9 |
| D13 | Cambio obligatorio | Toda contraseña inicial o restablecida marca `mustChangePassword`. El access token lleva `pcr: true` y la API rechaza con `403 PASSWORD_CHANGE_REQUIRED` todo salvo el cambio de contraseña | Mitiga D11/D12: la contraseña conocida solo sirve para fijar una nueva |
| D14 | Cuenta `INVITED` | Puede entrar si tiene credencial; pasa a `ACTIVE` al fijar su propia contraseña | `INVITED` = aún no completó su primer acceso |

---

## 3. Contrato de API

Todos bajo `/api/v1`.

| Método | Ruta | Acceso | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/auth/login` | `@Public` | `{ email, password }` | `200 Session` + cookie de refresco |
| POST | `/auth/refresh` | `@Public` (la credencial es la cookie) | — | `200 Session` + cookie rotada |
| POST | `/auth/logout` | `@Public` (debe funcionar con el access token caducado) | — | `204`, cookie borrada y sesión revocada |
| POST | `/auth/password/change` | `@AuthenticatedOnly` | `{ currentPassword, newPassword }` | `200 Session` + cookie nueva; el resto de sesiones del usuario se revocan |
| POST | `/users/{id}/password/reset` | `usuarios.editar` | — | `204`; asigna `AUTH_DEFAULT_PASSWORD` con cambio obligatorio y cierra sus sesiones |

```ts
Session = {
  accessToken: string;
  expiresAt: string;               // ISO 8601, caducidad del access token
  passwordChangeRequired: boolean; // D13
  user: { id: string; email: string; displayName: string; roles: string[]; permissions: string[] };
}
```

**Fuera de este plan** (requieren un ADR de correo): `/auth/password/forgot`,
`/auth/password/reset` y `/auth/invitation/accept`. Mientras tanto, quien
olvide su contraseña pide al administrador que la restablezca.

### Errores

Formato único de `API-STANDARDS.md`.

| Caso | Respuesta |
|---|---|
| Contraseña incorrecta, usuario inexistente, sin credencial o bloqueo temporal (D8) | `401 INVALID_CREDENTIALS`, **idéntica** en cuerpo y en tiempo |
| Contraseña correcta, cuenta `SUSPENDED` o `LOCKED` | `403 ACCOUNT_DISABLED` (solo lo ve quien conoce la contraseña) |
| Refresh ausente, inválido, caducado o reutilizado | `401 INVALID_REFRESH_TOKEN` y cookie borrada |
| Contraseña actual incorrecta al cambiarla | `422 INVALID_CURRENT_PASSWORD` (no `401`: la sesión sigue siendo válida) |
| Nueva contraseña no cumple la política | `422 PASSWORD_POLICY_VIOLATION`, motivos en `details[].issue` |
| Access token con cambio pendiente sobre otra ruta | `403 PASSWORD_CHANGE_REQUIRED` |
| Restablecer sin `AUTH_DEFAULT_PASSWORD` configurada | `422 DEFAULT_PASSWORD_NOT_CONFIGURED` |
| Demasiados intentos de login desde una IP | `429` (10 por minuto) |

### Cookie de refresco

`refresh_token`: `HttpOnly`, `Secure` (salvo `NODE_ENV=development`),
`SameSite=Lax`, `Path=/api/v1/auth`, caduca con la sesión. El access token
**nunca** se guarda en `localStorage`.

---

## 4. Cambios en el modelo de datos

Ninguno en las tablas. Se usan `user_credentials`, `user_sessions`,
`login_attempts` y `password_reset_tokens` tal como las trae la plantilla.

`password_reset_tokens` no se usa todavía: queda para el flujo por correo.

---

## 5. Archivos previstos

### Backend — `src/modules/auth/`

| Archivo | Responsabilidad |
|---|---|
| `auth.controller.ts` | Los siete endpoints, DTOs validados, sin lógica |
| `auth.service.ts` | Orquestación: login, refresh, logout, invitación |
| `password.service.ts` | Argon2id: hash, verificación, política (D5–D7) |
| `session.service.ts` | Emisión y rotación de sesiones, detección de reutilización (D3, D4) |
| `lockout.service.ts` | Intentos fallidos y bloqueo (D8) |
| `token.service.ts` | Firma y verificación del access token con `jose` |
| `ports/auth.repository.port.ts` | Puerto de datos (ADR-004) |
| `dto/*.ts` | `LoginDto`, `ResetPasswordDto`, `ChangePasswordDto`, `AcceptInvitationDto` |

### Backend — infraestructura

`src/infrastructure/database/prisma/repositories/prisma-auth.repository.ts`

### Frontend

| Archivo | Cambio |
|---|---|
| `routes/pages/LoginPage.tsx` | Formulario real con React Hook Form + Zod |
| `routes/pages/ResetPasswordPage.tsx` | Nueva |
| `routes/pages/AcceptInvitationPage.tsx` | Nueva |
| `services/auth/local-auth.provider.ts` | Completar `signIn()` |
| `services/auth/auth.api.ts` | Llamadas al módulo |
| `routes/app-routes.tsx` | Rutas nuevas |

### Dependencia nueva

`argon2` en el backend. Es la única que añade este plan. La cookie se lee sin `cookie-parser`.

---

## 6. Permisos

No se crean permisos nuevos: los endpoints son públicos o de autoservicio.
`/auth/password/change` usa `@AuthenticatedOnly('el recurso es la propia
contraseña del usuario')`.

El alta de usuarios y el envío de invitaciones usan `usuarios.crear`, que ya
existe.

---

## 7. Plan de pruebas

### Unitarias

- `password.service`: hash verificable, hash distinto para la misma contraseña
  (sal), política acepta y rechaza según D6 y D7
- `session.service`: rotación encadena correctamente; **reutilizar un token ya
  rotado revoca todas las sesiones del usuario** (D4)
- `lockout.service`: bloquea al quinto intento, libera pasados los minutos, un
  acierto reinicia el contador

### Integración (API, contra PostgreSQL real)

- Login correcto devuelve token y fija la cookie
- Credencial inválida y usuario inexistente: **misma respuesta**
- Refresh rota la cookie; la anterior deja de servir
- Logout revoca: el refresh posterior falla
- Usuario `SUSPENDED` o `LOCKED` no entra aunque la contraseña sea correcta
- Contraseña inicial: el login devuelve `passwordChangeRequired` y cualquier otra ruta responde `403 PASSWORD_CHANGE_REQUIRED` hasta cambiarla
- Cambio de contraseña: la anterior deja de servir y el resto de sesiones quedan revocadas
- Restablecimiento por administrador: exige `usuarios.editar` (401 sin sesión, 403 sin permiso)

### E2E

Entrar, ver el menú del administrador, cerrar sesión. Es además la primera
prueba real de que `/me/menu` entrega lo que la base concede.

---

## 8. Observabilidad

Se registra, con su correlation ID: `auth.login.succeeded`,
`auth.login.failed`, `auth.lockout.triggered`, `auth.refresh.reused`
(importante: indica posible robo), `auth.password.changed`,
`auth.password.reset.requested`.

**Nunca** se registran contraseñas, hashes ni tokens.

Los eventos relevantes van también a `audit_logs`.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Custodia de contraseñas asumida por el proyecto | Temporal hasta Entra (ADR-019); Argon2id y política mínima |
| Sin MFA | Declarado en ADR-019; quien aprueba lo conoce |
| Una baja de personal no cierra el acceso | Revisión trimestral de cuentas activas (ADR-019) |
| `argon2` es módulo nativo: puede fallar al compilar en el agente de CI | Verificar en el pipeline antes de depender de él; alternativa en JS puro si da problemas |
| Enumeración de cuentas por tiempo de respuesta | Verificar siempre contra un hash ficticio cuando el usuario no existe |
| Dos refresh simultáneos con la misma cookie (varias pestañas) cuentan como reutilización (D4) y cierran todas las sesiones | El frontend serializa la renovación: una sola petición de refresh en vuelo, compartida entre pestañas (paso 8) |
| `user_sessions` acumula una fila por rotación (≈32 por usuario y jornada) | Purga periódica de sesiones caducadas; fuera de este plan |
| Si la respuesta de un refresh se pierde (corte de red), la cookie vieja reaparece y D4 cierra todas las sesiones | Aceptado: el coste es volver a entrar. Una ventana de gracia en el backend lo evitaría; no se implementa |
| Cerrar sesión en una pestaña no cierra las demás hasta que caduca su access token (≤ 15 min) | Aceptado; `BroadcastChannel` lo resolvería |
| Alta de usuario y asignación de credencial no son atómicas | Si falla el hash, el usuario queda sin credencial y el administrador lo restablece |
| Cuenta existente con contraseña incorrecta hace 2–3 escrituras más que un correo inexistente | Diferencia de milisegundos frente a ~50 ms de Argon2, y limitada por el throttle por IP |

---

## 10. Pasos

Cada paso deja el repositorio en verde y es revisable por separado.

1. ✅ `password.service` con sus pruebas (sin tocar la API)
2. ✅ `token.service` y `session.service` con sus pruebas
3. ✅ Puerto y adaptador Prisma del repositorio de autenticación
4. ✅ `POST /auth/login` y `/auth/refresh` con pruebas de integración
5. ✅ `lockout.service` integrado en el login
6. ✅ `/auth/logout` y `/auth/password/change`, con cambio obligatorio (D13)
7. ✅ Contraseñas iniciales: semilla (D11), alta de usuario y restablecimiento por administrador (D12)
8. ✅ `LoginPage` real y `LocalAuthProvider.signIn()`, con renovación serializada entre pestañas
9. ✅ Pantalla de cambio de contraseña (obligatorio y voluntario)
10. ✅ E2E del recorrido completo
11. ✅ Actualizar `AUTHENTICATION.md` y `docs/api/README.md`

El paso 4 es el primero que produce algo demostrable: a partir de ahí el
administrador puede entrar y ver su menú.
