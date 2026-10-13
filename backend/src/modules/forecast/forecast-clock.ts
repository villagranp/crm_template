/**
 * Reloj del forecast (03 RN-03.66, PF-03.92, PF-03.103): alias del reloj del negocio
 * (`commercial-metrics/business-clock.ts`), el **mismo** token que usan la eliminación
 * del proyecto y la de un producto asociado (Revisión E5, m2). Las pruebas lo sustituyen
 * con `overrideProvider(FORECAST_CLOCK)` para simular el cambio de mes.
 */
export {
  BUSINESS_CLOCK as FORECAST_CLOCK,
  type BusinessClock as ForecastClock,
  systemBusinessClock as systemForecastClock,
} from '@/modules/commercial-metrics/business-clock';
