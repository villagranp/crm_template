# ADR-014 - Clean Architecture progresiva

## Status
Accepted — 2026-09-22

## Context
El prompt fundacional exige aplicar Clean Architecture "donde agregue valor" y, a la vez,
prohíbe el overengineering. Aplicar cuatro capas a un CRUD trivial produce ceremonia sin
beneficio; no aplicarlas nunca produce acoplamiento irreversible.

## Decision
Los módulos nacen **planos**: `modules/<feature>/` con controller, casos de uso, DTOs y mappers.
Un módulo evoluciona a `domain/ application/ infrastructure/ presentation/` cuando cumple al
menos dos de estos criterios:

1. Tiene reglas de negocio invariantes propias, más allá de validación de forma.
2. Tiene más de una fuente de datos o adaptador.
3. Supera aproximadamente cinco casos de uso.
4. Su lógica se prueba mejor sin infraestructura.

**Independientemente de la forma del módulo**, la regla no negociable se mantiene siempre:
los casos de uso dependen de interfaces, nunca de Prisma ni de drivers.

## Alternatives
- **Cuatro capas desde el inicio, siempre**: consistencia total, a costa de carpetas vacías y
  ceremonia que desincentiva su cumplimiento.
- **Sin capas, servicios directos contra el ORM**: rápido y acoplado; hace inviable el objetivo
  de soportar múltiples fuentes de datos.

## Consequences
- La complejidad estructural aparece cuando el problema la justifica.
- Se requiere criterio en cada módulo: por eso los criterios de promoción están escritos.
- Migrar un módulo plano a capas es un refactor local y acotado, porque los puertos ya existen.

## Security Considerations
Ninguna directa. Mantener el dominio libre de infraestructura facilita razonar sobre dónde se
validan y autorizan las operaciones.
