import { z } from 'zod';

import type { CountryOption, SalesOwnerOption } from './customers.api';

/**
 * Validación de los formularios de cliente y contacto (02 §E.3, §E.5).
 *
 * Es experiencia de usuario: el backend valida de nuevo y es quien decide. Los
 * obligatorios y los patrones por país llegan de `form-options`; aquí no se
 * inventan reglas que el backend no aplique.
 */

export const CUSTOMER_LIMITS = {
  customerCode: 40,
  legalName: 200,
  tradeName: 200,
  taxId: 30,
  city: 120,
  address: 300,
  phone: 40,
  email: 320,
} as const;

export const CONTACT_LIMITS = {
  firstName: 80,
  lastName: 80,
  jobTitle: 120,
  phone: 40,
  email: 320,
  comments: 1000,
} as const;

/** Campos obligatorios aunque `form-options.requiredFields` no los traiga (DTO, 02 §F.3). */
const BASE_REQUIRED_FIELDS = ['legalName', 'countryId'] as const;

/**
 * RN-02.32: el texto libre no puede empezar (tras espacios) por `=`, `@`,
 * tabulador o retorno de carro, para que no se interprete como fórmula al
 * exportarlo a una hoja de cálculo.
 */
const FORMULA_START = /^ *[=@\t\r]/;
export const FORMULA_MESSAGE = 'No puede empezar por =, @, tabulador ni retorno de carro.';
export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
const EMAIL_MESSAGE = 'Escribe un correo válido.';
const PHONE_MESSAGE = 'El teléfono no tiene un formato válido para el país.';

/** Separadores que el backend quita del NIT antes de validarlo (`normalizeTaxId`). */
const TAX_ID_SEPARATORS = /[\s.-]+/g;

export function startsLikeFormula(value: string): boolean {
  return FORMULA_START.test(value);
}

/** Patrón del país anclado al valor completo, como el backend; `null` si falta o no compila. */
export function compileCountryPattern(pattern: string | null | undefined): RegExp | null {
  if (!pattern) {
    return null;
  }
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

export function normalizeTaxIdForCheck(value: string): string {
  return value.replace(TAX_ID_SEPARATORS, '').toUpperCase();
}

function maxMessage(limit: number): string {
  return `Usa como máximo ${limit} caracteres.`;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export interface CustomerFormValues {
  customerCode: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  countryId: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  companyTypeId: string;
  statusId: string;
  ratingId: string;
  salesOwner: SalesOwnerOption | null;
}

export type CustomerTextField = Exclude<keyof CustomerFormValues, 'salesOwner'>;

export interface CustomerSchemaContext {
  /** `form-options.requiredFields` (nombres del DTO: `salesOwnerId`, `companyTypeId`…). */
  requiredFields: readonly string[];
  countries: readonly CountryOption[];
  /** Sólo se exige el responsable si el usuario puede elegirlo (con `clientes.administrar`). */
  canChooseOwner: boolean;
  /**
   * En el alta el responsable vacío no se envía y el backend asigna al actor
   * (02 §F.4, `salesOwnerId?` con defecto el actor): no se exige elegirlo.
   */
  ownerDefaultsToActor?: boolean;
  /**
   * Campos que no se validan (deshabilitados en la edición porque el usuario no
   * puede cambiarlos): el backend no los recibe y un dato antiguo no debe
   * bloquear el guardado.
   */
  skipFields?: ReadonlySet<string>;
}

const FREE_TEXT_FIELDS: readonly CustomerTextField[] = ['legalName', 'tradeName', 'city', 'address'];

/** Esquema del formulario de cliente para unas opciones concretas. */
export function buildCustomerFormSchema({ requiredFields, countries, canChooseOwner, ownerDefaultsToActor = false, skipFields }: CustomerSchemaContext) {
  const required = new Set<string>([...BASE_REQUIRED_FIELDS, ...requiredFields]);
  const isChecked = (field: string) => !skipFields?.has(field);

  const text = z.string();
  const base = z.object({
    customerCode: text,
    legalName: text,
    tradeName: text,
    taxId: text,
    countryId: text,
    city: text,
    address: text,
    phone: text,
    email: text,
    companyTypeId: text,
    statusId: text,
    ratingId: text,
    salesOwner: z.custom<SalesOwnerOption | null>(),
  });

  return base.superRefine((values, ctx) => {
    const issue = (path: keyof CustomerFormValues, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    for (const [field, limit] of Object.entries(CUSTOMER_LIMITS) as [CustomerTextField, number][]) {
      if (isChecked(field) && values[field].length > limit) {
        issue(field, maxMessage(limit));
      }
    }

    for (const field of FREE_TEXT_FIELDS) {
      if (isChecked(field) && startsLikeFormula(values[field])) {
        issue(field, FORMULA_MESSAGE);
      }
    }

    for (const field of required) {
      if (!isChecked(field)) {
        continue;
      }
      if (field === 'salesOwnerId') {
        if (canChooseOwner && !ownerDefaultsToActor && !values.salesOwner) {
          issue('salesOwner', REQUIRED_MESSAGE);
        }
        continue;
      }
      if (field in values && field !== 'salesOwner') {
        const value = values[field as CustomerTextField];
        if (!value.trim()) {
          issue(field as CustomerTextField, REQUIRED_MESSAGE);
        }
      }
    }

    const email = values.email.trim();
    if (isChecked('email') && email && !z.string().email().safeParse(email).success) {
      issue('email', EMAIL_MESSAGE);
    }

    const country = countries.find((option) => option.id === values.countryId);
    const phonePattern = compileCountryPattern(country?.phonePattern);
    const phone = values.phone.trim();
    if (isChecked('phone') && phone && phonePattern && !phonePattern.test(phone)) {
      issue('phone', PHONE_MESSAGE);
    }

    const taxIdPattern = compileCountryPattern(country?.taxIdPattern);
    const taxId = normalizeTaxIdForCheck(values.taxId.trim());
    if (isChecked('taxId') && taxId && taxIdPattern && !taxIdPattern.test(taxId)) {
      issue('taxId', `No tiene un formato válido de ${country?.taxIdLabel ?? 'NIT'} para ${country?.name ?? 'el país'}.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------------

export interface ContactFormValues {
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
  isActive: boolean;
  comments: string;
  isPrimary: boolean;
}

/** Esquema del formulario de contacto; el teléfono sigue el patrón del país del cliente. */
export function buildContactFormSchema(phonePattern: string | null | undefined) {
  const compiled = compileCountryPattern(phonePattern);
  return z
    .object({
      firstName: z.string().trim().min(1, REQUIRED_MESSAGE).max(CONTACT_LIMITS.firstName, maxMessage(CONTACT_LIMITS.firstName)),
      lastName: z.string().trim().min(1, REQUIRED_MESSAGE).max(CONTACT_LIMITS.lastName, maxMessage(CONTACT_LIMITS.lastName)),
      jobTitle: z.string().max(CONTACT_LIMITS.jobTitle, maxMessage(CONTACT_LIMITS.jobTitle)),
      phone: z.string().max(CONTACT_LIMITS.phone, maxMessage(CONTACT_LIMITS.phone)),
      email: z
        .string()
        .max(CONTACT_LIMITS.email, maxMessage(CONTACT_LIMITS.email))
        .refine((value) => !value.trim() || z.string().email().safeParse(value.trim()).success, EMAIL_MESSAGE),
      isActive: z.boolean(),
      comments: z.string().max(CONTACT_LIMITS.comments, maxMessage(CONTACT_LIMITS.comments)),
      isPrimary: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const phone = values.phone.trim();
      if (phone && compiled && !compiled.test(phone)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: PHONE_MESSAGE });
      }
      if (values.isPrimary && !values.isActive) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['isPrimary'],
          message: 'Un contacto inactivo no puede ser el principal.',
        });
      }
    });
}
