import { Box } from '@mui/material';

interface MaterialSymbolProps {
  /** Nombre del glifo de Material Symbols, tal como se guarda en la base de datos. */
  name: string;
  size?: number;
}

/**
 * Icono de Material Symbols por nombre.
 *
 * Las opciones de menú guardan el nombre del icono como texto en la base de
 * datos (columna `MenuOption.icon`), así que el componente tiene que resolverlo
 * en tiempo de ejecución. La familia se carga con `@fontsource` — no desde una
 * CDN — para no abrir la Content-Security-Policy del borde.
 *
 * Es decorativo: `aria-hidden`. La etiqueta accesible la pone siempre el
 * control que lo contiene.
 */
export function MaterialSymbol({ name, size = 22 }: MaterialSymbolProps) {
  return (
    <Box
      component="span"
      className="material-symbols-sharp"
      aria-hidden="true"
      sx={{
        fontSize: size,
        lineHeight: 1,
        userSelect: 'none',
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
    >
      {name}
    </Box>
  );
}
