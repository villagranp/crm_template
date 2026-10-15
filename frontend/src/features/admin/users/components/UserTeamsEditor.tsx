import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
  Autocomplete,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

import type { TeamOption } from '../users.api';
import type { TeamAssignmentValue } from '../users.schemas';

export interface UserTeamsEditorProps {
  value: TeamAssignmentValue[];
  onChange: (next: TeamAssignmentValue[]) => void;
  /** Equipos que se pueden añadir (`GET /teams`); sólo se ofrecen los activos. */
  options: readonly TeamOption[];
  disabled?: boolean;
  loading?: boolean;
  /** Mensaje si no se pudo cargar la lista de equipos. */
  optionsError?: string | null;
}

/**
 * Editor de los equipos de un usuario (07 RN-07.10): añadir, quitar y elegir
 * el equipo principal (como mucho uno). Controlado: quien lo usa decide cuándo
 * se guarda. Al quitar el principal, pasa a serlo el primero que quede, para
 * no dejar al usuario sin principal por accidente.
 */
export function UserTeamsEditor({
  value,
  onChange,
  options,
  disabled = false,
  loading = false,
  optionsError = null,
}: UserTeamsEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const chosen = useMemo(() => new Set(value.map((team) => team.teamId)), [value]);
  const available = useMemo(
    () => options.filter((team) => team.isActive && !chosen.has(team.id)),
    [options, chosen],
  );
  const primaryId = value.find((team) => team.isPrimary)?.teamId ?? '';

  const add = (team: TeamOption) => {
    onChange([...value, { teamId: team.id, name: team.name, isPrimary: value.length === 0 }]);
  };

  const remove = (teamId: string) => {
    const rest = value.filter((team) => team.teamId !== teamId);
    const lostPrimary = primaryId === teamId;
    onChange(rest.map((team, index) => (lostPrimary ? { ...team, isPrimary: index === 0 } : team)));
  };

  const setPrimary = (teamId: string) => {
    onChange(value.map((team) => ({ ...team, isPrimary: team.teamId === teamId })));
  };

  return (
    <>
      <Autocomplete
        size="small"
        options={available}
        value={null}
        inputValue={inputValue}
        onInputChange={(_, next, reason) => setInputValue(reason === 'reset' ? '' : next)}
        onChange={(_, team) => {
          if (team) {
            add(team);
            setInputValue('');
          }
        }}
        getOptionLabel={(team) => `${team.name} (${team.code})`}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        loading={loading}
        disabled={disabled}
        noOptionsText="No hay más equipos activos"
        loadingText="Cargando equipos…"
        renderInput={(params) => (
          <TextField
            {...params}
            label="Añadir equipo"
            error={Boolean(optionsError)}
            helperText={optionsError ?? 'Busca por nombre o código.'}
          />
        )}
      />
      {value.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin equipo.
        </Typography>
      ) : (
        <RadioGroup
          aria-label="Equipo principal"
          value={primaryId}
          onChange={(event) => setPrimary(event.target.value)}
        >
          <List aria-label="Equipos del usuario" disablePadding>
            {value.map((team) => (
              <ListItem
                key={team.teamId}
                divider
                disableGutters
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label={`Quitar ${team.name}`}
                    disabled={disabled}
                    onClick={() => remove(team.teamId)}
                  >
                    <RemoveCircleOutlineIcon />
                  </IconButton>
                }
              >
                <FormControlLabel
                  value={team.teamId}
                  control={<Radio disabled={disabled} />}
                  label={team.isPrimary ? `${team.name} (principal)` : team.name}
                  sx={{ minWidth: 0, pr: 6, overflowWrap: 'anywhere' }}
                />
              </ListItem>
            ))}
          </List>
        </RadioGroup>
      )}
    </>
  );
}
