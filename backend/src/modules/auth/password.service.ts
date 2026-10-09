import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Hashing y política de contraseñas (PLAN-AUTH-LOCAL, D5–D7).
 *
 * Es el único punto del proyecto que conoce el algoritmo de hashing. El resto
 * del código pide "verifica esta contraseña", nunca compara hashes por su
 * cuenta.
 *
 * Nada de lo que entra o sale de aquí se registra en los logs: ni la
 * contraseña, ni el hash, ni fragmentos de ninguno de los dos.
 */

/**
 * Parámetros de Argon2id (OWASP, mínimos vigentes). Ver D5 del plan.
 *
 * El tipo es `HashOptions`, no `Options`: `argon2` renombró el tipo en la
 * versión 0.44 y los ejemplos antiguos que circulan ya no compilan.
 */
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * `needsRehash` sólo compara coste y versión: no acepta `type` ni el resto de
 * `HashOptions`. Se le pasa exactamente lo que entiende.
 */
const ARGON2_REHASH_OPTIONS = {
  memoryCost: ARGON2_OPTIONS.memoryCost,
  timeCost: ARGON2_OPTIONS.timeCost,
  parallelism: ARGON2_OPTIONS.parallelism,
};

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Tope de longitud. No es una regla de seguridad sino de disponibilidad:
 * Argon2 trabaja sobre lo que se le dé, y una contraseña de un megabyte es una
 * forma barata de consumir CPU del servidor.
 */
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordPolicyResult {
  valid: boolean;
  /** Motivos de rechazo, en el idioma de la interfaz. Vacío si es válida. */
  errors: string[];
}

@Injectable()
export class PasswordService {
  /**
   * Hash precalculado de una contraseña ficticia.
   *
   * Se usa cuando el correo no existe, para que el login tarde lo mismo que
   * con un usuario real. Sin esto, la diferencia de tiempo entre "no existe" y
   * "contraseña incorrecta" permite enumerar cuentas, por mucho que la
   * respuesta HTTP sea idéntica.
   *
   * Se calcula de forma perezosa en el primer uso: hacerlo en el constructor
   * retrasaría el arranque de la aplicación.
   */
  private dummyHash: string | null = null;

  hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, ARGON2_OPTIONS);
  }

  /**
   * Verifica una contraseña contra su hash.
   *
   * Devuelve `false` ante un hash corrupto o de un formato desconocido en
   * lugar de propagar el error: un registro dañado no debe convertirse en un
   * 500 que además revela que la cuenta existe.
   */
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      return false;
    }
  }

  /**
   * Consume tiempo equivalente a una verificación real y devuelve `false`.
   * Se llama cuando el correo no existe o la cuenta no tiene credencial.
   */
  async verifyAgainstDummy(plainPassword: string): Promise<false> {
    this.dummyHash ??= await this.hash('contrasena-ficticia-para-igualar-tiempos');
    await this.verify(this.dummyHash, plainPassword);
    return false;
  }

  /**
   * Indica si un hash se generó con parámetros distintos de los actuales.
   *
   * Permite migrar el hash de forma transparente: cuando el usuario acierta su
   * contraseña y su hash está desactualizado, se vuelve a calcular con los
   * parámetros nuevos. Es el único momento en que se dispone del texto plano.
   */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON2_REHASH_OPTIONS);
    } catch {
      // Hash ilegible: tratarlo como obsoleto es lo conservador.
      return true;
    }
  }

  /**
   * Política de contraseñas (D6, D7).
   *
   * Se exige longitud y se rechaza lo trivial, pero **no** se obliga a
   * combinar mayúsculas, números y símbolos: esa exigencia empuja a la gente
   * hacia variantes predecibles de una misma palabra. La longitud aporta más
   * entropía real.
   *
   * `email` es opcional y sirve para rechazar contraseñas derivadas del propio
   * correo, que son de las primeras que prueba un atacante.
   */
  validate(plainPassword: string, email?: string): PasswordPolicyResult {
    const errors: string[] = [];

    if (plainPassword.length < MIN_PASSWORD_LENGTH) {
      errors.push(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    if (plainPassword.length > MAX_PASSWORD_LENGTH) {
      errors.push(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`);
    }

    if (plainPassword.trim().length === 0) {
      errors.push('La contraseña no puede estar compuesta solo por espacios.');
    }

    const normalized = plainPassword.trim().toLowerCase();

    if (COMMON_PASSWORDS.has(normalized)) {
      errors.push('Esa contraseña aparece en las listas de contraseñas más usadas. Elige otra.');
    }

    if (isSingleRepeatedCharacter(plainPassword)) {
      errors.push('La contraseña no puede ser un mismo carácter repetido.');
    }

    if (email) {
      const localPart = email.split('@')[0]?.toLowerCase() ?? '';
      if (localPart.length >= 3 && normalized.includes(localPart)) {
        errors.push('La contraseña no puede contener tu dirección de correo.');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

function isSingleRepeatedCharacter(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const first = value[0];
  return [...value].every((character) => character === first);
}
