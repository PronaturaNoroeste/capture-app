// Supabase client + the one server call the app makes for sync.
// GMS-free: nothing here depends on Google Play Services.
//
// Auth (M2): the app signs in *anonymously*. Each install thus gets a stable
// `authenticated` JWT with its own auth.uid(), persisted in the local SQLite kv
// store. The sync RPC stamps that uid onto every faena for claim-later
// reconciliation, and RLS now requires an authenticated session.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SqliteAuthStorage } from '../db/kvStorage';

let _client: SupabaseClient | null = null;

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  _client = createClient(url, anonKey, {
    auth: {
      storage: SqliteAuthStorage,     // persist the anon session per install
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,      // no deep-link OAuth in this app
    },
  });
  return _client;
}

export function supabase(): SupabaseClient {
  if (!_client) throw new Error('initSupabase() no fue llamado');
  return _client;
}

// Ensure we hold an authenticated (anonymous) session before any RLS-guarded
// call. Reuses the persisted session if present; otherwise signs in anonymously
// (needs network — runs during the online bootstrap). Returns the auth.uid().
export async function ensureAnonAuth(): Promise<string> {
  const { data: { session } } = await supabase().auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase().auth.signInAnonymously();
  if (error) throw new Error('auth anónima: ' + error.message);
  if (!data.user) throw new Error('auth anónima: sin usuario en la respuesta');
  return data.user.id;
}

// The single sync call: hand the built payload to the atomic, idempotent RPC.
// Conforms to SyncFn in outbox.ts. Throws on error so the outbox marks it retryable.
export async function syncFaena(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase().rpc('crear_faena_completa', { payload });
  if (error) throw new Error(error.message);
}
