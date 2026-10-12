import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { ConfirmDialog, REASON_MIN_LENGTH, type ConfirmDialogProps } from './ConfirmDialog';

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const props: ConfirmDialogProps = {
    open: true,
    title: 'Suspender usuario',
    description: 'La persona perderá el acceso de inmediato.',
    confirmLabel: 'Suspender',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<ConfirmDialog {...props} />);
  return props;
}

describe('ConfirmDialog', () => {
  it('sin razón confirma directamente', async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Suspender usuario' })).toHaveAccessibleDescription(
      'La persona perderá el acceso de inmediato.',
    );
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(props.onConfirm).toHaveBeenCalledWith(undefined);
  });

  it(`con razón obligatoria rechaza menos de ${REASON_MIN_LENGTH} caracteres sin contar espacios`, async () => {
    const user = userEvent.setup();
    const props = renderDialog({ reason: {} });

    await user.type(screen.getByRole('textbox', { name: /razón/i }), '   corta     ');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(
      await screen.findByText(`Escribe al menos ${REASON_MIN_LENGTH} caracteres.`),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /razón/i })).toHaveAttribute('aria-invalid', 'true');
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('con una razón válida confirma pasándola recortada', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ reason: { label: 'Motivo' } });

    await user.type(
      screen.getByRole('textbox', { name: /motivo/i }),
      '  Baja temporal por auditoría  ',
    );
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(props.onConfirm).toHaveBeenCalledWith('Baja temporal por auditoría');
  });

  it('respeta un mínimo propio', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ reason: { minLength: 3 } });

    await user.type(screen.getByRole('textbox', { name: /razón/i }), 'ok');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(props.onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: /razón/i }), '!');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(props.onConfirm).toHaveBeenCalledWith('ok!');
  });

  it('mientras la mutación está en curso bloquea los botones y muestra el error traducido', () => {
    renderDialog({
      isPending: true,
      errorMessage: 'Debe quedar al menos un administrador activo.',
    });

    expect(screen.getByRole('button', { name: 'Suspender' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Debe quedar al menos un administrador activo.',
    );
  });

  it('cancelar cierra sin confirmar', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ destructive: true });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
