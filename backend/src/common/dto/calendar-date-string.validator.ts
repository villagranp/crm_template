import { registerDecorator, type ValidationOptions } from 'class-validator';

import { isCalendarDate } from '@/common/calendar-date';

/** Fecha de calendario `YYYY-MM-DD` real (DM-31). */
export function IsCalendarDateString(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDateString',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} must be a calendar date (YYYY-MM-DD)`, ...options },
      validator: { validate: (value: unknown) => isCalendarDate(value) },
    });
  };
}
