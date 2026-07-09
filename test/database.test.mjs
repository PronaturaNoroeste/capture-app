import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Concurrent first calls to getDb() (GoTrueClient storage read + hasLocalAuth at
// boot) must share ONE native connection. A second openDatabaseAsync on the same
// file races the DDL batch and NPEs expo-sqlite on Android
// ("NativeDatabase.prepareAsync has been rejected → java.lang.NullPointerException").
test('getDb opens the database exactly once under concurrent callers', async () => {
  let opens = 0;
  let execsBeforeOpenSettled = 0;

  mock.module('expo-sqlite', {
    namedExports: {
      openDatabaseAsync: async () => {
        opens++;
        await new Promise((r) => setTimeout(r, 10));   // simulate native open latency
        return {
          execAsync: async () => { execsBeforeOpenSettled++; },
          getFirstAsync: async () => null,
          runAsync: async () => {},
        };
      },
    },
  });

  const { getDb } = await import('../src/db/database.ts');

  const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
  assert.equal(opens, 1, `openDatabaseAsync ran ${opens}× — concurrent boot callers must share one connection`);
  assert.equal(execsBeforeOpenSettled, 1, 'DDL batch must run exactly once');
  assert.ok(a === b && b === c, 'all callers must get the same db instance');
});
