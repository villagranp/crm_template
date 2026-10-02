---
name: database
description: Diseña el modelo de datos y el acceso mediante puertos y adaptadores, manteniendo el dominio libre de ORM y de motor concreto. Úsalo ante cualquier cambio de entidades, consultas o persistencia.
---

# Database

## Purpose

Datos correctos, íntegros y evolutivos, accedidos por interfaces que permiten cambiar la
tecnología sin reescribir el negocio.

## When to use

Nuevas entidades o campos, cambios de consulta, nuevos repositorios, decisiones de índices,
integración de una fuente de datos.

## Required context

`ARCHITECTURE.md`, ADR-003 y ADR-004, `backend/prisma/schema.prisma`,
`infrastructure/database/ports/`.

## Inputs

Modelo conceptual de la user story, volúmenes esperados, patrones de consulta, requisitos de retención.

## Standards

```typescript
// Puerto en el dominio/aplicación — sin tipos de Prisma
export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}
```

- Transaccional: PostgreSQL + Prisma (MariaDB/MySQL por el mismo adaptador cuando aplique).
- Analítico: Snowflake detrás de `AnalyticsRepository` / `ReportingRepository` / `DataProvider`.
- Naming: tablas `snake_case` plural; columnas `snake_case`; FKs `<entidad>_id`;
  índices `idx_<tabla>_<columnas>`; únicos `uq_<tabla>_<columnas>`.
- Tipos: `timestamptz` para fechas; `NUMERIC(19,4)` para dinero; UUID/ULID para IDs públicos.
- Auditoría mínima: `created_at`, `updated_at`; y `deleted_at` si hay soft delete.
- Toda estructura se crea por migración versionada.

## Process

1. Modela entidades e invariantes **antes** de pensar en tablas.
2. Define el puerto que necesita el caso de uso, con los métodos que realmente usa.
3. Diseña el esquema: claves, tipos, nulabilidad, unicidad, integridad referencial.
4. Define índices a partir de los patrones de consulta reales, no por intuición.
5. Decide soft delete vs borrado físico, y documenta la elección.
6. Implementa el adaptador (`PrismaCustomerRepository`) con mapeo explícito DB ↔ dominio.
7. Genera la migración y verifica su reversibilidad.
8. Comprueba que las consultas tengan límite y paginación.
9. Prueba el repositorio contra una base efímera con migraciones aplicadas.

## Required checks

- [ ] ¿El caso de uso depende de la interfaz y no del ORM?
- [ ] ¿Naming y tipos conforme al estándar?
- [ ] ¿Restricciones de integridad y unicidad en la base, no solo en el código?
- [ ] ¿Índices que soportan las consultas previstas?
- [ ] ¿Migración versionada y reversible (o irreversibilidad documentada)?
- [ ] ¿Datos sensibles identificados, con política de exposición y retención?
- [ ] ¿Consultas con límite, sin N+1?
- [ ] ¿Transacciones donde hay invariantes multi-tabla?
- [ ] ¿Sin mezclar consulta analítica y transacción OLTP en la misma unidad de trabajo?

## Expected output

Esquema y migración, puerto e implementación, mapeo explícito y pruebas de repositorio.

## Anti-patterns

- `PrismaService` inyectado en un caso de uso.
- Tipos generados por Prisma atravesando el dominio o la API.
- Repositorio genérico que expone `where` del ORM al negocio.
- Tabla creada a mano en la base o con SQL suelto fuera de migraciones.
- Índice agregado "por si acaso" sobre cada columna.
- Dinero en `float`; fechas sin zona horaria.

## Definition of Done

Modelo migrado, acceso tras el puerto, consultas acotadas y pruebas de repositorio en verde.

## Related Skills

`prisma`, `snowflake`, `architecture`, `security`, `backend-nestjs`, `testing`
