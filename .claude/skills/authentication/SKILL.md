---
name: authentication
description: Decide y aplica la estrategia de autenticación (JWT local, Entra ID o servicio a servicio) sin acoplar el dominio a un proveedor. Úsalo ante cualquier cambio de login, tokens, sesión o providers.
---

# Authentication

## Purpose

Verificar identidad de forma estándar e intercambiable, con tokens correctamente validados
y sin acoplar la aplicación a un proveedor.

## When to use

Login, logout, emisión o validación de tokens, refresh, cambio de proveedor, integración M2M.

## Required context

`AUTHENTICATION.md`, ADR-006 y ADR-007, `infrastructure/authentication/` y su configuración.

## Inputs

Tipo de identidad (usuario o servicio), proveedor configurado (`AUTH_PROVIDER`), requisitos de sesión.

## Standards

```text
AuthenticationProvider (port)
  ├── LocalAuthenticationProvider    JWT propio
  ├── EntraIdAuthenticationProvider  OAuth2 / OIDC
  └── ServiceAuthenticationProvider  client credentials
```

Autenticación ≠ autorización. El resultado de autenticar es un `AuthenticatedPrincipal`,
nunca un permiso.

**Local:** Argon2id para passwords; access token 15 min; refresh 7 días con rotación,
revocación y detección de reuso; cookie `httpOnly`+`Secure`+`SameSite=Strict` para el refresh.

**Entra ID:** Authorization Code + PKCE en el frontend (MSAL); backend valida contra JWKS.

**M2M:** OAuth2 Client Credentials. Nunca credenciales de usuario para integraciones.

## Process

1. Determina qué identidad se autentica: usuario interactivo o servicio.
2. Confirma el proveedor activo (`AUTH_PROVIDER`) y usa el puerto, no la implementación.
3. Si emites tokens (local): define claims mínimos, TTL, algoritmo de firma y rotación.
4. Si validas tokens: verifica firma, `iss`, `aud`, `exp`, `nbf` y claims requeridos. Siempre los cinco.
5. Mapea el principal a la identidad de aplicación (`authorization` se encarga de permisos).
6. Define el comportamiento ante `401` en el frontend: un intento de refresh, luego login.
7. Añade rate limiting a los endpoints de autenticación.
8. Escribe pruebas: token válido, expirado, firma inválida, audiencia incorrecta, ausente, malformado.

## Required checks

- [ ] ¿Se usa el puerto y no una implementación concreta?
- [ ] ¿Validación completa: firma, `iss`, `aud`, `exp`, `nbf`?
- [ ] ¿Tokens con expiración y sin datos sensibles en claims?
- [ ] ¿Refresh con rotación y revocación?
- [ ] ¿Passwords con Argon2id, nunca reversibles?
- [ ] ¿Respuesta genérica ante credenciales inválidas (sin enumeración de usuarios)?
- [ ] ¿Rate limit en login y refresh?
- [ ] ¿Ningún token en logs, URLs ni mensajes de error?
- [ ] ¿Secretos solo por configuración?

## Expected output

Flujo de autenticación implementado tras el puerto, configuración documentada en `.env.example`
y pruebas de los casos de token inválido.

## Anti-patterns

- Aceptar cualquier JWT bien formado sin validar audiencia e issuer.
- Token de acceso sin expiración o de días de duración.
- Secreto de firma por defecto en el código.
- Guardar el refresh token en `localStorage`.
- Reutilizar el mismo token para usuario y para integraciones.
- Mezclar decisiones de permisos dentro del provider de autenticación.

## Definition of Done

La autenticación funciona con el proveedor configurado, el dominio no conoce al proveedor,
y existen pruebas de rechazo para cada forma de token inválido.

## Related Skills

`entra-id`, `authorization`, `security`, `backend-nestjs`, `frontend-react`, `testing`
