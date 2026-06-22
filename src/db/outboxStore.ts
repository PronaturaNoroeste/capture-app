// expo-sqlite implementation of OutboxStore (mirror of MemoryOutboxStore in sync/outbox.ts).
import type { OutboxEntry, OutboxState, OutboxStore } from '../sync/outbox';
import { getDb } from './database';

function rowToEntry(r: any): OutboxEntry {
  return {
    faenaId: r.faena_id,
    payload: JSON.parse(r.payload),
    state: r.state as OutboxState,
    intentos: r.intentos,
    ultimoError: r.ultimo_error ?? undefined,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export class SqliteOutboxStore implements OutboxStore {
  async upsert(e: OutboxEntry): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO outbox (faena_id, payload, state, intentos, ultimo_error, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(faena_id) DO UPDATE SET
         payload=excluded.payload, state=excluded.state, intentos=excluded.intentos,
         ultimo_error=excluded.ultimo_error, actualizado_en=excluded.actualizado_en`,
      [e.faenaId, JSON.stringify(e.payload), e.state, e.intentos,
       e.ultimoError ?? null, e.creadoEn, e.actualizadoEn],
    );
  }

  async get(faenaId: string): Promise<OutboxEntry | undefined> {
    const db = await getDb();
    const r = await db.getFirstAsync<any>('SELECT * FROM outbox WHERE faena_id = ?', [faenaId]);
    return r ? rowToEntry(r) : undefined;
  }

  async remove(faenaId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM outbox WHERE faena_id = ?', [faenaId]);
  }

  async list(states?: OutboxState[]): Promise<OutboxEntry[]> {
    const db = await getDb();
    let rows: any[];
    if (states?.length) {
      const ph = states.map(() => '?').join(',');
      rows = await db.getAllAsync<any>(
        `SELECT * FROM outbox WHERE state IN (${ph}) ORDER BY creado_en`, states);
    } else {
      rows = await db.getAllAsync<any>('SELECT * FROM outbox ORDER BY creado_en');
    }
    return rows.map(rowToEntry);
  }
}
