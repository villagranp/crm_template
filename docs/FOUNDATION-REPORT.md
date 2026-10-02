# Foundation Report — Enterprise Project Template

**Fase ejecutada:** PHASE 1 — Enterprise Project Foundation
**Fecha:** 2026-09-22 · **Ampliación:** 2026-09-24 (sistema de diseño y núcleo de gestión)
**Alcance:** plantilla reutilizable para desarrollo asistido por IA.
**Fuera de alcance por diseño:** toda funcionalidad de negocio.

Este documento es el cierre de la fase. Describe qué se construyó, por qué,
qué contradicciones del brief se resolvieron y qué queda pendiente de decidir
en cada proyecto derivado.

---

## 1. Repository structure

```text
project-template/
├── CLAUDE.md                     # Punto de entrada obligatorio para agentes de IA
├── AGENTS.md                     # Reglas de comportamiento de agentes
├── ARCHITECTURE.md               # Vista de sistema + diagramas C4 y de flujo
├── API-STANDARDS.md              # Contrato REST vinculante
├── CODING-STANDARDS.md           # Naming, estilo, estructura
├── SECURITY.md                   # Línea base de seguridad (OWASP Top 10)
├── AUTHENTICATION.md             # Modelo de autenticación y extensión
├── TESTING.md                    # Estrategia y niveles de prueba
├── DEVELOPMENT.md                # Levantar y operar el entorno local
├── CONTRIBUTING.md               # Ramas, commits, pull requests
├── CHANGELOG.md / README.md
├── package.json                  # Workspace raíz + script `verify`
├── pnpm-workspace.yaml           # frontend, backend
├── tsconfig.base.json            # TypeScript strict compartido
├── docker-compose.yml            # postgres + backend + frontend + nginx
├── .env.example                  # Todas las variables, sin valores reales
│
├── .claude/
│   ├── agents/                   # 9 agentes especializados
│   └── skills/                   # 23 skills ejecutables
│
├── backend/                      # NestJS 11 (skeleton, sin dominio)
│   ├── src/
│   │   ├── common/               # guards, filters, interceptors, decorators, DTOs
│   │   ├── config/               # validación de entorno con Zod
│   │   ├── infrastructure/       # logging, authentication, database (puertos + adaptadores)
│   │   ├── modules/access/       # identidad local, permisos, menú y administración
│   │   └── modules/health/       # health y readiness
│   ├── prisma/schema.prisma      # núcleo de gestión (27 modelos, sin negocio)
│   ├── prisma/seed.ts            # semilla idempotente del catálogo de accesos
│   ├── test/                     # pruebas e2e de API
│   └── Dockerfile                # multi-stage, contexto = raíz del monorepo
│
├── frontend/                     # React 18.3 + Vite (skeleton, sin dominio)
│   ├── src/
│   │   ├── app/                  # App, providers
│   │   ├── components/           # layout y feedback transversales
│   │   ├── config/               # validación de VITE_* con Zod
│   │   ├── hooks/ stores/        # estado de cliente y hooks compartidos
│   │   ├── routes/               # tabla de rutas + páginas del esqueleto
│   │   ├── services/api/         # cliente HTTP único + TanStack Query
│   │   ├── services/auth/        # puerto AuthProvider + adaptadores
│   │   ├── theme/                # tokens y tema Material UI (sistema Grupo AG)
│   │   └── test/                 # setup y harness de pruebas
│   ├── public/brand/             # activos de marca (logotipos, favicon, fondo de acceso)
│   ├── nginx/static.conf         # servidor estático del contenedor SPA
│   ├── tests/e2e/                # Playwright
│   └── Dockerfile                # multi-stage, contexto = raíz del monorepo
│
├── infrastructure/
│   ├── nginx/                    # proxy de borde (nginx.conf + conf.d/)
│   ├── docker/                   # documentación y overrides de contenedores
│   └── scripts/                  # bootstrap.sh, verify.sh
│
├── azure-pipelines/
│   ├── pull-request.yml          # quality gate de PR
│   ├── backend.yml / frontend.yml
│   └── templates/                # setup-node, verify, security-scan, docker-build
│
└── docs/
    ├── adr/                      # 18 ADR + índice + plantilla
    ├── design/                   # spec original del cliente + sistema de diseño vigente
    ├── requirements/ user-stories/ implementation-plans/
    ├── architecture/ api/ database/ security/ testing/ deployment/ diagrams/
    └── FOUNDATION-REPORT.md      # este documento
```

**Totales:** 106 directorios, 239 archivos. 56 archivos TypeScript en backend,
53 en frontend, 25 skills, 9 agentes, 18 ADR.

La ampliación del 24 de septiembre añadió dos bloques que no estaban en la fase
original: el **sistema de diseño Grupo AG** (sección 22) y el **núcleo de
gestión de accesos** (sección 23).

---

## 2. Files created

| Área | Archivos | Contenido principal |
|---|---:|---|
| Gobernanza raíz | 12 | CLAUDE.md, AGENTS.md, ARCHITECTURE.md, API-STANDARDS.md, CODING-STANDARDS.md, SECURITY.md, AUTHENTICATION.md, TESTING.md, DEVELOPMENT.md, CONTRIBUTING.md, CHANGELOG.md, README.md |
| Configuración raíz | 10 | package.json, pnpm-workspace.yaml, tsconfig.base.json, .env.example, docker-compose.yml, .gitignore, .dockerignore, .editorconfig, .nvmrc, .npmrc, .prettierrc.json, .prettierignore |
| Agentes | 9 | architect, business-analyst, frontend-engineer, backend-engineer, database-engineer, security-engineer, qa-engineer, devops-engineer, code-reviewer |
| Skills | 25 | orquestador `feature-development` + 24 skills especializadas |
| ADR | 20 | 18 decisiones + índice + plantilla |
| Backend | 62 | 56 `.ts` (incluye el módulo `access` y la semilla), pruebas, Dockerfile, esquema Prisma |
| Frontend | 66 | 53 `.ts`/`.tsx` (tema, shell, servicios), activos de marca, configuración, Dockerfile |
| Infraestructura | 6 | nginx.conf, app.conf, security-headers.conf, bootstrap.sh, verify.sh, README |
| Azure DevOps | 7 | 3 pipelines + 4 templates |
| Documentación | 14 | README de cada carpeta de `docs/`, sistema de diseño y modelo de datos |

---

## 3. Architecture decisions

Decisiones estructurales que condicionan todo lo demás:

1. **Monorepo pnpm** con dos workspaces (`frontend`, `backend`). Un solo
   comando `pnpm verify` reproduce exactamente el quality gate del pipeline.
2. **Separación estricta frontend/backend.** El frontend nunca contiene reglas
   de negocio; su validación es de experiencia de usuario y la autoritativa
   siempre está en el backend.
3. **Arquitectura modular por defecto, Clean Architecture por excepción**
   (ADR-014). Un módulo nace plano y se promueve a capas cuando cumple
   criterios explícitos y escritos, no por gusto del autor.
4. **Acceso a datos detrás de puertos** (ADR-004). Prisma vive confinado en
   `infrastructure/`; el dominio depende de interfaces, nunca del ORM.
5. **Autenticación seleccionable por configuración** (ADR-006): un puerto
   `AuthenticationProvider` con adaptadores local y Entra ID, tanto en backend
   como en frontend.
6. **Autorización deny-by-default** (ADR-008): todo endpoint exige un permiso
   `resource.action` explícito o un `@Public()` con razón escrita.
7. **Observabilidad desde el primer día** (ADR-016): correlation ID generado en
   el borde, propagado por NGINX, el backend y el cliente HTTP del frontend.
8. **NGINX de borde como único punto de entrada**: `/` a la SPA, `/api/` al
   backend, cabeceras de seguridad y límites de tasa.

---

## 4. ADRs created

| ADR | Decisión | Nota |
|---|---|---|
| ADR-001 | React + TypeScript + Vite (React 18.3) | Versión alineada con MUI v6 |
| ADR-002 | NestJS como framework de backend | |
| ADR-003 | PostgreSQL + Prisma por defecto | |
| ADR-004 | Abstracción de acceso a datos mediante puertos | Resuelve contradicción |
| ADR-005 | Estándar REST y versionado por URI | |
| ADR-006 | Arquitectura de autenticación extensible | |
| ADR-007 | Microsoft Entra ID como proveedor corporativo | |
| ADR-008 | RBAC + permisos `resource.action` | |
| ADR-009 | Material UI como única librería de UI | |
| ADR-010 | Docker multi-stage y usuario sin privilegios | |
| ADR-011 | NGINX como reverse proxy de borde | |
| ADR-012 | Azure DevOps para CI; despliegue fuera de alcance | |
| ADR-013 | Estrategia de pruebas y pirámide | |
| ADR-014 | Arquitectura modular con promoción a capas | **Añadido** |
| ADR-015 | Snowflake como fuente analítica de solo lectura | **Añadido** |
| ADR-016 | Observabilidad y correlation ID | **Añadido** |
| ADR-017 | Sistema de diseño Grupo AG sobre Material UI | **Ampliación** |
| ADR-018 | Modelo de identidad, acceso y opciones de menú | **Ampliación** |

Los tres ADR marcados como añadidos no estaban en la lista mínima del brief:
existen porque resuelven contradicciones detectadas (sección 20).

---

## 5. Agents created

| Agente | Responsabilidad | Escala cuando… |
|---|---|---|
| `architect` | Diseño de sistema, límites de módulos, ADR | la decisión cambia un contrato público o un ADR aceptado |
| `business-analyst` | Requisitos, historias, criterios de aceptación | el requisito es ambiguo o contradice una regla existente |
| `frontend-engineer` | SPA React, estado, formularios, accesibilidad | necesita una regla de negocio no expuesta por la API |
| `backend-engineer` | Módulos NestJS, contratos, validación | falta contrato de API o permiso definido |
| `database-engineer` | Modelo de datos, migraciones, índices | una migración puede bloquear una tabla grande |
| `security-engineer` | Controles, revisión, modelo de amenazas | detecta exposición de datos personales o secretos |
| `qa-engineer` | Plan de pruebas, trazabilidad, cobertura | un criterio de aceptación no es verificable |
| `devops-engineer` | Contenedores, pipelines, configuración | se requiere un recurso o secreto de plataforma |
| `code-reviewer` | Cumplimiento de estándares y del Definition of Done | encuentra deuda que no puede aceptarse en silencio |

Cada agente declara en su archivo: responsabilidad, decisiones permitidas,
skills obligatorias, verificaciones requeridas, salidas esperadas y condiciones
de escalamiento.

---

## 6. Skills created

**Orquestador:** `feature-development` — selecciona las skills aplicables en su
Fase 0 y gobierna las seis fases del flujo. Es el punto de entrada de cualquier
cambio funcional.

| Categoría | Skills |
|---|---|
| Producto | `requirements-analysis`, `user-story` |
| Arquitectura | `architecture`, `adr`, `api-design` |
| Backend | `backend-nestjs`, `database`, `prisma`, `snowflake` |
| Frontend | `frontend-react` |
| Seguridad | `security`, `authentication`, `entra-id`, `authorization` |
| Calidad | `testing`, `code-review`, `coding-standards` |
| Plataforma | `docker`, `nginx`, `azure-devops`, `observability` |
| Documentación | `documentation` |
| Identidad visual | `design-system` |
| Gestión de accesos | `access-management` |

Todas comparten la misma estructura: propósito, cuándo usarla, contexto
requerido, entradas, estándares, proceso, verificaciones obligatorias, salida
esperada, anti-patrones, Definition of Done y skills relacionadas.

---

## 7. Coding standards defined

- TypeScript `strict` en todo el monorepo desde `tsconfig.base.json`.
- Nombres de archivo en `kebab-case`, excepto componentes React, que usan
  `PascalCase.tsx` (resolución de contradicción, sección 20).
- Sufijos por rol: `*.service.ts`, `*.controller.ts`, `*.module.ts`,
  `*.dto.ts`, `*.guard.ts`, `*.port.ts`, `*.provider.ts`, `*.store.ts`.
- Pruebas: `*.spec.ts` / `*.spec.tsx` para unidad e integración,
  `*.e2e.spec.ts` para extremo a extremo.
- Interfaces sin prefijo `I`. Enumerados en `PascalCase`, constantes en
  `UPPER_SNAKE_CASE`.
- Prohibidos: `any`, números y cadenas mágicas, `console.log` en producción,
  promesas sin manejar, comentarios que repiten el código.
- Importes por alias `@/…` dentro de cada workspace; sin rutas relativas
  profundas.
- Dinero como cadena decimal con su moneda; fechas siempre ISO-8601 en UTC.
- Prettier y ESLint con `--max-warnings 0`: una advertencia rompe el build.

---

## 8. API standards defined

- REST sobre sustantivos en plural, versionado por URI (`/api/v1/...`).
- Métodos con semántica estricta y códigos de estado acotados por operación.
- Colecciones devuelven `{ data, pagination }`; un recurso único se devuelve
  plano, sin envoltorio (resolución de contradicción, sección 20).
- Paginación `page`/`pageSize` con máximo 100, orden por `sortBy`/`sortOrder`.
- **Una sola forma de error** en toda la API:
  `{ statusCode, code, message, details, correlationId }`. Nunca se filtra el
  stack ni el mensaje interno de la base de datos.
- Validación de entrada con DTO y `class-validator`, con `whitelist` y
  `forbidNonWhitelisted`: un campo no declarado es un error, no se ignora.
- OpenAPI generado desde los decoradores, nunca escrito a mano. Swagger UI
  disponible solo fuera de producción y bloqueado además en el borde.
- Todo endpoint declara permiso o `@Public('razón')`.

---

## 9. Authentication architecture

```text
Cliente → NGINX → AuthenticationGuard → AuthenticationProvider (puerto)
                                          ├── LocalAuthenticationProvider  (JWT propio, jose)
                                          └── EntraIdAuthenticationProvider (OIDC + JWKS remoto)
                                        → PermissionResolver (puerto) → principal con permisos
```

- El proveedor se elige por configuración (`AUTH_PROVIDER=local|entra|hybrid`).
- El guard es global y **deniega por defecto**; solo `@Public()` con razón
  escrita abre un endpoint.
- Validación de token local: firma, `iss`, `aud` y tolerancia de reloj de 60 s.
- Validación de token de Entra: JWKS remoto cacheado, `iss`, `aud` y `tid`;
  identidad tomada de `oid`, con `sub` como alternativa.
- El frontend replica el mismo puerto (`AuthProvider`) con adaptadores local y
  Entra, para que habilitar Entra sea un cambio de adaptador y no de
  arquitectura.
- El token de acceso vive **solo en memoria** en el navegador; la continuidad
  de sesión depende de una cookie de refresco `HttpOnly` emitida por el
  backend. No se usa `localStorage` para material de token.
- `hybrid` está definido pero deliberadamente deshabilitado: lanza un error de
  arranque que exige un ADR del proyecto (sección 21).

---

## 10. Entra ID readiness

Lo que ya está listo:

- Adaptador de backend completo y funcional contra JWKS de Entra.
- Variables de entorno definidas y validadas (`ENTRA_TENANT_ID`,
  `ENTRA_CLIENT_ID`, `ENTRA_AUDIENCE`, `ENTRA_AUTHORITY`, `ENTRA_JWKS_URI`), con
  una validación que falla al arranque si falta alguna con `AUTH_PROVIDER=entra`.
- Contrato de frontend, configuración MSAL preparada y validación Zod de las
  `VITE_ENTRA_*`.
- Skill `entra-id` con el procedimiento de habilitación paso a paso.

Lo que queda para el proyecto que lo habilite:

- Registro de aplicación en el tenant (redirect URI, scope de API, exposición
  de la API y consentimiento).
- Instalar `@azure/msal-browser` y completar `EntraAuthProvider`.
- Decidir el origen de los permisos: el mapeo de grupos o app roles de Entra a
  permisos `resource.action` se resuelve en el backend, nunca leyendo claims
  crudos en el cliente.

La dependencia MSAL **no** se incluye a propósito: sin tenant no aporta valor y
el brief prohíbe dependencias que todavía no se necesitan.

---

## 11. Authorization model

- Modelo híbrido: **RBAC** para asignar y **permisos** para autorizar.
- Formato único de permiso: `resource.action` (por ejemplo `invoice.approve`).
- `PermissionsGuard` global: un endpoint sin `@RequirePermission` y sin
  `@Public()` se rechaza. Olvidar el decorador produce un error, no un agujero.
- La resolución de permisos es un puerto (`PermissionResolver`), implementado
  por `DatabasePermissionResolver`: los permisos salen de los roles y de las
  excepciones directas del usuario en la base de datos, nunca de los claims del
  token. El catálogo base trae 30 permisos de gestión; los del dominio los
  añade cada proyecto (sección 23).
- El frontend usa `usePermission` solo para ocultar affordances. Nunca es un
  control de seguridad: el backend vuelve a verificar siempre.

---

## 12. Database abstraction

- PostgreSQL + Prisma es el camino por defecto (ADR-003).
- El dominio depende de **puertos** definidos en
  `backend/src/infrastructure/database/ports/`; Prisma solo aparece en los
  adaptadores (ADR-004).
- `prisma/schema.prisma` contiene el núcleo de gestión (27 modelos: identidad,
  autorización, menú, organización, soporte y auditoría). **No hay entidades de
  negocio**: eso lo aporta cada proyecto (sección 23).
- MariaDB y MySQL se soportan cambiando el `provider` de Prisma y revisando
  tipos específicos; el impacto queda contenido en la capa de adaptadores.
- Snowflake tiene su propio puerto (`AnalyticsDataProvider`) y es de **solo
  lectura**: nunca es el almacén transaccional (ADR-015).
- Toda migración va en control de versiones. Ningún cambio manual en entornos
  compartidos.

---

## 13. Testing strategy

| Nivel | Herramienta | Alcance |
|---|---|---|
| Unidad backend | Jest | servicios, guards, filtros, mapeos |
| Integración/API backend | Jest + Supertest | contrato HTTP real contra PostgreSQL real |
| Unidad frontend | Vitest + Testing Library | componentes, hooks, cliente HTTP |
| E2E frontend | Playwright | recorridos críticos por la SPA |

- Pirámide: muchas unitarias, menos de integración, pocas E2E.
- Cada criterio de aceptación se mapea a al menos una prueba automatizada.
- Un bug se corrige empezando por una prueba que lo reproduce.
- Las pruebas describen comportamiento, no implementación.
- Ambos workspaces emiten JUnit para que el pipeline publique resultados sin
  pasos especiales.

El esqueleto incluye 7 archivos de prueba que verifican el cableado: health y
readiness, formato de error, correlation ID, cliente HTTP, tema, render de
página y —el más importante— la resolución de acceso efectivo, con 15 casos que
cubren la precedencia de `DENY` y el filtrado del menú por permiso.

---

## 14. Docker architecture

- **Multi-stage** en ambas imágenes: `deps → build → development | production`.
- **Contexto de build = raíz del monorepo.** Es una corrección respecto del
  planteamiento inicial: con contexto por aplicación, `tsconfig.base.json`, el
  lockfile y `pnpm-workspace.yaml` quedan fuera de alcance y el build no es
  reproducible.
- Backend en producción: solo `dist`, `node_modules` podados, `prisma` y
  `package.json`; usuario `node` sin privilegios; healthcheck a
  `/api/v1/health`.
- Frontend en producción: NGINX sirviendo el bundle como usuario `nginx` en el
  puerto 8080, sin privilegios elevados.
- Las variables `VITE_*` entran como build args y son **públicas** por
  definición; está documentado que jamás se pase un secreto por esa vía.
- `docker-compose.yml` levanta postgres, backend, frontend y el NGINX de borde,
  con healthchecks y dependencias ordenadas.

---

## 15. NGINX architecture

Dos capas, con responsabilidades separadas a propósito:

1. **Servidor estático del contenedor frontend** (`frontend/nginx/static.conf`):
   sirve el bundle, hace el fallback SPA y fija caché inmutable para
   `/assets/` y `no-store` para `index.html`.
2. **Proxy de borde** (`infrastructure/nginx/`): único punto de entrada.
   - `/` al contenedor frontend, `/api/` al backend.
   - `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Real-IP`.
   - Genera el correlation ID si el cliente no lo envía.
   - `server_tokens off`, límites de cuerpo y cabeceras, timeouts,
     `limit_req` y `limit_conn`, gzip selectivo.
   - Cabeceras de seguridad con CSP restrictiva (`frame-ancestors 'none'`,
     `object-src 'none'`, sin scripts en línea).
   - `/api/docs` devuelve 404 en el borde.
   - Log de acceso en JSON, con el correlation ID como campo.

TLS no se configura aquí: se asume terminado en el ingress de la plataforma.
Terminarlo en esta capa requiere un ADR del proyecto.

---

## 16. Azure DevOps setup

| Pipeline | Disparador | Hace |
|---|---|---|
| `pull-request.yml` | PR a `main`, `develop`, `release/*` | quality gate, auditoría de dependencias, build de imágenes sin push |
| `backend.yml` | cambios en backend | verify + pruebas de API contra PostgreSQL real + empaquetado de imagen |
| `frontend.yml` | cambios en frontend | verify + Playwright + publicación del bundle + empaquetado de imagen |

Templates reutilizables: `setup-node.yml` (Node + pnpm + caché del store),
`verify.yml` (formato, lint, tipos, pruebas, build y publicación de resultados),
`security-scan.yml` (auditoría de dependencias y verificación de que ningún
`.env` esté versionado) y `docker-build.yml` (build y push opcional).

`verify.yml` ejecuta exactamente lo mismo que `pnpm verify` y que
`infrastructure/scripts/verify.sh`. Si se añade una verificación en el
pipeline, debe añadirse también al script, para que un fallo de CI siempre sea
reproducible en local.

**No hay etapas de despliegue**, y es deliberado: el runtime de destino (App
Service, AKS, Container Apps) es una decisión de cada proyecto que exige su
propio ADR.

---

## 17. Security controls implemented

| Control | Dónde |
|---|---|
| Deny-by-default en autenticación y autorización | guards globales del backend |
| Validación estricta de entrada | `ValidationPipe` con whitelist y rechazo de campos no declarados |
| Validación de configuración al arranque | esquemas Zod en backend y frontend; falla rápido y nunca imprime valores |
| Formato de error único, sin filtrado de internos | `AllExceptionsFilter` |
| Redacción de campos sensibles en logs | `AppLoggerService` |
| Cabeceras de seguridad | Helmet en el backend + cabeceras y CSP en el borde |
| CORS con lista de orígenes permitidos | `main.ts` |
| Rate limiting | throttler del backend + `limit_req`/`limit_conn` en NGINX |
| Contenedores sin privilegios | usuarios `node` y `nginx`; puerto no privilegiado |
| Token de acceso fuera de `localStorage` | `LocalAuthProvider` del frontend |
| Secretos fuera del repositorio | `.gitignore`, `.env.example` sin valores, verificación en pipeline |
| Auditoría de dependencias | `pnpm audit --audit-level=high` en CI |
| Registro de auditoría | modelo `AuditLog` con diferencia de cambios, sin datos sensibles |
| Permisos fuera del token | `DatabasePermissionResolver`: se leen de la base de datos en cada petición |
| Excepciones de acceso justificadas | `reason` obligatorio y `expiresAt` en asignaciones directas |
| Tokens de sesión y de restablecimiento hasheados | `user_sessions`, `password_reset_tokens` |
| Enumeración de cuentas evitada | `login_attempts` con `user_id` nulo si el correo no existe |
| Sin dependencias de terceros en tiempo de ejecución | fuentes e iconos auto-alojados; CSP cerrada a CDNs |

`SECURITY.md` mapea cada control contra OWASP Top 10.

---

## 18. Observability

- **Correlation ID** generado en el borde si el cliente no lo aporta,
  propagado a backend y devuelto en toda respuesta de error. El middleware del
  backend valida el formato antes de reutilizar un valor entrante, para que una
  cabecera maliciosa no contamine los logs.
- El cliente HTTP del frontend genera y envía un correlation ID en cada
  petición, y lo muestra en los mensajes de error para que un usuario pueda
  reportarlo.
- **Logging estructurado en JSON** con niveles, campos fijos y redacción de
  claves sensibles. Sin `console.log`.
- **Access log de NGINX en JSON**, con el mismo correlation ID, para poder unir
  la línea del borde con la traza del backend.
- **Health y readiness separados**: `/api/v1/health` no toca dependencias
  (liveness) y `/api/v1/ready` verifica la base de datos (readiness).
- Métricas y trazas distribuidas quedan como decisión pendiente (sección 21):
  elegir OpenTelemetry o Application Insights sin conocer la plataforma de
  destino sería una decisión arbitraria.

---

## 19. Current limitations

Declaradas con honestidad, porque afectan a la confianza que merece esta
entrega:

1. **No se ejecutaron `pnpm install`, `lint`, `typecheck`, `test` ni `build`.**
   El entorno de construcción no dispone de `pnpm` ni de acceso al registro de
   paquetes. La validación realizada fue estructural: parseo de todos los JSON
   y YAML, verificación de que cada importe por alias y cada importe relativo
   resuelve a un archivo existente, y verificación de los enlaces entre
   documentos. **El primer `pnpm install` en un entorno real puede revelar
   ajustes de versiones.**
2. **No se ejecutó `docker build` ni `docker compose config`.** Docker no está
   disponible en el entorno. Los Dockerfiles están escritos con el contexto
   correcto, pero no han sido construidos.
3. **No existe `pnpm-lock.yaml`.** Se genera en la primera instalación. Hasta
   entonces, los rangos `^` de las dependencias no están fijados y los
   pipelines caen al `pnpm install` sin `--frozen-lockfile`. Generar y
   versionar el lockfile es el primer paso del primer proyecto.
4. **El login local no está implementado.** Ahora sí existen las tablas
   (`users`, `user_credentials`, `user_sessions`, `login_attempts`), pero
   **faltan el endpoint de login, el hashing y la rotación del refresh token**.
   El template deja el modelo, el puerto, el guard y la validación de token.
   Al implementarlo, el algoritmo es Argon2id y la dependencia todavía no está
   instalada.
5. **El adaptador MSAL del frontend es un contrato, no una implementación.**
6. **No se pudo ejecutar `prisma validate` ni generar el cliente.** El motor de
   Prisma se descarga de `binaries.prisma.sh`, fuera de la lista de dominios
   permitidos del entorno de construcción. El esquema se revisó a mano y se
   corrigió el uso de `@@index(..., name:)` por `map:` (obligatorio desde
   Prisma 4), pero **no está verificado contra el motor real**. Es lo primero
   que conviene comprobar: `pnpm --filter @app/backend run prisma:generate`.
7. **`AUTH_PROVIDER=hybrid` no arranca**: lanza un error que exige un ADR.
8. **Sin etapas de despliegue** en los pipelines (ver sección 16).
9. **Snowflake tiene puerto pero no adaptador**: falta la dependencia y las
   credenciales, que son específicas del proyecto.
10. **Las versiones de dependencias no fueron resueltas contra el registro.**
    Están elegidas por compatibilidad conocida, no verificadas en ejecución.
11. **La capa visual no se ha visto renderizada.** No hay navegador en el
    entorno de construcción: el tema, el shell y las pantallas están escritos
    contra el spec, pero nadie los ha mirado. Conviene revisarlos en los
    breakpoints del checklist antes de darlos por buenos.
12. **No hay pantallas de administración.** Los endpoints de gestión existen y
    están documentados; la interfaz para usarlos (usuarios, roles, opciones) es
    el primer trabajo del primer proyecto, y para eso está la skill
    `access-management`.
13. **Los logotipos pesan ~80 KB cada uno** (3679 px). El CRM original ya lo
    tenía anotado como pendiente; conviene exportarlos a SVG o a ~400 px.

---

## 20. Contradictions detected and resolved

El brief contenía instrucciones que no podían cumplirse simultáneamente. Cada
una se resolvió de forma explícita y quedó documentada.

| # | Contradicción | Resolución | Dónde |
|---|---|---|---|
| 1 | "Todos los archivos en kebab-case" frente a la convención de React de componentes en PascalCase | `PascalCase.tsx` solo para componentes React; `kebab-case` para todo lo demás | CODING-STANDARDS §9 |
| 2 | "Jest o Vitest" sin decidir | Jest en backend (camino soportado por NestJS), Vitest en frontend (integrado con Vite) | ADR-013 |
| 3 | "PostgreSQL + Prisma" frente a "no acoplar el dominio a Prisma" | Prisma por defecto, confinado tras puertos en `infrastructure/` | ADR-003, ADR-004 |
| 4 | "Clean Architecture donde aporte valor" frente a "sin sobreingeniería" | Módulos planos por defecto, promoción a capas con criterios escritos | ADR-014 |
| 5 | Autenticación `hybrid` frente a KISS | Definida en el contrato, deshabilitada en ejecución hasta que exista un ADR del proyecto | ADR-006 |
| 6 | "Evitar envoltorios" frente a paginación con metadatos | Colecciones con `{data, pagination}`; recurso único plano | API-STANDARDS |
| 7 | Snowflake listado junto a las bases transaccionales | Fijado como fuente analítica de solo lectura, nunca OLTP | ADR-015 |
| 8 | Estructura prescrita sin configuración compartida de TypeScript, lint ni formato | Añadidos `tsconfig.base.json`, configuración de ESLint y Prettier como decisión menor documentada | Este informe |
| 9 | React 19 en el brief frente a la compatibilidad declarada de Material UI v6 | React 18.3, con la migración documentada como cambio de dependencia | ADR-001 |
| 10 | Contexto de build de Docker por aplicación frente a monorepo pnpm | Contexto = raíz del repositorio en ambas imágenes | ADR-010, sección 14 |
| 11 | Plantilla visual en Bootstrap 5 + JS vanilla frente a React + Material UI de la plantilla | Se porta el **sistema de diseño**, no el código: tokens, tipografía, motion y responsive al tema de MUI | ADR-017 |
| 12 | El CRM declaraba el menú en `modules.js` (frontend) mientras la autorización vive en el backend | El menú se sirve desde la base de datos con `GET /me/menu`: una sola fuente para menú y permisos | ADR-018 |
| 13 | El CRM cargaba fuentes, iconos y librerías desde CDN sin SRI | Fuentes e iconos auto-alojados; ninguna librería de la referencia se adopta | ADR-017, sección 22 |
| 14 | "Sin funcionalidad de negocio" frente a "todo lo necesario de la parte de gestión" | La gestión de accesos es infraestructura, no negocio: entra completa. Las entidades del dominio siguen fuera | Sección 23 |

---

## 21. Pending decisions

Decisiones que este template **no** toma porque dependen del proyecto, y que
deben resolverse con un ADR antes de su primera implementación:

1. Runtime de despliegue y etapas de despliegue de los pipelines.
2. Origen de los permisos con Entra ID: grupos, app roles o catálogo propio.
3. Habilitación o descarte definitivo del modo `hybrid` de autenticación.
4. Estrategia de métricas y trazas: OpenTelemetry, Application Insights u otra.
5. Política de retención y de purga del registro de auditoría.
6. Estrategia de caché (si aparece Redis, con qué invalidación).
7. Internacionalización del frontend: si se requiere, elegir librería y formato.
8. Terminación de TLS: en el ingress de plataforma o en el NGINX de borde.
9. Motor de base de datos si no es PostgreSQL, con el impacto en tipos y
   migraciones.
10. Política de versiones de la API y ventana de soporte de versiones antiguas.

---

## 22. Design system

Origen: plantilla visual entregada por el cliente (CRM "Mi Cliente AG"). La
decisión de portar el sistema en vez de adoptar Bootstrap está en ADR-017.

| Pieza | Dónde |
|---|---|
| Tokens (paleta AG, escala de marca, semánticos, motion, layout, sombras) | `frontend/src/theme/tokens.ts` |
| Tema claro y oscuro | `frontend/src/theme/palette.ts`, `theme.ts` |
| Tipografía Poppins + Inter, fluida con `clamp()` | `frontend/src/theme/typography.ts` |
| Motion system (tabla componente → duración/easing/transform) | `frontend/src/theme/components.ts` |
| Shell: topbar, sidebar de tres estados, barra inferior, encabezado de página | `frontend/src/components/layout/` |
| Activos de marca | `frontend/public/brand/` |
| Spec original del cliente, íntegro | `docs/design/DESIGN-SPEC-SOURCE.md` |
| Traducción y reglas vigentes | `docs/design/DESIGN-SYSTEM.md` |

Reglas que quedan grabadas en la plantilla:

- Ningún componente escribe un hex, una duración o un píxel a mano.
- Nada de morado, teal ni naranja; los semánticos sólo para estado.
- Mobile first obligatorio; cero scroll horizontal de página.
- Sólo `transform`, `opacity` y `filter`; nunca `ease-in` (el tema lo mapea a
  la curva de salida para que no esté disponible ni por accidente).
- Áreas táctiles ≥ 44 px; `<input>` nunca bajo 16 px.
- Fuentes e iconos auto-alojados: la CSP del borde no se abre a ninguna CDN.

Lo que **no** se trajo: Bootstrap, jQuery, SweetAlert2, Toastr, Sortable y el
inventario de páginas de demostración del CRM (dashboards, kanban, calendario,
UI kit). Eran páginas de un producto concreto, no de una plantilla.

Cambiar de cliente son cuatro pasos, ninguno toca componentes: sustituir los
activos de marca, editar los tokens, cambiar las fuentes y ajustar las pruebas
del tema.

---

## 23. Management core (accesos, menú y soporte)

Modelo completo en `docs/database/data-model.md`; decisiones en ADR-018.

### Esquema

27 modelos y 8 enums en `backend/prisma/schema.prisma`:

| Bloque | Tablas |
|---|---|
| Identidad | `users`, `user_identities`, `user_credentials`, `user_sessions`, `login_attempts`, `password_reset_tokens` |
| Autorización | `permissions`, `roles`, `role_permissions`, `user_roles`, `user_permissions` |
| Menú | `app_modules`, `menu_options`, `role_menu_options`, `user_menu_options` |
| Organización | `teams`, `team_members` |
| Soporte | `system_parameters`, `user_preferences`, `catalogs`, `catalog_items`, `sequences`, `stored_files`, `notifications`, `approval_requests`, `approval_steps` |
| Auditoría | `audit_logs` |

### Resolución del acceso

```
permisos = (permisos de roles vigentes y activos)
         + (GRANT directos vigentes)
         - (DENY directos vigentes)
```

`DENY` gana siempre, incluso sobre lo heredado de un rol. Las opciones de menú
siguen la misma regla, con las mismas tablas espejo. Está implementado como
función pura en `AccessService` y cubierto por 15 pruebas unitarias que no
tocan base de datos.

### Decisiones que conviene no deshacer

- **El menú es un dato, no código.** Añadir una opción es un alta en
  `menu_options` más su asignación; el frontend sólo necesita una ruta que
  coincida con el `path`.
- **El menú se calcula en el servidor.** Menú y autorización no pueden
  divergir.
- **Los permisos no salen del token.** `DatabasePermissionResolver` sustituye
  al mapa estático vacío; un rol que llegue en un claim de Entra ID no concede
  nada por sí mismo.
- **Toda asignación directa lleva razón obligatoria** y puede caducar.
- **Nunca se guarda un token, sólo su hash** (sesiones y restablecimientos).
- **`login_attempts.user_id` es nulo si el correo no existe**: la API no
  permite averiguar qué cuentas existen.

### API

`/me`, `/me/menu` (autoservicio, con `@AuthenticatedOnly` y razón escrita),
`/users` y sus asignaciones, `/roles` y las suyas, `/permissions`,
`/menu-options`. Catálogo completo en `docs/api/README.md`.

Las asignaciones se reemplazan en bloque con `PUT`: idempotente y sin el estado
intermedio de un "quitar" y un "poner" separados.

### Semilla

Idempotente: 2 módulos, 30 permisos, 9 opciones, 4 roles
(`administrador`, `gestor-accesos`, `auditor`, `usuario`), 6 parámetros y el
administrador inicial en estado `INVITED` y sin credencial utilizable. Los
valores de los parámetros no se pisan al re-ejecutar; las asignaciones de los
roles de sistema sí se reponen.

---

## 24. How to create the first project

> Para publicar la plantilla en Azure DevOps y derivar proyectos de ella,
> el procedimiento completo está en
> [`docs/deployment/template-repository.md`](deployment/template-repository.md).

```bash
# 1. Copiar la plantilla y reiniciar el historial
cp -r project-template mi-proyecto && cd mi-proyecto
rm -rf .git && git init

# 2. Preparar el entorno (idempotente)
./infrastructure/scripts/bootstrap.sh

# 3. Generar y versionar el lockfile
pnpm install
git add pnpm-lock.yaml

# 4. Levantar la base de datos, aplicar el esquema y sembrar la gestión
docker compose up -d postgres
pnpm --filter @app/backend run prisma:migrate
pnpm --filter @app/backend run prisma:seed

# 5. Verificar que todo está verde antes de escribir nada
pnpm verify

# 6. Arrancar
pnpm run dev
```

Después, y antes de la primera historia:

1. Renombrar el proyecto en `package.json`, `README.md` y `CHANGELOG.md`.
2. Fijar `APP_NAME`, `JWT_ISSUER` y `JWT_AUDIENCE`.
3. Decidir `AUTH_PROVIDER` y, si es `entra`, completar el registro de
   aplicación y el adaptador MSAL.
4. Ampliar el catálogo de `prisma/seed/access-catalog.ts` con los módulos,
   permisos y opciones del proyecto, y construir las pantallas de
   administración (Skill `access-management`).
5. Sustituir los activos de `frontend/public/brand/` y los tokens de
   `frontend/src/theme/tokens.ts` si el cliente no es Grupo AG.
5. Revisar los ADR heredados: los que no apliquen se marcan como
   *Superseded* con su razón. No se borran.
6. Registrar en `docs/adr/` las decisiones pendientes de la sección 21 que el
   proyecto ya pueda cerrar.

---

## 25. How to develop the first feature

El flujo obligatorio es el de `CLAUDE.md` y lo orquesta
`.claude/skills/feature-development/SKILL.md`. Resumido:

1. **Requisito** → `requirements-analysis` → `docs/requirements/REQ-001-*.md`.
   Sin preguntas bloqueantes abiertas.
2. **Historia** → `user-story` → `docs/user-stories/US-001-*.md` con criterios
   de aceptación verificables. Debe cumplir el Definition of Ready.
3. **Diseño** → `architecture` y, si hay decisión estructural, `adr`.
4. **Contrato de API** → `api-design`, antes de cualquier implementación.
5. **Seguridad y permisos** → `security` y `authorization`: qué permisos se
   crean y dónde se verifican.
6. **Datos** → `database` y `prisma`: modelo, migración e índices.
7. **Plan** → `docs/implementation-plans/PLAN-US-001.md`, aprobado antes de
   escribir código.
8. **Plan de pruebas** → `testing`, con cada criterio de aceptación mapeado.
9. **Implementación** → `backend-nestjs` y `frontend-react`, siguiendo el plan.
   Si la realidad contradice el plan, se actualiza el plan, no se ignora.
10. **Pruebas** → unitarias, de integración y E2E de los recorridos críticos.
11. **Verificación** → `pnpm verify` en verde, sin advertencias.
12. **Revisión** → `code-review` contra el Definition of Done.
13. **Documentación** → `documentation`: actualizar lo que la funcionalidad
    haya dejado desactualizado, en el mismo pull request.

**Regla que no se negocia:** si en el paso 9 se descubre que falta una
decisión, se vuelve al paso que corresponda. Nunca se improvisa la decisión
dentro del código.
