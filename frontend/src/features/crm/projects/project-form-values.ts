import { canEditField, type ProjectGeneralField } from './capabilities';
import type { CreateProjectInput, DuplicateProjectInput, ProjectCapabilities, ProjectDetail, UpdateProjectInput } from './projects.api';
import type { DuplicateFormValues, ProjectFormValues } from './projects.schemas';

/**
 * Conversión entre el formulario de datos generales (todo texto) y los cuerpos
 * de `POST /projects` y `PATCH /projects/{id}` (03 F.1).
 */

/** Texto libre opcional que se puede borrar (`null` en el PATCH). */
const NULLABLE_TEXT_FIELDS = ['city', 'address', 'description', 'estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate'] as const;

/** Nombre del campo del formulario para un `details[].field` del backend. */
export function projectFormFieldFor(apiField: string): keyof ProjectFormValues | null {
  switch (apiField) {
    case 'customerId':
      return 'customer';
    case 'ownerId':
      return 'owner';
    case 'name':
    case 'countryId':
    case 'city':
    case 'address':
    case 'description':
    case 'estimatedStartDate':
    case 'estimatedEndDate':
    case 'estimatedDecisionDate':
    case 'code':
      return apiField;
    default:
      return null;
  }
}

function cleaned(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

/** Valores iniciales del alta. Con un solo país, queda elegido. */
export function emptyProjectValues(countryIds: readonly string[] = []): ProjectFormValues {
  return {
    name: '',
    customer: null,
    countryId: countryIds.length === 1 ? (countryIds[0] ?? '') : '',
    city: '',
    address: '',
    description: '',
    estimatedStartDate: '',
    estimatedEndDate: '',
    estimatedDecisionDate: '',
    owner: null,
    code: '',
  };
}

/** Valores de la edición a partir de la ficha. */
export function projectToFormValues(project: ProjectDetail): ProjectFormValues {
  return {
    name: project.name,
    customer: { id: project.customer.id, legalName: project.customer.legalName },
    countryId: project.country.id,
    city: project.city ?? '',
    address: project.address ?? '',
    description: project.description ?? '',
    estimatedStartDate: project.estimatedStartDate ?? '',
    estimatedEndDate: project.estimatedEndDate ?? '',
    estimatedDecisionDate: project.estimatedDecisionDate ?? '',
    owner: { id: project.owner.id, displayName: project.owner.displayName, countryId: null, primaryTeam: null },
    code: project.code,
  };
}

/**
 * Cuerpo del alta. Lo vacío se omite (el backend aplica sus valores por
 * defecto: país del cliente, asesor = actor, código `PRY-…`). El asesor y el
 * código sólo se envían si el usuario puede elegirlos (`proyectos.administrar`).
 */
export function toCreateProjectInput(values: ProjectFormValues, canAdminister: boolean): CreateProjectInput {
  const input: CreateProjectInput = { name: values.name.trim(), customerId: values.customer?.id ?? '' };
  if (values.countryId) {
    input.countryId = values.countryId;
  }
  for (const field of NULLABLE_TEXT_FIELDS) {
    const value = cleaned(values[field]);
    if (value !== null) {
      input[field] = value;
    }
  }
  if (canAdminister && values.owner) {
    input.ownerId = values.owner.id;
  }
  const code = cleaned(values.code);
  if (canAdminister && code !== null) {
    input.code = code;
  }
  return input;
}

/**
 * Cuerpo del PATCH con **sólo** lo que cambió y el usuario puede cambiar
 * (omitido = sin cambio). Un opcional vaciado va como `null`; un obligatorio
 * vaciado se envía vacío para que el backend responda con su campo. El código
 * se compara sin mayúsculas ni espacios (E2a #2: un cambio sólo de forma no
 * cuenta).
 */
export function toUpdateProjectInput(
  initial: ProjectFormValues,
  values: ProjectFormValues,
  capabilities: ProjectCapabilities,
): UpdateProjectInput {
  const input: UpdateProjectInput = {};
  const editable = (field: ProjectGeneralField) => canEditField(capabilities, field);

  if (editable('name') && values.name.trim() !== initial.name.trim()) {
    input.name = values.name.trim();
  }
  if (editable('customerId') && values.customer && values.customer.id !== initial.customer?.id) {
    input.customerId = values.customer.id;
  }
  if (editable('countryId') && values.countryId && values.countryId !== initial.countryId) {
    input.countryId = values.countryId;
  }
  for (const field of NULLABLE_TEXT_FIELDS) {
    if (editable(field) && cleaned(values[field]) !== cleaned(initial[field])) {
      input[field] = cleaned(values[field]);
    }
  }
  if (editable('ownerId') && values.owner && values.owner.id !== initial.owner?.id) {
    input.ownerId = values.owner.id;
  }
  const code = values.code.trim();
  if (editable('code') && code && code.toUpperCase() !== initial.code.trim().toUpperCase()) {
    input.code = code;
  }
  return input;
}

/**
 * Cuerpo de `POST /projects/{id}/duplicate`. Lo que no cambia respecto al
 * origen se omite (el backend usa el valor del origen); una fecha vaciada va
 * como `null`. Sin `administrar`, el asesor no se envía: el backend asigna al
 * propio usuario (E2a #3).
 */
export function toDuplicateInput(project: ProjectDetail, values: DuplicateFormValues, canAdminister: boolean): DuplicateProjectInput {
  const input: DuplicateProjectInput = {
    name: values.name.trim(),
    copy: {
      location: values.copyLocation,
      description: values.copyDescription,
      classification: values.copyClassification,
      products: values.copyProducts,
    },
  };
  if (values.customer && values.customer.id !== project.customer.id) {
    input.customerId = values.customer.id;
  }
  for (const field of ['estimatedStartDate', 'estimatedEndDate', 'estimatedDecisionDate'] as const) {
    const value = values[field] || null;
    if (value !== (project[field] ?? null)) {
      input[field] = value;
    }
  }
  if (canAdminister && values.owner && values.owner.id !== project.owner.id) {
    input.ownerId = values.owner.id;
  }
  if (canAdminister && values.code.trim()) {
    input.code = values.code.trim();
  }
  return input;
}
