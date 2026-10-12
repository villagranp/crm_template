import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@mui/material';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { renderWithProviders } from '@/test/render-with-providers';

import { DECIMAL_SPECS, decimalSchema, type DecimalSpec } from './decimal';
import { DecimalField } from './DecimalField';

function Controlled({
  initial = '',
  spec,
  onValue,
}: {
  initial?: string;
  spec?: DecimalSpec;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DecimalField
        label="Cantidad"
        spec={spec}
        unit="t"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
      <p>{`Valor: ${value}`}</p>
      <button type="button" onClick={() => setValue('42.5')}>
        Fijar
      </button>
    </>
  );
}

describe('DecimalField (03 §E.9)', () => {
  it('es un campo de texto con teclado decimal, no type="number"', () => {
    renderWithProviders(<Controlled />);
    const input = screen.getByRole('textbox', { name: 'Cantidad' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('t')).toBeInTheDocument();
  });

  it('emite la cadena canónica mientras se escribe y formatea es-GT al salir', async () => {
    renderWithProviders(<Controlled />);
    const input = screen.getByRole('textbox', { name: 'Cantidad' });

    await userEvent.type(input, '1234.50');
    expect(input).toHaveValue('1234.50');
    expect(screen.getByText('Valor: 1234.5')).toBeInTheDocument();

    await userEvent.tab();
    expect(input).toHaveValue('1,234.5');

    await userEvent.click(input);
    expect(input).toHaveValue('1234.5');
  });

  it('ignora letras y signos no admitidos', async () => {
    renderWithProviders(<Controlled />);
    const input = screen.getByRole('textbox', { name: 'Cantidad' });

    await userEvent.type(input, '1e-2a');
    expect(input).toHaveValue('12');
    expect(screen.getByText('Valor: 12')).toBeInTheDocument();
  });

  it('un texto inválido llega tal cual para que la validación lo explique; vacío es ""', async () => {
    const onValue = vi.fn();
    renderWithProviders(<Controlled spec={DECIMAL_SPECS.percent} onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: 'Cantidad' });

    await userEvent.type(input, '100.5');
    expect(onValue).toHaveBeenLastCalledWith('100.5');
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('muestra el valor inicial formateado y sigue los cambios externos', async () => {
    renderWithProviders(<Controlled initial="1200000.0000" />);
    const input = screen.getByRole('textbox', { name: 'Cantidad' });
    expect(input).toHaveValue('1,200,000');

    await userEvent.click(screen.getByRole('button', { name: 'Fijar' }));
    expect(input).toHaveValue('42.5');
  });

  it('con React Hook Form + decimalSchema envía la cadena canónica y pinta el error del esquema', async () => {
    const onSubmit = vi.fn();
    const schema = z.object({ progress: decimalSchema(DECIMAL_SPECS.percent) });

    function Form() {
      const { control, handleSubmit } = useForm<
        z.input<typeof schema>,
        unknown,
        z.output<typeof schema>
      >({
        defaultValues: { progress: '' },
        resolver: zodResolver(schema),
      });
      return (
        <form onSubmit={handleSubmit((values) => onSubmit(values))} noValidate>
          <Controller
            control={control}
            name="progress"
            render={({ field, fieldState }) => (
              <DecimalField
                label="Porcentaje"
                spec={DECIMAL_SPECS.percent}
                unit="%"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
              />
            )}
          />
          <Button type="submit">Guardar</Button>
        </form>
      );
    }

    renderWithProviders(<Form />);
    const input = screen.getByRole('textbox', { name: 'Porcentaje' });

    await userEvent.type(input, '100.01');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Debe ser como máximo 100.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '75.50');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ progress: '75.5' }));
  });
});
