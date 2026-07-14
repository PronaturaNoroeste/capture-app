import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildPayload } from '../src/forms/buildPayload.ts';
import { validateAnswer, campoVisible, seccionVisible } from '../src/forms/engine.ts';

const __dir = dirname(fileURLToPath(import.meta.url));
// Use the REAL seeded form-definition (placeholders left as {cat:..} strings — fine
// for routing tests; we only care about bindings/structure, not resolved UUIDs).
const formPath = join(__dir, '../../Planning/supabase/seed/boca_alamo_form.json');
const form = JSON.parse(readFileSync(formPath, 'utf8'));
const definition = { secciones: form.secciones };
const constantes = { 'faena.region_id': 'REG', 'faena.zona_pesca_id': 'ZON', 'faena.tipo_registro': 'BITACORA' };

let counter = 0;
const newId = () => `id-${++counter}`;

function base(extra = {}) {
  return {
    faenaId: 'FAENA-1', formularioId: 'FORM-1', formularioVersion: 1, formatoOrigenId: 'FMT-1',
    definition, constantes, newId, deviceId: 'dev', createdBy: 'tester',
    ...extra,
  };
}

test('faena fields + constants land on the faena object', () => {
  counter = 0;
  const answers = {
    generales: { fecha: '2026-06-20', comunidad: 'C1', tecnico: 'T1', capitan: 'P1',
                 especie_objetivo: 'E-HUACH', sitio: 'S1', tiempo: 4.5, num_pescadores: 2, gasolina: 30 },
  };
  const p = buildPayload(base({ answers }));
  assert.equal(p.faena.id, 'FAENA-1');
  assert.equal(p.faena.fecha, '2026-06-20');
  assert.equal(p.faena.tipo_registro, 'BITACORA');   // from constants
  assert.equal(p.faena.region_id, 'REG');
  assert.equal(p.faena.formulario_version, 1);
  assert.equal(p.faena.formato_origen_id, 'FMT-1');   // intrinsic form metadata (NOT NULL)
});

test('especie_objetivo routes to its child array (single row)', () => {
  counter = 0;
  const answers = { generales: { especie_objetivo: 'E-HUACH' } };
  const p = buildPayload(base({ answers }));
  assert.ok(Array.isArray(p.especie_objetivo));
  assert.equal(p.especie_objetivo.length, 1);
  assert.equal(p.especie_objetivo[0].especie_id, 'E-HUACH');
});

test('repeating tallas → mediciones rows, with kg→gr transform', () => {
  counter = 0;
  const answers = {
    tallas: [
      { talla_especie: 'E1', talla_long: 35.5, talla_peso: 0.7 },   // 0.7 kg → 700 g
      { talla_especie: 'E1', talla_long: 41.0, talla_peso: 1.1 },   // 1.1 kg → 1100 g
    ],
  };
  const p = buildPayload(base({ answers }));
  assert.equal(p.mediciones.length, 2);
  assert.equal(p.mediciones[0].longitud_total_cm, 35.5);
  assert.equal(p.mediciones[0].peso_gr, 700);
  assert.equal(p.mediciones[1].peso_gr, 1100);
});

test('ui fields (monitorear_tallas, grupo_pap) are NOT stored', () => {
  counter = 0;
  const answers = {
    tallas_gate: { monitorear_tallas: 'Sí' },
    pap: [{ grupo_pap: 'Tortugas', especie_pap: 'E-TORT', destino_pap: 'D1' }],
  };
  const p = buildPayload(base({ answers }));
  // grupo_pap is ui-only → only especie/tipo land on interaccion_etp
  assert.equal(p.interaccion_etp.length, 1);
  assert.equal(p.interaccion_etp[0].especie_id, 'E-TORT');
  assert.ok(!('grupo_pap' in p.interaccion_etp[0]));
  assert.ok(!('monitorear_tallas' in p.faena));
});

test('empty repeating instances are dropped', () => {
  counter = 0;
  const answers = { tallas: [{}, { talla_especie: 'E1', talla_long: 30 }] };
  const p = buildPayload(base({ answers }));
  assert.equal(p.mediciones.length, 1);
});

test('engine: visibility branches by tipo_arte', () => {
  const arte = definition.secciones.find((s) => s.key === 'arte');
  const metodo = arte.campos.find((c) => c.key === 'metodo');       // Piola-only
  const caida = arte.campos.find((c) => c.key === 'caida');         // Chinchorro-only
  const piolaScope = { tipo_arte: '{cat_tipo_arte:Piola}' };
  assert.equal(campoVisible(metodo, piolaScope), true);
  assert.equal(campoVisible(caida, piolaScope), false);
});

test('engine: required + range validation', () => {
  const tallas = definition.secciones.find((s) => s.key === 'tallas');
  // missing required especie + length out of range
  const errs = validateAnswer(tallas.campos, { talla_long: 999 });
  const keys = errs.map((e) => e.campo);
  assert.ok(keys.includes('talla_especie'));   // required missing
  assert.ok(keys.includes('talla_long'));       // > max 300
});

test('engine: carnada — arte_carnada visible only when origen = PESCADA (enum value)', () => {
  const carnada = definition.secciones.find((s) => s.key === 'carnada');
  const arte = carnada.campos.find((c) => c.key === 'arte_carnada');
  assert.equal(campoVisible(arte, { origen: 'COMPRADA' }), false);
  assert.equal(campoVisible(arte, { origen: 'PESCADA' }), true);
});

test('option label/value mapping: origen stores enum value, shows label', async () => {
  const { opLabel, opValor } = await import('../src/forms/types.ts');
  const carnada = definition.secciones.find((s) => s.key === 'carnada');
  const origen = carnada.campos.find((c) => c.key === 'origen');
  assert.deepEqual(origen.opciones.map(opLabel), ['Comprada', 'Pescada']);
  assert.deepEqual(origen.opciones.map(opValor), ['COMPRADA', 'PESCADA']);  // enum values
});

test('section visibility: tallas hidden unless gate = Sí', () => {
  const tallas = definition.secciones.find((s) => s.key === 'tallas');
  assert.equal(seccionVisible(tallas, { monitorear_tallas: 'No' }), false);
  assert.equal(seccionVisible(tallas, { monitorear_tallas: 'Sí' }), true);
});

test('propuestas: only proposals referenced by the payload are included', () => {
  counter = 0;
  // capitan = a proposed new pescador id; an unused proposal must be dropped
  const answers = { generales: { capitan: 'PROP-CAP', especie_objetivo: 'E-HUACH' } };
  const p = buildPayload(base({
    answers,
    propuestas: [
      { tabla: 'cat_pescador', id: 'PROP-CAP', nombre: 'Nuevo Capitán' },
      { tabla: 'cat_embarcacion', id: 'PROP-EMB-UNUSED', nombre: 'Lancha fantasma' },
    ],
  }));
  assert.equal(p.faena.capitan_id, 'PROP-CAP');
  assert.ok(Array.isArray(p.propuestas));
  assert.equal(p.propuestas.length, 1);                     // unused one dropped
  assert.deepEqual(p.propuestas[0], { tabla: 'cat_pescador', id: 'PROP-CAP', nombre: 'Nuevo Capitán' });
});

test('propuestas: the curated list the name was proposed from travels with it', () => {
  counter = 0;
  // A proposal made on a curated-list field carries `lista`, so the RPC can record
  // which list it belongs to and the console can put it back there on approval.
  const answers = { generales: { capitan: 'PROP-CAP', especie_objetivo: 'E-HUACH' } };
  const p = buildPayload(base({
    answers,
    propuestas: [
      { tabla: 'cat_pescador', id: 'PROP-CAP', nombre: 'Nuevo Capitán', lista: 'pescadores' },
    ],
  }));
  assert.deepEqual(p.propuestas[0], {
    tabla: 'cat_pescador', id: 'PROP-CAP', nombre: 'Nuevo Capitán', lista: 'pescadores',
  });
});

test('propuestas: a non-curated field proposes without a lista key', () => {
  counter = 0;
  const answers = { generales: { capitan: 'PROP-CAP', especie_objetivo: 'E-HUACH' } };
  const p = buildPayload(base({
    answers,
    propuestas: [{ tabla: 'cat_pescador', id: 'PROP-CAP', nombre: 'Nuevo Capitán' }],
  }));
  assert.ok(!('lista' in p.propuestas[0]));   // absent, not undefined/null
});

test('propuestas: absent when none provided', () => {
  counter = 0;
  const p = buildPayload(base({ answers: { generales: { especie_objetivo: 'E-HUACH' } } }));
  assert.ok(!('propuestas' in p));
});

test('requerido_si: conditionally required only when its condition holds (by-gear)', () => {
  const campo = {
    key: 'metodo', label: 'Método', tipo: 'texto',
    binding: { tipo: 'core', columna: 'faena_arte.metodo' },
    requerido_si: { campo: 'tipo_arte', op: '==', valor: 'PIOLA' },
  };
  // condition holds + empty → required error
  assert.ok(validateAnswer([campo], { tipo_arte: 'PIOLA' }).some((e) => e.campo === 'metodo'));
  // condition false → not required
  assert.equal(validateAnswer([campo], { tipo_arte: 'CHINCHORRO' }).length, 0);
  // condition holds + filled → no error
  assert.equal(validateAnswer([campo], { tipo_arte: 'PIOLA', metodo: 'Línea' }).length, 0);
});
