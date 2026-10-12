/**
 * Reloj del forecast (03 RN-03.66, PF-03.92, PF-03.103). Solo decide **qué mes es hoy**
 * en el negocio (la ventana M+1 … M+N); los instantes que se guardan (`updatedAt`,
 * `lastActivityAt`) son siempre la hora real. Las pruebas lo sustituyen con
 * `overrideProvider(FORECAST_CLOCK)` para simular el cambio de mes.
 */
export const FORECAST_CLOCK = Symbol('FORECAST_CLOCK');

export interface ForecastClock {
  now(): Date;
}

export const systemForecastClock: ForecastClock = { now: () => new Date() };
