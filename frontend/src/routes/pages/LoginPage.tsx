import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router-dom';

import { env } from '@/config/env';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { getLoginErrorMessage } from '@/features/auth/auth-error-messages';
import { PasswordField } from '@/features/auth/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { loginSchema, type LoginFormValues } from '@/schemas/auth.schema';

const PANEL_TITLE = 'Acceso a la plataforma';
const PANEL_DESCRIPTION =
  'Tu menú y tus permisos se resuelven en el servidor a partir de los roles y las opciones asignadas a tu cuenta.';
const FORGOT_PASSWORD_HINT = '¿Olvidaste tu contraseña? Pide al administrador que la restablezca.';
const PROVIDER_ERROR_MESSAGE = 'No se pudo iniciar sesión. Contacta al administrador del sistema.';

/** Rutas a las que no tiene sentido volver tras entrar. */
const NON_RETURNABLE_PATHS: readonly string[] = [ROUTE_PATHS.login, ROUTE_PATHS.changePassword];

/** Sólo rutas internas: un `from` manipulado no puede sacar al usuario del sitio. */
function getReturnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !NON_RETURNABLE_PATHS.includes(from)) {
    return from;
  }
  return ROUTE_PATHS.home;
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
      <Stack spacing={2.5}>
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
          required
          fullWidth
          autoFocus
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
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

        <Button type="submit" size="large" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Iniciar sesión'}
        </Button>

        <Typography variant="caption" color="text.secondary">
          {FORGOT_PASSWORD_HINT}
        </Typography>
      </Stack>
    </Box>
  );
}

/** Proveedores de redirección (Entra ID): no hay credenciales que pedir aquí. */
function RedirectSignIn() {
  const { signIn, status } = useAuth();

  return (
    <Stack spacing={3}>
      {status === 'error' ? <Alert severity="error">{PROVIDER_ERROR_MESSAGE}</Alert> : null}

      <Button size="large" fullWidth onClick={() => void signIn().catch(() => undefined)}>
        Continuar
      </Button>

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
    const target = passwordChangeRequired ? ROUTE_PATHS.changePassword : getReturnPath(location.state);
    return <Navigate to={target} replace />;
  }

  const isLocalProvider = env.VITE_AUTH_PROVIDER === 'local';

  return (
    <AuthLayout
      panelTitle={PANEL_TITLE}
      panelDescription={PANEL_DESCRIPTION}
      title="Iniciar sesión"
      subtitle="Usa la cuenta corporativa que te asignó el administrador del sistema."
    >
      {isLocalProvider ? <LocalSignInForm /> : <RedirectSignIn />}
    </AuthLayout>
  );
}
