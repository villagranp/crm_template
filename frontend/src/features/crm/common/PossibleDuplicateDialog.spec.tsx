import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { parseDuplicateCandidates } from './duplicates';
import { PossibleDuplicateDialog, type PossibleDuplicateDialogProps } from './PossibleDuplicateDialog';

const DETAILS = [
  {
    rule: 'nit',
    reason: 'TAX_ID',
    candidate: {
      id: 'c-1',
      crmCode: 'CLI-000001',
      customerCode: 'EST-01',
      legalName: 'Constructora Peña S.A.',
      country: { isoCode: 'GT', name: 'Guatemala' },
      salesOwnerName: 'Ana Pérez',
      isVisible: true,
      isDeleted: false,
    },
  },
  {
    rule: 'razonSocialNormalizada',
    reason: 'LEGAL_NAME',
    candidate: {
      id: null,
      crmCode: 'CLI-000002',
      customerCode: null,
      legalName: 'Constructora Pena',
      country: { isoCode: 'GT', name: 'Guatemala' },
      salesOwnerName: 'Luis Gómez',
      isVisible: false,
      isDeleted: true,
    },
  },
];

function renderDialog(overrides: Partial<PossibleDuplicateDialogProps> = {}) {
  const props: PossibleDuplicateDialogProps = {
    open: true,
    entity: 'customer',
    candidates: parseDuplicateCandidates(DETAILS),
    getCandidateHref: (id) => `/clientes/${id}`,
    onReview: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<PossibleDuplicateDialog {...props} />);
  return props;
}

describe('PossibleDuplicateDialog', () => {
  it('lista los candidatos con sus motivos y enlaza sólo a los visibles', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Posible cliente duplicado' });
    const list = within(dialog).getByRole('list', { name: 'Posibles duplicados' });
    const [visible, hidden] = within(list).getAllByRole('listitem');
    if (!visible || !hidden) {
      throw new Error('Se esperaban dos candidatos');
    }

    expect(within(visible).getByRole('link', { name: /CLI-000001 · Constructora Peña S\.A\./ })).toHaveAttribute(
      'href',
      '/clientes/c-1',
    );
    expect(within(visible).getByText('Mismo NIT')).toBeInTheDocument();
    expect(
      within(visible).getByText('Código de cliente EST-01 · Guatemala · Responsable: Ana Pérez'),
    ).toBeInTheDocument();

    expect(within(hidden).queryByRole('link')).not.toBeInTheDocument();
    expect(within(hidden).getByText('CLI-000002 · Constructora Pena')).toBeInTheDocument();
    expect(within(hidden).getByText('Razón social parecida')).toBeInTheDocument();
    expect(within(hidden).getByText('Eliminado')).toBeInTheDocument();
    expect(within(dialog).getByText(/no tienes acceso a su ficha/)).toBeInTheDocument();
  });

  it('con NIT repetido aclara que puede ser otro establecimiento (DM-4), con la etiqueta del país', () => {
    renderDialog({ taxIdLabel: 'RTN' });

    expect(
      screen.getByText(/Un RTN repetido puede corresponder a otro establecimiento del mismo cliente/),
    ).toBeInTheDocument();
    expect(screen.getByText('Mismo RTN')).toBeInTheDocument();
  });

  it('"Guardar de todos modos" entrega los ids reconocibles y "Revisar" vuelve al formulario', async () => {
    const user = userEvent.setup();
    const props = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Guardar de todos modos' }));
    expect(props.onConfirm).toHaveBeenCalledWith(['c-1']);

    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(props.onReview).toHaveBeenCalledOnce();
  });

  it('mientras se reenvía bloquea los botones y muestra el error del reenvío', () => {
    renderDialog({ isPending: true, errorMessage: 'No se pudo guardar.' });

    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.');
  });

  it('con DUPLICATE_BLOCKED no ofrece guardar de todos modos', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ blocked: true });

    expect(screen.queryByRole('button', { name: 'Guardar de todos modos' })).not.toBeInTheDocument();
    expect(screen.getByText(/la configuración no permite duplicarlo/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar datos' }));
    expect(props.onReview).toHaveBeenCalledOnce();
  });

  it('usa los textos de contacto', () => {
    renderDialog({
      entity: 'contact',
      candidates: parseDuplicateCandidates([
        {
          rule: 'nombreCompleto',
          reason: 'FULL_NAME',
          candidate: { id: 'k-1', fullName: 'Ana López', jobTitle: null, isDeleted: false },
        },
      ]),
      getCandidateHref: undefined,
    });

    expect(screen.getByRole('dialog', { name: 'Posible contacto duplicado' })).toBeInTheDocument();
    expect(screen.getByText('Mismo nombre completo')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
