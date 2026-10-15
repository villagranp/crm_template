import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Texto plano para mensajes que la interfaz muestra a todas las sesiones: sin caracteres de
 * control (salvo `\n` y `\t`), sin marcas de formato ni de dirección bidi (`U+202E` y similares
 * reordenan lo que se ve) y con al menos un carácter visible. `\u0000` además lo rechaza
 * PostgreSQL (22021), de modo que se corta aquí con `400` y no llega a la base como `500`.
 */

/** Controles C0 salvo `\t` (09) y `\n` (0A), y `DEL`. `\r` ya se normalizó a `\n`. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
/** Formato y bidi: `U+200B–200F`, `U+202A–202E`, `U+2060–2069` y `U+FEFF`. */
const FORMAT_CHARACTERS = /[​-‏‪-‮⁠-⁩﻿]/u;
/** Espacios y rellenos sin trazo: no cuentan como carácter visible. */
const INVISIBLE_FILLERS = /^[\s⠀ㅤᅟᅠﾠ​-‏﻿]*$/u;

/** `\r\n` y `\r` sueltos pasan a `\n`, para que la longitud no dependa del cliente. */
export function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Transform de DTO: normaliza saltos de línea y recorta; lo que no es texto llega tal cual. */
export function trimPlainText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeLineBreaks(value).trim() : value;
}

export function isPlainText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return !CONTROL_CHARACTERS.test(value) && !FORMAT_CHARACTERS.test(value) && !INVISIBLE_FILLERS.test(value);
}

export function IsPlainText(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isPlainText',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be plain text with at least one visible character and no control or formatting characters`,
        ...options,
      },
      validator: { validate: (value: unknown) => isPlainText(value) },
    });
  };
}
