import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCatalog, norm, catalogOutsiders } from '../src/catalog/search.ts';

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

// --- outsiders: rows that exist in the wider catalog but not in this curated list.
// Proposing one of these would mint a duplicate row (and on cat_tipo_arte, whose
// nombre is UNIQUE, abort the whole faena sync with a unique_violation).
test('outsiders: an exact catalog match outside the list is offered', () => {
  const lista = [{ id: 'l1', nombre: 'Piola' }];
  const catalogo = [
    { id: 'l1', nombre: 'Piola' },
    { id: 'c9', nombre: 'Cimbra' },        // in the catalog, not in this list
  ];
  const out = catalogOutsiders({ query: 'cimbra', listaItems: lista, catalogItems: catalogo });
  assert.deepEqual(out.map((i) => i.id), ['c9']);
});

test('outsiders: accent/case-insensitive, and ignores rows already in the list', () => {
  const lista = [{ id: 'l1', nombre: 'Cimbra' }];
  const catalogo = [{ id: 'l1', nombre: 'Cimbra' }, { id: 'c9', nombre: 'Trasmallo' }];
  // already listed → not an outsider (the normal ranked results already show it)
  assert.deepEqual(catalogOutsiders({ query: 'CÍMBRA', listaItems: lista, catalogItems: catalogo }), []);
});

test('outsiders: only exact names, never partial (curation stays strict)', () => {
  const catalogo = [{ id: 'c9', nombre: 'Cimbra de fondo' }];
  // a partial match must NOT leak the whole catalog into a curated picker
  assert.deepEqual(catalogOutsiders({ query: 'cimbra', listaItems: [], catalogItems: catalogo }), []);
  assert.equal(
    catalogOutsiders({ query: 'cimbra de fondo', listaItems: [], catalogItems: catalogo }).length, 1);
});

test('outsiders: nothing below the 2-char floor', () => {
  const catalogo = [{ id: 'c9', nombre: 'Pa' }];
  assert.deepEqual(catalogOutsiders({ query: 'p', listaItems: [], catalogItems: catalogo }), []);
});
