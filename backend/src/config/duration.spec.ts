import { parseDurationMs } from './duration';

describe('parseDurationMs', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['8h', 28_800_000],
    ['7d', 604_800_000],
  ])('convierte %s', (value, expected) => {
    expect(parseDurationMs(value)).toBe(expected);
  });

  it.each(['', '15', 'm', '0m', '-5m', '1.5h', '15 minutes', '15M'])('rechaza "%s"', (value) => {
    expect(() => parseDurationMs(value)).toThrow('Duración inválida');
  });
});
