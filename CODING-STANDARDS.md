# CODING-STANDARDS.md

Obligatorio para todo el código del repositorio. Aplicación operativa en
[`.claude/skills/coding-standards/SKILL.md`](.claude/skills/coding-standards/SKILL.md).

---

## 1. TypeScript

- `strict: true` en todos los paquetes. Prohibido desactivarlo por archivo.
- `any` prohibido salvo justificación en comentario; preferir `unknown` + narrowing.
- Sin `@ts-ignore`; si es inevitable, `@ts-expect-error` con explicación.
- Tipos de retorno explícitos en funciones exportadas y métodos públicos.
- `readonly` para estructuras que no deben mutar.
- Nada de `export default` salvo donde el framework lo exija (páginas, config de Vite).

## 2. Variables

`camelCase`, nombres descriptivos, sin abreviaturas crípticas.

```typescript
const customerName = 'Acme';
const purchaseOrderId = '018f...';
```

Prohibido: `data1`, `tmp`, `res2`, `x`, `aux`.

## 3. Booleanos

Prefijos semánticos obligatorios: `is`, `has`, `can`, `should`, `was`.

```typescript
const isActive = true;        // ✅
const hasPermission = false;  // ✅
const active = true;          // ❌
const flag = true;            // ❌
```

## 4. Constantes

Constantes de módulo/globales: `UPPER_SNAKE_CASE`.

```typescript
const MAX_RETRY_COUNT = 3;
const DEFAULT_PAGE_SIZE = 20;
```

Constantes locales que representan un valor común conservan `camelCase`.

## 5. Funciones

`camelCase` y describen una acción concreta.

```typescript
getCustomerById()   createOrder()   calculateTotal()   validateToken()
```

Prohibido: `process()`, `doStuff()`, `handler2()`, `executeThing()`.

Una función hace una cosa. Si necesita un comentario para explicar qué hace en conjunto,
probablemente deben ser dos funciones.

## 6. Clases

`PascalCase`: `CustomerService`, `CreateCustomerUseCase`, `PrismaCustomerRepository`.

## 7. Interfaces y tipos

`PascalCase`, **sin** prefijo `I`.

```typescript
export interface CustomerRepository { /* ... */ }   // ✅
export interface ICustomerRepository { /* ... */ }  // ❌
```

Implementaciones llevan el prefijo de la tecnología: `PrismaCustomerRepository`,
`SnowflakeAnalyticsRepository`.

## 8. Enums

Nombre `PascalCase`, valores `UPPER_SNAKE_CASE`. Preferir string enums o union types
cuando formen parte de un contrato.

```typescript
export enum OrderStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
```

## 9. Archivos y carpetas

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos TS (backend y frontend no-componente) | `kebab-case` + sufijo de rol | `customer.service.ts`, `create-customer.dto.ts` |
| Componentes React | `PascalCase.tsx` | `CustomerCard.tsx` |
| Hooks | `camelCase.ts` con prefijo `use` | `useCurrentUser.ts` |
| Carpetas | `kebab-case` | `purchase-orders/` |
| Tests | `*.spec.ts` (unit/integration), `*.e2e.spec.ts`, `*.spec.tsx` | `customer.service.spec.ts` |

Sufijos backend: `.controller.ts`, `.service.ts`, `.module.ts`, `.dto.ts`, `.repository.ts`,
`.guard.ts`, `.use-case.ts`, `.mapper.ts`, `.port.ts`.

## 10. Base de datos

- Tablas: `snake_case`, plural → `customers`, `purchase_orders`, `user_roles`.
- Columnas: `snake_case` → `customer_id`, `created_at`, `updated_at`.
- Claves foráneas: `<entidad_singular>_id`.
- Índices: `idx_<tabla>_<columnas>`; únicos: `uq_<tabla>_<columnas>`.
- El ORM mapea `customer_id` → `customerId` (`@map` en Prisma). La DB nunca dicta el contrato de API.

## 11. JSON de API

`camelCase` siempre. Nunca exponer `snake_case` de la base.

```json
{ "customerId": "018f...", "createdAt": "2026-09-22T15:30:00Z" }
```

## 12. Variables de entorno

`UPPER_SNAKE_CASE`, declaradas en `.env.example` y validadas al arranque.

```text
DATABASE_URL   JWT_ACCESS_TOKEN_TTL   ENTRA_TENANT_ID   ENTRA_CLIENT_ID
```

En el frontend solo `VITE_*` — y **solo valores públicos**: todo lo que llega al bundle es público.

## 13. Fechas

- Transporte y almacenamiento: ISO 8601 en **UTC**.
- Columnas: `timestamptz` para **instantes** (algo que ocurrió o está agendado a una hora).
- **Fechas de calendario** sin hora (fecha de una oportunidad, inicio/fin estimados,
  fecha de decisión, vigencia de un tipo de cambio): columna `date` (`@db.Date`) y
  `YYYY-MM-DD` en la API. Un `timestamptz` las desplazaría de día según la zona
  horaria (DM-31, `docs/implementation-plans/crm/00-modelo-de-datos.md` §2).
- La conversión a zona horaria local ocurre en presentación.
- Prohibido enviar `22/09/2026` desde la API.

## 14. Dinero

- Nunca `float`/`number` para importes.
- DB: `NUMERIC(19,4)` / `Decimal`.
- API: string decimal + moneda explícita ISO 4217.
- Aritmética con librería decimal, no con operadores nativos sobre floats.

## 15. `null` vs `undefined`

| Valor | Significado |
|---|---|
| Campo ausente en `PATCH` | No modificar |
| `null` | Borrar / ausencia explícita |
| `undefined` | Uso interno TypeScript; no se serializa |
| `""` / `0` | Valores legítimos, **nunca** representan ausencia |

Cada DTO documenta qué significa cada caso en sus campos opcionales.

## 16. Errores

- Errores de dominio como clases propias (`CustomerNotFoundError`), traducidos a HTTP en la capa
  de presentación mediante filtros.
- Nunca `catch` vacío. Nunca tragar un error sin log ni re-throw.
- Nunca usar excepciones para flujo de control normal.

## 17. Logging

- Logging estructurado (JSON), con `correlationId`.
- Niveles: `error`, `warn`, `info`, `debug`.
- Prohibido loggear: passwords, tokens, cookies, secretos, PII, payloads completos sin redactar.

## 18. Comentarios

Explican el **por qué**, no el **qué**. Todo `TODO` lleva referencia a issue:
`// TODO(ABC-123): ...`. Comentarios desactualizados se borran.

## 19. Estructura de imports

1. Node/librerías externas → 2. paquetes internos/alias → 3. relativos.
Sin imports circulares. Sin rutas `../../../..`: usar alias (`@/`).

## 20. Principios

`KISS`, `DRY`, `YAGNI`, `SOLID` donde aporte. **No** crear: capas sin función, interfaces
triviales de un solo implementador sin necesidad de sustitución, repositorios genéricos,
factories innecesarias, wrappers sin valor ni abstracciones anticipadas.
