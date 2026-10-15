import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_UI_SETTINGS } from '@/services/ui-settings';

import { DashboardCardsEditor } from './DashboardCardsEditor';
import { parseDashboardComposition } from './editor-metadata';

const INITIAL = JSON.stringify({
  blocks: DEFAULT_UI_SETTINGS.dashboard.blocks,
  kpis: DEFAULT_UI_SETTINGS.dashboard.kpis,
});

function Harness({ onValue }: { onValue: (value: string) => void }) {
  const [value, setValue] = useState(INITIAL);
  return (
    <DashboardCardsEditor
      value={value}
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
});
