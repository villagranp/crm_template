/** Filtros del historial que se editan o se muestran como chip (04 §E.5). */

/** Filtros del formulario (nombres de la API y la URL). `sourceType` y `typeId` comparten el selector "Tipo". */
export type InteractionFormFilter = 'from' | 'to' | 'customerId' | 'userId' | 'sourceType' | 'typeId' | 'resultId';
/** Filtros que se muestran como chip: los del formulario y los que sólo llegan por enlace. */
export type InteractionChipFilter = InteractionFormFilter | 'projectId' | 'opportunityId';

export type InteractionFilterValues = Partial<Record<InteractionChipFilter, string>>;

export const INTERACTION_FORM_FILTERS: readonly InteractionFormFilter[] = ['from', 'to', 'customerId', 'userId', 'sourceType', 'typeId', 'resultId'];

/** Valor del selector "Tipo" para las visitas (`sourceType=VISIT`); el resto son ids de tipo de actividad (`typeId`). */
export const VISIT_TYPE_VALUE = 'VISIT';
