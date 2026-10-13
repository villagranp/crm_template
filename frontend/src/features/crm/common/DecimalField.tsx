import { InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { useEffect, useState, type ChangeEvent, type FocusEvent, type ReactNode } from 'react';

import {
  DECIMAL_SPECS,
  formatDecimal,
  parseDecimal,
  toEditableDecimal,
  type DecimalSpec,
} from './decimal';

export type DecimalFieldProps = Omit<
  TextFieldProps,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'select' | 'multiline' | 'SelectProps'
> & {
  /**
   * Valor del formulario: la cadena canónica (`"1234.5"`) cuando es válida, o
   * el texto tal cual cuando no lo es (para que la validación lo rechace y lo
   * explique). `''` = vacío.
   */
  value: string | null | undefined;
  /** Recibe la cadena canónica si el texto es válido; si no, el texto tal cual. */
  onChange: (value: string) => void;
  /** Dígitos y máximo admitidos; por defecto, cantidad (`Decimal(19,4)`). */
  spec?: DecimalSpec;
  /** Unidad o moneda que se muestra al final del campo (`t`, `%`, `GTQ`). */
  unit?: ReactNode;
};

/** Caracteres que se pueden escribir: dígitos, separadores, espacios y, si procede, signo. */
function isTypeable(text: string, allowNegative: boolean): boolean {
  return (allowNegative ? /^[\d.,\s+-]*$/ : /^[\d.,\s+]*$/).test(text);
}

function displayText(value: string | null | undefined, spec: DecimalSpec): string {
  if (!value) {
    return '';
  }
  const parsed = parseDecimal(value, spec);
  return parsed.ok ? formatDecimal(parsed.value) : value;
}

/**
 * Campo de número decimal sin `number` de punto flotante (03 §E.9, §L.3).
 *
 * - Se escribe con el teclado decimal del móvil (`inputMode="decimal"`), no con
 *   `type="number"`: este último convierte a `double`, acepta `e` y cambia el
 *   valor con la rueda del ratón.
 * - Mientras tiene el foco muestra el texto tal como se escribe (sin
 *   separador de miles); al salir lo muestra en formato `es-GT` (`1,234.5`).
 * - Ignora las pulsaciones de letras y otros símbolos; el formato fino
 *   (decimales, máximo, vacío) lo valida el esquema con `decimalSchema(spec)`,
 *   que es idempotente sobre el valor canónico que emite este campo.
 *
 * Pensado para `Controller` de React Hook Form:
 *
 * @example
 * <Controller control={control} name="quantity" render={({ field, fieldState }) => (
 *   <DecimalField label="Cantidad" spec={DECIMAL_SPECS.quantity} unit="VAR"
 *     value={field.value} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref}
 *     error={Boolean(fieldState.error)} helperText={fieldState.error?.message} />
 * )} />
 */
export function DecimalField({
  value,
  onChange,
  spec = DECIMAL_SPECS.quantity,
  unit,
  onFocus,
  onBlur,
  slotProps,
  ...props
}: DecimalFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(() => toEditableDecimal(value));

  // Si el valor cambia desde fuera mientras se edita (p. ej. `reset`), el texto lo sigue.
  useEffect(() => {
    setText((current) => {
      const parsed = parseDecimal(current, spec);
      const currentValue = parsed.ok ? parsed.value : current;
      return currentValue === (value ?? '') ? current : toEditableDecimal(value);
    });
  }, [value, spec]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value;
    if (!isTypeable(next, Boolean(spec.allowNegative))) {
      return;
    }
    setText(next);
    const parsed = parseDecimal(next, spec);
    onChange(parsed.ok ? parsed.value : parsed.issue === 'empty' ? '' : next);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsFocused(true);
    setText(toEditableDecimal(value));
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  const inputSlot = (slotProps?.input ?? {}) as Record<string, unknown>;
  const htmlInputSlot = (slotProps?.htmlInput ?? {}) as Record<string, unknown>;

  return (
    <TextField
      {...props}
      type="text"
      value={isFocused ? text : displayText(value, spec)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      slotProps={{
        ...slotProps,
        input: {
          ...inputSlot,
          endAdornment: unit ? (
            <InputAdornment position="end">{unit}</InputAdornment>
          ) : (
            (inputSlot.endAdornment as ReactNode)
          ),
        },
        htmlInput: {
          inputMode: 'decimal',
          autoComplete: 'off',
          spellCheck: false,
          ...htmlInputSlot,
        },
      }}
    />
  );
}
