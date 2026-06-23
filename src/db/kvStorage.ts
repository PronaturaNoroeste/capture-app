// A SQLite-backed key/value store implementing the Supabase Auth `storage`
// interface (getItem/setItem/removeItem). We reuse the existing expo-sqlite db
// instead of pulling in AsyncStorage — keeps the dependency surface minimal and
// the auth session in the same durable WAL store as the outbox.
import { getDb } from './database';

export const SqliteAuthStorage = {
  async getItem(k: string): Promise<string | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', k);
    return row?.v ?? null;
  },
  async setItem(k: string, v: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      k, v,
    );
  },
  async removeItem(k: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM kv WHERE k = ?', k);
  },
};
