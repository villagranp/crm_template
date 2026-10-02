---
name: coding-standards
description: Aplica las convenciones obligatorias de naming, tipos, estructura y estilo en todo el código. Se aplica a cada archivo que se crea o modifica, sin excepción.
---

# Coding Standards

## Purpose

Que el código se lea como si lo hubiera escrito una sola persona, y que un agente no
introduzca dialectos nuevos en cada cambio.

## When to use

Siempre que se escriba o modifique código.

## Required context

`CODING-STANDARDS.md` (norma completa) y los archivos vecinos al cambio (coherencia local).

## Inputs

El cambio a implementar.

## Standards

| Elemento | Convención | Ejemplo |
|---|---|---|
| Variables | `camelCase` | `customerName` |
| Booleanos | prefijo `is/has/can/should/was` | `isActive`, `hasPermission` |
| Constantes globales | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Funciones | `camelCase`, verbo + objeto | `getCustomerById()` |
| Clases | `PascalCase` | `CreateCustomerUseCase` |
| Interfaces/tipos | `PascalCase`, **sin** `I` | `CustomerRepository` |
| DTOs | `PascalCase` + `Dto` | `CreateCustomerDto` |
| Enums | `PascalCase` / valores `UPPER_SNAKE_CASE` | `OrderStatus.PENDING` |
| Archivos | `kebab-case` + sufijo de rol | `customer.service.ts` |
| Componentes React | `PascalCase.tsx` | `CustomerCard.tsx` |
| Hooks | `useAlgo.ts` | `useCurrentUser.ts` |
| Carpetas | `kebab-case` | `purchase-orders/` |
| Tablas | `snake_case` plural | `purchase_orders` |
| Columnas | `snake_case` | `created_at` |
| JSON de API | `camelCase` | `customerId` |
| Variables de entorno | `UPPER_SNAKE_CASE` | `JWT_ACCESS_TOKEN_TTL` |

TypeScript: `strict` siempre, sin `any` sin justificación, sin `@ts-ignore`,
tipos de retorno explícitos en API pública del módulo.

Fechas ISO-8601 UTC. Dinero decimal + moneda, nunca float.
`null` = ausencia explícita; campo omitido en `PATCH` = sin cambio; `""` y `0` son valores válidos.

## Process

1. Antes de nombrar algo, mira cómo se nombra lo equivalente en el repositorio.
2. Escribe el tipo antes que la implementación cuando aclare el diseño.
3. Nombra por intención de negocio, no por mecanismo (`approveOrder`, no `updateStatusField`).
4. Mantén las funciones en un solo nivel de abstracción.
5. Extrae constantes con nombre en vez de literales mágicos.
6. Ordena imports: externos → alias internos → relativos.
7. Ejecuta `pnpm lint` y `pnpm typecheck` antes de considerar el archivo terminado.

## Required checks

- [ ] Naming conforme a la tabla, en **todos** los elementos nuevos
- [ ] Sin `any` ni `@ts-ignore` sin justificación escrita
- [ ] Sin literales mágicos repetidos
- [ ] Sin `catch` vacío ni errores silenciados
- [ ] Sin `console.log` en código de producción (usar el logger)
- [ ] Sin imports circulares ni rutas `../../../..`
- [ ] Sin `TODO` sin referencia a issue
- [ ] `lint` y `typecheck` en verde

## Expected output

Código que pasa lint y typecheck y que un revisor no distingue del código preexistente
en estilo ni en convenciones.

## Anti-patterns

- `ICustomerRepository`, `data1`, `tmp`, `doStuff()`, `handler2()`
- `active` en vez de `isActive`
- Importes profundos `../../../../shared/utils`
- Desactivar reglas de lint por archivo para no arreglar el problema
- Formatear el archivo entero junto con un cambio de una línea

## Definition of Done

Lint y typecheck en verde, y naming coherente con el resto del repositorio.

## Related Skills

`backend-nestjs`, `frontend-react`, `code-review`, `api-design`, `database`
