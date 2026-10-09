import { MenuItem, TextField } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { describe, expect, it } from 'vitest';

import { lightTheme } from './theme';

/**
 * Los campos heredan del tema la etiqueta encima del campo (nunca flotante),
 * sin tocar el código de cada formulario.
 */
describe('campos de formulario del tema', () => {
  it('la etiqueta queda fija encima del campo y sigue asociada al input', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <TextField id="campo-nombre" label="Nombre" required />
      </ThemeProvider>,
    );

    const input = screen.getByRole('textbox', { name: /nombre/i });
    const label = document.querySelector('label[for="campo-nombre"]');
    expect(input).toBeRequired();
    expect(label).toHaveAttribute('data-shrink', 'true');
    // Sin muesca: el borde no reserva hueco para una etiqueta flotante.
    expect(document.querySelector('fieldset legend')).not.toBeVisible();
  });

  it('la etiqueta sigue fija con el campo vacío en un selector', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <TextField id="campo-tipo" select label="Tipo" value="">
          <MenuItem value="a">A</MenuItem>
        </TextField>
      </ThemeProvider>,
    );

    expect(document.querySelector('#campo-tipo-label')).toHaveAttribute('data-shrink', 'true');
    expect(screen.getByRole('combobox', { name: /tipo/i })).toBeInTheDocument();
  });

  it('fuerza la etiqueta encima en la configuración del tema', () => {
    expect(lightTheme.components?.MuiInputLabel?.defaultProps?.shrink).toBe(true);
  });
});
