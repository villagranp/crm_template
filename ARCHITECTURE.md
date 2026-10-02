# ARCHITECTURE.md

Arquitectura del **Enterprise Project Template**. Toda modificación estructural requiere ADR
en [`docs/adr/`](docs/adr/).

---

## 1. Principios

1. **Desacoplamiento total frontend/backend.** Única frontera: REST sobre HTTPS descrito en OpenAPI.
2. **Dependencias hacia adentro.** Presentation → Application → Domain. Infrastructure implementa puertos del Domain/Application; nunca al revés.
3. **La persistencia es un detalle.** Prisma, PostgreSQL y Snowflake viven detrás de puertos.
4. **Autenticación intercambiable.** JWT local y Entra ID son adaptadores del mismo puerto.
5. **Autorización explícita.** Todo endpoint declara su permiso.
6. **Sin capas decorativas.** Se aplica Clean Architecture donde agrega valor; un CRUD trivial no necesita cuatro capas (ADR-004, ADR-014).
7. **Observabilidad desde el día uno.** Correlation ID, logging estructurado, health/ready.

---

## 2. System Context

```mermaid
C4Context
  title System Context
  Person(user, "Usuario de negocio", "Navegador")
  Person(svc, "Sistema integrado", "Cliente M2M")
  System(app, "Enterprise Application", "React SPA + NestJS API")
  System_Ext(entra, "Microsoft Entra ID", "OAuth 2.0 / OIDC")
  System_Ext(pg, "PostgreSQL", "Datos transaccionales")
  System_Ext(snow, "Snowflake", "Analytics / Data Platform")
  System_Ext(api, "APIs externas", "Integraciones")
  Rel(user, app, "HTTPS")
  Rel(svc, app, "HTTPS + client credentials")
  Rel(app, entra, "OIDC / validación de tokens")
  Rel(app, pg, "SQL vía Prisma")
  Rel(app, snow, "SQL analítico vía adaptador")
  Rel(app, api, "HTTPS")
```

---

## 3. Container Diagram

```mermaid
flowchart TB
  B["Navegador — React SPA"] -->|HTTPS| N["NGINX — reverse proxy"]
  N -->|"/"| S["Static assets (SPA)"]
  N -->|"/api/"| A["NestJS API"]
  A --> AL["Application Layer — use cases"]
  AL --> D["Domain Layer — entidades y reglas"]
  AL --> P["Ports / Interfaces"]
  P --> PR["PrismaRepository → PostgreSQL / MariaDB / MySQL"]
  P --> SN["SnowflakeAdapter → Analytics"]
  P --> EX["HttpAdapter → APIs externas"]
  A -.->|valida tokens| E["Microsoft Entra ID"]
```

El frontend **nunca** accede a una base de datos ni conoce credenciales de datos.

---

## 4. Frontier frontend / backend

| | Frontend | Backend |
|---|---|---|
| Fuente de verdad de reglas de negocio | No | **Sí** |
| Validación | UX (Zod) | **Autoritativa (DTO + pipes)** |
| Autorización | Solo oculta UI | **Decide acceso** |
| Estado de servidor | TanStack Query | — |
| Contrato | Consume OpenAPI | **Publica OpenAPI** |

Ocultar un botón en el frontend **no** es un control de seguridad.

---

## 5. Capas del backend

```text
presentation/   Controllers, DTOs, Swagger, guards de ruta
application/    Use cases, orquestación, transacciones, puertos consumidos
domain/         Entidades, value objects, reglas invariantes, puertos definidos
infrastructure/ Prisma, Snowflake, HTTP clients, auth providers, logging
```

Reglas:

- `domain/` no importa nada de `infrastructure/`, ni NestJS, ni Prisma.
- `application/` depende de interfaces, nunca de implementaciones concretas.
- Los módulos simples pueden empezar planos (`module/` con controller + service + repository)
  y evolucionar a cuatro carpetas cuando la complejidad lo justifique (ADR-014).

---

## 6. Data Access

```mermaid
flowchart LR
  UC["Use Case"] --> R["CustomerRepository (port)"]
  R --> PP["PrismaCustomerRepository"]
  R --> SR["SnowflakeCustomerReadModel"]
  PP --> PG[("PostgreSQL")]
  PP --> MD[("MariaDB / MySQL")]
  SR --> SF[("Snowflake")]
```

- Puerto transaccional: `*Repository` (escritura + lectura consistente).
- Puerto analítico: `AnalyticsRepository`, `ReportingRepository`, `DataProvider`, `IntegrationRepository`.
- Un caso de uso puede combinar ambos, pero **no** mezcla transacción OLTP con consulta Snowflake
  dentro de la misma unidad de trabajo.

Detalle en ADR-004 y en el Skill `database`.

---

## 7. Flujo de autenticación — Local JWT

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as React SPA
  participant A as NestJS API
  U->>F: credenciales
  F->>A: POST /api/v1/auth/login
  A->>A: verifica hash (Argon2id)
  A-->>F: accessToken (corto) + refreshToken (cookie httpOnly)
  F->>A: request con Authorization: Bearer
  A->>A: valida firma, exp, nbf, iss, aud
  A-->>F: recurso
  F->>A: POST /api/v1/auth/refresh (rotación)
  A-->>F: nuevo par de tokens
```

## 8. Flujo de autenticación — Microsoft Entra ID

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as React SPA (MSAL)
  participant E as Entra ID
  participant A as NestJS API
  U->>F: iniciar sesión
  F->>E: Authorization Code + PKCE
  E-->>F: id_token + access_token (audience = API)
  F->>A: Authorization: Bearer access_token
  A->>E: JWKS (cacheado)
  A->>A: valida firma, iss, aud, exp, nbf, claims
  A->>A: mapea claims → identidad de aplicación → roles → permisos
  A-->>F: recurso
```

## 9. Flujo de autorización

```mermaid
flowchart LR
  T["Token validado"] --> I["ApplicationIdentity"]
  I --> RL["Roles"]
  RL --> PM["Permissions (resource.action)"]
  PM --> G["PermissionsGuard"]
  G -->|permitido| H["Handler"]
  G -->|sin permiso| F403["403 Forbidden"]
  T -->|inválido o ausente| F401["401 Unauthorized"]
```

## 10. Despliegue (entorno local y de referencia)

```mermaid
flowchart TB
  subgraph Docker Compose
    NG["nginx:alpine — 80"]
    FE["frontend — build estático servido por NGINX"]
    BE["backend — node:22-alpine — 3000"]
    DB[("postgres:16 — 5432")]
  end
  NG --> FE
  NG --> BE
  BE --> DB
```

En Azure DevOps el mismo artefacto se publica como imagen; la topología de producción real
se define por proyecto (ADR-012).

---

## 11. Núcleo de gestión: accesos y menú

El acceso efectivo de un usuario se resuelve en el servidor a partir de la base de datos,
nunca de los claims del token (ADR-018).

```mermaid
flowchart TB
  TK["Token validado<br/>(local o Entra ID)"] --> RES["DatabasePermissionResolver"]
  RES --> MAP["AccessService.findUserIdForPrincipal<br/>UserIdentity → User"]
  MAP --> SNAP["AccessRepository.getUserAccessSnapshot"]
  SNAP --> CALC{"Resolución"}
  CALC --> P1["permisos de roles vigentes"]
  CALC --> P2["+ GRANT directos"]
  CALC --> P3["− DENY directos (ganan siempre)"]
  P1 --> EFF["Permisos efectivos"]
  P2 --> EFF
  P3 --> EFF
  EFF --> GUARD["PermissionsGuard<br/>@RequirePermission"]
  EFF --> MENU["GET /me/menu<br/>opciones concedidas ∩ permisos"]
```

Consecuencia de diseño: **el menú y la autorización no pueden divergir**, porque se calculan
con la misma información y en el mismo sitio. El frontend pinta lo que recibe.

```mermaid
erDiagram
    User ||--o{ UserRole : tiene
    Role ||--o{ UserRole : ""
    Role ||--o{ RolePermission : concede
    Permission ||--o{ RolePermission : ""
    User ||--o{ UserPermission : "excepción GRANT/DENY"
    Permission ||--o{ UserPermission : ""
    AppModule ||--o{ MenuOption : agrupa
    MenuOption }o--o| Permission : exige
    Role ||--o{ RoleMenuOption : "concede opción"
    User ||--o{ UserMenuOption : "opción directa"
```

Modelo completo en [`docs/database/data-model.md`](docs/database/data-model.md).

---

## 12. Capa visual

La identidad visual proviene del sistema de diseño Grupo AG, portado del CRM de referencia
al tema de Material UI (ADR-017). Los tokens viven en `frontend/src/theme/tokens.ts` y el
shell (topbar, sidebar de tres estados, barra inferior de móvil, encabezado de página) en
`frontend/src/components/layout/`.

Detalle en [`docs/design/DESIGN-SYSTEM.md`](docs/design/DESIGN-SYSTEM.md).

---

## 13. Decisiones registradas

Ver [`docs/adr/`](docs/adr/) — ADR-001 a ADR-018.
