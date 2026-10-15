import { authenticationSettings, LOGIN_SECURITY_PARAMETER_KEYS } from './authentication-settings';

describe('authenticationSettings (D-07.8, RN-07.34)', () => {
  it.each([
    ['local', true],
    ['hybrid', true],
    ['entra', false],
  ] as const)('%s → localLoginEnabled = %s', (provider, localLoginEnabled) => {
    expect(authenticationSettings(provider)).toEqual({
      provider,
      localLoginEnabled,
      securityParameterKeys: [...LOGIN_SECURITY_PARAMETER_KEYS],
    });
  });

  it('solo expone proveedor, login local y las claves de seguridad (sin secretos ni tenant)', () => {
    expect(Object.keys(authenticationSettings('entra')).sort()).toEqual(['localLoginEnabled', 'provider', 'securityParameterKeys']);
  });

  it('las claves son las tres de login local del grupo seguridad', () => {
    expect(LOGIN_SECURITY_PARAMETER_KEYS).toEqual([
      'seguridad.intentos_fallidos_maximos',
      'seguridad.minutos_bloqueo',
      'seguridad.dias_caducidad_password',
    ]);
  });
});
