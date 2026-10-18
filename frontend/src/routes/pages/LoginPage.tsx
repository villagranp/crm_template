import { zodResolver } from '@hookform/resolvers/zod';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { Alert, Box, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';

import { env } from '@/config/env';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthSubmitButton } from '@/features/auth/AuthSubmitButton';
import { getLoginErrorMessage, getSsoErrorMessage } from '@/features/auth/auth-error-messages';
import { PasswordField } from '@/features/auth/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { clearReturnPath, isSafeReturnPath, saveReturnPath } from '@/services/auth';
import { loginSchema, type LoginFormValues } from '@/schemas/auth.schema';
import { brandIdentity } from '@/theme/tokens';

const FORGOT_PASSWORD_HINT = '¿Olvidaste tu contraseña? Pide al administrador que la restablezca.';
const PROVIDER_ERROR_MESSAGE = 'No se pudo iniciar sesión. Contacta al administrador del sistema.';

/**
 * Sólo rutas internas y a las que tiene sentido volver (`isSafeReturnPath`): un `from` manipulado
 * no puede sacar al usuario del sitio.
 */
function getReturnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return isSafeReturnPath(from) ? from : ROUTE_PATHS.home;
}

function LocalSignInForm() {
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setServerError(null);
    try {
      // Al tener éxito el store pasa a `authenticated` y la página redirige.
      await signIn({ email: values.email, password: values.password });
    } catch (error) {
      setServerError(getLoginErrorMessage(error));
      resetField('password');
      setFocus('password');
    }
  };

  return (
    <Box component="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <Stack spacing={2.25}>
        {serverError ? (
          <Alert severity="error" role="alert">
            {serverError}
          </Alert>
        ) : null}

        <TextField
          {...register('email')}
          id="login-email"
          label="Correo electrónico"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="nombre@empresa.com"
          required
          fullWidth
          autoFocus
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <MailOutlineIcon fontSize="small" aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />

        <PasswordField
          {...register('password')}
          id="login-password"
          label="Contraseña"
          autoComplete="current-password"
          required
          fullWidth
          error={Boolean(errors.password)}
          helperText={errors.password?.message}
        />

        <Box sx={{ pt: 0.75 }}>
          <AuthSubmitButton type="submit" loading={isSubmitting}>
            Iniciar sesión
          </AuthSubmitButton>
        </Box>

        {/* Sin flujo de recuperación por correo: se explica cómo recuperar el acceso, sin enlace. */}
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {FORGOT_PASSWORD_HINT}
        </Typography>
      </Stack>
    </Box>
  );
}

/**
 * Proveedores de redirección (Entra ID): no hay credenciales que pedir aquí.
 *
 * La ruta pedida se guarda ANTES de salir a Microsoft, porque la página se descarga y el estado de
 * React Router se pierde; `AuthCallbackPage` la recupera al volver.
 */
function RedirectSignIn() {
  const { signIn, status, signInError } = useAuth();
  const location = useLocation();
  const [starting, setStarting] = useState(false);

  const handleContinue = (): void => {
    const returnPath = getReturnPath(location.state);
    if (returnPath === ROUTE_PATHS.home) {
      clearReturnPath();
    } else {
      saveReturnPath(returnPath);
    }
    setStarting(true);
    // Tras un rechazo previo, Microsoft debe preguntar la cuenta: si no, devuelve la misma.
    signIn(undefined, signInError ? { selectAccount: true } : undefined)
      .catch(() => undefined)
      .finally(() => setStarting(false));
  };

  // Un fallo que dejó el intento anterior (p. ej. cuenta sin vincular) se explica en el formulario.
  const failureMessage = signInError
    ? getSsoErrorMessage(signInError)
    : status === 'error'
      ? PROVIDER_ERROR_MESSAGE
      : null;

  return (
    <Stack spacing={3}>
      {failureMessage ? (
        <Alert severity="error" role="alert">
          {failureMessage}
        </Alert>
      ) : null}

      <AuthSubmitButton loading={starting} onClick={handleContinue}>
        Continuar
      </AuthSubmitButton>

      <Typography variant="caption" color="text.secondary">
        ¿Problemas para entrar? Contacta al administrador del sistema.
      </Typography>
    </Stack>
  );
}

/**
 * Pantalla de acceso.
 *
 * Con el proveedor local pide correo y contraseña (PLAN-AUTH-LOCAL paso 8);
 * con Entra ID delega en la redirección del proveedor. Si la sesión exige
 * cambiar la contraseña, lleva a esa pantalla en lugar de al destino.
 */
export function LoginPage() {
  const { isAuthenticated, passwordChangeRequired } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    const target = passwordChangeRequired
      ? ROUTE_PATHS.changePassword
      : getReturnPath(location.state);
    return <Navigate to={target} replace />;
  }

  const isLocalProvider = env.VITE_AUTH_PROVIDER === 'local';

  return (
    <AuthLayout
      panelTitle={brandIdentity.productName}
      title="Bienvenido de nuevo"
      subtitle={
        isLocalProvider
          ? 'Introduce tu correo y contraseña para acceder a tu cuenta.'
          : 'Usa la cuenta corporativa que te asignó el administrador del sistema.'
      }
    >
      {isLocalProvider ? <LocalSignInForm /> : <RedirectSignIn />}
    </AuthLayout>
  );
}
