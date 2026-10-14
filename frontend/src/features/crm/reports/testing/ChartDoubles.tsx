import type { BarChartImplProps, ComboChartImplProps, LineChartImplProps } from '../charts/chart-types';

/**
 * Dobles de las implementaciones de gráficas (`ReportBarChart`, `ReportLineChart`,
 * `ReportComboChart`) para las pruebas de pantalla: sustituyen a `@mui/x-charts` (cuya primera
 * carga en jsdom tarda segundos) y exponen lo que importa observar: el tipo y la orientación, las
 * categorías, los valores, el texto junto a la barra y el clic en una categoría. La librería real
 * se prueba aparte en `charts/ReportCharts.spec.tsx`.
 *
 * Se enchufan con los módulos de `chart-doubles.ts`.
 */

function Categories({ props, kind }: { props: BarChartImplProps | LineChartImplProps | ComboChartImplProps; kind: string }) {
  const barLabel = 'barLabel' in props ? props.barLabel : undefined;
  return (
    <div data-testid={`${kind}-chart`} data-chart={kind} data-layout={'layout' in props ? props.layout : undefined} aria-label={props.ariaLabel}>
      <span data-testid="chart-series">{props.series.map((item) => `${item.key}:${item.label}:${item.color}`).join('|')}</span>
      {props.categories.map((category, index) => (
        <button key={`${category}-${index}`} type="button" data-chart-item onClick={() => props.onItemClick?.(index, props.series[0]?.key ?? '')}>
          {`${category} = ${props.series.map((item) => item.values[index] ?? 'null').join(' / ')}`}
          {barLabel ? ` [${barLabel(props.series[0]?.values[index] ?? null, index) ?? ''}]` : ''}
        </button>
      ))}
    </div>
  );
}

export function FakeBarChart(props: BarChartImplProps) {
  return <Categories props={props} kind="bar" />;
}

export function FakeLineChart(props: LineChartImplProps) {
  return <Categories props={props} kind="line" />;
}

export function FakeComboChart(props: ComboChartImplProps) {
  return <Categories props={props} kind="combo" />;
}
