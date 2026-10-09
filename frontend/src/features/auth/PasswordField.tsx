import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { forwardRef, useState } from 'react';

type PasswordFieldProps = Omit<TextFieldProps, 'type'> & {
  /** Muestra el candado al inicio del campo (`.input-icon-wrap` del prototipo). Por defecto, sí. */
  showLeadingIcon?: boolean;
};

/**
 * Campo de contraseña con botón para mostrarla.
 *
 * Ver lo que se escribe reduce errores en contraseñas largas, que es justo lo
 * que la política pide (D6). El botón tiene etiqueta accesible y estado
 * `aria-pressed`.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ showLeadingIcon = true, ...props }, ref) {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <TextField
        {...props}
        inputRef={ref}
        type={isVisible ? 'text' : 'password'}
        slotProps={{
          input: {
            startAdornment: showLeadingIcon ? (
              <InputAdornment position="start">
                <LockOutlinedIcon fontSize="small" aria-hidden="true" />
              </InputAdornment>
            ) : undefined,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={isVisible}
                  onClick={() => setIsVisible((current) => !current)}
                  edge="end"
                  sx={{ color: 'text.secondary' }}
                >
                  {isVisible ? (
                    <VisibilityOffOutlinedIcon fontSize="small" />
                  ) : (
                    <VisibilityOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    );
  },
);
