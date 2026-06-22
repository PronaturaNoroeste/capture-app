// Root: init Supabase, sync catalogs + cache the pilot form (online once), then render
// the form fully offline. On save → enqueue to the SQLite outbox. A sync bar flushes.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initSupabase, supabase, syncFaena } from './src/sync/supabaseClient';
import { Outbox } from './src/sync/outbox';
import { SqliteOutboxStore } from './src/db/outboxStore';
import { syncCatalogs, cacheForm, getCachedForm, type CachedForm } from './src/db/catalogMirror';
import { FormRenderer } from './src/ui/FormRenderer';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FORMATO_PILOTO, CATALOGOS_PILOTO } from './src/config';

const outbox = new Outbox(new SqliteOutboxStore());
const DEVICE_ID = 'huawei-pilot-01';   // TODO: stable per-device id

export default function App() {
  const [status, setStatus] = useState('Iniciando…');
  const [form, setForm] = useState<CachedForm | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [saved, setSaved] = useState(false);

  async function refreshPend() { setPendientes((await outbox.pendientes()).length); }

  // First launch (online): pull catalogs + form, cache them. Later launches: use cache.
  async function bootstrap() {
    initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    // resolve formato codigo → id
    const { data: fmt, error } = await supabase()
      .from('cat_formato_origen').select('id').eq('codigo', FORMATO_PILOTO).single();
    if (error) throw new Error('formato: ' + error.message);
    const formatoId = fmt.id as string;

    let cached = await getCachedForm(formatoId);
    if (!cached) {
      setStatus('Descargando catálogos…');
      await syncCatalogs(supabase(), CATALOGOS_PILOTO);
      setStatus('Descargando formulario…');
      await cacheForm(supabase(), formatoId);
      cached = await getCachedForm(formatoId);
    }
    if (!cached) throw new Error('No hay formulario publicado para ' + FORMATO_PILOTO);
    setForm(cached);
    await refreshPend();
    setStatus('Listo');
  }

  useEffect(() => { bootstrap().catch((e) => setStatus('Error: ' + e.message)); }, []);

  async function onComplete(faenaId: string, payload: Record<string, unknown>) {
    await outbox.enqueue(faenaId, payload);   // persisted offline
    await refreshPend();
    setSaved(true);
  }

  async function flush() {
    setStatus('Sincronizando…');
    const r = await outbox.flush(syncFaena);
    await refreshPend();
    setStatus(`Sync: ${r.ok} ok, ${r.fail} pendiente(s)`);
  }

  if (!form) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={s.center}>
          <ActivityIndicator size="large" />
          <Text style={s.status}>{status}</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.flex} edges={['top']}>
      <View style={s.bar}>
        <Text style={s.barTitle}>Boca del Álamo · v{form.version}</Text>
        <Pressable style={s.syncBtn} onPress={flush}>
          <Text style={s.syncText}>Sincronizar ({pendientes})</Text>
        </Pressable>
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
          formatoOrigenId={form.formatoOrigenId} deviceId={DEVICE_ID} createdBy={DEVICE_ID}
          onComplete={onComplete}
        />
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f6f7f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  status: { color: '#666', marginTop: 12, textAlign: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#0b5cad' },
  barTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  syncBtn: { backgroundColor: '#ffffff22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  syncText: { color: '#fff', fontWeight: '600' },
  saved: { fontSize: 18, fontWeight: '700', color: '#137333' },
  again: { marginTop: 24, backgroundColor: '#1a73e8', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  againText: { color: '#fff', fontWeight: '700' },
});
