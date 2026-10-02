# Data Access Ports

Los puertos de datos se definen **aquí** (o dentro del módulo que los necesita) y se
implementan en `infrastructure/database/prisma/` o en el adaptador correspondiente.

Regla no negociable (ADR-004): **los casos de uso dependen de estas interfaces, nunca de Prisma.**

## Cómo crear un repositorio

```typescript
// 1. Puerto — expone solo lo que el caso de uso usa
export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}

// 2. Adaptador — vive en infrastructure/database/prisma/
@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    return row ? toDomain(row) : null;
  }
  // ...
}

// 3. Registro en el módulo
{ provide: CUSTOMER_REPOSITORY, useClass: PrismaCustomerRepository }
```

## Anti-patrones

- Repositorio genérico `Repository<T>` que expone `where` del ORM.
- Devolver tipos generados por Prisma fuera de este directorio.
- Métodos "por si acaso" que nadie llama.
- Consultas sin `select` explícito o sin límite.
