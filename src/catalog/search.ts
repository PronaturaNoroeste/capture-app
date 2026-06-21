// Pure catalog search/ranking — used by the autocomplete picker. No I/O, so it's
// unit-tested in Node. The on-device store feeds it cached rows; this ranks them.

export interface CatalogItem {
  id: string;
  nombre: string;
  estado?: string;        // 'aprobado' | 'pendiente' | … (pendientes get a badge)
}

// Normalize for accent/case-insensitive matching (Spanish catalogs).
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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
  if (!q) {
    const prio = prioritarias
      .map((id) => items.find((i) => i.id === id))
      .filter((x): x is CatalogItem => !!x);
    const prioIds = new Set(prio.map((i) => i.id));
    const rest = items
      .filter((i) => !prioIds.has(i.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return [...prio, ...rest].slice(0, limit);
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
    .sort((a, b) => a.score - b.score || a.i.nombre.localeCompare(b.i.nombre, 'es'))
    .map((x) => x.i);
  return scored.slice(0, limit);
}
