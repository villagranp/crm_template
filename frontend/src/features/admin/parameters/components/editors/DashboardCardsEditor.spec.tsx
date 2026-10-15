import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_UI_SETTINGS } from '@/services/ui-settings';

import { DashboardCardsEditor } from './DashboardCardsEditor';
import { completeEntries, parseDashboardComposition } from './editor-metadata';

const INITIAL = JSON.stringify({
  blocks: DEFAULT_UI_SETTINGS.dashboard.blocks,
  kpis: DEFAULT_UI_SETTINGS.dashboard.kpis,
});

function Harness({
  onValue,
  initial = INITIAL,
  editorOptions,
}: {
  onValue: (value: string) => void;
  initial?: string;
  editorOptions?: Record<string, string[]> | null;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DashboardCardsEditor
      value={value}
      editorOptions={editorOptions}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe('DashboardCardsEditor (PF-AJ1.4c)', () => {
  it('muestra TODOS los bloques e indicadores, la nota y el minuto sin interruptor', () => {
    render(<Harness onValue={() => undefined} />);

    expect(
      screen.getByText('Es la composición de quienes no personalizaron su panel.'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Bloques por defecto' })).getAllByRole('listitem')).toHaveLength(7);
    expect(within(screen.getByRole('list', { name: 'Indicadores por defecto' })).getAllByRole('listitem')).toHaveLength(9);
    expect(screen.queryByRole('checkbox', { name: 'Visible: Minuto de seguridad' })).not.toBeInTheDocument();
  });

  it('emite el JSON completo al ocultar y al reordenar', async () => {
    const values: string[] = [];
    const user = userEvent.setup();
    render(<Harness onValue={(value) => values.push(value)} />);

    await user.click(screen.getByRole('checkbox', { name: 'Visible: Alertas y pendientes' }));
    await user.click(screen.getByRole('button', { name: 'Subir Forecast' }));

    const last = parseDashboardComposition(values.at(-1) ?? '');
    expect(last).not.toBeNull();
    expect(last?.blocks.find((entry) => entry.key === 'alerts')?.visible).toBe(false);
    expect(last?.blocks).toHaveLength(7);
    expect(last?.kpis.map((entry) => entry.key).indexOf('forecast')).toBe(3);
    expect(last?.kpis).toHaveLength(9);
  });

  it('un valor que no es una composición no se interpreta', () => {
    expect(parseDashboardComposition('{"blocks":1}')).toBeNull();
    expect(parseDashboardComposition('no es json')).toBeNull();
    expect(parseDashboardComposition(INITIAL)).not.toBeNull();
  });

  it('completa con editorOptions las claves que faltan (al final, visibles) y las incluye al emitir', async () => {
    const values: string[] = [];
    const user = userEvent.setup();
    const seeded = JSON.stringify({
      blocks: [{ key: 'hero', visible: true }, { key: 'safety-minute', visible: true }],
      kpis: [{ key: 'forecast', visible: false }],
    });
    render(
      <Harness
        initial={seeded}
        onValue={(value) => values.push(value)}
        editorOptions={{
          blocks: ['safety-minute', 'hero', 'new-block'],
          kpis: ['forecast', 'new-kpi'],
          lockedVisibleBlocks: ['safety-minute'],
        }}
      />,
    );

    expect(within(screen.getByRole('list', { name: 'Bloques por defecto' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Visible: new-block' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Visible: new-kpi' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Visible: new-kpi' }));
    const last = parseDashboardComposition(values.at(-1) ?? '');
    expect(last?.blocks.map((entry) => entry.key)).toEqual(['hero', 'safety-minute', 'new-block']);
    expect(last?.kpis).toEqual([
      { key: 'forecast', visible: false },
      { key: 'new-kpi', visible: false },
    ]);
  });

  it('respeta lockedVisibleBlocks: sin interruptor y forzado a visible', () => {
    const seeded = JSON.stringify({
      blocks: [{ key: 'hero', visible: true }, { key: 'alerts', visible: false }],
      kpis: [],
    });
    render(
      <Harness
        initial={seeded}
        onValue={() => undefined}
        editorOptions={{ blocks: ['hero', 'alerts'], kpis: [], lockedVisibleBlocks: ['alerts'] }}
      />,
    );

    expect(screen.queryByRole('checkbox', { name: 'Visible: Alertas y pendientes' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Visible: Saludo' })).toBeInTheDocument();
  });

  it('usa una sola región aria-live para las dos listas', () => {
    render(<Harness onValue={() => undefined} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('completeEntries no quita ni reordena y fuerza visibles los bloqueados', () => {
    expect(
      completeEntries([{ key: 'b', visible: false }, { key: 'a', visible: false }], ['a', 'b', 'c'], ['a']),
    ).toEqual([
      { key: 'b', visible: false },
      { key: 'a', visible: true },
      { key: 'c', visible: true },
    ]);
  });
});
