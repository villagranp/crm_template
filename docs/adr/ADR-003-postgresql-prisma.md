# ADR-003 - PostgreSQL + Prisma como stack transaccional

## Status
Accepted — 2026-09-22

## Context
Se necesita una base transaccional confiable con tipos ricos, y un acceso tipado que reduzca
errores en desarrollo asistido por IA, sin quedar atados al motor.

## Decision
PostgreSQL 16 como base transaccional por defecto y Prisma como ORM, confinado a
`backend/src/infrastructure/database/prisma/`. Migraciones versionadas obligatorias.

## Alternatives
- **TypeORM**: más flexible en patrones, con historial de inconsistencias en migraciones.
- **Drizzle**: ligero y cercano a SQL; ecosistema menos maduro para equipos grandes.
- **SQL directo con query builder**: máximo control, mayor costo de mantenimiento y más
  superficie para errores de inyección.

## Consequences
- Tipado extremo a extremo en la capa de infraestructura y migraciones reproducibles.
- MariaDB/MySQL quedan soportables por el mismo adaptador cambiando el provider.
- Prisma impone límites en consultas muy complejas: se resuelven con SQL parametrizado dentro
  del adaptador, nunca filtrando el ORM al dominio.

## Security Considerations
Prisma parametriza por defecto, mitigando inyección SQL. `$queryRawUnsafe` queda prohibido.
Las credenciales viven solo en configuración.
