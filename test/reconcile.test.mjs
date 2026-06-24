import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAction } from '../src/catalog/reconcile.ts';

test('reconcileAction: server outcomes map to the right local action', () => {
  assert.equal(reconcileAction('aprobado'), 'approve');     // accepted → becomes a normal pick
  assert.equal(reconcileAction('rechazado'), 'delete');     // rejected → drop
  assert.equal(reconcileAction('fusionado'), 'delete');     // merged → drop
  assert.equal(reconcileAction(undefined), 'delete');       // gone from server → drop
  assert.equal(reconcileAction('pendiente'), 'keep');       // still under review → keep
});
