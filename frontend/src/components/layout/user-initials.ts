/** Iniciales del nombre visible: dos como máximo, "?" si no hay nombre. */
export function initialsOf(displayName: string | undefined | null): string {
  if (!displayName?.trim()) {
    return '?';
  }
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
