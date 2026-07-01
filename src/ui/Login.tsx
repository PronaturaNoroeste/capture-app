// Sign-in screen (Phase 1). Email + password against Supabase Auth. Accounts are
// created by admins in the console; there is no public signup here.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { signInEmail } from '../sync/supabaseClient';
import { color, font, radius, space, type } from './theme';

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
        style={s.input} placeholder="Correo" placeholderTextColor={color.stone}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        value={email} onChangeText={setEmail}
      />
      <TextInput
        style={s.input} placeholder="Contraseña" placeholderTextColor={color.stone}
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
  wrap: { flex: 1, justifyContent: 'center', padding: space.xxl, backgroundColor: color.shell },
  title: { fontSize: 28, fontFamily: font.display, color: color.tide, textAlign: 'center' },
  sub: { color: color.stone, textAlign: 'center', marginTop: space.xs, marginBottom: space.xxl, fontFamily: font.regular, fontSize: type.body },
  input: { borderWidth: 1, borderColor: color.fog, borderRadius: radius.input, padding: space.md, backgroundColor: color.canvas, marginBottom: space.md, fontSize: type.input, color: color.ink, fontFamily: font.regular },
  err: { color: color.danger, marginBottom: space.sm, fontFamily: font.regular },
  btn: { backgroundColor: color.tide, borderRadius: radius.button, padding: space.lg, alignItems: 'center', marginTop: space.sm },
  btnOff: { opacity: 0.5 },
  btnText: { color: color.white, fontFamily: font.semibold, fontSize: type.input },
});
