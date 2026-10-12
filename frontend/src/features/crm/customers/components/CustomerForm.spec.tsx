import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render-with-providers';

import { customerToFormValues, emptyCustomerValues } from '../customer-form-values';
import { CUSTOMER, FORM_OPTIONS, signInWith, signOut, SV } from '../testing/customer-fixtures';

import { CustomerForm, type CustomerFormProps } from './CustomerForm';

function renderForm(props: Partial<CustomerFormProps> = {}) {
  const onSubmit = vi.fn();
  renderWithProviders(
    <CustomerForm
      mode="create"
      options={FORM_OPTIONS}
      initialValues={emptyCustomerValues(FORM_OPTIONS)}
      canChooseOwner={false}
      fixedOwnerName="Ana Asesora"
      isPending={false}
      submitLabel="Crear cliente"
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit };
}

beforeEach(() => signInWith(['clientes.ver']));
afterEach(signOut);

describe('CustomerForm', () => {
  it('marca como obligatorios los campos de form-options.requiredFields', () => {
    renderForm({ options: { ...FORM_OPTIONS, requiredFields: ['legalName', 'countryId', 'email', 'phone'] } });

    expect(screen.getByLabelText(/Correo electrónico/)).toBeRequired();
    expect(screen.getByLabelText(/Teléfono/)).toBeRequired();
    expect(screen.getByLabelText(/Ciudad/)).not.toBeRequired();
    expect(screen.getByText('Campo obligatorio')).toBeInTheDocument();
  });

  it('cambia la etiqueta fiscal y la ayuda del teléfono según el país (DM-3)', async () => {
    renderForm({
      options: {
        ...FORM_OPTIONS,
        countries: [FORM_OPTIONS.countries[0]!, { ...FORM_OPTIONS.countries[1]!, taxIdLabel: 'NIT SV' }],
      },
    });

    await userEvent.click(screen.getByRole('combobox', { name: /País/ }));
    await userEvent.click(await screen.findByRole('option', { name: SV.name }));

    expect(screen.getByLabelText('NIT SV')).toBeInTheDocument();
    expect(screen.getByText('Prefijo de El Salvador: +503')).toBeInTheDocument();
  });

  it('no ofrece valores de catálogo que no vienen en form-options (AC-02.23)', async () => {
    renderForm({ options: { ...FORM_OPTIONS, companyTypes: [] } });

    await userEvent.click(screen.getByRole('combobox', { name: /Tipo de empresa/ }));
    expect(screen.queryByRole('option', { name: 'Constructora' })).not.toBeInTheDocument();
  });

  it('en edición conserva y muestra un valor ya desactivado del catálogo', async () => {
    renderForm({
      mode: 'edit',
      options: { ...FORM_OPTIONS, companyTypes: [] },
      initialValues: customerToFormValues(CUSTOMER),
      editableFields: CUSTOMER.capabilities.editableFields,
      currentValues: { companyTypeId: { id: 'ct-1', label: 'Constructora' } },
      submitLabel: 'Guardar cambios',
    });

    expect(screen.getByRole('combobox', { name: /Tipo de empresa/ })).toHaveTextContent('Constructora (inactivo)');
  });

  it('en edición deshabilita los campos reservados sin clientes.administrar (AC-02.29)', () => {
    renderForm({
      mode: 'edit',
      initialValues: customerToFormValues(CUSTOMER),
      editableFields: CUSTOMER.capabilities.editableFields,
      submitLabel: 'Guardar cambios',
    });

    expect(screen.getByLabelText(/Código de cliente/)).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /País/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Responsable de ventas')).toBeDisabled();
    expect(screen.getByLabelText(/Razón social/)).toBeEnabled();
  });

  it('pinta los errores del backend bajo su campo, incluido el responsable', () => {
    renderForm({
      canChooseOwner: true,
      serverFieldErrors: { email: 'Otro mensaje del backend', salesOwnerId: 'El responsable no es un usuario activo elegible.' },
    });

    expect(screen.getByText('Otro mensaje del backend')).toBeInTheDocument();
    expect(screen.getByText('El responsable no es un usuario activo elegible.')).toBeInTheDocument();
  });

  it('envía los valores cuando son válidos', async () => {
    const { onSubmit } = renderForm();

    await userEvent.type(screen.getByLabelText(/Razón social/), 'Ferretería El Sol');
    await userEvent.click(screen.getByRole('combobox', { name: /País/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Guatemala' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ legalName: 'Ferretería El Sol', statusId: 'st-activo' });
  });
});
