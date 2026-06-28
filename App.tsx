// Root: require login, then init Supabase, sync catalogs + cache the pilot form,
// and render the form fully offline. The signed-in técnico's tecnico_id is
// prefilled (and that field hidden). On save → enqueue to the SQLite outbox.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StatusBar, Platform, StyleSheet } from 'react-native';
import {
  initSupabase, supabase, syncFaena, getSessionUserId, loadUsuario, signOut, type Usuario,
} from './src/sync/supabaseClient';
import { Outbox } from './src/sync/outbox';
import { SqliteOutboxStore } from './src/db/outboxStore';
import { syncCatalogs, cacheForm, getCachedForm, reconcileProposals, type CachedForm } from './src/db/catalogMirror';
import { FormRenderer } from './src/ui/FormRenderer';
import { Login } from './src/ui/Login';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FORMATO_PILOTO, CATALOGOS_PILOTO } from './src/config';

const outbox = new Outbox(new SqliteOutboxStore());
const DEVICE_ID = 'huawei-pilot-01';   // TODO: stable per-device id

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>('checking');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [status, setStatus] = useState('Iniciando…');
  const [form, setForm] = useState<CachedForm | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [saved, setSaved] = useState(false);

  async function refreshPend() { setPendientes((await outbox.pendientes()).length); }

  // Init the client and check for a persisted session (works offline).
  useEffect(() => {
    initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    getSessionUserId()
      .then((uid) => setAuthState(uid ? 'in' : 'out'))
      .catch(() => setAuthState('out'));
  }, []);

  // Once signed in: load the profile, then catalogs + the published form.
  useEffect(() => {
    if (authState === 'in') bootstrap().catch((e) => setStatus('Error: ' + e.message));
  }, [authState]);

  async function bootstrap() {
    setStatus('Cargando perfil…');
    setUsuario(await loadUsuario());

    const { data: fmt, error } = await supabase()
      .from('cat_formato_origen').select('id').eq('codigo', FORMATO_PILOTO).single();
    if (error) throw new Error('formato: ' + error.message);
    const formatoId = fmt.id as string;

    // Refresh from the server when reachable; fall back to the local cache offline.
    try {
      setStatus('Actualizando catálogos…');
      const n = await syncCatalogs(supabase(), CATALOGOS_PILOTO);
      const { resueltas } = await reconcileProposals(supabase());
      setStatus('Actualizando formulario…');
      await cacheForm(supabase(), formatoId);
      console.log(`catalogos sincronizados: ${n} filas · propuestas reconciliadas: ${resueltas}`);
    } catch (e) {
      console.log('sin conexión, usando caché local:', String(e));
    }

    const cached = await getCachedForm(formatoId);
    if (!cached) throw new Error('No hay formulario en caché. Conéctate a internet y reinicia.');
    setForm(cached);
    await refreshPend();
    setStatus('Listo');
  }

  // The field bound to faena.tecnico_id is prefilled from the user's tecnico_id and hidden.
  const tecnicoField = useMemo(() => {
    if (!form) return null;
    for (const sec of form.definicion.secciones)
      for (const c of (sec.campos ?? []))
        if ((c as any)?.binding?.columna === 'faena.tecnico_id') return (c as any).key as string;
    return null;
  }, [form]);
  const prefill = (tecnicoField && usuario?.tecnico_id) ? { [tecnicoField]: usuario.tecnico_id } : undefined;
  const hiddenKeys = prefill ? [tecnicoField!] : undefined;

  async function onComplete(faenaId: string, payload: Record<string, unknown>) {
    await outbox.enqueue(faenaId, payload);
    await refreshPend();
    setSaved(true);
  }

  async function flush() {
    setStatus('Sincronizando…');
    const r = await outbox.flush(syncFaena);
    await refreshPend();
    if (r.fail > 0) {
      const failed = (await outbox.pendientes()).find((e) => e.ultimoError);
      const msg = failed?.ultimoError ?? 'desconocido';
      console.log('SYNC ERROR:', msg);
      setStatus(`Error: ${msg}`);
    } else {
      setStatus(`Sync: ${r.ok} ok`);
    }
  }

  async function logout() {
    await signOut();
    setForm(null);
    setUsuario(null);
    setSaved(false);
    setAuthState('out');
  }

  if (authState === 'checking') {
    return <View style={[s.flex, s.center]}><ActivityIndicator size="large" /><Text style={s.status}>Iniciando…</Text></View>;
  }
  if (authState === 'out') {
    return <Login onSignedIn={() => setAuthState('in')} />;
  }
  if (!form) {
    return <View style={[s.flex, s.center]}><ActivityIndicator size="large" /><Text style={s.status}>{status}</Text></View>;
  }

  return (
    <View style={s.flex}>
      <View style={s.bar}>
        <View style={s.barInfo}>
          <Text style={s.barTitle}>Boca del Álamo · v{form.version}</Text>
          {usuario && <Text style={s.barUser}>{usuario.nombre} · {usuario.rol.toLowerCase()}</Text>}
        </View>
        <View style={s.barBtns}>
          {pendientes > 0 && (
            <Pressable style={s.syncBtn}
              onPress={async () => { const n = await outbox.descartarErrores(); await refreshPend(); setStatus(`Descartados: ${n}`); }}>
              <Text style={s.syncText}>Descartar</Text>
            </Pressable>
          )}
          <Pressable style={s.syncBtn} onPress={flush}>
            <Text style={s.syncText}>Sincronizar ({pendientes})</Text>
          </Pressable>
          <Pressable style={s.syncBtn} onPress={logout}>
            <Text style={s.syncText}>Salir</Text>
          </Pressable>
        </View>
      </View>
      {saved ? (
        <View style={s.center}>
          <Text style={s.saved}>✓ Faena guardada en el dispositivo</Text>
          <Text style={s.status}>{pendientes} sin sincronizar · {status}</Text>
          <Pressable style={s.again} onPress={() => setSaved(false)}>
            <Text style={s.againText}>Nueva faena</Text>
          </Pressable>
        </View>
      ) : (
        <FormRenderer
          definition={form.definicion} constantes={form.constantes}
          formularioId={form.formularioId} formularioVersion={form.version}
          formatoOrigenId={form.formatoOrigenId} deviceId={DEVICE_ID}
          createdBy={usuario?.id ?? DEVICE_ID}
          prefill={prefill} hiddenKeys={hiddenKeys}
          onComplete={onComplete}
        />
      )}
    </View>
  );
}

const TOP = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 44;

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f6f7f9', paddingTop: TOP },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  status: { color: '#666', marginTop: 12, textAlign: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#0b5cad' },
  barInfo: { flexShrink: 1 },
  barTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  barUser: { color: '#cfe0f3', fontSize: 12, marginTop: 2 },
  barBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  syncBtn: { backgroundColor: '#ffffff22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  syncText: { color: '#fff', fontWeight: '600' },
  saved: { fontSize: 18, fontWeight: '700', color: '#137333' },
  again: { marginTop: 24, backgroundColor: '#1a73e8', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  againText: { color: '#fff', fontWeight: '700' },
});
