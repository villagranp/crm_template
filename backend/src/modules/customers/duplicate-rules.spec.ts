import {
  activeRuleKeys,
  areWarningsAcknowledged,
  CONTACT_DUPLICATE_RULE_KEYS,
  CUSTOMER_DUPLICATE_RULE_KEYS,
  CUSTOMER_RESTRICTED_ACTIONS,
  evaluateDuplicates,
  parseDuplicateRules,
} from './duplicate-rules';

describe('parseDuplicateRules (F.6.4, PF-02.56)', () => {
  it('interpreta las claves admitidas; las no configuradas valen NO', () => {
    const parsed = parseDuplicateRules({ razonSocialNormalizada: 'AVISAR', nit: 'AVISAR' }, CUSTOMER_DUPLICATE_RULE_KEYS, {
      restrictedActions: CUSTOMER_RESTRICTED_ACTIONS,
    });
    expect(parsed.rules).toEqual({
      razonSocialNormalizada: 'AVISAR',
      nombreComercialNormalizado: 'NO',
      correo: 'NO',
      telefono: 'NO',
      nit: 'AVISAR',
    });
    expect(parsed.warnings).toEqual([]);
  });

  it('ignora claves desconocidas y acciones inválidas con advertencia', () => {
    const parsed = parseDuplicateRules({ cuit: 'BLOQUEAR', correo: 'QUIZAS', telefono: 'BLOQUEAR' }, CUSTOMER_DUPLICATE_RULE_KEYS);
    expect(parsed.rules.telefono).toBe('BLOQUEAR');
    expect(parsed.rules.correo).toBe('NO');
    expect(parsed.warnings).toEqual([
      { key: 'cuit', reason: 'UNKNOWN_KEY' },
      { key: 'correo', reason: 'INVALID_ACTION' },
    ]);
  });

  it('nit nunca bloquea: BLOQUEAR se degrada a AVISAR con advertencia (DM-4)', () => {
    const parsed = parseDuplicateRules({ nit: 'BLOQUEAR' }, CUSTOMER_DUPLICATE_RULE_KEYS, { restrictedActions: CUSTOMER_RESTRICTED_ACTIONS });
    expect(parsed.rules.nit).toBe('AVISAR');
    expect(parsed.warnings).toEqual([{ key: 'nit', reason: 'ACTION_NOT_ALLOWED' }]);
  });

  it('el correo de contacto siempre bloquea, aunque el parámetro diga otra cosa (RN-02.16)', () => {
    const parsed = parseDuplicateRules({ correo: 'NO', nombreCompleto: 'AVISAR' }, CONTACT_DUPLICATE_RULE_KEYS, { forced: { correo: 'BLOQUEAR' } });
    expect(parsed.rules).toEqual({ nombreCompleto: 'AVISAR', telefono: 'NO', correo: 'BLOQUEAR' });
  });

  it('un valor que no es objeto se trata como vacío', () => {
    expect(parseDuplicateRules('texto', CUSTOMER_DUPLICATE_RULE_KEYS).rules.nit).toBe('NO');
    expect(parseDuplicateRules(null, CUSTOMER_DUPLICATE_RULE_KEYS).warnings).toEqual([]);
    expect(parseDuplicateRules(['nit'], CUSTOMER_DUPLICATE_RULE_KEYS).rules.razonSocialNormalizada).toBe('NO');
  });
});

describe('evaluateDuplicates', () => {
  const rules = { razonSocialNormalizada: 'AVISAR', nombreComercialNormalizado: 'NO', correo: 'BLOQUEAR', telefono: 'NO', nit: 'AVISAR' } as const;

  it('clasifica por la acción de la regla: BLOQUEAR > AVISAR > NO', () => {
    const evaluation = evaluateDuplicates(rules, [
      { rule: 'razonSocialNormalizada', candidate: 'A' },
      { rule: 'correo', candidate: 'A' },
      { rule: 'nombreComercialNormalizado', candidate: 'B' },
      { rule: 'nit', candidate: 'C' },
    ]);
    expect(evaluation.blocking).toEqual([{ rule: 'correo', candidate: 'A' }]);
    expect(evaluation.warnings).toEqual([
      { rule: 'razonSocialNormalizada', candidate: 'A' },
      { rule: 'nit', candidate: 'C' },
    ]);
  });

  it('reglas activas = las distintas de NO', () => {
    expect(activeRuleKeys(rules).sort()).toEqual(['correo', 'nit', 'razonSocialNormalizada']);
  });
});

describe('areWarningsAcknowledged (RN-02.14, aclaración de 2026-10-11)', () => {
  it('sin avisos no hace falta confirmar', () => {
    expect(areWarningsAcknowledged([], undefined)).toBe(true);
  });

  it('sin el campo, cualquier aviso exige confirmación', () => {
    expect(areWarningsAcknowledged(['a'], undefined)).toBe(false);
    expect(areWarningsAcknowledged([null], undefined)).toBe(false);
  });

  it('la presencia confirma los no visibles; los visibles deben figurar todos', () => {
    expect(areWarningsAcknowledged([null, null], [])).toBe(true);
    expect(areWarningsAcknowledged(['a', null], ['a'])).toBe(true);
    expect(areWarningsAcknowledged(['a', 'b'], ['a'])).toBe(false);
    expect(areWarningsAcknowledged(['a'], ['a', 'z'])).toBe(true);
  });
});
