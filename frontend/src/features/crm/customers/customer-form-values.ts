import type { CreateCustomerInput, Customer, CustomerFormOptions, UpdateCustomerInput } from './customers.api';
import type { CustomerFormValues, CustomerTextField } from './customers.schemas';

/**
 * Conversión entre el formulario de cliente (todo texto) y los cuerpos de F5/F6.
 */

/** Texto libre que el backend comprueba crudo (RN-02.32): se envía tal cual, salvo vacío. */
const RAW_TEXT_FIELDS: ReadonlySet<CustomerTextField> = new Set(['legalName', 'tradeName', 'city', 'address']);
/** Campos opcionales que se pueden quitar (`null` en F6). */
const NULLABLE_FIELDS: ReadonlySet<CustomerTextField> = new Set([
  'customerCode',
  'tradeName',
  'taxId',
  'city',
  'address',
  'phone',
  'email',
  'companyTypeId',
  'ratingId',
]);
const TEXT_FIELDS: readonly CustomerTextField[] = [
  'customerCode',
  'legalName',
  'tradeName',
  'taxId',
  'countryId',
  'city',
  'address',
  'phone',
  'email',
  'companyTypeId',
  'statusId',
  'ratingId',
];

/** Nombre del campo del formulario para un `details[].field` del backend. */
export function formFieldFor(apiField: string): keyof CustomerFormValues | null {
  if (apiField === 'salesOwnerId') {
    return 'salesOwner';
  }
  return (TEXT_FIELDS as readonly string[]).includes(apiField) ? (apiField as CustomerTextField) : null;
}

function cleaned(field: CustomerTextField, value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  return RAW_TEXT_FIELDS.has(field) ? value : value.trim();
}

/** Valores iniciales del alta: vacíos, con los valores por defecto de `form-options`. */
export function emptyCustomerValues(options: CustomerFormOptions): CustomerFormValues {
  return {
    customerCode: '',
    legalName: '',
    tradeName: '',
    taxId: '',
    countryId: options.countries.length === 1 ? (options.countries[0]?.id ?? '') : '',
    city: '',
    address: '',
    phone: '',
    email: '',
    companyTypeId: options.defaults.companyTypeId ?? '',
    statusId: options.defaults.statusId ?? '',
    ratingId: options.defaults.ratingId ?? '',
    salesOwner: null,
  };
}

/** Valores del formulario de edición a partir de la ficha. */
export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    customerCode: customer.customerCode ?? '',
    legalName: customer.legalName,
    tradeName: customer.tradeName ?? '',
    taxId: customer.taxId ?? '',
    countryId: customer.country.id,
    city: customer.city ?? '',
    address: customer.address ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    companyTypeId: customer.companyType?.id ?? '',
    statusId: customer.status.id,
    ratingId: customer.rating?.id ?? '',
    salesOwner: { id: customer.salesOwner.id, displayName: customer.salesOwner.displayName, employeeCode: null, country: null },
  };
}

/**
 * Cuerpo de F5. Lo vacío se omite (el backend aplica sus valores por
 * defecto). Sin `clientes.administrar` el responsable no se envía: el backend
 * asigna al propio usuario (RN-02.11).
 */
export function toCreateCustomerInput(values: CustomerFormValues, canChooseOwner: boolean): CreateCustomerInput {
  const input: CreateCustomerInput = { legalName: values.legalName, countryId: values.countryId };
  for (const field of TEXT_FIELDS) {
    const value = cleaned(field, values[field]);
    if (value !== null) {
      (input as unknown as Record<string, string>)[field] = value;
    }
  }
  if (canChooseOwner && values.salesOwner) {
    input.salesOwnerId = values.salesOwner.id;
  }
  return input;
}

/**
 * Cuerpo de F6 con **sólo** lo que cambió (omitido = sin cambio): así el aviso
 * de NIT repetido sólo aparece si se toca el NIT o el país (RN-02.14) y los
 * campos reservados no se envían si no cambian (H.2). Un opcional vaciado va
 * como `null`.
 */
export function toUpdateCustomerInput(initial: CustomerFormValues, values: CustomerFormValues): UpdateCustomerInput {
  const input: Record<string, string | null> = {};
  for (const field of TEXT_FIELDS) {
    const before = cleaned(field, initial[field]);
    const after = cleaned(field, values[field]);
    if (before === after) {
      continue;
    }
    if (after === null && !NULLABLE_FIELDS.has(field)) {
      // Un obligatorio vaciado se envía vacío para que el backend responda con su campo.
      input[field] = '';
      continue;
    }
    input[field] = after;
  }
  if (values.salesOwner && values.salesOwner.id !== initial.salesOwner?.id) {
    input.salesOwnerId = values.salesOwner.id;
  }
  return input as UpdateCustomerInput;
}
