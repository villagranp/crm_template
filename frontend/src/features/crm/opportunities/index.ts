/**
 * Barril público del submódulo de Oportunidades (03 §L.3): lo único que la
 * ficha del proyecto, el Forecast y el Módulo 4 (Actividad comercial) pueden
 * importar de aquí. Lo demás es interno.
 */
export { OpportunityPicker } from './components/OpportunityPicker';
export type { OpportunityPickerProps, OpportunityPickerValue } from './components/OpportunityPicker';
export { OpportunityFormDialog } from './components/OpportunityFormDialog';
export type { OpportunityFormDialogProps } from './components/OpportunityFormDialog';
export { StageChangeDialog } from './components/StageChangeDialog';
export { ResultEditDialog } from './components/ResultEditDialog';
export { OpportunityHistoryPanel } from './components/OpportunityHistory';
export { StageChip } from './components/StageChip';
export { OutcomeChip } from './components/OutcomeChip';
export { EstimateText } from './components/EstimateText';
export { useOpportunity, useOpportunityFormOptions, useProjectOpportunities } from './opportunities.queries';
export { OPPORTUNITY_ERROR_MESSAGES, staleRateMessage } from './opportunities.errors';
export { lacksNextAction, outcomeLabel, resultText } from './opportunity-format';
export type {
  OpportunityCapabilities,
  OpportunityDetail,
  OpportunityListItem,
  OpportunityMutationResponse,
  OpportunityOutcome,
  OpportunityStage,
  OutcomeOption,
} from './opportunities.api';
