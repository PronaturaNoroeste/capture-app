import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCatalog, norm } from '../src/catalog/search.ts';

const items = [
  { id: 'a', nombre: 'Huachinango' },
  { id: 'b', nombre: 'Pargo amarillo' },
  { id: 'c', nombre: 'Cabrilla sardinera' },
  { id: 'd', nombre: 'San Evaristo' },
  { id: 'e', nombre: 'Jurel' },
];

test('norm strips accents + case', () => {
  assert.equal(norm('Japonés'), 'japones');
  assert.equal(norm('  ÁrEa '), 'area');
});

test('empty query → priority items first, then alpha', () => {
  const r = rankCatalog({ query: '', items, prioritarias: ['a', 'e'] });
  assert.deepEqual(r.slice(0, 2).map((i) => i.id), ['a', 'e']);   // priority order preserved
  // remaining are alphabetical
  const rest = r.slice(2).map((i) => i.nombre);
  assert.deepEqual(rest, [...rest].sort((x, y) => x.localeCompare(y, 'es')));
});

test('prefix beats substring', () => {
  const r = rankCatalog({ query: 'par', items });
  assert.equal(r[0].id, 'b');   // "Pargo amarillo" prefix
});

test('accent-insensitive + token-prefix match', () => {
  assert.equal(rankCatalog({ query: 'jurél', items })[0].id, 'e');     // accent ignored
  assert.equal(rankCatalog({ query: 'evar', items })[0].id, 'd');      // token prefix "San [Evar]isto"
});

test('no match → empty', () => {
  assert.equal(rankCatalog({ query: 'zzzz', items }).length, 0);
});

test('empty query → higher importancia first, then alpha', () => {
  const listed = [
    { id: 'a', nombre: 'Zorro', importancia: 0 },
    { id: 'b', nombre: 'Bonito', importancia: 1 },
    { id: 'c', nombre: 'Abadejo', importancia: 0 },
    { id: 'd', nombre: 'Atún', importancia: 5 },
  ];
  const r = rankCatalog({ query: '', items: listed }).map((i) => i.id);
  assert.deepEqual(r, ['d', 'b', 'c', 'a']);   // 5, 1, then importancia-0 alpha (Abadejo, Zorro)
});

test('importancia breaks ties on equal query score', () => {
  const listed = [
    { id: 'x', nombre: 'Pargo lunarejo', importancia: 0 },
    { id: 'y', nombre: 'Pargo amarillo', importancia: 9 },
  ];
  // both are token-prefix matches for "pargo"; higher importancia wins the tie
  assert.equal(rankCatalog({ query: 'pargo', items: listed })[0].id, 'y');
});
