# Reportes — convenciones del frontend

Pantallas del Módulo 5 del CRM ([especificación 05](../../../../../docs/implementation-plans/crm/05-reportes.md),
§E y "Precisiones de implementación" P-05.19–P-05.32). Son de **solo lectura**: no hay
mutaciones ni invalidaciones; la exportación genera un archivo en el backend.

## 1. Estructura

```text
features/crm/reports/
  reports-routes.ts          ruta + reportes.ver + página lazy de las siete pantallas
  reports.permissions.ts     reportes.ver, reportes.exportar y los .ver de las fichas de origen
  reports.errors.ts          mensajes por código (F.5) con "Referencia: <correlationId>"
  filter-options.*.ts        GET /reports/filter-options (opciones, alcance y zonas horarias)
  report.queries.ts          TanStack Query de todos los reportes, bajo ['crm', 'reports', …]
  common/                    piezas compartidas (ver features/crm/README.md, "Piezas comunes de Reportes")
  charts/                    la ÚNICA puerta a @mui/x-charts (ADR-023)
  projects/ opportunities/ forecast/ visits/ activities/   F-34…F-38 (+ exportación F-39)
  dashboard/                 F-40: CommercialDashboardPage, DashboardPanels, dashboard.api
  funnel/                    F-41: SalesFunnelPage, FunnelChart (barras horizontales), funnel.api
  testing/                   fixtures (report-fixtures.ts) y dobles de gráficas (chart-doubles.ts)
```

| Pantalla | Ruta | Carpeta | Endpoints |
|---|---|---|---|
| Proyectos (F-34) | `/reportes/proyectos` | `projects/` | `/reports/projects` (+ `/export`) |
| Oportunidades (F-35) | `/reportes/oportunidades` | `opportunities/` | `/reports/opportunities`, `/summary` (+ `/export`) |
| Forecast (F-36) | `/reportes/forecast` | `forecast/` | `/reports/forecast`, `/consolidated`, `/summary` (+ `/export`) |
| Visitas (F-37) | `/reportes/visitas` | `visits/` | `/reports/visits`, `/summary` (+ `/export`) |
| Actividades (F-38) | `/reportes/actividades` | `activities/` | `/reports/activities`, `/summary` (+ `/export`) |
| Dashboard (F-40) | `/reportes/dashboard` | `dashboard/` | `/reports/dashboard`, `/reports/dashboard/trends` |
| Embudo (F-41) | `/reportes/embudo` | `funnel/` | `/reports/funnel` |

Las rutas y sus opciones de menú salen de la base (`app-routes.registry.json`, semilla DM-32):
aquí sólo se declaran la ruta, el permiso y la página (CLAUDE.md §8.11).

## 2. Reglas del área

- **Estado en la URL** con `useReportQueryState` y los **nombres de parámetro de la API**; un valor
  por filtro (P-05.19). Lista, resumen y exportación usan los mismos filtros (RN-05.9, RN-05.44).
- **Opciones de filtro** sólo de `GET /reports/filter-options` (nunca listas fijas). Cliente,
  proyecto y producto con los selectores de 02/03 y su permiso.
- **Zonas horarias** de `filter-options` (`useReportTimeZones`): instantes en la del perfil,
  "hoy" y atajos de período en la del negocio, fechas de calendario sin conversión (P-05.27).
- **Decimales** como cadena; se formatean con `report-format.ts`. Para la geometría de una gráfica
  se convierte a número (`chartNumber`), pero lo que se lee (tabla, *tooltip*) sale de la cadena.
- **Cuatro estados** en cada pantalla y cada panel: cargando, vacío, error con referencia y
  "Reintentar", y sin permiso (la ruta exige `reportes.ver`). Un `ChartPanel` carga y falla solo.
- **Porcentajes no calculables**: "—" con su motivo visible, nunca "0 %" (AC-05.36).

## 3. Gráficas (ADR-023)

- `@mui/x-charts` **Community** fijada exacta en `package.json`; prohibidas las ediciones
  Pro/Premium y el `FunnelChart` (el embudo es `BarChart` con `layout="horizontal"`).
- Sólo `charts/ReportBarChart.tsx`, `ReportLineChart.tsx` y `ReportComboChart.tsx` importan la
  librería, y sólo `charts/LazyCharts.tsx` los carga, con `React.lazy`: la librería queda en un
  *chunk* diferido. Las pantallas usan `LazyBarChart`, `LazyLineChart` y `LazyComboChart`.
  Lo vigila `charts/charts-architecture.spec.ts` (PF-05.47).
- Toda gráfica va dentro de un `ChartPanel` con su **tabla equivalente** (`ChartDataTable`) y el
  conmutador "Ver como tabla" / "Ver como gráfica": la accesibilidad la da la tabla.
- Color por **papel** (`tone`): `primary` y `secondary` (azules de identidad, como mucho dos por
  gráfica) y `negative` (rojo, sólo si la serie **es** un estado negativo). Valores de
  `chartColors`/`chartLayout` en `theme/tokens.ts`; nunca hex ni píxeles en un componente.
- Leyenda en texto con dos o más series; con una, el título del panel la nombra.
- **Un solo eje**: dos medidas de distinta unidad van en gráficas separadas (asesores: conteos y
  toneladas). Barras + línea sólo si comparten unidad (forecast: toneladas y acumulado).
- Clic en una barra → reporte con el filtro aplicado (`report-links.ts`); la tabla ofrece el mismo
  destino como enlace (camino por teclado).
- `prefers-reduced-motion: reduce` desactiva la animación de la librería.

## 4. Pruebas

- Pantallas con `renderWithProviders` + `mockApi` y los fixtures de `testing/report-fixtures.ts`.
- Las pantallas con gráficas sustituyen las implementaciones por dobles
  (`vi.mock('../charts/ReportBarChart', async () => (await import('../testing/chart-doubles')).barChartModule)`),
  que exponen orientación, categorías, valores, texto de barra y clic. La librería real se prueba
  en `charts/ReportCharts.spec.tsx` (su primera carga en jsdom tarda segundos; vitest la procesa
  con `server.deps.inline`, ver `vite.config.ts`).
