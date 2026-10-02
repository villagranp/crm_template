# ADR-006 - Arquitectura de autenticación extensible

## Status
Accepted — 2026-09-22

## Context
Distintos proyectos derivados del template necesitarán autenticación interna (JWT propio) o
corporativa (Microsoft Entra ID), y algunos ambas. Acoplar el dominio a un proveedor obligaría
a reescribir la aplicación al cambiar de contexto.

## Decision
Se define el puerto `AuthenticationProvider` con implementaciones `LocalAuthenticationProvider`,
`EntraIdAuthenticationProvider` y, para integraciones, `ServiceAuthenticationProvider`.
La selección se hace por configuración: `AUTH_PROVIDER=local|entra|hybrid`.
El resultado de autenticar es un `AuthenticatedPrincipal` interno; el dominio no conoce al proveedor.

El modo `hybrid` queda **definido pero no habilitado por defecto**: activarlo en un proyecto
requiere un ADR propio que justifique la coexistencia y defina la resolución de identidades
duplicadas entre proveedores.

## Alternatives
- **Solo JWT local**: simple, pero incompatible con el requisito corporativo de Entra ID.
- **Solo Entra ID**: alineado con la organización, pero bloquea proyectos sin tenant disponible
  o con usuarios externos.
- **Passport con múltiples estrategias sin puerto propio**: funciona, pero acopla el dominio a
  la forma de Passport y dispersa la lógica de identidad.

## Consequences
- Cambiar de proveedor no toca casos de uso, controllers ni dominio.
- Cada proveedor se prueba de forma aislada.
- Coste: una capa de traducción claims → identidad de aplicación que hay que mantener.
- `hybrid` sin ADR de proyecto es una configuración no soportada.

## Security Considerations
La validación de tokens (firma, `iss`, `aud`, `exp`, `nbf`) es responsabilidad del proveedor y
es obligatoria en todas las implementaciones. La autenticación nunca decide permisos (ADR-008).
