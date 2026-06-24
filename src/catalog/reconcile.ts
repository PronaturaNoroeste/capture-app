// Pure decision logic for reconciling a device's pending catalog proposals with
// their server review outcome. Kept dependency-free so it's unit-testable without
// the native SQLite/Supabase layers (catalogMirror.reconcileProposals applies it).

export type ReconcileAction = 'delete' | 'approve' | 'keep';

// Given the proposal's current estado on the server (undefined = no longer exists):
//   aprobado            → keep locally, mark approved (now a normal pick)
//   rechazado/fusionado → drop it (rejected or merged into another entry)
//   undefined (gone)    → drop it
//   pendiente           → keep, still awaiting review
export function reconcileAction(serverEstado: string | undefined): ReconcileAction {
  if (serverEstado === 'aprobado') return 'approve';
  if (serverEstado === 'rechazado' || serverEstado === 'fusionado' || serverEstado === undefined)
    return 'delete';
  return 'keep';
}
