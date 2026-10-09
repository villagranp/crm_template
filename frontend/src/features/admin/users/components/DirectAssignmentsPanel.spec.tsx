import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { DirectAssignmentsPanel, type DirectAssignmentsPanelProps } from './DirectAssignmentsPanel';

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function renderPanel(overrides: Partial<DirectAssignmentsPanelProps> = {}) {
  const props: DirectAssignmentsPanelProps = {
    noun: 'permiso',
    items: [
      { targetId: 'p-1', label: 'Exportar usuarios', secondary: 'usuarios.exportar', effect: 'GRANT', reason: 'Cubre la baja de Juan', expiresAt: FUTURE },
      { targetId: 'p-old', label: 'Ver roles', secondary: 'roles.ver', effect: 'GRANT', reason: 'Auditoría ya cerrada', expiresAt: PAST },
    ],
    targets: [
      { id: 'p-1', label: 'Exportar usuarios' },
      { id: 'p-2', label: 'Editar usuarios' },
    ],
    canEdit: true,
    isPending: false,
    errorMessage: null,
    onReplace: vi.fn(),
    onResetError: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<DirectAssignmentsPanel {...props} />);
  return props;
}

describe('DirectAssignmentsPanel', () => {
  it('exige una razón de al menos 10 caracteres', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Añadir excepción' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /permiso/i }));
    await user.click(await screen.findByRole('option', { name: 'Editar usuarios' }));
    await user.type(within(dialog).getByRole('textbox', { name: /razón/i }), 'corta');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

    expect(await within(dialog).findByText('Escribe al menos 10 caracteres.')).toBeInTheDocument();
    expect(props.onReplace).not.toHaveBeenCalled();
  });

  it('añade conservando las vigentes y sin reenviar las caducadas', async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Añadir excepción' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: /permiso/i }));
    await user.click(await screen.findByRole('option', { name: 'Editar usuarios' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Denegar' }));
    await user.type(within(dialog).getByRole('textbox', { name: /razón/i }), '  Restricción temporal por auditoría  ');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));

    expect(props.onReplace).toHaveBeenCalledWith(
      [
        { targetId: 'p-1', effect: 'GRANT', reason: 'Cubre la baja de Juan', expiresAt: FUTURE },
        { targetId: 'p-2', effect: 'DENY', reason: 'Restricción temporal por auditoría' },
      ],
      expect.any(Function),
    );
  });

  it('marca las caducadas y sin permiso de edición no ofrece acciones', () => {
    renderPanel({ canEdit: false });

    expect(screen.getByText('Caducada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir excepción' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument();
  });
});
