# CLAUDE.md — Punto de entrada para agentes de IA

> **Lee este archivo completo antes de tocar cualquier archivo del repositorio.**
> Este proyecto es un **Enterprise Project Template**, no una aplicación de negocio.
> Su objetivo es que humanos y agentes de IA produzcan software mantenible, seguro,
> consistente, testeable y documentado.

---

## 1. Regla número uno: NO CODE-FIRST

Está **prohibido** empezar a escribir código de producción al recibir un requerimiento.

```text
REQUIREMENT → REQUIREMENTS ANALYSIS → USER STORY → ACCEPTANCE CRITERIA
→ ARCHITECTURE REVIEW → SECURITY REVIEW → DATA REVIEW → API CONTRACT
→ TEST PLAN → IMPLEMENTATION PLAN → IMPLEMENTATION
→ UNIT TESTS → INTEGRATION TESTS → E2E TESTS
→ CODE REVIEW → DOCUMENTATION → DONE
```

**Antes de modificar código de producción, determina qué Skills aplican al cambio solicitado y síguelos.**
El orquestador obligatorio es [`.claude/skills/feature-development/SKILL.md`](.claude/skills/feature-development/SKILL.md).

Si el usuario pide "solo hazlo rápido", el flujo se puede comprimir (ver §9 Fast Path)
pero **nunca se salta** el contrato de API, la autorización, los tests ni la documentación.

---

## 2. Qué es este repositorio

| Aspecto | Valor |
|---|---|
| Tipo | Monorepo (pnpm workspaces) |
| Frontend | React 18.3 + TypeScript + Vite + Material UI v6 (ver ADR-001) |
| Backend | NestJS 11 + TypeScript + REST + OpenAPI 3.x |
| DB transaccional | PostgreSQL + Prisma (**detrás de puertos**) |
| DB analítica | Snowflake (adaptador, opcional) |
| Auth | JWT local **o** Microsoft Entra ID (OAuth2/OIDC), seleccionable por config |
| Authz | RBAC + Permission Based (`resource.action`) |
| CI/CD | Azure DevOps |
| Runtime local | Docker Compose + NGINX |

Diagrama, límites y flujos: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 3. Mapa de documentos

| Necesito… | Leo… |
|---|---|
| Reglas para agentes de IA | [`AGENTS.md`](AGENTS.md) |
| Método para desarrollar un módulo (igual para Claude, Codex u otro agente) | [`AGENTS.md` §9](AGENTS.md) |
| Arquitectura y diagramas | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Diseño de endpoints | [`API-STANDARDS.md`](API-STANDARDS.md) |
| Naming y estilo | [`CODING-STANDARDS.md`](CODING-STANDARDS.md) |
| Controles de seguridad | [`SECURITY.md`](SECURITY.md) |
| Autenticación | [`AUTHENTICATION.md`](AUTHENTICATION.md) |
| Estrategia de pruebas | [`TESTING.md`](TESTING.md) |
| Levantar el entorno | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| Flujo de ramas y PR | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Decisiones tomadas | [`docs/adr/`](docs/adr/) |
| Identidad visual y tema | [`docs/design/DESIGN-SYSTEM.md`](docs/design/DESIGN-SYSTEM.md) |
| Modelo de datos de gestión | [`docs/database/data-model.md`](docs/database/data-model.md) |

---

## 4. Skills: cuándo se usan

Los Skills viven en `.claude/skills/<nombre>/SKILL.md` y contienen instrucciones ejecutables.

| Skill | Se activa cuando… |
|---|---|
| `feature-development` | **Siempre** que exista un cambio funcional. Orquesta al resto. |
| `requirements-analysis` | Llega un requerimiento ambiguo o nuevo |
| `user-story` | Hay que formalizar alcance y criterios de aceptación |
| `architecture` | El cambio cruza capas, módulos o introduce dependencias |
| `adr` | Hay una decisión estructural, de seguridad o de contrato |
| `api-design` | Se crea o modifica cualquier endpoint |
| `coding-standards` | Se escribe cualquier línea de código |
| `frontend-react` | Se toca `frontend/` |
| `design-system` | Se toca cualquier cosa visual: pantalla, componente, tema |
| `access-management` | Aparece una opción en el menú, un permiso nuevo o cambia quién ve qué |
| `backend-nestjs` | Se toca `backend/` |
| `authentication` | Login, tokens, sesiones, providers |
| `entra-id` | Integración con Microsoft Entra ID |
| `authorization` | Roles, permisos, guards, policies |
| `security` | Datos sensibles, entradas externas, secretos, dependencias |
| `database` | Modelo de datos, puertos/repositorios |
| `prisma` | Schema, migraciones, queries Prisma |
| `snowflake` | Analytics, reporting, data products |
| `testing` | Cualquier cambio de comportamiento |
| `docker` | Imágenes, compose, runtime |
| `nginx` | Routing, proxy, headers |
| `azure-devops` | Pipelines |
| `observability` | Logs, correlation ID, health |
| `documentation` | Cierre de cualquier cambio |
| `code-review` | Antes de declarar DONE |

**Regla de selección:** ante la duda, incluye el Skill. Un Skill de más cuesta lectura; uno de menos cuesta un defecto.

### Skills de terceros: pulido de UI y movimiento

Copiados sin modificar de [emilkowalski/skills](https://github.com/emilkowalski/skills)
(MIT, ver `.claude/skills/THIRD_PARTY_NOTICES.md`). Complementan a `design-system`
y `frontend-react`; no los sustituyen.

| Skill | Se activa cuando… |
|---|---|
| `emil-design-eng` | Se pule un componente o se decide si algo debe animarse |
| `animate` | Se construye una animación o transición |
| `review-animations` | Se revisa el movimiento de un cambio (solo invocación explícita) |
| `improve-animations` | Se audita el movimiento de toda la app (solo lectura) |
| `find-animation-opportunities` | Se buscan sitios que ganarían con movimiento (solo lectura) |
| `animation-vocabulary` | Hay que nombrar un efecto de movimiento |
| `apple-design` | Gestos, hojas, arrastre, profundidad y movimiento físico |
| `mobile-native` | La app debe sentirse nativa en el teléfono |
| `break-ui` | Se prueba una pantalla con datos extremos |
| `prototype` | Se comparan variantes de una pieza de UI (solo invocación explícita) |

#### `ui-ux-pro-max` (nextlevelbuilder/ui-ux-pro-max-skill)

Base de datos local de recomendaciones de UX (accesibilidad, formularios,
navegación, gráficas, rendimiento de React) que se consulta con un script de
Python sin dependencias ni acceso a red. Úsalo **solo como consulta**:

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain ux
python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --stack react
```

- La ruta es relativa a la raíz del repo: `${CLAUDE_PLUGIN_ROOT}` de su SKILL.md
  no existe en un skill de proyecto.
- **Prohibido** `--design-system` y `--persist`: generan paletas, tipografías y un
  `design-system/MASTER.md` propios. El sistema de diseño es el de Grupo AG
  (ADR-017) y no se sustituye ni se duplica.
- Dominios útiles aquí: `ux`, `chart`, `icons`, `react`, `web`. Su catálogo no
  tiene Material UI: usa `--stack react`.

**Precedencia:** las reglas de este proyecto ganan siempre. Duraciones, curvas,
colores y espaciados salen de `frontend/src/theme/tokens.ts` (§8.12, ADR-017): si un
Skill de terceros propone un valor, se añade como token y no se escribe a mano.
Ninguna librería que mencionen (Sonner, Vaul, Motion, Tailwind…) se instala sin
ADR (§8.6).

---

## 5. Agentes: cuándo se invocan

Los agentes viven en `.claude/agents/`. Cada uno define responsabilidad, decisiones permitidas y condiciones de escalamiento.

- `business-analyst` → requerimiento → user story + criterios
- `architect` → impacto estructural, ADRs
- `backend-engineer` / `frontend-engineer` → implementación
- `database-engineer` → modelo, migraciones, puertos de datos
- `security-engineer` → revisión de seguridad y autorización
- `qa-engineer` → plan de pruebas y cobertura de riesgo
- `devops-engineer` → Docker, NGINX, pipelines
- `code-reviewer` → gate final antes de DONE

En trabajo secuencial de un solo agente, **asume los roles en orden**: analista → arquitecto → seguridad → implementación → QA → review.

---

## 6. Definition of Ready

No se implementa nada hasta que la historia tenga:

- [ ] Objetivo y beneficio claros
- [ ] Actor/rol identificado
- [ ] Criterios de aceptación Given/When/Then
- [ ] Reglas de negocio explícitas
- [ ] Dependencias identificadas
- [ ] Impacto de API evaluado
- [ ] Impacto de datos evaluado
- [ ] Seguridad evaluada
- [ ] Autorización evaluada (¿qué permiso protege esto?)
- [ ] Escenarios de error definidos
- [ ] Estrategia de pruebas definida

---

## 7. Definition of Done

- [ ] Todos los Acceptance Criteria cumplidos y verificados por pruebas
- [ ] `pnpm build` compila
- [ ] `pnpm typecheck` sin errores
- [ ] `pnpm lint` sin errores
- [ ] Unit tests pasan
- [ ] Integration tests pasan (cuando aplican)
- [ ] E2E tests pasan (cuando aplican)
- [ ] Revisión de seguridad hecha (Skill `security`)
- [ ] Autorización validada (permiso correcto, test de 401 y 403)
- [ ] OpenAPI/Swagger actualizado
- [ ] Documentación actualizada (incl. ADR si aplica)
- [ ] Logging estructurado apropiado, sin datos sensibles
- [ ] Migraciones creadas y reversibles (cuando aplican)
- [ ] Sin secretos en el código ni en el historial
- [ ] Sin `TODO`/`FIXME` críticos sin issue asociado

---

## 8. Restricciones no negociables

1. Frontend **nunca** accede a base de datos. Solo REST sobre HTTPS.
2. Domain y Application Layer **nunca** importan Prisma, `@prisma/client` ni drivers.
3. Ningún endpoint sin contrato documentado en OpenAPI.
4. Ningún endpoint sin decisión explícita de autenticación y autorización (incluido "público, y por qué").
5. Ningún secreto en Git. Solo `.env.example` con valores vacíos o de ejemplo.
6. Ningún framework, ORM, librería UI, base de datos o patrón arquitectónico nuevo sin ADR.
7. No se borran ni se marcan como `skip` pruebas para que pase el pipeline.
8. No se devuelve `200 OK` para representar un error funcional.
9. Los modelos de base de datos **no** se exponen como contrato de API. Siempre DTOs.
10. La primera ejecución del template **no** crea funcionalidad de negocio.
11. El **menú no se declara en el frontend**. Sale de `GET /me/menu`, es decir, de las
    opciones que la base de datos concede al usuario (ADR-018).
12. Ningún componente escribe un hex, una duración o un píxel a mano: todo sale del tema
    (`frontend/src/theme/tokens.ts`, ADR-017).

---

## 9. Fast Path (cambios triviales)

Aplica solo a: typos, textos, estilos sin cambio de comportamiento, bumps de versión de parche,
comentarios y documentación.

Flujo permitido: `coding-standards` → cambio → lint/typecheck/test → commit.

**No aplica** si el cambio toca: endpoints, auth, permisos, modelo de datos, configuración, dependencias o infraestructura.

---

## 10. Comandos

```bash
pnpm install          # instalar workspace completo
pnpm dev              # frontend + backend en watch
pnpm lint             # ESLint en todos los paquetes
pnpm typecheck        # tsc --noEmit
pnpm test             # unit tests
pnpm test:e2e         # Playwright (frontend) / e2e Nest (backend)
pnpm build            # build de producción
docker compose up -d  # stack completo con NGINX y PostgreSQL
```

---

## 11. Cuando no sepas algo

1. Busca en `docs/adr/` si ya se decidió.
2. Busca en el Skill correspondiente.
3. Si sigue sin estar definido y **no** afecta arquitectura, seguridad, interoperabilidad,
   contrato público ni modelo de datos: aplica buena práctica y **documéntala** en el archivo relevante.
4. Si **sí** afecta alguno de esos cinco puntos: **detente**, propón un ADR y escala al usuario.

No inventes requerimientos de negocio. No asumas reglas de negocio no escritas.
