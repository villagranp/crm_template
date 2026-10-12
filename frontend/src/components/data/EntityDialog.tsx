import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  type Breakpoint,
  type Theme,
} from '@mui/material';
import { useId, type FormEvent, type ReactNode } from 'react';

export interface EntityDialogProps {
  open: boolean;
  /** `undefined` mientras hay una mutación en curso: bloquea el cierre. */
  onClose: (() => void) | undefined;
  /** Nombre accesible del diálogo. */
  title: string;
  /** Contexto bajo el título (normalmente el nombre del área). */
  subtitle?: string;
  /** Id del texto que describe el diálogo (`aria-describedby`). */
  describedBy?: string;
  maxWidth?: Breakpoint;
  /** Por debajo de este breakpoint el diálogo ocupa la pantalla entera. */
  fullScreenBelow?: Breakpoint;
  /** Si se indica, el papel del diálogo es un `<form noValidate>` que llama a esto al enviarse. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Muestra la nota "* Campo obligatorio" al inicio del contenido. */
  requiredNote?: boolean;
  /** Pie del diálogo; normalmente `DialogFooter`. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Diálogo del CRUD del prototipo (`modal` de `pages/modulo.html`): cabecera
 * con título, subtítulo y botón de cerrar; contenido con separadores; pie con
 * "Cancelar" y la acción primaria. En móvil ocupa la pantalla entera.
 *
 * El estilo de los campos lo pone el tema global: aquí sólo hay estructura.
 */
export function EntityDialog({
  open,
  onClose,
  title,
  subtitle,
  describedBy,
  maxWidth = 'md',
  fullScreenBelow = 'sm',
  onSubmit,
  requiredNote = false,
  actions,
  children,
}: EntityDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down(fullScreenBelow));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      fullScreen={fullScreen}
      fullWidth
      maxWidth={maxWidth}
      PaperProps={
        onSubmit
          ? {
              component: 'form',
              noValidate: true,
              onSubmit: (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                onSubmit(event);
              },
            }
          : undefined
      }
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="flex-start"
        sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box sx={{ flex: 1, minWidth: 0, pt: 0.5 }}>
          <DialogTitle id={titleId} sx={{ p: 0, typography: 'h5', overflowWrap: 'anywhere' }}>
            {title}
          </DialogTitle>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary" component="p">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          aria-label="Cerrar"
          onClick={onClose}
          disabled={!onClose}
          sx={{ color: 'text.secondary', mr: -1 }}
        >
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent sx={{ px: { xs: 2, sm: 2.5 }, py: 2.5 }}>
        {requiredNote ? <RequiredNote /> : null}
        {children}
      </DialogContent>
      {actions ? (
        <DialogActions
          sx={{
            px: { xs: 2, sm: 2.5 },
            py: 2,
            borderTop: 1,
            borderColor: 'divider',
            gap: 1,
            '& > :not(style) ~ :not(style)': { ml: 0 },
          }}
        >
          {actions}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}

/** "* Campo obligatorio" (`form-note` del prototipo). */
export function RequiredNote() {
  return (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
      <Box component="span" aria-hidden sx={{ color: 'error.main' }}>
        *
      </Box>{' '}
      Campo obligatorio
    </Typography>
  );
}

export interface DialogFooterProps {
  /** `undefined` deshabilita "Cancelar" (mutación en curso). */
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  /** Mutación en curso: deshabilita ambos botones. */
  pending?: boolean;
  /** Botón primario de color de error (acciones destructivas). */
  destructive?: boolean;
  /** Botón primario fuera de un formulario (`onClick` en lugar de `type="submit"`). */
  onSubmit?: () => void;
  submitDisabled?: boolean;
}

/**
 * Pie estándar: "Cancelar" con contorno y la acción primaria rellena. En
 * móvil ambos ocupan el ancho, como en el prototipo.
 */
export function DialogFooter({
  onCancel,
  cancelLabel = 'Cancelar',
  submitLabel,
  pending = false,
  destructive = false,
  onSubmit,
  submitDisabled = false,
}: DialogFooterProps) {
  const grow = { flex: { xs: '1 1 0', sm: '0 0 auto' } };
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        onClick={onCancel}
        disabled={pending}
        sx={{ ...grow, borderColor: 'divider' }}
      >
        {cancelLabel}
      </Button>
      <Button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        color={destructive ? 'error' : 'primary'}
        disabled={pending || submitDisabled}
        sx={grow}
      >
        {submitLabel}
      </Button>
    </>
  );
}
