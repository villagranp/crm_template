import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { forwardRef, useState } from 'react';

type PasswordFieldProps = Omit<TextFieldProps, 'type'>;

/**
 * Campo de contraseña con botón para mostrarla.
 *
 * Ver lo que se escribe reduce errores en contraseñas largas, que es justo lo
 * que la política pide (D6). El botón tiene etiqueta accesible y estado
 * `aria-pressed`.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <TextField
      {...props}
      inputRef={ref}
      type={isVisible ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={isVisible}
                onClick={() => setIsVisible((current) => !current)}
                edge="end"
              >
                {isVisible ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
});
