/**
 * Reloj del negocio (03 DEF-G, RN-03.12, RN-03.61, RN-03.66): decide **qué mes es hoy**
 * en el negocio para la ventana del forecast y para las comprobaciones de "forecast
 * futuro" al eliminar un proyecto o quitar un producto asociado. Una sola fuente para
 * todos (03 "Precisiones", Revisión E5, m2). Los instantes que se guardan (`updatedAt`,
 * `lastActivityAt`, `deletedAt`) son siempre la hora real.
 *
 * Lo provee y exporta `ProjectsModule`; las pruebas lo sustituyen con
 * `overrideProvider(BUSINESS_CLOCK)` (alias `FORECAST_CLOCK`) para simular el cambio de mes.
 */
export const BUSINESS_CLOCK = Symbol('BUSINESS_CLOCK');

export interface BusinessClock {
  now(): Date;
}

export const systemBusinessClock: BusinessClock = { now: () => new Date() };
