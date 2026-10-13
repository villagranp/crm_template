import { zodResolver } from '@hookform/resolvers/zod';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import type { OutcomeOption } from '../opportunities.api';
import { buildResultSchema, emptyResultValues, outcomesForStage, toResultInput, type ResultFormValues } from '../opportunities.schemas';
import { OUTCOMES, REASONS } from '../testing/opportunity-fixtures';

import { ResultForm } from './ResultForm';

function Harness({ outcomes, onSubmit }: { outcomes: OutcomeOption[]; onSubmit: (values: ResultFormValues) => void }) {
  const form = useForm<ResultFormValues>({
    resolver: zodResolver(buildResultSchema({ outcomes, reasons: REASONS })),
    defaultValues: emptyResultValues('2026-10-12'),
  });
  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
        <ResultForm outcomes={outcomes} reasons={REASONS} />
        <button type="submit">Guardar</button>
      </form>
    </FormProvider>
  );
}

async function choose(label: RegExp, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('ResultForm (PF-03.79, AC-03.51–AC-03.53, AC-03.57)', () => {
  it('en una etapa Ganado ofrece Ganado y Parcial; Parcial pide el porcentaje (0–100) y solo los motivos aplicables', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness outcomes={outcomesForStage(OUTCOMES, 'WON')} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('combobox', { name: /Resultado/ }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Ganado', 'Parcial']);
    await userEvent.click(within(listbox).getByRole('option', { name: 'Parcial' }));

    const percent = screen.getByRole('textbox', { name: /Porcentaje adjudicado/ });
    await userEvent.type(percent, '120');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Debe ser como máximo 100.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: /Motivo/ }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Sin motivo', 'Plazo de entrega']);
    await userEvent.keyboard('{Escape}');

    await userEvent.clear(percent);
    await userEvent.type(percent, '60');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0]?.[0] as ResultFormValues;
    expect(toResultInput(values, OUTCOMES)).toEqual({ outcome: 'PARTIAL', awardedPercent: '60', decisionDate: '2026-10-12', reasonId: null, comments: null });
  });

  it('Ganado no pide porcentaje (implícito 100 %, DM-15)', async () => {
    renderWithProviders(<Harness outcomes={outcomesForStage(OUTCOMES, 'WON')} onSubmit={vi.fn()} />);
    await choose(/Resultado/, 'Ganado');
    expect(screen.queryByRole('textbox', { name: /Porcentaje adjudicado/ })).not.toBeInTheDocument();
  });

  it('en una etapa Perdido el resultado queda elegido y el motivo es obligatorio', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness outcomes={outcomesForStage(OUTCOMES, 'LOST')} onSubmit={onSubmit} />);

    expect(await screen.findByRole('combobox', { name: /Resultado/ })).toHaveTextContent('Perdido');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Indica el motivo.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await choose(/Motivo/, 'Precio');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'LOST', reasonId: 'rs-precio' }), expect.anything());
  });
});
