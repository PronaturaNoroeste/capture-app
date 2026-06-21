import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Outbox, MemoryOutboxStore } from '../src/sync/outbox.ts';

test('enqueue → flush success marks sincronizado', async () => {
  const ob = new Outbox(new MemoryOutboxStore());
  await ob.enqueue('F1', { faena: { id: 'F1' } });
  const calls = [];
  const r = await ob.flush(async (p) => { calls.push(p); });
  assert.deepEqual(r, { ok: 1, fail: 0 });
  assert.equal(calls.length, 1);
  assert.equal((await ob.pendientes()).length, 0);
});

test('flush failure keeps entry pending (retryable) and records error', async () => {
  const store = new MemoryOutboxStore();
  const ob = new Outbox(store);
  await ob.enqueue('F1', { faena: { id: 'F1' } });

  let attempt = 0;
  const flaky = async () => { attempt++; if (attempt === 1) throw new Error('network down'); };

  const r1 = await ob.flush(flaky);
  assert.deepEqual(r1, { ok: 0, fail: 1 });
  const e = await store.get('F1');
  assert.equal(e.state, 'error');
  assert.equal(e.ultimoError, 'network down');
  assert.ok((await ob.pendientes()).length === 1);   // still retryable

  // second flush (reconnected) succeeds
  const r2 = await ob.flush(flaky);
  assert.deepEqual(r2, { ok: 1, fail: 0 });
  assert.equal((await store.get('F1')).state, 'sincronizado');
  assert.equal((await store.get('F1')).intentos, 2);
});

test('re-flushing a synced entry does nothing (no duplicate sends)', async () => {
  const ob = new Outbox(new MemoryOutboxStore());
  await ob.enqueue('F1', { faena: { id: 'F1' } });
  let sends = 0;
  await ob.flush(async () => { sends++; });
  await ob.flush(async () => { sends++; });   // already sincronizado → skipped
  assert.equal(sends, 1);
});

test('re-enqueue same faena id updates payload, preserves creadoEn', async () => {
  let t = 1000;
  const store = new MemoryOutboxStore();
  const ob = new Outbox(store, () => t);
  await ob.enqueue('F1', { v: 1 });
  const created = (await store.get('F1')).creadoEn;
  t = 2000;
  await ob.enqueue('F1', { v: 2 });
  const e = await store.get('F1');
  assert.equal(e.payload.v, 2);
  assert.equal(e.creadoEn, created);   // unchanged
  assert.equal(e.actualizadoEn, 2000);
});
