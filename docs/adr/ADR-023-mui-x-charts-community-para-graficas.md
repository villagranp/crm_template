# ADR-023 - `@mui/x-charts` (edición Community) para gráficas

## Status
Accepted — 2026-10-10

Proyecto: Mi Cliente AG. Resuelve D-05.2 del CRM (dashboard comercial F-40 y
embudo comercial F-41). Complementa ADR-009 (Material UI) y ADR-017 (sistema de
diseño Grupo AG).

## Context

El Módulo 5 pide un dashboard comercial con indicadores y gráficas (§7.7) y un
embudo comercial por etapa (§7.8). El frontend no tiene librería de gráficas y
CLAUDE.md §8.6 exige ADR para incorporarla. Sin ella, F-40 y F-41 estaban
`bloqueada` en su parte visual (las tablas equivalentes sí podían construirse).

Restricciones: todo color, duración y medida sale del tema
(`frontend/src/theme/tokens.ts`, ADR-017, CLAUDE.md §8.12); el frontend es
React 18.3 + MUI v6 (ADR-001, ADR-009); accesibilidad AA; las páginas que no
muestran gráficas no deben pagar su peso.

## Decision

**Se adopta `@mui/x-charts`, edición Community (licencia MIT), en una versión
compatible con `@mui/material` v6 y React 18 fijada exacta en el lockfile, solo
en las rutas de reportes y cargada en diferido.**

- Toma colores, tipografía y modo oscuro del tema MUI: las series usan los
  tokens de `chartSeries` del sistema de diseño, sin una capa de traducción.
- El **embudo** se dibuja con `BarChart` en `layout="horizontal"` (barras por
  etapa ordenadas por `metadata.order`). **No** se usa el `FunnelChart` ni ningún
  componente de la edición Pro/Premium (licencia comercial).
- Carga diferida: `React.lazy` en las páginas de dashboard y embudo, para que
  el resto de la aplicación no incluya la librería en su *bundle* inicial.
- Toda gráfica lleva su **"Ver como tabla"** con los mismos datos: la
  accesibilidad la garantiza la tabla, no la librería.
- Los datos llegan agregados del backend (USD, ADR-024); la librería no calcula
  indicadores.

## Alternatives

- **Recharts.** MIT, madura y con embudo nativo; pero su estilo es propio y
  habría que mapear a mano cada token del tema (una capa más que mantener) y su
  *bundle* es similar o mayor.
- **Chart.js / react-chartjs-2.** Dibuja en *canvas*: sin DOM por serie, peor
  accesibilidad y sin integración con el tema.
- **Nivo / ECharts.** Muy completas, pero pesadas para dos pantallas.
- **Sin librería** (barras con `Box` del tema y tablas). Viable para el embudo,
  pobre para el dashboard. Queda como respaldo si la librería se retirara.

## Consequences

- F-40 y F-41 pasan a `especificada` completas.
- Una dependencia más en el frontend, del mismo proveedor que MUI: sus
  actualizaciones de versión mayor deben acompañar a las de `@mui/material`.
- Prohibido importar componentes de las ediciones Pro/Premium; la revisión de
  código lo verifica (`@mui/x-charts-pro` no puede aparecer en `package.json`).

## Security Considerations

- Librería de presentación sin acceso a red ni a almacenamiento; no cambia
  ninguna decisión de autorización (los datos ya llegan filtrados por permiso y
  alcance).
- Se fija la versión y pasa por `pnpm audit` en el pipeline (ADR-012).
- Las etiquetas que vienen de datos (nombres de etapa, de usuario) se renderizan
  como texto por React; no se usa HTML crudo en *tooltips*.

## Addendum (2026-10-14) — versión, carga diferida y colores

Implementación del frontend de F-35 (distribución por etapa), F-40 y F-41
(`05-reportes.md`, P-05.29–P-05.31).

- **Versión: `@mui/x-charts` 8.29.3**, fijada exacta (`--save-exact`) en
  `frontend/package.json` y en `pnpm-lock.yaml`. Es la última estable cuyo `peerDependencies`
  admite `@mui/material` `^6` (el proyecto usa 6.5.0) y React 18: la línea 9.x exige
  `@mui/material ^7.3 || ^9` y se descarta hasta la subida de versión mayor de MUI (ADR-009).
  Publicada el 2026-08-21, licencia MIT. Trae su propia `@mui/utils` 7.x, `reselect`,
  `use-sync-external-store`, `bezier-easing`, `flatqueue` y la familia `d3-*` (vía
  `@mui/x-charts-vendor`). `pnpm audit` no reporta ningún aviso en esas rutas (los 19 avisos del
  monorepo son previos: vite, vitest, esbuild, react-router, jest, prisma).
- **Carga diferida en dos niveles.** Las páginas de dashboard y embudo (como las otras cinco)
  son `React.lazy` en `reports-routes.ts`; además, la librería sólo se importa desde
  `charts/ReportBarChart.tsx`, `ReportLineChart.tsx` y `ReportComboChart.tsx`, que sólo carga
  `charts/LazyCharts.tsx` con `import()`. Resultado del build: el *chunk* inicial no contiene la
  librería; el núcleo diferido (`useChartsContainerProps-*.js`) pesa 234,9 kB (70,5 kB gzip)
  más `BarPlot` (20,3 kB), `MarkPlot` (22,0 kB), `ChartsWrapper` (8,1 kB) y las tres
  implementaciones (5,3 kB, 11,6 kB y 1,4 kB). Lo vigila `charts-architecture.spec.ts`
  (PF-05.47), que también falla si aparece `@mui/x-charts-pro`/`-premium` o el `FunnelChart`.
- **Colores**: `chartSeries` (cinco azules) no distinguía series adyacentes ni en oscuro; se
  añaden `chartColors` (identidad: dos azules por modo; estado negativo: el rojo semántico) y
  `chartLayout` a `tokens.ts`, validados con el validador de paletas de la skill `dataviz`
  (DESIGN-SYSTEM §3 "Gráficas"). Leyendas en HTML con texto; la librería oculta la suya.
- **Pruebas**: vitest procesa `@mui/x-charts` con `server.deps.inline` (su ESM importa
  `@mui/material/styles` como directorio y Node lo rechaza); no afecta al build.

