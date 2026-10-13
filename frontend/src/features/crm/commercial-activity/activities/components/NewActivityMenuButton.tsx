import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { Button, ListItemIcon, Menu, MenuItem } from '@mui/material';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';

import type { ActivityTypeOption } from '../activities.api';
import { activityTypeIconName, newActivityPath } from '../activity-format';

export interface NewActivityMenuButtonProps {
  /** Tipos activos del catálogo (`form-options.types`); sin ellos, el botón abre el alta sin tipo. */
  types: readonly ActivityTypeOption[] | undefined;
  /** Preselección que se añade a la URL (desde una ficha). */
  preset?: { customerId?: string; projectId?: string; opportunityId?: string };
}

/**
 * "Nueva actividad" con un menú por tipo (04 §E.9): Llamada, Reunión, Correo,
 * Tarea… leídos del catálogo, nunca fijos. Cada opción abre el alta con el tipo
 * preseleccionado (`?typeId=`).
 */
export function NewActivityMenuButton({ types, preset }: NewActivityMenuButtonProps) {
  const navigate = useNavigate();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const sorted = [...(types ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);

  if (sorted.length === 0) {
    return (
      <Button startIcon={<AddIcon />} onClick={() => navigate(newActivityPath(preset))}>
        Nueva actividad
      </Button>
    );
  }

  return (
    <>
      <Button
        startIcon={<AddIcon />}
        endIcon={<ArrowDropDownIcon />}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Nueva actividad
      </Button>
      <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {sorted.map((type) => (
          <MenuItem key={type.id} onClick={() => navigate(newActivityPath({ ...preset, typeId: type.id }))}>
            <ListItemIcon>
              <MaterialSymbol name={activityTypeIconName(type)} />
            </ListItemIcon>
            {type.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
