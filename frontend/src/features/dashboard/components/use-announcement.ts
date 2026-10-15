import { useState } from 'react';

/** Estado del aviso `aria-live` que comparten las listas de un mismo diálogo (`AnnouncementRegion`). */
export function useAnnouncement(): { message: string; announce: (message: string) => void } {
  const [message, setMessage] = useState('');
  return { message, announce: setMessage };
}
