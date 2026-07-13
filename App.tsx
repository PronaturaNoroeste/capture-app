// Root: require login, then init Supabase, sync catalogs + cache the pilot form,
// and render the form fully offline. The signed-in técnico's tecnico_id is
// prefilled (and that field hidden). On save → enqueue to the SQLite outbox.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StatusBar, Platform, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { color, font, radius, space, type } from './src/ui/theme';
import {
  initSupabase, supabase, syncFaena, hasLocalAuth, loadUsuario, signOut, type Usuario,
} from './src/sync/supabaseClient';
import { Outbox, type OutboxEntry } from './src/sync/outbox';
import { SqliteOutboxStore } from './src/db/outboxStore';
import { syncCatalogs, cacheForm, getCachedForm, reconcileProposals, syncListas, type CachedForm } from './src/db/catalogMirror';
import { FormRenderer } from './src/ui/FormRenderer';
import { Login } from './src/ui/Login';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CATALOGOS_PILOTO } from './src/config';

const outbox = new Outbox(new SqliteOutboxStore());
const DEVICE_ID = 'huawei-pilot-01';   // TODO: stable per-device id

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>('checking');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [status, setStatus] = useState('Iniciando…');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [form, setForm] = useState<CachedForm | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [saved, setSaved] = useState(false);
  const [screen, setScreen] = useState<'form' | 'pendientes' | 'edit'>('form');
  const [pendList, setPendList] = useState<OutboxEntry[]>([]);
  const [editEntry, setEditEntry] = useState<OutboxEntry | null>(null);
  const [fontsLoaded] = useFonts({
    DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, Fraunces_400Regular, Fraunces_600SemiBold,
  });

  async function refreshPend() { setPendientes((await outbox.pendientes()).length); }

  // Init the client and check for a persisted session (works offline).
  useEffect(() => {
    initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);
    hasLocalAuth()
      .then((ok) => setAuthState(ok ? 'in' : 'out'))
      .catch(() => setAuthState('out'));
  }, []);

  // Once signed in: load the profile, then catalogs + the published form.
  useEffect(() => {
    if (authState === 'in') bootstrap().catch((e) => setStatus('Error: ' + e.message));
  }, [authState]);

  async function bootstrap() {
    setBlocked(null);
    setStatus('Cargando perfil…');
    const u = await loadUsuario();
    setUsuario(u);

    const formatoId = u?.formato_origen_id ?? null;
    if (u && !formatoId) {
      setBlocked('No tienes un formulario asignado. Pide a un administrador que te asigne uno.');
      return;
    }
    if (!formatoId) {
      setBlocked('No se pudo cargar tu perfil. Conéctate a internet e inténtalo de nuevo.');
      return;
    }

    // Refresh from the server when reachable; fall back to the local cache offline.
    try {
      setStatus('Actualizando catálogos…');
      const n = await syncCatalogs(supabase(), CATALOGOS_PILOTO);
      const { resueltas } = await reconcileProposals(supabase());
      setStatus('Actualizando formulario…');
      await cacheForm(supabase(), formatoId);
      const nl = await syncListas(supabase(), formatoId);   // curated per-form option lists
      console.log(`catalogos: ${n} filas · propuestas reconciliadas: ${resueltas} · listas: ${nl}`);
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

  async function openPendientes() {
    setPendList(await outbox.pendientes());
    setScreen('pendientes');
  }

  async function onComplete(faenaId: string, payload: Record<string, unknown>) {
    const wasEdit = screen === 'edit';
    await outbox.enqueue(faenaId, payload);
    await refreshPend();
    if (wasEdit) { setEditEntry(null); await openPendientes(); }   // back to the list
    else setSaved(true);
  }

  function startEdit(entry: OutboxEntry) { setEditEntry(entry); setScreen('edit'); }

  function deleteEntry(entry: OutboxEntry) {
    Alert.alert('Eliminar faena', '¿Borrar esta faena sin sincronizar? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await outbox.descartar(entry.faenaId);
        await refreshPend();
        setPendList(await outbox.pendientes());
      } },
    ]);
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
    setBlocked(null);
    setAuthState('out');
  }

  if (!fontsLoaded || authState === 'checking') {
    return <View style={[s.flex, s.center]}><ActivityIndicator size="large" color={color.tide} /><Text style={s.status}>Iniciando…</Text></View>;
  }
  if (authState === 'out') {
    return <Login onSignedIn={() => setAuthState('in')} />;
  }
  if (blocked) {
    return (
      <View style={[s.flex, s.center]}>
        <Text style={[s.status, { paddingHorizontal: space.lg, textAlign: 'center' }]}>{blocked}</Text>
        <Pressable style={[s.syncBtn, { marginTop: space.lg, backgroundColor: color.tide }]} onPress={logout}>
          <Text style={s.syncText}>Salir</Text>
        </Pressable>
      </View>
    );
  }
  if (!form) {
    return <View style={[s.flex, s.center]}><ActivityIndicator size="large" color={color.tide} /><Text style={s.status}>{status}</Text></View>;
  }

  return (
    <View style={s.flex}>
      <View style={s.bar}>
        {/* The lines are cut to keep the header one row high; tapping shows them in full. */}
        <Pressable
          style={s.barInfo}
          onPress={() => Alert.alert(
            `Boca del Álamo · v${form.version}`,
            usuario ? `${usuario.nombre}\n${usuario.rol.toLowerCase()}` : undefined,
          )}
          accessibilityRole="button"
          accessibilityLabel="Ver la información completa del formulario y la cuenta"
        >
          <View style={s.barTitleRow}>
            <Text style={s.barTitle} numberOfLines={1} ellipsizeMode="tail">Boca del Álamo · v{form.version}</Text>
            {/* Sits outside the truncating Text so it survives when the title is cut. */}
            <Text style={s.barInfoGlyph}>ⓘ</Text>
          </View>
          {usuario && (
            <Text style={s.barUser} numberOfLines={1} ellipsizeMode="tail">
              {usuario.nombre} · {usuario.rol.toLowerCase()}
            </Text>
          )}
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={s.barBtnsScroll}
          contentContainerStyle={s.barBtns}
        >
          {/* Dev-only: discards errored outbox items. Hidden in production builds so a
              técnico can't silently drop captured data. Absent when __DEV__ is false. */}
          {__DEV__ && pendientes > 0 && (
            <Pressable style={s.syncBtn}
              onPress={async () => { const n = await outbox.descartarErrores(); await refreshPend(); setStatus(`Descartados: ${n}`); }}>
              <Text style={s.syncText}>Descartar</Text>
            </Pressable>
          )}
          <Pressable style={s.syncBtn} onPress={openPendientes}>
            <Text style={s.syncText}>📋 Pendientes ({pendientes})</Text>
          </Pressable>
          <Pressable style={s.syncBtn} onPress={flush}>
            <Text style={s.syncText}>Sincronizar ({pendientes})</Text>
          </Pressable>
          <Pressable style={s.syncBtn} onPress={logout}>
            <Text style={s.syncText}>Salir</Text>
          </Pressable>
        </ScrollView>
      </View>
      {screen === 'pendientes' ? (
        <ScrollView style={s.flex} contentContainerStyle={{ padding: space.lg }}>
          <View style={s.pendHead}>
            <Text style={s.pendTitle}>Pendientes ({pendList.length})</Text>
            <Pressable style={s.backBtn} onPress={() => setScreen('form')}>
              <Text style={s.syncText}>← Volver</Text>
            </Pressable>
          </View>
          {pendList.length === 0 && <Text style={s.status}>No hay faenas sin sincronizar.</Text>}
          {pendList.map((e) => {
            const f = (e.payload as any).faena ?? {};
            const nCap = ((e.payload as any).capturas ?? []).length;
            const nMed = ((e.payload as any).mediciones ?? []).length;
            return (
              <View key={e.faenaId} style={s.card}>
                <Text style={s.cardTitle}>
                  {e.state === 'error' ? '⚠️' : '⏳'} Faena · {String(f.fecha ?? 'sin fecha')}
                </Text>
                <Text style={s.cardSub}>
                  {nCap} captura(s) · {nMed} medición(es){e.ultimoError ? ` · error: ${e.ultimoError}` : ''}
                </Text>
                <View style={s.cardBtns}>
                  <Pressable style={s.cardBtn} onPress={() => startEdit(e)}>
                    <Text style={s.cardBtnTxt}>Editar</Text>
                  </Pressable>
                  <Pressable style={[s.cardBtn, s.cardDel]} onPress={() => deleteEntry(e)}>
                    <Text style={s.cardBtnTxt}>🗑️ Borrar</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : screen === 'edit' && editEntry ? (
        <View style={s.flex}>
          <Pressable style={[s.backBtn, { margin: space.sm, alignSelf: 'flex-start' }]}
            onPress={() => { setEditEntry(null); setScreen('pendientes'); }}>
            <Text style={s.syncText}>← Cancelar edición</Text>
          </Pressable>
          <FormRenderer
            key={editEntry.faenaId}
            definition={form.definicion} constantes={form.constantes}
            formularioId={form.formularioId} formularioVersion={form.version}
            formatoOrigenId={form.formatoOrigenId} deviceId={DEVICE_ID}
            createdBy={usuario?.id ?? DEVICE_ID}
            prefill={prefill} hiddenKeys={hiddenKeys}
            faenaId={editEntry.faenaId}
            initialAnswers={(editEntry.payload as any).__answers}
            initialPropuestas={(editEntry.payload as any).propuestas}
            onComplete={onComplete}
          />
        </View>
      ) : saved ? (
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
  flex: { flex: 1, backgroundColor: color.shell, paddingTop: TOP },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  status: { color: color.stone, marginTop: space.md, textAlign: 'center', fontFamily: font.regular },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: color.tide },
  barInfo: { flexShrink: 1, marginRight: space.md },
  barTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  barTitle: { color: color.white, fontFamily: font.display, fontSize: type.sectionTitle, flexShrink: 1 },
  barInfoGlyph: { color: '#cfe4e2', fontSize: type.caption },
  barUser: { color: '#cfe4e2', fontSize: type.caption, marginTop: 2, fontFamily: font.regular },
  // The buttons scroll sideways instead of wrapping: wrapping grew the header on narrow devices.
  barBtnsScroll: { flexGrow: 0, flexShrink: 1 },
  barBtns: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  syncBtn: { backgroundColor: '#ffffff22', borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm },
  syncText: { color: color.white, fontFamily: font.semibold, fontSize: type.body },
  saved: { fontSize: 18, fontFamily: font.display, color: color.success },
  again: { marginTop: space.xl, backgroundColor: color.tide, borderRadius: radius.button, paddingHorizontal: space.xl, paddingVertical: space.lg },
  againText: { color: color.white, fontFamily: font.semibold, fontSize: type.body },
  pendHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  pendTitle: { fontSize: type.sectionTitle, fontFamily: font.display, color: color.tide },
  backBtn: { backgroundColor: color.tide, borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm },
  card: { backgroundColor: color.canvas, borderWidth: 1, borderColor: color.fog, borderRadius: radius.card, padding: space.md, marginBottom: space.md },
  cardTitle: { fontFamily: font.semibold, fontSize: type.body, color: color.ink },
  cardSub: { fontFamily: font.regular, fontSize: type.caption, color: color.stone, marginTop: 2 },
  cardBtns: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  cardBtn: { backgroundColor: color.tide, borderRadius: radius.button, paddingHorizontal: space.md, paddingVertical: space.sm },
  cardDel: { backgroundColor: color.danger },
  cardBtnTxt: { color: color.white, fontFamily: font.semibold, fontSize: type.body },
});
