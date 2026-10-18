import { canonicalDomain, canonicalOid, isEmailDomainAllowed, isGuestUpn, isGuid, parseDomainList, usableEmail } from './identity-claims';

const chars = (...codes: number[]): string => String.fromCharCode(...codes);

describe('usableEmail', () => {
  it('normaliza a minúsculas y recorta', () => {
    expect(usableEmail('  Ana.Beltran@Example.INVALID ')).toBe('ana.beltran@example.invalid');
  });

  it('acepta un dominio punycode y la parte local con símbolos habituales', () => {
    expect(usableEmail('ana+crm@xn--espaa-rta.example.invalid')).toBe('ana+crm@xn--espaa-rta.example.invalid');
  });

  it.each([undefined, '', '   ', 'sin-arroba', 'a@b', 'a b@example.invalid', 'a@@example.invalid', 'a,b@example.invalid', 'x'.repeat(320) + '@example.invalid'])('rechaza %p', (candidate) => {
    expect(usableEmail(candidate as string | undefined)).toBeNull();
  });

  it('rechaza el UPN de un invitado externo (no es un buzón)', () => {
    expect(usableEmail('ana_empresa.com#EXT#@tenant.onmicrosoft.com')).toBeNull();
  });

  it.each([
    ['NUL', chars(0)],
    ['control C0', chars(7)],
    ['DEL', chars(0x7f)],
    ['control C1', chars(0x85)],
    ['ancho cero U+200B', chars(0x200b)],
    ['marca direccional U+200E', chars(0x200e)],
    ['bidi U+202E (override)', chars(0x202e)],
    ['bidi U+2066 (isolate)', chars(0x2066)],
    ['word joiner U+2060', chars(0x2060)],
    ['BOM U+FEFF', chars(0xfeff)],
  ])('rechaza %s en cualquier posición (también en los bordes)', (_name, invisible) => {
    expect(usableEmail(`ana${invisible}@example.invalid`)).toBeNull();
    expect(usableEmail(`ana@exa${invisible}mple.invalid`)).toBeNull();
    expect(usableEmail(`${invisible}ana@example.invalid`)).toBeNull();
    expect(usableEmail(`ana@example.invalid${invisible}`)).toBeNull();
  });

  it.each(['ánа@example.invalid', 'ana@exámple.invalid', 'аna@example.invalid', 'ana@example.invalidé'])('rechaza caracteres no ASCII (%p)', (candidate) => {
    expect(usableEmail(candidate)).toBeNull();
  });
});

describe('isGuestUpn', () => {
  it('detecta #EXT# sin distinguir mayúsculas y solo en textos', () => {
    expect(isGuestUpn('a_b.com#EXT#@t.onmicrosoft.com')).toBe(true);
    expect(isGuestUpn('a_b.com#ext#@t.onmicrosoft.com')).toBe(true);
    expect(isGuestUpn('ana@example.invalid')).toBe(false);
    expect(isGuestUpn(undefined)).toBe(false);
    expect(isGuestUpn(42)).toBe(false);
  });
});

describe('oid', () => {
  it('reconoce un GUID en cualquier capitalización y lo deja en minúsculas', () => {
    expect(isGuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(true);
    expect(canonicalOid(' 3F2504E0-4F89-11D3-9A0C-0305E82C3301 ')).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  });

  it.each(['', 'no-es-un-guid', '3f2504e0-4f89-11d3-9a0c-0305e82c330', '3f2504e04f8911d39a0c0305e82c3301', '3f2504e0-4f89-11d3-9a0c-0305e82c330g'])('rechaza %p', (value) => {
    expect(isGuid(value)).toBe(false);
  });
});

describe('dominios permitidos', () => {
  it('canonicalDomain recorta y baja a minúsculas; rechaza lo que no es un dominio', () => {
    expect(canonicalDomain(' SomosGrupoAG.com ')).toBe('somosgrupoag.com');
    for (const bad of ['', 'sinpunto', '-a.com', 'a..com', 'a b.com', '@a.com', 'a.com/x', 'ñ.com']) expect(canonicalDomain(bad)).toBeNull();
  });

  it('parseDomainList normaliza, quita repetidos y omite lo ilegible', () => {
    expect(parseDomainList(' SomosGrupoAG.com , otro.example.invalid,somosgrupoag.com,basura, ')).toEqual(['somosgrupoag.com', 'otro.example.invalid']);
    expect(parseDomainList('')).toEqual([]);
    expect(parseDomainList(undefined)).toEqual([]);
    expect(parseDomainList(null)).toEqual([]);
  });

  const allowed = ['somosgrupoag.com'];

  it('coincide solo por dominio exacto, sin distinguir mayúsculas', () => {
    expect(isEmailDomainAllowed('ana@somosgrupoag.com', allowed)).toBe(true);
    expect(isEmailDomainAllowed('ana@SomosGrupoAG.COM', allowed)).toBe(true);
  });

  it.each([
    'ana@evil-somosgrupoag.com',
    'ana@somosgrupoag.com.evil.io',
    'ana@sub.somosgrupoag.com',
    'ana@somosgrupoag.co',
    'ana@somosgrupoag.com@evil.io',
    'somosgrupoag.com',
  ])('no autoriza %s', (email) => {
    expect(isEmailDomainAllowed(email, allowed)).toBe(false);
  });

  it('una lista vacía no autoriza a nadie', () => {
    expect(isEmailDomainAllowed('ana@somosgrupoag.com', [])).toBe(false);
  });
});
