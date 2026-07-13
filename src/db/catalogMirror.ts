// Catalog mirror: pull approved catalog rows from Supabase into local SQLite, then
// serve offline autocomplete. Also caches the published form-definition.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogItem } from '../catalog/search';
import { reconcileAction } from '../catalog/reconcile';
import { getDb } from './database';

// catalog table → name column (most use 'nombre'; especie differs)
const NAME_COL: Record<string, string> = { cat_especie: 'nombre_comun' };

// Controlled-vocabulary catalogs WITHOUT es_aprobado/estado — every row is canonical,
// so pull all of them with no approval filter (see migration 0003).
const SIN_APROBACION = new Set([
  'cat_tipo_gasto', 'cat_tipo_interaccion_etp',
  'cat_tipo_viento', 'cat_tipo_luna', 'cat_tipo_marea', 'cat_region', 'cat_formato_origen',
]);

const PAGE = 1000;   // PostgREST caps a response (~1000 rows); page through it.

// Pull approved rows for the given catalog tables and make the local mirror a true
// replica of them: upsert what the server has, and PRUNE local rows the server no
// longer has (e.g. an entry merged/deleted by an admin) — but never the device's own
// 'pendiente' proposals, which reconcileProposals() resolves separately.
export async function syncCatalogs(sb: SupabaseClient, tablas: string[]): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const tabla of tablas) {
    const nameCol = NAME_COL[tabla] ?? 'nombre';
    const controlled = SIN_APROBACION.has(tabla);
    const cols = controlled ? `id, ${nameCol}` : `id, ${nameCol}, estado`;

    // Page through the full approved set first (so a partial pull can't drive a prune).
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = sb.from(tabla).select(cols).range(from, from + PAGE - 1);
      if (!controlled) query = query.eq('es_aprobado', true);
      const { data, error } = await query;
      if (error) throw new Error(`${tabla}: ${error.message}`);
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }

    const pulled = new Set(rows.map((r) => r.id as string));
    // Local approved rows the server no longer returns → stale (merged/deleted).
    const localApproved = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM catalogo WHERE tabla = ? AND estado <> 'pendiente'", [tabla]);
    const stale = localApproved.filter((r) => !pulled.has(r.id)).map((r) => r.id);

    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO catalogo (tabla, id, nombre, estado) VALUES (?, ?, ?, ?)
           ON CONFLICT(tabla, id) DO UPDATE SET nombre=excluded.nombre, estado=excluded.estado`,
          [tabla, row.id, row[nameCol], row.estado ?? 'aprobado'],
        );
        total++;
      }
      for (const id of stale) {
        await db.runAsync('DELETE FROM catalogo WHERE tabla = ? AND id = ?', [tabla, id]);
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

// Reconcile this device's pending proposals with their server outcome: approved
// ones become selectable-as-approved; rejected/merged/deleted ones are dropped so
// the técnico stops seeing a stale option. Runs on the online catalog refresh.
export async function reconcileProposals(sb: SupabaseClient): Promise<{ resueltas: number }> {
  const db = await getDb();
  const pend = await db.getAllAsync<{ tabla: string; id: string }>(
    "SELECT tabla, id FROM catalogo WHERE estado = 'pendiente'");
  const byTable = new Map<string, string[]>();
  for (const r of pend) (byTable.get(r.tabla) ?? byTable.set(r.tabla, []).get(r.tabla)!).push(r.id);

  let resueltas = 0;
  for (const [tabla, ids] of byTable) {
    const { data, error } = await sb.from(tabla).select('id, estado').in('id', ids);
    if (error) continue;   // offline/permission hiccup → leave pending, retry next refresh
    const serverState = new Map((data ?? []).map((d: any) => [d.id, d.estado as string]));
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        const action = reconcileAction(serverState.get(id));
        if (action === 'delete') {
          await db.runAsync('DELETE FROM catalogo WHERE tabla = ? AND id = ?', [tabla, id]);
          resueltas++;
        } else if (action === 'approve') {
          await db.runAsync("UPDATE catalogo SET estado = 'aprobado' WHERE tabla = ? AND id = ?",
            [tabla, id]);
          resueltas++;
        }
      }
    });
  }
  return { resueltas };
}

// Pull the curated per-form option lists (lista_opcion) for this formato and mirror
// them locally (replace-in-transaction so de-listed rows disappear). Offline-tolerant.
export async function syncListas(sb: SupabaseClient, formatoOrigenId: string): Promise<number> {
  const db = await getDb();
  const { data, error } = await sb
    .from('lista_opcion')
    .select('lista, tabla, registro_id, importancia')
    .eq('formato_origen_id', formatoOrigenId);
  if (error) throw new Error(`lista_opcion: ${error.message}`);
  const rows = (data ?? []) as any[];
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM lista_opcion');
    for (const r of rows) {
      await db.runAsync(
        'INSERT INTO lista_opcion (lista, tabla, registro_id, importancia) VALUES (?, ?, ?, ?)',
        [r.lista, r.tabla, r.registro_id, r.importancia ?? 0]);
    }
  });
  return rows.length;
}

// Items for a curated-list field: the list's catalog rows (name + importancia),
// UNION this device's own pending proposals for `tabla` (so a just-proposed row
// stays selectable in the strict list until it's reviewed).
export async function getListaItems(lista: string, tabla: string): Promise<CatalogItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT c.id AS id, c.nombre AS nombre, c.estado AS estado, l.importancia AS importancia
       FROM lista_opcion l JOIN catalogo c ON c.id = l.registro_id
      WHERE l.lista = ?
     UNION
     SELECT id, nombre, estado, 0 AS importancia
       FROM catalogo WHERE tabla = ? AND estado = 'pendiente'`,
    [lista, tabla]);
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, estado: r.estado, importancia: r.importancia ?? 0 }));
}

// ---- form-definition cache ----
export async function cacheForm(sb: SupabaseClient, formatoOrigenId: string): Promise<void> {
  const db = await getDb();
  const { data, error } = await sb
    .from('formulario')
    .select('id, nombre, version, definicion, constantes')
    .eq('formato_origen_id', formatoOrigenId)
    .eq('estado', 'publicado')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  await db.runAsync(
    `INSERT INTO formulario_cache (formato_origen_id, formulario_id, version, nombre, definicion, constantes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(formato_origen_id) DO UPDATE SET
       formulario_id=excluded.formulario_id, version=excluded.version,
       nombre=excluded.nombre, definicion=excluded.definicion, constantes=excluded.constantes`,
    [formatoOrigenId, data.id, data.version, data.nombre,
     JSON.stringify(data.definicion), JSON.stringify(data.constantes ?? {})]);
}

export interface CachedForm {
  formatoOrigenId: string;
  formularioId: string;
  version: number;
  // null on a cache row written by a pre-nombre app version and never refreshed online
  nombre: string | null;
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
    nombre: r.nombre ?? null,
    definicion: JSON.parse(r.definicion),
    constantes: JSON.parse(r.constantes ?? '{}'),
  };
}
