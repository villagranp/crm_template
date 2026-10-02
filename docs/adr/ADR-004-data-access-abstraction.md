# ADR-004 - Abstracción de acceso a datos (Ports & Adapters)

## Status
Accepted — 2026-09-22

## Context
El template debe soportar PostgreSQL, MariaDB, MySQL, Snowflake y futuras fuentes sin que un
cambio de motor obligue a reescribir la lógica de negocio. A la vez, no debe caer en
abstracciones genéricas que filtren detalles del ORM.

## Decision
Acceso a datos mediante puertos definidos por el dominio/aplicación e implementados en
infraestructura. Puertos transaccionales (`*Repository`) y analíticos (`AnalyticsRepository`,
`ReportingRepository`, `DataProvider`, `IntegrationRepository`) separados.
Los casos de uso nunca dependen de Prisma ni de drivers.

```text
CustomerRepository (port)
 ├── PrismaCustomerRepository → PostgreSQL / MariaDB / MySQL
 └── SnowflakeCustomerReadModel → Snowflake
```

## Alternatives
- **Usar Prisma directamente en los servicios**: más rápido al inicio, acopla todo el sistema
  al ORM y hace imposible sustituir la fuente sin reescribir casos de uso.
- **Repositorio genérico `Repository<T>`**: reduce código repetido pero filtra la semántica del
  ORM (filtros, includes) al dominio, que es justamente lo que se quiere evitar.

## Consequences
- Los casos de uso se prueban sin base de datos.
- Cambiar de motor afecta solo al adaptador.
- Costo: cada repositorio se escribe a medida, con métodos que reflejan necesidades reales.
- Regla anti-overengineering: el puerto expone lo que el caso de uso usa, no un CRUD completo
  "por si acaso".

## Security Considerations
El adaptador es el único lugar donde se construyen consultas, concentrando la superficie de
inyección y facilitando su revisión.
