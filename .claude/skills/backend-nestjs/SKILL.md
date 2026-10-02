---
name: backend-nestjs
description: Guía la implementación de módulos NestJS: estructura, casos de uso, DTOs, guards, filtros y separación de capas. Úsalo en cualquier cambio dentro de backend/.
---

# Backend — NestJS

## Purpose

Implementar la API con NestJS manteniendo el dominio limpio, el contrato estable y los
controles transversales aplicados por defecto.

## When to use

Cualquier cambio en `backend/`.

## Required context

`ARCHITECTURE.md`, `API-STANDARDS.md`, `CODING-STANDARDS.md`, estructura actual de `backend/src`.

## Inputs

User story, contrato de API, modelo de datos, permiso requerido.

## Standards

```text
backend/src/
  main.ts  app.module.ts
  config/             configuración validada (fail fast)
  common/             decorators, filters, guards, interceptors, middleware, pipes
  modules/<feature>/  controller, use cases, dto, mappers, (domain/ si aplica)
  infrastructure/     database, authentication, integrations, logging
```

- Controllers: sin lógica de negocio. Reciben, delegan, devuelven DTO.
- Use cases: una responsabilidad, nombre `<Verbo><Entidad>UseCase`, sin dependencias concretas.
- Repositorios: interfaz en el puerto, implementación en `infrastructure/database`.
- Inyección de dependencias por token para los puertos, no por clase concreta.
- Transversales globales: `ValidationPipe`, filtro de excepciones, interceptor de correlación,
  guard de autenticación, guard de permisos.
- Módulos simples se quedan planos; solo se dividen en `domain/application/infrastructure/presentation`
  cuando la complejidad lo justifica.

## Process

1. Confirma el contrato con `api-design` **antes** de crear el controller.
2. Crea o ubica el módulo: `modules/<feature>/`.
3. Define DTOs de entrada con `class-validator` y de salida explícitos.
4. Implementa el caso de uso con las interfaces que necesita; sin Prisma.
5. Implementa el adaptador de persistencia detrás del puerto.
6. Registra proveedores con tokens en el módulo.
7. Anota el handler: `@ApiOperation`, `@ApiResponse`, `@RequirePermission` (o `@Public()` justificado).
8. Traduce errores de dominio a HTTP en el filtro, no con `throw new HttpException` disperso.
9. Añade logs estructurados con contexto, sin datos sensibles.
10. Escribe pruebas unitarias del caso de uso y de integración del endpoint (Supertest).

## Required checks

- [ ] ¿El controller está libre de reglas de negocio?
- [ ] ¿El caso de uso depende de interfaces y no de Prisma?
- [ ] ¿Los DTOs validan todo y rechazan campos no declarados?
- [ ] ¿El handler declara permiso o `@Public()` justificado?
- [ ] ¿Se verifica propiedad del recurso además del permiso?
- [ ] ¿Los errores salen en el formato estándar con `correlationId`?
- [ ] ¿Las consultas tienen límite y paginación?
- [ ] ¿Swagger completo, incluidos errores?
- [ ] ¿Pruebas unitarias e integración presentes y en verde?

## Expected output

Módulo NestJS completo, documentado en OpenAPI y probado.

## Anti-patterns

- `PrismaService` inyectado en un caso de uso o en un controller.
- Devolver entidades de Prisma como respuesta.
- Lógica de negocio en el repositorio.
- `try/catch` en cada handler replicando el filtro global.
- Guards aplicados manualmente endpoint por endpoint en lugar de deny-by-default global.
- Un `SharedModule` que exporta todo y acopla todo.

## Definition of Done

Endpoint conforme al contrato, con autorización, validación, logs, OpenAPI y pruebas;
`lint`, `typecheck` y `test` en verde.

## Related Skills

`api-design`, `database`, `authorization`, `authentication`, `security`, `testing`, `observability`
