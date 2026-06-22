// Catalog mirror: pull approved catalog rows from Supabase into local SQLite, then
// serve offline autocomplete. Also caches the published form-definition.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogItem } from '../catalog/search';
import { getDb } from './database';

// catalog table → name column (most use 'nombre'; especie differs)
const NAME_COL: Record<string, string> = { cat_especie: 'nombre_comun' };

// Controlled-vocabulary catalogs WITHOUT es_aprobado/estado — every row is canonical,
// so pull all of them with no approval filter (see migration 0003).
const SIN_APROBACION = new Set([
  'cat_tipo_gasto', 'cat_tipo_interaccion_etp',
  'cat_tipo_viento', 'cat_tipo_luna', 'cat_tipo_marea', 'cat_region', 'cat_formato_origen',
]);

// Pull approved rows for the given catalog tables and upsert into the local mirror.
// (Delta refresh by updated_at can be layered on later; full pull is fine at this size.)
export async function syncCatalogs(sb: SupabaseClient, tablas: string[]): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const tabla of tablas) {
    const nameCol = NAME_COL[tabla] ?? 'nombre';
    const controlled = SIN_APROBACION.has(tabla);
    const cols = controlled ? `id, ${nameCol}` : `id, ${nameCol}, estado`;
    let query = sb.from(tabla).select(cols);
    if (!controlled) query = query.eq('es_aprobado', true);
    const { data, error } = await query;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    await db.withTransactionAsync(async () => {
      for (const row of data ?? []) {
        await db.runAsync(
          `INSERT INTO catalogo (tabla, id, nombre, estado) VALUES (?, ?, ?, ?)
           ON CONFLICT(tabla, id) DO UPDATE SET nombre=excluded.nombre, estado=excluded.estado`,
          [tabla, (row as any).id, (row as any)[nameCol], (row as any).estado ?? 'aprobado'],
        );
        total++;
      }
    });
  }
  return total;
}

export async function getCatalogItems(tabla: string): Promise<CatalogItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT id, nombre, estado FROM catalogo WHERE tabla = ?', [tabla]);
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, estado: r.estado }));
}

// Add this device's own pending proposal locally so it's reusable immediately (offline).
export async function addLocalProposal(tabla: string, id: string, nombre: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO catalogo (tabla, id, nombre, estado) VALUES (?, ?, ?, 'pendiente')
     ON CONFLICT(tabla, id) DO NOTHING`,
    [tabla, id, nombre]);
}

// ---- form-definition cache ----
export async function cacheForm(sb: SupabaseClient, formatoOrigenId: string): Promise<void> {
  const db = await getDb();
  const { data, error } = await sb
    .from('formulario')
    .select('id, version, definicion, constantes')
    .eq('formato_origen_id', formatoOrigenId)
    .eq('estado', 'publicado')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  await db.runAsync(
    `INSERT INTO formulario_cache (formato_origen_id, formulario_id, version, definicion, constantes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(formato_origen_id) DO UPDATE SET
       formulario_id=excluded.formulario_id, version=excluded.version,
       definicion=excluded.definicion, constantes=excluded.constantes`,
    [formatoOrigenId, data.id, data.version,
     JSON.stringify(data.definicion), JSON.stringify(data.constantes ?? {})]);
}

export interface CachedForm {
  formatoOrigenId: string;
  formularioId: string;
  version: number;
  definicion: { secciones: any[] };
  constantes: Record<string, unknown>;
}

export async function getCachedForm(formatoOrigenId: string): Promise<CachedForm | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>(
    'SELECT * FROM formulario_cache WHERE formato_origen_id = ?', [formatoOrigenId]);
  if (!r) return null;
  return {
    formatoOrigenId: r.formato_origen_id,
    formularioId: r.formulario_id,
    version: r.version,
    definicion: JSON.parse(r.definicion),
    constantes: JSON.parse(r.constantes ?? '{}'),
  };
}
