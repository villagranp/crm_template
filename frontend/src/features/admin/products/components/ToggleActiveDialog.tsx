import { ConfirmDialog } from '@/features/admin/common';

export interface ToggleActiveDialogProps {
  /** Elemento a activar o desactivar; `null` cierra el diálogo. */
  target: { name: string; isActive: boolean } | null;
  /** Qué es ("la familia", "el producto", "la unidad"). */
  noun: string;
  /** Consecuencia de desactivar, propia del recurso. */
  deactivateHint: string;
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmación de activar o desactivar un maestro (no hay borrado, 07 F.7). */
export function ToggleActiveDialog({
  target,
  noun,
  deactivateHint,
  isPending,
  errorMessage,
  onConfirm,
  onClose,
}: ToggleActiveDialogProps) {
  const deactivating = target?.isActive ?? false;
  return (
    <ConfirmDialog
      open={target !== null}
      title={deactivating ? `Desactivar ${noun}` : `Activar ${noun}`}
      description={
        target
          ? deactivating
            ? `«${target.name}» dejará de ofrecerse. ${deactivateHint}`
            : `«${target.name}» volverá a ofrecerse en los formularios.`
          : undefined
      }
      confirmLabel={deactivating ? 'Desactivar' : 'Activar'}
      destructive={deactivating}
      isPending={isPending}
      errorMessage={errorMessage}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
