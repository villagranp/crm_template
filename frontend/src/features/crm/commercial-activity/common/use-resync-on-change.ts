import { useState } from 'react';

/**
 * Llama a `onChange(value)` cuando cambia el **contenido** de `value` (su JSON),
 * no su identidad. Lo usan los borradores de filtros: la URL manda (atrás,
 * adelante, "Limpiar", un chip quitado), pero un nuevo render con los mismos
 * filtros (p. ej. al recargar la lista) no debe borrar lo que el usuario está
 * escribiendo. Ajusta el estado durante el render, sin efecto: no hay un
 * render intermedio con el borrador viejo.
 */
export function useResyncOnChange<T>(value: T, onChange: (value: T) => void): void {
  const key = JSON.stringify(value);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    onChange(value);
  }
}
