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

## Addendum 2026-10-11 — Transacciones entre puertos (`TransactionRunner`)

**Estado:** Accepted — 2026-10-11. Origen: Módulo 2 del CRM (02 F.6, `SequenceGenerator.next(key, tx)`
y `CustomersRepository.create(tx)`), donde un caso de uso debe escribir en varios puertos de forma
atómica (número de secuencia + cliente + contacto principal + auditoría).

**Decisión.** Se añade un puerto mínimo de unidad de trabajo en
`backend/src/infrastructure/database/ports/transaction.port.ts`:

```ts
interface TransactionContext { /* opaco */ }
interface TransactionRunner {
  run<T>(work: (tx: TransactionContext) => Promise<T>, options?: { timeoutMs?: number }): Promise<T>;
}
```

- La aplicación solo **pasa** el `TransactionContext` a los métodos de puerto que lo aceptan
  (`tx?` opcional); nunca lo inspecciona ni conoce su tipo real.
- El adaptador Prisma (`prisma-transaction.ts`) lo implementa con `$transaction` interactivo y
  `prismaClientFor(prisma, tx)` resuelve el cliente dentro de los adaptadores.
- Un puerto solo acepta `tx` cuando un caso de uso real lo necesita (regla anti-overengineering).

**Alternativas descartadas.**
- *Pasar el `Prisma.TransactionClient` a la aplicación:* rompe §8.2 de CLAUDE.md.
- *Métodos de repositorio "gordos" que hacen todo dentro (p. ej. `createCustomerWithContact`):*
  mezclan agregados y obligan a duplicar la generación de secuencias en cada adaptador.
- *Contexto implícito (AsyncLocalStorage / CLS):* menos explícito y más difícil de probar.

**Consecuencias.** Los casos de uso siguen probándose sin base de datos (un `TransactionRunner`
falso que invoca `work` con un contexto ficticio). Cambiar de motor exige reimplementar solo el
adaptador del runner.
