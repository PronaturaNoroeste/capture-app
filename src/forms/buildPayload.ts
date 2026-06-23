// buildPayload — turn a form-definition + collected answers into the structured
// JSONB payload that the `crear_faena_completa(jsonb)` RPC consumes.
//
// Routing rules (see AppDashboardSpec/08,09):
//   binding.tipo === 'ui'      → dropped (drives visibility/cascades only)
//   columna "faena.col"        → faena object
//   columna "child.col"        → a row in that child array (section.entidad)
//   binding.tipo === 'custom'  → valores_custom (EAV) row
//   unit transform             → value * factor (e.g. kg→gr ×1000)
//   constants                  → merged into faena
//
// Pure function: deterministic, no I/O. Unit-tested in test/buildPayload.test.mjs.

import type { Answers, Campo, FormDefinition, Seccion } from './types';
import type { Proposal } from './proposals';

export interface BuildInput {
  faenaId: string;                       // client-generated UUID
  formularioId: string;
  formularioVersion: number;
  formatoOrigenId: string;               // = formulario.formato_origen_id (NOT NULL on faena)
  definition: FormDefinition;
  constantes: Record<string, unknown>;   // form-level constants ("faena.col": value)
  answers: Answers;
  newId: () => string;                   // UUID generator for child rows
  deviceId?: string;
  createdBy?: string;
  propuestas?: Proposal[];               // catalog proposals made during capture
}

// Walk an arbitrary payload value collecting every string (to find referenced ids).
function collectStrings(o: unknown, into: Set<string>): void {
  if (typeof o === 'string') into.add(o);
  else if (Array.isArray(o)) for (const x of o) collectStrings(x, into);
  else if (o && typeof o === 'object') for (const x of Object.values(o)) collectStrings(x, into);
}

// table name → payload array key
const CHILD_KEY: Record<string, string> = {
  faena_especie_objetivo: 'especie_objetivo',
  faena_arte: 'faena_arte',
  captura: 'capturas',
  medicion: 'mediciones',
  carnada: 'carnada',
  interaccion_etp: 'interaccion_etp',
  gasto: 'gasto',
};

function splitCol(columna: string): [string, string] {
  const i = columna.indexOf('.');
  return [columna.slice(0, i), columna.slice(i + 1)];
}

function transform(campo: Campo, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (campo.factor && typeof value === 'number') return value * campo.factor;
  if (campo.factor && typeof value === 'string' && value.trim() !== '')
    return Number(value) * campo.factor;
  return value;
}

// Resolve where a field's value goes, by its OWN binding column's table (not the
// section's entity — a faena section may carry a field bound to a child table, e.g.
// especie_objetivo). `singletons` collects at-most-one-row child entities seen in
// non-repeating sections (keyed by table). `repeatRow`, when given, is the current
// repeating-instance row that same-table fields write into.
function applyFields(
  campos: Campo[],
  ans: Record<string, unknown>,
  faena: Record<string, unknown>,
  repeatEntity: string | null,
  repeatRow: Record<string, unknown> | null,
  singletons: Map<string, Record<string, unknown>>,
  customs: Array<Record<string, unknown>>,
  newId: () => string,
) {
  for (const campo of campos) {
    if (campo.binding.tipo === 'ui') continue;
    const val = transform(campo, ans[campo.key]);
    if (val === undefined) continue;

    if (campo.binding.tipo === 'custom') {
      customs.push({ id: newId(), clave: campo.binding.clave ?? campo.key, valor: String(val) });
      continue;
    }
    const [table, col] = splitCol(campo.binding.columna!);
    if (table === 'faena') {
      faena[col] = val;
    } else if (repeatRow && table === repeatEntity) {
      repeatRow[col] = val;                       // belongs to this repeating instance
    } else {
      // a child binding inside a non-repeating section → one singleton row per table
      let row = singletons.get(table);
      if (!row) { row = { id: newId() }; singletons.set(table, row); }
      row[col] = val;
    }
  }
}

export function buildPayload(input: BuildInput): Record<string, unknown> {
  const { definition, answers, constantes, newId } = input;

  const faena: Record<string, unknown> = {
    id: input.faenaId,
    formato_origen_id: input.formatoOrigenId,   // NOT NULL on faena; intrinsic to the form
    formulario_id: input.formularioId,
    formulario_version: input.formularioVersion,
    device_id: input.deviceId,
    created_by: input.createdBy,
  };
  // form-level constants → faena columns
  for (const [k, v] of Object.entries(constantes)) {
    const [table, col] = splitCol(k);
    if (table === 'faena') faena[col] = v;
  }

  const payload: Record<string, unknown> = { faena };
  const customs: Array<Record<string, unknown>> = [];
  const singletons = new Map<string, Record<string, unknown>>();  // table → one row

  for (const sec of definition.secciones) {
    const entidad = sec.entidad;
    const isFaena = !entidad || entidad === 'faena';
    const got = answers[sec.key];

    if (isFaena) {
      const ans = (Array.isArray(got) ? got[0] : got) ?? {};
      applyFields(sec.campos, ans, faena, null, null, singletons, customs, newId);
      continue;
    }

    // repeating child entity → array of rows (one per instance)
    const key = CHILD_KEY[entidad] ?? entidad;
    const list = Array.isArray(got) ? got : got ? [got] : [];
    const rows = (payload[key] as Array<Record<string, unknown>>) ?? [];
    for (const ans of list) {
      const row: Record<string, unknown> = { id: newId() };
      applyFields(sec.campos, ans as Record<string, unknown>, faena, entidad, row, singletons, customs, newId);
      if (Object.keys(row).some((k) => k !== 'id')) rows.push(row);  // drop empty instances
    }
    if (rows.length) payload[key] = rows;
  }

  // singleton child rows (e.g. especie_objetivo bound inside the faena section)
  for (const [table, row] of singletons) {
    const key = CHILD_KEY[table] ?? table;
    const existing = (payload[key] as Array<Record<string, unknown>>) ?? [];
    existing.push(row);
    payload[key] = existing;
  }

  if (customs.length) payload['valores_custom'] = customs;

  // Catalog proposals: include only those actually referenced by the payload
  // (a técnico may propose then remove the row). The RPC inserts them first.
  if (input.propuestas?.length) {
    const refs = new Set<string>();
    collectStrings(payload, refs);
    const used = input.propuestas
      .filter((p) => refs.has(p.id))
      .map((p) => ({ tabla: p.tabla, id: p.id, nombre: p.nombre }));
    if (used.length) payload['propuestas'] = used;
  }
  return payload;
}
