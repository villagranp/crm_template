# Panel de control (Inicio) — convenciones del frontend

Módulo 1 del CRM ([01-inicio-dashboard.md](../../../../docs/implementation-plans/crm/01-inicio-dashboard.md),
F-01…F-04). Es un módulo **de lectura**: compone la pantalla `/` (`routes/pages/HomePage.tsx`)
con los 10 `GET` de `/api/v1/dashboard` más `/me`, `/me/menu` y `/health`. No crea, edita
ni borra nada, y no declara rutas ni opciones de menú (la opción `inicio` ya existe, DM-32).

## 1. Estructura

```text
features/dashboard/
  dashboard.types.ts        reflejo de los DTO de backend/src/modules/dashboard/dto (decimales como string)
  dashboard.api.ts          los 10 GET con httpClient (nunca fetch)
  dashboard.queries.ts      TanStack Query: claves ['dashboard', …], staleTime 60 s, foco y montaje refrescan
  dashboard.permissions.ts  códigos de 01 §H.1 y resolveDashboardAccess (qué bloque se pinta)
  dashboard-format.ts       fechas, horas, toneladas, porcentajes, etiquetas y color de prioridad (+ spec)
  quick-access.ts           opciones navegables de /me/menu y selección de accesos rápidos (D-01.12)
  source-routes.ts          ÚNICO sitio que decide a dónde lleva una tarjeta, alerta, evento o visita (+ spec)
  components/               HeroCard, AccessSummary, KpiCard, KpiGrid, TargetsCard, AlertsPanel,
                            UpcomingVisitsList, RecentActivityPanel, QuickAccess, DashboardPanel (+ specs)
  testing/                  fixtures con la forma exacta de los DTO y ayudas de sesión
```

## 2. Reglas

| Regla | Dónde se cumple |
|---|---|
| **RN-01.4**: sin el permiso `.ver` de su fuente, un bloque no se pinta **ni se consulta** | `useDashboardAccess()` + `enabled` en cada hook; `HomePage`/`KpiGrid` no montan el bloque |
| **RN-01.7**: sin ningún permiso de fuente, aviso "Todavía no tienes indicadores comerciales asignados" y cero peticiones a `/dashboard/*` | `KpiGrid` (`NO_INDICATORS_NOTICE`), `HomePage` |
| **RN-01.8**: cada tarjeta y panel carga y falla por su cuenta (mensaje de `describeApiError`, "Reintentar" y referencia `correlationId`) | `KpiCard`, paneles |
| **RN-01.11**: no se inventan valores (`null` → "Sin proyección", "No calculable", "Sin metas configuradas") | `KpiGrid` (K5), `TargetsCard` (K9), `formatCompliance` |
| **RN-01.19 / E.7**: sólo se enlaza una ruta **registrada** en el router y permitida; si no, sin enlace y "Listado disponible cuando se habilite el módulo" | `source-routes.ts` |
| **RN-01.29**: nada se guarda más de 60 s; foco y vuelta a `/` vuelven a pedir | `FRESHNESS` en `dashboard.queries.ts` |
| **RN-01.32**: importes de metas `AMOUNT` en USD | `formatTargetValue` |
| Decimales siempre como cadena; nunca se suman ni convierten para calcular | `features/crm/common/decimal` |
| Ocultar es UX, no seguridad: el backend vuelve a exigir cada permiso y filtra por ámbito | — |

## 3. Enlaces (`source-routes.ts`)

- Las rutas registradas salen de `getShellNavigablePathsWithoutPages()` (`routes/shell-paths.ts`),
  idéntica por prueba a `getShellNavigablePaths()` de `app-routes.tsx`. Se usa la variante sin
  páginas porque `app-routes.tsx` importa la propia `HomePage` (import circular).
- Un **listado** debe estar registrado tal cual (`/actividad/pendientes`); una **ficha** basta con
  que coincida un patrón con parámetros (`/proyectos/:projectId`).
- Filtros de destino (D-01.4): `/proyectos?active=true`, `/proyectos/oportunidades?status=OPEN`,
  `?outcome=WON,PARTIAL|LOST&decisionFrom=…&decisionTo=…` (período que devuelve el backend),
  `/proyectos/forecast`, `/actividad/visitas?statusGroup=PENDING`,
  `/actividad/pendientes?bucket=DUE_SOON&bucket=PENDING` y `?bucket=OVERDUE`.
- Fichas: `/proyectos/:id`, `/proyectos/oportunidades/:id`, `/clientes/:id` y, cuando el Módulo 4 las
  registre, `/actividad/visitas/:id` y `/actividad/actividades/:id`. Al registrarlas, los enlaces
  aparecen sin tocar este feature.

## 4. Estado en la URL

| Parámetro | Bloque | Valores |
|---|---|---|
| `period` | K3, K4, K9 | `QUARTER`, `YEAR` (sin parámetro = `MONTH`) |
| `alertType`, `alertPriority`, `mine=true`, `alertSort=referenceDate`, `alertPage`, `alertPageSize` | Alertas | Tipos de `ALERT_TYPES`, códigos de `crm.prioridad` |

El filtro por tipo de la actividad reciente es estado local (no se comparte por URL).

## 5. Pruebas

Vitest + RTL con `renderWithProviders` y `mockApi`; fixtures en `testing/dashboard-fixtures.ts`
(`setSessionPermissions` fija los permisos de la sesión, `dashboardRequests` lista las peticiones
a `/dashboard/*`). Cubren PF-01.1–PF-01.4, PF-01.6, PF-01.7, PF-01.19, PF-01.22, PF-01.25,
PF-01.33 y PF-01.38.
