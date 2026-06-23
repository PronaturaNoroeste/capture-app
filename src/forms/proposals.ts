// In-memory buffer of catalog proposals made while capturing the current faena.
// The CatalogPicker records a proposal here (and into the local mirror so it's
// immediately reusable); FormRenderer drains it into the sync payload on submit.
// One faena at a time → a module-level buffer is sufficient; FormRenderer clears
// it on mount so proposals never leak between faenas.

export interface Proposal {
  tabla: string;   // cat_* table (must be permite_propuestas server-side)
  id: string;      // client-generated UUID, also the catalog row id
  nombre: string;
}

const buffer = new Map<string, Proposal>();

export function recordProposal(p: Proposal): void {
  buffer.set(p.id, p);
}

export function takeProposals(): Proposal[] {
  return [...buffer.values()];
}

export function clearProposals(): void {
  buffer.clear();
}
