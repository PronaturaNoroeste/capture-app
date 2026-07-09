// expo-sqlite: open the local DB and create the offline tables.
// Two stores live here: the outbox (queued faena payloads) and the catalog mirror
// (approved catalog rows + this device's own pending proposals, for offline autocomplete).
import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('capture.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS outbox (
      faena_id     TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      state        TEXT NOT NULL DEFAULT 'pendiente',
      intentos     INTEGER NOT NULL DEFAULT 0,
      ultimo_error TEXT,
      creado_en    INTEGER NOT NULL,
      actualizado_en INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalogo (
      tabla   TEXT NOT NULL,
      id      TEXT NOT NULL,
      nombre  TEXT NOT NULL,
      estado  TEXT,
      PRIMARY KEY (tabla, id)
    );
    CREATE INDEX IF NOT EXISTS idx_catalogo_tabla ON catalogo (tabla);

    -- last successful catalog delta-sync timestamp per table
    CREATE TABLE IF NOT EXISTS catalogo_sync (
      tabla     TEXT PRIMARY KEY,
      updated_at TEXT
    );

    -- the published form-definition currently cached on the device
    CREATE TABLE IF NOT EXISTS formulario_cache (
      formato_origen_id TEXT PRIMARY KEY,
      formulario_id     TEXT NOT NULL,
      version           REAL NOT NULL,     -- decimal form version (R-F: 0.8, 0.9…)
      definicion        TEXT NOT NULL,
      constantes        TEXT
    );

    -- generic key/value store; backs the Supabase Auth session (persists the
    -- anonymous identity across launches so auth.uid() stays stable per install).
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT
    );

    -- curated per-form option lists (mirror of lista_opcion for the cached formato):
    -- which catalog rows are options for a named list, + their importancia rank.
    CREATE TABLE IF NOT EXISTS lista_opcion (
      lista       TEXT NOT NULL,
      tabla       TEXT NOT NULL,
      registro_id TEXT NOT NULL,
      importancia INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (lista, registro_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lista_opcion_lista ON lista_opcion (lista);
  `);
  return _db;
}
