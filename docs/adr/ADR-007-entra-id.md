# ADR-007 - Microsoft Entra ID vía OAuth 2.0 / OIDC

## Status
Accepted — 2026-09-22

## Context
La organización usa Microsoft Entra ID como proveedor de identidad corporativo. Se requiere
integración estándar, sin mecanismos propietarios y sin secretos en el cliente.

## Decision
Integración con Entra ID mediante OAuth 2.0 y OpenID Connect. Frontend con MSAL usando
Authorization Code Flow + PKCE. Backend valida el access token contra el JWKS del tenant,
verificando firma, `iss`, `aud`, `exp`, `nbf` y `tid`. Los claims se traducen a permisos de
aplicación mediante un mapeo explícito y versionado. Toda la configuración por variables `ENTRA_*`.

## Alternatives
- **Implicit flow**: más simple, obsoleto e inseguro (tokens en la URL). Descartado.
- **Backend for Frontend con sesión de servidor**: válido y en algunos aspectos más seguro,
  pero introduce estado de sesión y rompe el desacoplamiento SPA/API buscado. Puede adoptarse
  por proyecto mediante ADR propio.
- **Confiar en el `id_token` para llamar a la API**: incorrecto; el `id_token` identifica al
  usuario ante el cliente, no autoriza llamadas a la API.

## Consequences
- SSO corporativo y MFA gestionados por la organización.
- Sin secretos en el SPA.
- Dependencia de disponibilidad del tenant y de la correcta configuración del registro de aplicación.
- El mapeo de roles/grupos a permisos debe mantenerse cuando el directorio cambia.

## Security Considerations
Se rechaza cualquier token cuya audiencia o issuer no coincidan con los esperados. El JWKS se
cachea con soporte de rotación de llaves. La identidad se basa en `oid`/`sub`, nunca en el correo.
Ningún client secret ni certificado se versiona.

## Addendum 2026-10-15 — De identidad de Entra ID a cuenta local

**Estado:** Accepted — 2026-10-15. Aclara este ADR; no lo modifica. Detalle y decisiones en
[ADR-027](ADR-027-sso-entra-id-alta-primer-ingreso-y-corte-directo.md).

- La identidad es **siempre el `oid`** (GUID, en minúsculas); el respaldo al `sub` se elimina (es *pairwise*
  por aplicación y no sirve para vincular) y un token sin `oid` válido se rechaza. Se fija RS256.
- Un `oid` sin vínculo **no se resuelve por correo**: si no existe un usuario local con ese correo, se crea al
  primer ingreso **sin roles ni permisos** (interruptor `seguridad.sso_alta_automatica`); si existe, `403
  IDENTITY_NOT_LINKED` hasta que un administrador lo vincule.
- Los claims no conceden permisos (sin cambio): los roles se asignan en el CRM (ADR-020).
