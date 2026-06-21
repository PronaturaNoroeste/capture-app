// Supabase client + the one server call the app makes for sync.
// GMS-free: nothing here depends on Google Play Services.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  _client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

export function supabase(): SupabaseClient {
  if (!_client) throw new Error('initSupabase() no fue llamado');
  return _client;
}

// The single sync call: hand the built payload to the atomic, idempotent RPC.
// Conforms to SyncFn in outbox.ts. Throws on error so the outbox marks it retryable.
export async function syncFaena(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase().rpc('crear_faena_completa', { payload });
  if (error) throw new Error(error.message);
}
