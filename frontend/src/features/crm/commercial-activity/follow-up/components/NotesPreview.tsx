import { Box, Link, Typography } from '@mui/material';
import { useId, useState, type SyntheticEvent } from 'react';

import { truncateNotes } from '../follow-up-format';

export interface NotesPreviewProps {
  notes: string | null;
}

/** Los controles dentro de una fila navegable no deben abrir el drawer. */
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Notas de una fila de seguimiento (resumen de la última interacción, RN-04.34):
 * truncadas con "Ver más" (botón con `aria-expanded`) que las despliega en el
 * sitio. Texto libre pintado como texto (H.4).
 */
export function NotesPreview({ notes }: NotesPreviewProps) {
  const textId = useId();
  const [expanded, setExpanded] = useState(false);
  const text = notes?.trim();
  if (!text) {
    return <>—</>;
  }
  const preview = truncateNotes(text);

  return (
    <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
      <Typography id={textId} component="span" variant="body2" sx={{ display: 'block', overflowWrap: 'anywhere', whiteSpace: expanded ? 'pre-line' : undefined }}>
        {expanded || !preview ? text : preview}
      </Typography>
      {preview ? (
        <Link
          component="button"
          type="button"
          variant="body2"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={(event) => {
            stop(event);
            setExpanded((open) => !open);
          }}
          onKeyDown={stop}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </Link>
      ) : null}
    </Box>
  );
}
