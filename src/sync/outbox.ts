// Outbox — the offline-first queue of captured faenas awaiting sync.
//
// Each entry is a fully-built RPC payload (client-UUID faena graph). Because ids are
// client-generated and the RPC is idempotent (ON CONFLICT DO NOTHING), re-sending is
// always safe — so the outbox only needs at-least-once delivery, not exactly-once.
//
// This module is storage-agnostic: an OutboxStore is injected (expo-sqlite on device,
// an in-memory map in tests). Pure orchestration → unit-tested without a device.

export type OutboxState = 'pendiente' | 'enviando' | 'sincronizado' | 'error';

export interface OutboxEntry {
  faenaId: string;                 // = payload.faena.id (primary key)
  payload: Record<string, unknown>;
  state: OutboxState;
  intentos: number;
  ultimoError?: string;
  creadoEn: number;
  actualizadoEn: number;
}

export interface OutboxStore {
  upsert(e: OutboxEntry): Promise<void>;
  get(faenaId: string): Promise<OutboxEntry | undefined>;
  list(states?: OutboxState[]): Promise<OutboxEntry[]>;
  remove(faenaId: string): Promise<void>;
}

// Calls the RPC; resolves on success, throws on failure (network or server).
export type SyncFn = (payload: Record<string, unknown>) => Promise<unknown>;

export class Outbox {
  private store: OutboxStore;
  private now: () => number;
  constructor(store: OutboxStore, now: () => number = Date.now) {
    this.store = store;
    this.now = now;
  }

  async enqueue(faenaId: string, payload: Record<string, unknown>): Promise<void> {
    const t = this.now();
    // idempotent on the client too: re-enqueue updates the payload, keeps history
    const existing = await this.store.get(faenaId);
    await this.store.upsert({
      faenaId,
      payload,
      state: 'pendiente',
      intentos: existing?.intentos ?? 0,
      creadoEn: existing?.creadoEn ?? t,
      actualizadoEn: t,
    });
  }

  async pendientes(): Promise<OutboxEntry[]> {
    return this.store.list(['pendiente', 'error']);
  }

  // Delete one queued faena (pendiente or error) before it syncs — used by the
  // técnico from the Pendientes list to discard a capture they don't want to send.
  async descartar(faenaId: string): Promise<void> {
    await this.store.remove(faenaId);
  }

  // Discard entries stuck in 'error' (e.g. a bad payload during dev). Returns count.
  async descartarErrores(): Promise<number> {
    const errored = await this.store.list(['error']);
    for (const e of errored) await this.store.remove(e.faenaId);
    return errored.length;
  }

  // Try to flush all pending/errored entries. Returns counts. Never throws —
  // per-entry failures are recorded and left for the next flush.
  async flush(sync: SyncFn): Promise<{ ok: number; fail: number }> {
    let ok = 0, fail = 0;
    for (const e of await this.pendientes()) {
      await this.store.upsert({ ...e, state: 'enviando', actualizadoEn: this.now() });
      try {
        await sync(e.payload);
        await this.store.upsert({
          ...e, state: 'sincronizado', intentos: e.intentos + 1,
          ultimoError: undefined, actualizadoEn: this.now(),
        });
        ok++;
      } catch (err) {
        await this.store.upsert({
          ...e, state: 'error', intentos: e.intentos + 1,
          ultimoError: String((err as Error)?.message ?? err), actualizadoEn: this.now(),
        });
        fail++;
      }
    }
    return { ok, fail };
  }
}

// Simple in-memory store (tests; also a reference impl for the SQLite store).
export class MemoryOutboxStore implements OutboxStore {
  private m = new Map<string, OutboxEntry>();
  async upsert(e: OutboxEntry) { this.m.set(e.faenaId, { ...e }); }
  async get(id: string) { const e = this.m.get(id); return e ? { ...e } : undefined; }
  async list(states?: OutboxState[]) {
    const all = [...this.m.values()];
    return states ? all.filter((e) => states.includes(e.state)) : all;
  }
  async remove(faenaId: string) { this.m.delete(faenaId); }
}
