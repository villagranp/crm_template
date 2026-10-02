---
name: entra-id
description: Integración con Microsoft Entra ID vía OAuth 2.0 / OIDC — MSAL en el frontend, validación de tokens contra JWKS en el backend y mapeo de claims a permisos de aplicación. Úsalo en cualquier trabajo con Entra ID.
---

# Microsoft Entra ID

## Purpose

Integrar Entra ID usando estándares, sin mecanismos propietarios y sin acoplar el dominio
al proveedor.

## When to use

Configurar o modificar autenticación con Entra ID, validación de sus tokens, scopes,
mapeo de roles/grupos, logout federado o autenticación de servicios en Entra.

## Required context

`AUTHENTICATION.md`, ADR-007, configuración `ENTRA_*` y `VITE_ENTRA_*`.

## Inputs

Tenant, client ID, audiencia de la API, scopes, roles/grupos disponibles en el directorio.

## Standards

- Protocolos: OAuth 2.0 + OpenID Connect. Nada propietario.
- Frontend: MSAL con **Authorization Code Flow + PKCE**. Sin client secret en el cliente.
- Backend: valida el access token emitido **para esta API** (`aud` = `ENTRA_AUDIENCE`).
- Configuración por variables de entorno; jamás en el código.
- Claims → `ApplicationIdentity` → roles → permisos. Mapeo explícito y versionado.

## Process

1. Registra/confirma la app en Entra: SPA (redirect URIs) y API (expose an API, scope).
2. Configura el frontend: `VITE_ENTRA_CLIENT_ID`, `_TENANT_ID`, `_AUTHORITY`, `_REDIRECT_URI`, `_API_SCOPE`.
3. Configura el backend: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_AUDIENCE`, `ENTRA_AUTHORITY`, `ENTRA_JWKS_URI`.
4. Implementa la validación en `EntraIdAuthenticationProvider`:
   JWKS cacheado con rotación de llaves; verifica firma, `iss`, `aud`, `exp`, `nbf`, `tid`.
5. Extrae `oid`/`sub` como identificador estable del usuario. **No** uses `email` como identidad.
6. Traduce `roles`/`groups` a permisos internos con una tabla de mapeo explícita.
7. Define el comportamiento de expiración: refresh silencioso de MSAL, y `401` → reautenticación.
8. Define logout: limpieza local y, si el proyecto lo requiere, `end_session_endpoint`.
9. Para servicios: flujo client credentials con su propio principal y permisos.
10. Pruebas: token de otra audiencia, de otro tenant, expirado, firma inválida, sin claims requeridos.

## Required checks

- [ ] ¿`aud` verificado contra la audiencia de esta API?
- [ ] ¿`iss` verificado contra el authority esperado?
- [ ] ¿`tid` verificado (multi-tenant solo si está justificado y documentado)?
- [ ] ¿JWKS cacheado y con manejo de rotación de llaves?
- [ ] ¿Tolerancia de reloj acotada (≤ 60 s)?
- [ ] ¿Identidad basada en `oid`/`sub`, no en correo?
- [ ] ¿Roles/grupos mapeados a permisos propios, sin confiar ciegamente en el claim?
- [ ] ¿Sin client secrets ni certificados en Git?
- [ ] ¿Frontend sin secretos, solo PKCE?
- [ ] ¿Pruebas de rechazo para cada token inválido?

## Expected output

Provider de Entra ID funcional tras el puerto de autenticación, configuración documentada,
mapeo de claims versionado y pruebas de validación.

## Anti-patterns

- Confiar en el `id_token` para autorizar llamadas a la API (se usa el `access_token`).
- Aceptar tokens de cualquier audiencia o tenant.
- Decodificar el JWT sin verificar la firma.
- Usar el correo como clave primaria del usuario.
- Implicit flow o secretos en el SPA.
- Copiar el `tenant_id` o `client_id` dentro del código fuente.

## Definition of Done

La API acepta únicamente tokens válidos emitidos para ella, el mapeo a permisos está documentado
y los casos de token inválido están probados.

## Related Skills

`authentication`, `authorization`, `security`, `frontend-react`, `backend-nestjs`, `adr`
