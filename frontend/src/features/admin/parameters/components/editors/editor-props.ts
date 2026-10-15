/** Contrato común de los editores estructurados: el valor viaja como el texto JSON del parámetro. */
export interface StructuredEditorProps {
  /** Valor actual (texto JSON). El diálogo sólo monta el editor si es interpretable. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Además, los editores que ofrecen códigos de catálogo. */
export interface CatalogEditorProps extends StructuredEditorProps {
  /** `false` sin `catalogos.ver`: se trabaja con los códigos escritos o los que ya tiene el valor. */
  catalogsEnabled: boolean;
}
