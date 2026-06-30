// Form-definition types — mirror of the JSON published in `formulario.definicion`
// (see ../../../Planning/AppDashboardSpec/08,09 and supabase/seed/boca_alamo_form.json).
// Pure types + no runtime deps so they're usable in tests and on-device alike.

export type Op = '==' | '!=' | 'in';

export interface Condicion {
  campo: string;
  op: Op;
  valor: string | string[];
}

export type TipoCampo =
  | 'texto' | 'entero' | 'decimal' | 'fecha' | 'hora' | 'booleano'
  | 'seleccion_unica' | 'multiseleccion' | 'catalogo' | 'geo' | 'foto';

export interface Binding {
  tipo: 'core' | 'custom' | 'ui';
  columna?: string;          // core: "tabla.col"
  catalogo?: string;         // catalogo fields
  clave?: string;            // custom (EAV) key
}

// An option is either a plain string (label == stored value) or a {label, valor}
// pair when the displayed text differs from what's stored (e.g. enum columns:
// show "Comprada", store "COMPRADA").
export type Opcion = string | { label: string; valor: string };
export const opLabel = (o: Opcion): string => (typeof o === 'string' ? o : o.label);
export const opValor = (o: Opcion): string => (typeof o === 'string' ? o : o.valor);

export interface Campo {
  key: string;
  label: string;
  ayuda?: string;
  ejemplo?: string;
  tipo: TipoCampo;
  binding: Binding;
  requerido?: boolean;
  requerido_si?: Condicion;
  validacion?: { min?: number; max?: number; regex?: string };
  visible_si?: Condicion;
  opciones?: Opcion[];
  opciones_prioritarias?: string[];
  autocompletar?: boolean;
  filtrado_por?: { campo: string; modo: 'filtrar' | 'priorizar' };
  permite_otro_texto?: boolean;
  permite_proponer?: boolean;   // catalogo field: offer "proponer nueva entrada" (gated server-side)
  valor_predeterminado?: unknown;
  bloqueado?: boolean;
  // unit transform (e.g. captured kg, stored gr)
  unidad_captura?: string;
  almacena?: string;
  factor?: number;
  decimales?: number;   // max digits after the decimal point (numeric inputs)
}

export interface Seccion {
  key: string;
  titulo: string;
  entidad?: string;          // child table for repeating sections; faena for the rest
  repetible?: boolean;
  min?: number;
  max?: number | null;
  boton_agregar?: string;
  visible_si?: Condicion;
  campos: Campo[];
}

export interface FormDefinition {
  secciones: Seccion[];
}

// Sentinel value a catalogo field takes when the user picks "Otro" (free text).
export const OTRO = '__OTRO__';

// ---- Answers (what the renderer collects) ----
// A non-repeating section contributes one answer object; a repeating section
// contributes an array of answer objects (one per instance).
export type Answer = Record<string, unknown>;
export type Answers = Record<string, Answer | Answer[]>;  // keyed by seccion.key
