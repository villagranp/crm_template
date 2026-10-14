import type { Request } from 'express';

/**
 * Descarta, sin almacenarlo, el cuerpo que el cliente siga enviando y espera a
 * su final antes de responder el error (como hace multer con los suyos): si se
 * responde a mitad de subida, el servidor cierra la conexión y el cliente ve un
 * corte (`ECONNRESET`/`EPIPE`) en lugar del `404`/`403`. La memoria no crece (los
 * trozos se tiran según llegan) y NGINX acota el tamaño del cuerpo.
 *
 * Lo usan los guards de subida de los dueños de adjuntos (02 RN-02.29, 04 F.4),
 * que autorizan **antes** del interceptor de `multipart`.
 */
export function discardRequestBody(request: Request): Promise<void> {
  if (request.readableEnded || request.destroyed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    request.once('end', resolve);
    request.once('close', resolve);
    request.once('error', () => resolve());
    request.resume();
  });
}
