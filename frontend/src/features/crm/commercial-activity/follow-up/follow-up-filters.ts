/** Filtros del seguimiento que se editan o se muestran como chip (04 §E.4). */

/** Filtros del formulario (los nombres son los de la API y la URL). */
export type FollowUpFormFilter =
  | 'customerId'
  | 'projectId'
  | 'ownerId'
  | 'countryId'
  | 'withoutNextAction'
  | 'lastInteractionFrom'
  | 'lastInteractionTo';
/** Filtros que se muestran como chip: los mismos del formulario. */
export type FollowUpChipFilter = FollowUpFormFilter;

export type FollowUpFilterValues = Partial<Record<FollowUpChipFilter, string>>;

export const FOLLOW_UP_FORM_FILTERS: readonly FollowUpFormFilter[] = [
  'customerId',
  'projectId',
  'ownerId',
  'countryId',
  'withoutNextAction',
  'lastInteractionFrom',
  'lastInteractionTo',
];
