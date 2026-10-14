import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CancelIcon from '@mui/icons-material/Cancel';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { Autocomplete, Box, Button, Chip, FormHelperText, FormLabel, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useId, useState, type KeyboardEvent, type ReactElement } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';
import { usePermission } from '@/hooks/use-permission';

import { EXTERNAL_NAME_MAX_LENGTH, MAX_PARTICIPANTS, type ContactLookup, type ParticipantKind } from './commercial-activity.api';
import { COMMERCIAL_RELATED_PERMISSIONS } from './commercial-activity.permissions';
import { useCustomerContacts } from './commercial-activity.queries';
import { OwnerPicker } from './OwnerPicker';
import { PARTICIPANT_KIND_LABELS, participantKey, participantLabel, type ParticipantValue } from './participants';

export interface ParticipantsFieldProps {
  /** Cliente de la visita o actividad: sus contactos activos se ofrecen como participantes. */
  customerId: string | null;
  value: readonly ParticipantValue[];
  onChange: (participants: ParticipantValue[]) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Error ya traducido (p. ej. de `commercialFieldErrors(error).participants`). */
  error?: string;
  helperText?: string;
}

const KIND_ICONS: Record<ParticipantKind, ReactElement> = {
  CONTACT: <ContactPhoneOutlinedIcon />,
  USER: <BadgeOutlinedIcon />,
  EXTERNAL: <PersonOutlineIcon />,
};

/**
 * Participantes de una visita o actividad (04 §E.7, §E.10, RN-04.6): contactos
 * activos del cliente (con `contactos.ver`), usuarios internos dentro del alcance
 * o un nombre externo. Sin repetidos y como mucho 50 (04 H.4). Sirve para los
 * invitados y para los asistentes de la realización de una visita.
 */
export function ParticipantsField({
  customerId,
  value,
  onChange,
  label = 'Participantes',
  required,
  disabled = false,
  error,
  helperText,
}: ParticipantsFieldProps) {
  const labelId = useId();
  const canSeeContacts = usePermission(COMMERCIAL_RELATED_PERMISSIONS.viewContacts);
  const kinds: ParticipantKind[] = canSeeContacts ? ['CONTACT', 'USER', 'EXTERNAL'] : ['USER', 'EXTERNAL'];
  const [kind, setKind] = useState<ParticipantKind>(kinds[0] ?? 'USER');
  const full = value.length >= MAX_PARTICIPANTS;
  const keys = new Set(value.map(participantKey));

  const add = (participant: ParticipantValue) => {
    if (full || keys.has(participantKey(participant))) {
      return;
    }
    onChange([...value, participant]);
  };
  const remove = (key: string) => onChange(value.filter((participant) => participantKey(participant) !== key));

  return (
    <Box role="group" aria-labelledby={labelId} sx={{ minWidth: 0 }}>
      <FormLabel id={labelId} required={required} error={Boolean(error)}>
        {label}
      </FormLabel>

      {value.length > 0 ? (
        <Stack component="ul" direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }} aria-label={label}>
          {value.map((participant) => {
            const key = participantKey(participant);
            const name = participantLabel(participant);
            return (
              <Box component="li" key={key} sx={{ maxWidth: '100%' }}>
                <Chip
                  icon={KIND_ICONS[participant.kind]}
                  label={`${name} · ${PARTICIPANT_KIND_LABELS[participant.kind]}`}
                  onDelete={disabled ? undefined : () => remove(key)}
                  deleteIcon={<CancelIcon titleAccess={`Quitar a ${name}`} />}
                  sx={{ maxWidth: '100%' }}
                />
              </Box>
            );
          })}
        </Stack>
      ) : null}

      {disabled ? null : (
        <Box
          sx={{
            mt: 1.5,
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 14rem) minmax(0, 1fr)' },
            alignItems: 'start',
          }}
        >
          <TextField
            select
            size="small"
            label="Añadir"
            value={kind}
            onChange={(event) => setKind(event.target.value as ParticipantKind)}
            disabled={full}
          >
            {kinds.map((option) => (
              <MenuItem key={option} value={option}>
                {PARTICIPANT_KIND_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>
          {kind === 'CONTACT' ? <ContactAdder customerId={customerId} disabled={full} excluded={keys} onAdd={add} /> : null}
          {kind === 'USER' ? (
            <OwnerPicker
              label="Usuario interno"
              value={null}
              disabled={full}
              excludeIds={value.flatMap((participant) => (participant.userId ? [participant.userId] : []))}
              onChange={(user) => {
                if (user) {
                  add({ kind: 'USER', userId: user.id, displayName: user.displayName });
                }
              }}
            />
          ) : null}
          {kind === 'EXTERNAL' ? <ExternalAdder disabled={full} onAdd={add} /> : null}
        </Box>
      )}

      <FormHelperText error={Boolean(error)}>
        {error ?? (full ? `Como máximo ${MAX_PARTICIPANTS} participantes.` : helperText)}
      </FormHelperText>
    </Box>
  );
}

function ContactAdder({
  customerId,
  disabled,
  excluded,
  onAdd,
}: {
  customerId: string | null;
  disabled: boolean;
  excluded: ReadonlySet<string>;
  onAdd: (participant: ParticipantValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const contacts = useCustomerContacts(customerId, search, open && !disabled);
  const options = (contacts.data?.data ?? []).filter((contact) => !excluded.has(`contact:${contact.id}`));

  return (
    <Autocomplete<ContactLookup>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={null}
      onChange={(_, contact) => {
        if (contact) {
          onAdd({ kind: 'CONTACT', contactId: contact.id, displayName: contact.fullName });
          setInput('');
        }
      }}
      inputValue={input}
      onInputChange={(_, text, reason) => setInput(reason === 'reset' ? '' : text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={(contact) => (contact.jobTitle ? `${contact.fullName} · ${contact.jobTitle}` : contact.fullName)}
      loading={contacts.isFetching}
      loadingText="Buscando…"
      noOptionsText={contacts.isError ? 'No se pudieron cargar los contactos.' : 'Ningún contacto activo coincide'}
      disabled={disabled || !customerId}
      renderInput={(params) => (
        <TextField {...params} size="small" label="Contacto del cliente" helperText={customerId ? undefined : 'Elige primero el cliente.'} />
      )}
    />
  );
}

function ExternalAdder({ disabled, onAdd }: { disabled: boolean; onAdd: (participant: ParticipantValue) => void }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed) {
      return;
    }
    onAdd({ kind: 'EXTERNAL', externalName: trimmed, displayName: trimmed });
    setName('');
  };

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <TextField
        size="small"
        label="Nombre del participante externo"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        slotProps={{ htmlInput: { maxLength: EXTERNAL_NAME_MAX_LENGTH } }}
        sx={{ flex: 1, minWidth: 0 }}
      />
      <Button variant="outlined" onClick={submit} disabled={disabled || !trimmed} sx={{ flexShrink: 0 }}>
        Añadir
      </Button>
    </Stack>
  );
}
