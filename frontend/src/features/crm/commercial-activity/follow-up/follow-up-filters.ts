/** Filtros del seguimiento que se editan o se muestran como chip (04 §E.4). */

/** Filtros del formulario (los nombres son los de la API y la URL). */
export type FollowUpFormFilter = 'customerId' | 'ownerId' | 'countryId' | 'withoutNextAction' | 'lastInteractionFrom' | 'lastInteractionTo';
/** Filtros que se muestran como chip: los del formulario y `projectId` (sólo llega por enlace). */
export type FollowUpChipFilter = FollowUpFormFilter | 'projectId';

export type FollowUpFilterValues = Partial<Record<FollowUpChipFilter, string>>;

export const FOLLOW_UP_FORM_FILTERS: readonly FollowUpFormFilter[] = [
  'customerId',
  'ownerId',
  'countryId',
  'withoutNextAction',
  'lastInteractionFrom',
  'lastInteractionTo',
];
