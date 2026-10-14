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

## Addendum 2026-10-13 — Lecturas de reportes e indicadores (`runReportRead`)

**Estado:** Accepted — 2026-10-13. Origen: Módulo 5 del CRM (05 D.3, F.5): las pantallas de
Reportes (y los indicadores compartidos con Inicio, 01 F.2) leen una página y su conteo, o
varios agregados, que deben ver la misma instantánea, sin poder escribir y con un tiempo máximo.

**Decisión.** Los adaptadores de solo lectura (`prisma-commercial-metrics.repository.ts`,
`prisma-reporting.repository.ts`) ejecutan cada consulta con
`runReportRead(prisma, work, statementTimeoutMs)` de
`backend/src/infrastructure/database/prisma/report-read.ts`: una transacción interactiva
`REPEATABLE READ` + `SET TRANSACTION READ ONLY` + `set_config('statement_timeout', …, true)`
(equivalente a `SET LOCAL`, con el valor como parámetro). Un vencimiento (SQLSTATE `57014` o
`P2028` de Prisma) se traduce a `ServiceUnavailableError` → `503 REPORT_TIMEOUT`. Es un detalle
del adaptador: los puertos no exponen la transacción y la aplicación no la ve.

- Pantallas: 10 s (`SCREEN_STATEMENT_TIMEOUT_MS`). Exportación (F-39): 60 s
  (`EXPORT_STATEMENT_TIMEOUT_MS`), con el mismo helper.
- No sustituye a `TransactionRunner`: este sigue siendo el único camino para escrituras
  atómicas entre puertos.

**Alternativas descartadas.** *Lecturas sueltas sin transacción:* la página y el conteo
podrían ver estados distintos y no hay forma de acotar el tiempo por pantalla sin tocar la
configuración global del pool. *`statement_timeout` en la URL de conexión:* afectaría también a
las escrituras y a las migraciones.

**Consecuencias.** Cada pantalla ocupa una conexión durante su lectura (consultas en serie
dentro de la transacción). Probado en `commercial-metrics-consistency.e2e.spec.ts` (solo
lectura y `REPORT_TIMEOUT`) y `report-read.spec.ts`.
