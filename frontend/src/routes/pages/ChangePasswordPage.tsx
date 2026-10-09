import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertTitle, Box, Button, Stack } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { AuthSubmitButton } from '@/features/auth/AuthSubmitButton';
import {
  getChangePasswordError,
  type ChangePasswordError,
} from '@/features/auth/auth-error-messages';
import { PasswordField } from '@/features/auth/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { ROUTE_PATHS } from '@/routes/route-paths';
import {
  changePasswordSchema,
  MIN_PASSWORD_LENGTH,
  type ChangePasswordFormValues,
} from '@/schemas/auth.schema';

const PANEL_TITLE = 'Tu contraseña, sólo tuya';
const PANEL_DESCRIPTION =
  'Una frase larga y fácil de recordar protege más que una palabra corta con símbolos. Al cambiarla se cierran tus otras sesiones abiertas.';
const FORCED_CHANGE_TITLE = 'Debes establecer una contraseña personal antes de continuar';
const FORCED_CHANGE_DESCRIPTION =
  'Entraste con una contraseña inicial o restablecida por el administrador. Hasta que la cambies no podrás usar el resto de la aplicación.';
const NEW_PASSWORD_HINT = `Al menos ${MIN_PASSWORD_LENGTH} caracteres. Puedes usar una frase.`;

/** Consultas cuyo contenido depende de la sesión (perfil, menú). */
const SESSION_QUERY_KEY = ['me'] as const;

/**
 * Cambio de la contraseña propia (PLAN-AUTH-LOCAL paso 9).
 *
 * Es obligatoria cuando la sesión trae `passwordChangeRequired` (D13): la
 * guardia de rutas trae aquí al usuario y sólo puede cambiarla o cerrar
 * sesión. Fuera de ese caso es voluntaria y se puede cancelar.
 */
export function ChangePasswordPage() {
  const { passwordChangeRequired, changePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<ChangePasswordError | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmation: '' },
  });

  const onSubmit = async (values: ChangePasswordFormValues): Promise<void> => {
    setFormError(null);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate(ROUTE_PATHS.home, { replace: true });
    } catch (error) {
      const mapped = getChangePasswordError(error);
      if (mapped.field) {
        setError(mapped.field, { type: 'server', message: mapped.message });
        setFocus(mapped.field);
      }
      setFormError(mapped);
    }
  };

  const policyReasons = formError?.reasons ?? [];
  // El error de un campo ya se lee junto al campo; el aviso general sólo se
  // repite si trae motivos de la política o si no pertenece a ningún campo.
  const shouldShowFormAlert = formError !== null && (!formError.field || policyReasons.length > 0);

  return (
    <AuthLayout
      panelTitle={PANEL_TITLE}
      panelDescription={PANEL_DESCRIPTION}
      title="Cambiar contraseña"
      subtitle={
        passwordChangeRequired
          ? undefined
          : 'Al guardar la nueva contraseña se cerrarán tus otras sesiones.'
      }
    >
      {passwordChangeRequired ? (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          <AlertTitle>{FORCED_CHANGE_TITLE}</AlertTitle>
          {FORCED_CHANGE_DESCRIPTION}
        </Alert>
      ) : null}

      <Box component="form" noValidate onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
        <Stack spacing={2.25}>
          {shouldShowFormAlert ? (
            <Alert severity="error" role="alert">
              {/* Con campo asociado el mensaje ya está junto al campo: aquí sólo los motivos. */}
              {formError.field ? null : formError.message}
              {policyReasons.length > 0 ? (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {policyReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </Box>
              ) : null}
            </Alert>
          ) : null}

          <PasswordField
            {...register('currentPassword')}
            id="change-password-current"
            label="Contraseña actual"
            autoComplete="current-password"
            required
            fullWidth
            autoFocus
            error={Boolean(errors.currentPassword)}
            helperText={errors.currentPassword?.message}
          />

          <PasswordField
            {...register('newPassword')}
            id="change-password-new"
            label="Nueva contraseña"
            autoComplete="new-password"
            required
            fullWidth
            error={Boolean(errors.newPassword)}
            helperText={errors.newPassword?.message ?? NEW_PASSWORD_HINT}
          />

          <PasswordField
            {...register('confirmation')}
            id="change-password-confirmation"
            label="Repite la nueva contraseña"
            autoComplete="new-password"
            required
            fullWidth
            error={Boolean(errors.confirmation)}
            helperText={errors.confirmation?.message}
          />

          <AuthSubmitButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
          </AuthSubmitButton>

          {passwordChangeRequired ? (
            <Button variant="text" fullWidth onClick={() => void signOut()}>
              Cerrar sesión
            </Button>
          ) : (
            <Button variant="text" fullWidth component={RouterLink} to={ROUTE_PATHS.home}>
              Cancelar
            </Button>
          )}
        </Stack>
      </Box>
    </AuthLayout>
  );
}
