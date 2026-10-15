import { registerDecorator } from 'class-validator';

/**
 * `to` no anterior a `from` en una consulta por rango de fechas (`from ≤ to`). Las fechas
 * `YYYY-MM-DD` se comparan como texto; si falta uno de los dos extremos no hay nada que comparar.
 */
export function IsNotBeforeFrom(): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isNotBeforeFrom',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: 'to must be on or after from' },
      validator: {
        validate: (value: unknown, args) => {
          const from = (args?.object as { from?: unknown } | undefined)?.from;
          return typeof value !== 'string' || typeof from !== 'string' || from <= value;
        },
      },
    });
  };
}
