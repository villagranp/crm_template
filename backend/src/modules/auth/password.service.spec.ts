import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PasswordService } from './password.service';

// Argon2 está calibrado para ser lento a propósito: cada hash ronda los 50 ms.
jest.setTimeout(30_000);

describe('PasswordService', () => {
  const service = new PasswordService();
  const VALID_PASSWORD = 'caballo-correcto-grapa';

  describe('hash y verify', () => {
    it('genera un hash verificable', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      await expect(service.verify(hash, VALID_PASSWORD)).resolves.toBe(true);
    });

    it('rechaza una contraseña distinta', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      await expect(service.verify(hash, 'otra-contrasena-larga')).resolves.toBe(false);
    });

    it('produce hashes distintos para la misma contraseña', async () => {
      const [first, second] = await Promise.all([service.hash(VALID_PASSWORD), service.hash(VALID_PASSWORD)]);

      // Si coincidieran, no habría sal y dos usuarios con la misma contraseña
      // serían identificables entre sí con solo mirar la tabla.
      expect(first).not.toBe(second);
    });

    it('usa Argon2id, no otra variante', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('devuelve false ante un hash corrupto en lugar de lanzar', async () => {
      await expect(service.verify('esto-no-es-un-hash', VALID_PASSWORD)).resolves.toBe(false);
    });

    it('distingue contraseñas que solo difieren en mayúsculas', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      await expect(service.verify(hash, VALID_PASSWORD.toUpperCase())).resolves.toBe(false);
    });
  });

  describe('verifyAgainstDummy', () => {
    it('siempre devuelve false', async () => {
      await expect(service.verifyAgainstDummy(VALID_PASSWORD)).resolves.toBe(false);
    });

    it('tarda un tiempo comparable a una verificación real', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      const realStart = Date.now();
      await service.verify(hash, VALID_PASSWORD);
      const realElapsed = Date.now() - realStart;

      // El primer uso calcula el hash ficticio; se descarta esa llamada para
      // medir el caso estable, que es el que ve un atacante.
      await service.verifyAgainstDummy('cualquier-cosa');

      const dummyStart = Date.now();
      await service.verifyAgainstDummy('cualquier-cosa');
      const dummyElapsed = Date.now() - dummyStart;

      // Margen amplio a propósito: esto comprueba que se hace el trabajo
      // criptográfico, no que los tiempos sean idénticos al milisegundo.
      expect(dummyElapsed).toBeGreaterThan(realElapsed / 4);
    });
  });

  describe('needsRehash', () => {
    it('no pide recalcular un hash recién generado', async () => {
      const hash = await service.hash(VALID_PASSWORD);

      expect(service.needsRehash(hash)).toBe(false);
    });

    it('trata un hash ilegible como obsoleto', () => {
      expect(service.needsRehash('hash-de-otra-epoca')).toBe(true);
    });
  });

  describe('validate', () => {
    it('acepta una contraseña larga sin símbolos ni números', () => {
      // No se exige composición a propósito (D6): la longitud aporta más.
      expect(service.validate('caballo correcto grapa').valid).toBe(true);
    });

    it('rechaza una contraseña por debajo del mínimo', () => {
      const result = service.validate('corta123');

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain(String(MIN_PASSWORD_LENGTH));
    });

    it('rechaza una contraseña por encima del máximo', () => {
      const result = service.validate('a'.repeat(MAX_PASSWORD_LENGTH + 1));

      expect(result.valid).toBe(false);
    });

    it('rechaza una contraseña de la lista de más usadas', () => {
      expect(service.validate('contrasena123').valid).toBe(false);
    });

    it('rechaza la lista de más usadas sin importar mayúsculas ni espacios', () => {
      expect(service.validate('  Contrasena123  ').valid).toBe(false);
    });

    it('rechaza un mismo carácter repetido', () => {
      expect(service.validate('aaaaaaaaaaaaaaa').valid).toBe(false);
    });

    it('rechaza solo espacios', () => {
      expect(service.validate('               ').valid).toBe(false);
    });

    it('rechaza una contraseña que contiene el correo del usuario', () => {
      const result = service.validate('anabeltran-es-segura', 'anabeltran@example.com');

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('correo');
    });

    it('no confunde un correo muy corto con parte de la contraseña', () => {
      // Un local part de 1 o 2 letras aparecería en casi cualquier contraseña.
      expect(service.validate('caballo correcto grapa', 'ab@example.com').valid).toBe(true);
    });

    it('acumula todos los motivos de rechazo, no solo el primero', () => {
      const result = service.validate('aaa');

      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
