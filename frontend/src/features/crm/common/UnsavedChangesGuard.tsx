import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker, type Location } from 'react-router-dom';

import { ConfirmDialog } from '@/components/data';

export interface UnsavedChangesGuardProps {
  /** Hay cambios sin guardar. */
  when: boolean;
  /**
   * Qué navegaciones se bloquean. Por defecto, las que cambian de ruta
   * (`pathname`); cambiar filtros en la URL de la misma pantalla no pierde el
   * borrador y no se bloquea.
   */
  shouldBlock?: (current: Location, next: Location) => boolean;
  /** Texto del aviso. */
  description?: string;
}

const DEFAULT_DESCRIPTION = 'Tienes cambios sin guardar. Si sales ahora, se perderán.';

function changesPath(current: Location, next: Location): boolean {
  return current.pathname !== next.pathname;
}

function NavigationBlocker({ when, shouldBlock = changesPath, description = DEFAULT_DESCRIPTION }: UnsavedChangesGuardProps) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && shouldBlock(currentLocation, nextLocation));
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      destructive
      title="Cambios sin guardar"
      description={description}
      confirmLabel="Salir sin guardar"
      cancelLabel="Seguir editando"
      onConfirm={() => blocker.proceed?.()}
      onClose={() => blocker.reset?.()}
    />
  );
}

/**
 * Aviso al abandonar una pantalla con cambios sin guardar (03 §E.8: matriz del
 * forecast). Cubre recargar o cerrar la pestaña (`beforeunload`, el navegador
 * muestra su propio aviso) y la navegación dentro de la aplicación
 * (`useBlocker`, con un diálogo propio).
 *
 * `useBlocker` solo existe con un router de datos (`createBrowserRouter`, el de
 * la aplicación); bajo un `MemoryRouter` (pruebas de componente) solo se
 * protege `beforeunload`.
 */
export function UnsavedChangesGuard(props: UnsavedChangesGuardProps) {
  const { when } = props;
  const dataRouter = useContext(UNSAFE_DataRouterContext);

  useEffect(() => {
    if (!when) {
      return undefined;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Navegadores antiguos exigen asignar `returnValue` para mostrar el aviso.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);

  return dataRouter ? <NavigationBlocker {...props} /> : null;
}
