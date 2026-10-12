import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { EntityDialog, DialogFooter } from './EntityDialog';
import { FormSection } from './FormSection';

describe('EntityDialog', () => {
  it('pinta cabecera con título accesible, subtítulo, nota de obligatorios y secciones numeradas', () => {
    renderWithProviders(
      <EntityDialog open onClose={vi.fn()} title="Nuevo equipo" subtitle="Equipos" requiredNote>
        <FormSection number={1} title="Datos generales">
          <input aria-label="Nombre" />
        </FormSection>
      </EntityDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Nuevo equipo' });
    expect(within(dialog).getByText('Equipos')).toBeInTheDocument();
    expect(within(dialog).getByText(/Campo obligatorio/)).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: /Datos generales/ })).toBeInTheDocument();
  });

  it('cierra con la X y con «Cancelar», y envía el formulario con la acción primaria', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    renderWithProviders(
      <EntityDialog
        open
        onClose={onClose}
        title="Editar rol"
        onSubmit={onSubmit}
        actions={<DialogFooter onCancel={onClose} submitLabel="Guardar cambios" />}
      >
        contenido
      </EntityDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('con una mutación en curso no se puede cerrar ni volver a enviar', () => {
    renderWithProviders(
      <EntityDialog
        open
        onClose={undefined}
        title="Editar rol"
        onSubmit={vi.fn()}
        actions={<DialogFooter onCancel={vi.fn()} submitLabel="Guardar cambios" pending />}
      >
        contenido
      </EntityDialog>,
    );

    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });
});
