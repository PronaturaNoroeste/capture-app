// Pure catalog search/ranking — used by the autocomplete picker. No I/O, so it's
// unit-tested in Node. The on-device store feeds it cached rows; this ranks them.

export interface CatalogItem {
  id: string;
  nombre: string;
  estado?: string;        // 'aprobado' | 'pendiente' | … (pendientes get a badge)
  importancia?: number;   // curated-list rank; higher = higher (0 when not listed)
}

// Normalize for accent/case-insensitive matching (Spanish catalogs).
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface OutsiderOpts {
  query: string;
  listaItems: CatalogItem[];    // the curated subset shown by the picker
  catalogItems: CatalogItem[];  // the full mirrored catalog for the same table
}

// Rows that exist in the wider catalog but not in this curated list, whose name is
// EXACTLY what the técnico typed. The picker offers these instead of letting them
// propose a duplicate: a duplicate mints a second row (homonym confusion), and on
// cat_tipo_arte — UNIQUE (nombre), with no NULL-scoped FK to soften it — the RPC's
// INSERT raises unique_violation and the whole faena fails to sync.
// Exact names only: a partial match would leak the full catalog into a picker whose
// entire purpose is to show a curated subset.
export function catalogOutsiders({ query, listaItems, catalogItems }: OutsiderOpts): CatalogItem[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const listed = new Set(listaItems.map((i) => i.id));
  return catalogItems.filter((i) => !listed.has(i.id) && norm(i.nombre) === q);
}

export interface RankOpts {
  query: string;
  items: CatalogItem[];
  prioritarias?: string[];   // ids shown first when query is empty (chips)
  limit?: number;
}

// Returns items ranked for the query. Empty query → priority items first, then a
// short alphabetical head. Non-empty → prefix matches before substring matches.
export function rankCatalog({ query, items, prioritarias = [], limit = 30 }: RankOpts): CatalogItem[] {
  const q = norm(query);
  // legacy prioritarias order (curated lists pass importancia instead and no prioritarias)
  const prioRank = (i: CatalogItem) => {
    const idx = prioritarias.indexOf(i.id);
    return idx < 0 ? Number.POSITIVE_INFINITY : idx;
  };
  if (!q) {
    return [...items]
      .sort((a, b) =>
        prioRank(a) - prioRank(b)                              // explicit prioritarias first
        || (b.importancia ?? 0) - (a.importancia ?? 0)         // then curated importancia (desc)
        || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, limit);
  }
  const scored = items
    .map((i) => {
      const n = norm(i.nombre);
      let score = -1;
      if (n === q) score = 0;
      else if (n.startsWith(q)) score = 1;
      else if (n.includes(q)) score = 2;
      else {
        // token prefix (e.g. "san e" → "San Evaristo")
        const toks = n.split(/\s+/);
        if (toks.some((t) => t.startsWith(q))) score = 3;
      }
      return { i, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) =>
      a.score - b.score
      || (b.i.importancia ?? 0) - (a.i.importancia ?? 0)       // importancia tie-break
      || a.i.nombre.localeCompare(b.i.nombre, 'es'))
    .map((x) => x.i);
  return scored.slice(0, limit);
}
