import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeUploadError, precheckAttachment } from './attachment-format';
import { uploadAttachment, type AttachmentLimits } from './attachments.api';
import { attachmentKeys } from './attachments.queries';

export type UploadStatus = 'queued' | 'uploading' | 'error';

export interface UploadItem {
  /** Id local de la subida (no es el del adjunto). */
  key: string;
  fileName: string;
  status: UploadStatus;
  /** 0–100, o `null` si el navegador no conoce el tamaño de la petición. */
  percent: number | null;
  /** Mensaje ya traducido cuando `status = 'error'`. */
  errorMessage: string | null;
}

export interface UseAttachmentUploadsResult {
  uploads: UploadItem[];
  /** Último archivo subido con éxito, para anunciarlo. */
  lastUploaded: string | null;
  /** Encola los archivos; se suben de uno en uno, en orden (D-02.15). */
  enqueue: (files: readonly File[]) => void;
  /** Quita de la lista una subida fallida. */
  dismiss: (key: string) => void;
}

/**
 * Cola de subidas de adjuntos de un dueño: comprobación previa (sólo ayuda),
 * subida secuencial con progreso y error por archivo. Un fallo no detiene el
 * resto de la cola. Al terminar cada subida se invalida la lista del dueño y se
 * llama a `onChanged` (opcional: p. ej. para refrescar los contadores de
 * adjuntos del módulo dueño). Al desmontar se cancela la subida en curso.
 */
export function useAttachmentUploads(
  basePath: string,
  limits: AttachmentLimits | undefined,
  onChanged?: () => void,
): UseAttachmentUploadsResult {
  const queryClient = useQueryClient();
  // La última versión, sin rehacer la cola si quien llama pasa una función nueva en cada render.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const uploadOne = useCallback(
    async (key: string, file: File) => {
      const signal = abortRef.current?.signal;
      if (signal?.aborted) {
        return;
      }
      update(key, { status: 'uploading', percent: 0 });
      try {
        await uploadAttachment(basePath, file, {
          signal,
          onProgress: (progress) => update(key, { percent: progress.percent }),
        });
        setUploads((current) => current.filter((item) => item.key !== key));
        setLastUploaded(file.name);
        onChangedRef.current?.();
        await queryClient.invalidateQueries({ queryKey: attachmentKeys.owner(basePath) });
      } catch (error) {
        if (!signal?.aborted) {
          update(key, { status: 'error', percent: null, errorMessage: describeUploadError(error, limits) });
        }
      }
    },
    [basePath, limits, queryClient, update],
  );

  const enqueue = useCallback(
    (files: readonly File[]) => {
      const items = files.map((file) => {
        sequenceRef.current += 1;
        const precheckError = precheckAttachment(file, limits);
        const item: UploadItem = {
          key: `upload-${sequenceRef.current}`,
          fileName: file.name,
          status: precheckError ? 'error' : 'queued',
          percent: null,
          errorMessage: precheckError,
        };
        return { item, file };
      });
      setUploads((current) => [...current, ...items.map(({ item }) => item)]);
      for (const { item, file } of items) {
        if (item.status === 'queued') {
          chainRef.current = chainRef.current.then(() => uploadOne(item.key, file));
        }
      }
    },
    [limits, uploadOne],
  );

  const dismiss = useCallback((key: string) => {
    setUploads((current) => current.filter((item) => item.key !== key));
  }, []);

  return { uploads, lastUploaded, enqueue, dismiss };
}
