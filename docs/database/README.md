# Database documentation

Default engine is PostgreSQL with Prisma (ADR-003). The domain never depends on
Prisma directly: access goes through the ports in
`backend/src/infrastructure/database/ports/` (ADR-004).

| File | Contents |
|---|---|
| `data-model.md` | Entities, relationships, invariants and an ER diagram |
| `migrations.md` | Migration log, with the risk and rollback plan of each one |
| `indexes.md` | Indexes and the queries that justify them |
| `retention.md` | Retention and deletion rules per data category |

## Rules

1. Schema changes are migrations in version control. No manual change to any
   shared environment, ever.
2. Every migration must be reversible, or ship with a documented forward fix.
3. A migration that can lock a large table in production states the expected
   duration and the mitigation before it is merged.
4. Snowflake is an analytical, read-only source (ADR-015). It is never written
   to by the application and never used for transactional reads.
