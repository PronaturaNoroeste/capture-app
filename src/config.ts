// App config from EXPO_PUBLIC_* env (bundled at build time).
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// M1 pilot: which form to load. The app resolves this codigo → cat_formato_origen.id.
export const FORMATO_PILOTO = 'BOCA_ALAMO_V2';

// Catalogs the pilot form references (cached for offline autocomplete).
export const CATALOGOS_PILOTO = [
  'cat_comunidad', 'cat_tecnico', 'cat_cooperativa', 'cat_pescador', 'cat_embarcacion',
  'cat_especie', 'cat_sitio_pesca', 'cat_tipo_arte', 'cat_tipo_anzuelo',
  'cat_tipo_operacion', 'cat_tipo_gasto', 'cat_tipo_interaccion_etp',
];
