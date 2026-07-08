// Supabase client + auth + the one server call the app makes for sync.
// GMS-free: nothing here depends on Google Play Services.
//
// Auth (Phase 1, AppDashboardSpec/15): real email+password accounts (admin-created).
// The session persists in the local SQLite kv store and works offline once cached.
// The sync RPC stamps auth.uid() onto every faena (= the registrant = usuario.id).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SqliteAuthStorage } from '../db/kvStorage';

let _client: SupabaseClient | null = null;
const USUARIO_KEY = 'usuario_perfil';

export interface Usuario {
  id: string;
  nombre: string;
  rol: string;                  // TECNICO | ADMINISTRADOR | ANALISTA | PESCADOR
  region_id: string | null;
  tecnico_id: string | null;    // → cat_tecnico (prefills faena.tecnico_id)
  pescador_id: string | null;   // → cat_pescador (Phase 2; prefills faena.capitan_id)
  formato_origen_id: string | null;   // → cat_formato_origen (R4: which form loads on the tablet)
}

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  _client = createClient(url, anonKey, {
    auth: {
      storage: SqliteAuthStorage,     // persist the session per install (offline)
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

// uid of the persisted *real* session (works offline), or null. Anonymous sessions
// (left over from the retired anon-auth flow) don't count — force a real login.
export async function getSessionUserId(): Promise<string | null> {
  const { data: { session } } = await supabase().auth.getSession();
  const user = session?.user;
  if (!user || user.is_anonymous) return null;
  return user.id;
}

async function cachedUsuario(): Promise<Usuario | null> {
  const cached = await SqliteAuthStorage.getItem(USUARIO_KEY);
  return cached ? (JSON.parse(cached) as Usuario) : null;
}

// Offline-safe "is this device logged in?". A cached profile means the user has an
// established session here — we trust it so the app stays logged in offline, even
// when getSession() can't validate/refresh an expired access token without network.
// No network, no token refresh. autoRefreshToken revalidates the session when back online.
export async function hasLocalAuth(): Promise<boolean> {
  if (await cachedUsuario()) return true;
  try { return !!(await getSessionUserId()); } catch { return false; }
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await SqliteAuthStorage.removeItem(USUARIO_KEY);
  await supabase().auth.signOut();
}

// Load the signed-in user's profile (rol, tecnico_id, region…). Online: fetch +
// cache; offline: fall back to the cached copy so prefill still works.
export async function loadUsuario(): Promise<Usuario | null> {
  try {
    const uid = await getSessionUserId();
    if (!uid) return await cachedUsuario();   // offline / unrefreshable token → cached profile
    const { data, error } = await supabase()
      .from('usuario')
      .select('id, nombre, rol, region_id, tecnico_id, pescador_id, formato_origen_id')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) await SqliteAuthStorage.setItem(USUARIO_KEY, JSON.stringify(data));
    return (data as Usuario) ?? await cachedUsuario();
  } catch {
    return await cachedUsuario();
  }
}

// The single sync call: hand the built payload to the atomic, idempotent RPC.
// Conforms to SyncFn in outbox.ts. Throws on error so the outbox marks it retryable.
export async function syncFaena(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase().rpc('crear_faena_completa', { payload });
  if (error) throw new Error(error.message);
}
