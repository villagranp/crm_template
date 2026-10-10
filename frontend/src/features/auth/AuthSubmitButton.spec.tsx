import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthSubmitButton } from './AuthSubmitButton';

describe('AuthSubmitButton', () => {
  it('en reposo está habilitado y sin indicador de carga', () => {
    render(<AuthSubmitButton>Iniciar sesión</AuthSubmitButton>);

    const button = screen.getByRole('button', { name: 'Iniciar sesión' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('cargando conserva el texto, queda ocupado y no se puede volver a pulsar', () => {
    render(<AuthSubmitButton loading>Iniciar sesión</AuthSubmitButton>);

    // El nombre no cambia (el texto se difumina bajo el anillo): el botón no salta de ancho.
    const button = screen.getByRole('button', { name: 'Iniciar sesión' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
