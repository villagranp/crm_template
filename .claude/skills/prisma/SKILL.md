---
name: prisma
description: Uso correcto de Prisma como detalle de infraestructura — schema, migraciones, mapeo y consultas seguras — sin filtrar el ORM hacia el dominio. Úsalo al tocar schema.prisma, migraciones o repositorios Prisma.
---

# Prisma

## Purpose

Aprovechar Prisma para persistencia sin que el resto del sistema dependa de él.

## When to use

Cambios en `backend/prisma/schema.prisma`, migraciones, o implementaciones
`Prisma*Repository`.

## Required context

ADR-003, ADR-004, esquema actual, puertos en `infrastructure/database/ports/`.

## Inputs

Modelo de datos aprobado por el Skill `database`.

## Standards

- Prisma vive **solo** en `backend/src/infrastructure/database/prisma/`.
- Modelos con `@@map("tabla_snake_case")` y campos con `@map("columna_snake_case")`.
- Tipos: `DateTime @db.Timestamptz(6)`, `Decimal @db.Decimal(19,4)`, `String @db.Uuid`.
- Migraciones versionadas en `prisma/migrations/`, nunca `db push` en entornos compartidos.
- `PrismaService` gestiona el ciclo de vida de la conexión y se inyecta solo en repositorios.
- Prohibido `$queryRawUnsafe`. `$queryRaw` solo con plantillas parametrizadas y justificación.

## Process

1. Actualiza `schema.prisma` con nombres de dominio en TypeScript y `@map` hacia la base.
2. `pnpm --filter backend prisma:migrate` para generar la migración con nombre descriptivo.
3. Revisa el SQL generado **antes** de aceptarlo: ¿destructivo? ¿bloqueante? ¿reversible?
4. `pnpm --filter backend prisma:generate` para el cliente.
5. Implementa el repositorio detrás del puerto, con mapper explícito `toDomain` / `toPersistence`.
6. Usa `select` explícito en lugar de traer el registro completo.
7. Evita N+1: `include` cuando corresponde, o consulta agregada.
8. Usa `$transaction` cuando hay invariantes entre varias escrituras.
9. Prueba el repositorio contra una base efímera.

## Required checks

- [ ] ¿Ningún import de `@prisma/client` fuera de `infrastructure/database`?
- [ ] ¿`@@map`/`@map` presentes para respetar el naming de base de datos?
- [ ] ¿Tipos correctos para fechas, dinero e IDs?
- [ ] ¿Migración revisada, con nombre descriptivo y reversible?
- [ ] ¿Sin `$queryRawUnsafe` ni SQL concatenado?
- [ ] ¿`select` explícito y consultas con `take`/paginación?
- [ ] ¿Mapper explícito entre entidad de dominio y modelo de Prisma?
- [ ] ¿Transacciones donde son necesarias?

## Expected output

Schema actualizado, migración revisada, repositorio con mapper y pruebas de integración.

## Anti-patterns

- Devolver el objeto de Prisma como respuesta de la API.
- `prisma.customer.findMany()` sin límite.
- `db push` contra una base compartida.
- Editar a mano una migración ya aplicada en otro entorno.
- Poner lógica de negocio dentro del repositorio.
- Un `PrismaService` inyectado en controllers.

## Definition of Done

Migración aplicada y reversible, dominio libre de Prisma, consultas acotadas y pruebas en verde.

## Related Skills

`database`, `architecture`, `backend-nestjs`, `security`, `testing`
