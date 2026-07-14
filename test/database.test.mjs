import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Concurrent first calls to getDb() (GoTrueClient storage read + hasLocalAuth at
// boot) must share ONE native connection. A second openDatabaseAsync on the same
// file races the DDL batch and NPEs expo-sqlite on Android
// ("NativeDatabase.prepareAsync has been rejected → java.lang.NullPointerException").
// One init = the DDL batch + the formulario_cache.nombre ALTER patch. Counting the
// execs proves init ran ONCE overall, not once per concurrent caller (3 callers
// racing a per-caller init would give 3×).
const EXECS_PER_INIT = 2;

test('getDb opens the database exactly once under concurrent callers', async () => {
  let opens = 0;
  let execs = 0;

  mock.module('expo-sqlite', {
    namedExports: {
      openDatabaseAsync: async () => {
        opens++;
        await new Promise((r) => setTimeout(r, 10));   // simulate native open latency
        return {
          execAsync: async () => { execs++; },
          getFirstAsync: async () => null,
          runAsync: async () => {},
        };
      },
    },
  });

  const { getDb } = await import('../src/db/database.ts');

  const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
  assert.equal(opens, 1, `openDatabaseAsync ran ${opens}× — concurrent boot callers must share one connection`);
  assert.equal(execs, EXECS_PER_INIT, 'the init sequence must run exactly once, not per caller');
  assert.ok(a === b && b === c, 'all callers must get the same db instance');
});
