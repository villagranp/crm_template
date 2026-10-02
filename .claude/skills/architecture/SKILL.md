---
name: architecture
description: Evalúa el impacto estructural de un cambio, ubica el código en la capa correcta y protege la dirección de dependencias. Úsalo cuando un cambio cruce capas, módulos, dependencias o contratos.
---

# Architecture

## Purpose

Mantener límites claros y dependencias dirigidas hacia el dominio, sin agregar capas
ni abstracciones que nadie necesita todavía.

## When to use

- El cambio toca más de un módulo o capa.
- Se introduce una dependencia, integración o fuente de datos.
- Se define un puerto nuevo.
- Hay duda sobre dónde colocar una pieza de lógica.

## Required context

`ARCHITECTURE.md`, ADRs vigentes, estructura actual de `backend/src` y `frontend/src`.

## Inputs

User story, reglas de negocio, restricciones técnicas.

## Standards

```text
presentation → application → domain
infrastructure → implementa puertos definidos por domain/application
```

- `domain/` no importa NestJS, Prisma, HTTP ni nada de infraestructura.
- `application/` depende de interfaces, no de implementaciones.
- La lógica de negocio no vive en controllers, ni en repositorios, ni en el frontend.
- Frontend y backend se comunican solo por REST/OpenAPI.
- Un módulo empieza plano; evoluciona a cuatro capas cuando la complejidad lo justifica (ADR-014).

## Process

1. Clasifica la lógica: ¿regla invariante (dominio), orquestación (aplicación), detalle técnico
   (infraestructura) o presentación?
2. Verifica si ya existe un patrón equivalente en el repositorio y reutilízalo.
3. Si necesitas datos externos, define el **puerto** primero y su implementación después.
4. Dibuja mentalmente las dependencias: ¿alguna apunta hacia afuera del dominio? Corrige.
5. Evalúa alternativas y descarta las que agregan capas sin resolver un problema presente.
6. Determina si hay que registrar un ADR (arquitectura, seguridad, interoperabilidad,
   contrato público o modelo de datos).
7. Actualiza los diagramas de `ARCHITECTURE.md` si cambian los límites.

## Required checks

- [ ] ¿Dirección de dependencias correcta?
- [ ] ¿`domain`/`application` libres de Prisma, NestJS e infraestructura?
- [ ] ¿La lógica de negocio quedó fuera de controllers y repositorios?
- [ ] ¿Se reutilizó el patrón existente en lugar de inventar uno nuevo?
- [ ] ¿La abstracción resuelve un problema actual (YAGNI)?
- [ ] ¿Se rompe algún contrato? ¿Se evaluó versionado?
- [ ] ¿Se requiere ADR?

## Expected output

- Sección "Architecture impact" del implementation plan, con decisiones y restricciones.
- Diagramas actualizados si cambian los límites.
- ADR cuando corresponda.

## Anti-patterns

- Capas creadas "por si acaso".
- Interfaz con un único implementador sin necesidad real de sustitución.
- Repositorio genérico `Repository<T>` que filtra detalles del ORM al dominio.
- Lógica de negocio distribuida entre controller, servicio y componente React.
- Cambiar la arquitectura en un PR funcional sin ADR ni aviso.

## Definition of Done

El cambio respeta los límites vigentes o los modifica de forma documentada y aprobada.

## Related Skills

`adr`, `api-design`, `database`, `backend-nestjs`, `frontend-react`, `security`
