/**
 * Entrega un archivo ya descargado al navegador para que el usuario lo guarde.
 * La URL del blob se revoca en el siguiente tick, cuando la descarga ya empezó.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
