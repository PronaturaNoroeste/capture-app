// Sign-in screen (Phase 1). Email + password against Supabase Auth. Accounts are
// created by admins in the console; there is no public signup here.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { signInEmail } from '../sync/supabaseClient';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await signInEmail(email.trim(), pass);
      onSignedIn();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !email.trim() || !pass;
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Monitoreo pesquero</Text>
      <Text style={s.sub}>Inicia sesión para capturar</Text>
      <TextInput
        style={s.input} placeholder="Correo" placeholderTextColor="#999"
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        value={email} onChangeText={setEmail}
      />
      <TextInput
        style={s.input} placeholder="Contraseña" placeholderTextColor="#999"
        secureTextEntry value={pass} onChangeText={setPass}
      />
      {err ? <Text style={s.err}>{err}</Text> : null}
      <Pressable style={[s.btn, disabled && s.btnOff]} onPress={submit} disabled={disabled}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Entrar</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#f6f7f9' },
  title: { fontSize: 24, fontWeight: '800', color: '#0b5cad', textAlign: 'center' },
  sub: { color: '#666', textAlign: 'center', marginTop: 4, marginBottom: 28 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 10, padding: 14, backgroundColor: '#fff', marginBottom: 12, fontSize: 16 },
  err: { color: '#c00', marginBottom: 8 },
  btn: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
