// Sign-in screen (Phase 1). Email + password against Supabase Auth. Accounts are
// created by admins in the console; there is no public signup here.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { signInEmail, sendRecoveryCode, resetPasswordWithCode } from '../sync/supabaseClient';
import { color, font, radius, space, type } from './theme';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recover, setRecover] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await signInEmail(email.trim(), pass);
      onSignedIn();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo iniciar sesión');
    } finally { setBusy(false); }
  }

  async function sendCode() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await sendRecoveryCode(email.trim());
      setSent(true); setMsg('Te enviamos un código a tu correo (revisa spam).');
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo enviar el código');
    } finally { setBusy(false); }
  }

  async function applyReset() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await resetPasswordWithCode(email.trim(), code.trim(), newPass);
      setRecover(false); setSent(false); setCode(''); setNewPass('');
      setMsg('Contraseña actualizada. Inicia sesión con la nueva.');
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo cambiar la contraseña');
    } finally { setBusy(false); }
  }

  const signinDisabled = busy || !email.trim() || !pass;
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Monitoreo pesquero</Text>
      <Text style={s.sub}>{recover ? 'Restablecer contraseña' : 'Inicia sesión para capturar'}</Text>
      <TextInput
        style={s.input} placeholder="Correo" placeholderTextColor={color.stone}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
        value={email} onChangeText={setEmail}
      />
      {!recover && (
        <TextInput
          style={s.input} placeholder="Contraseña" placeholderTextColor={color.stone}
          secureTextEntry value={pass} onChangeText={setPass}
        />
      )}
      {recover && sent && (
        <>
          <TextInput
            style={s.input} placeholder="Código del correo" placeholderTextColor={color.stone}
            autoCapitalize="none" keyboardType="number-pad" value={code} onChangeText={setCode}
          />
          <TextInput
            style={s.input} placeholder="Nueva contraseña" placeholderTextColor={color.stone}
            secureTextEntry value={newPass} onChangeText={setNewPass}
          />
        </>
      )}
      {err ? <Text style={s.err}>{err}</Text> : null}
      {msg ? <Text style={s.msg}>{msg}</Text> : null}

      {!recover && (
        <Pressable style={[s.btn, signinDisabled && s.btnOff]} onPress={submit} disabled={signinDisabled}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Entrar</Text>}
        </Pressable>
      )}
      {recover && !sent && (
        <Pressable style={[s.btn, (busy || !email.trim()) && s.btnOff]} onPress={sendCode}
                   disabled={busy || !email.trim()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Enviar código</Text>}
        </Pressable>
      )}
      {recover && sent && (
        <Pressable style={[s.btn, (busy || !code.trim() || !newPass) && s.btnOff]} onPress={applyReset}
                   disabled={busy || !code.trim() || !newPass}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Cambiar contraseña</Text>}
        </Pressable>
      )}

      <Pressable onPress={() => { setRecover(!recover); setErr(null); setMsg(null); setSent(false); }}>
        <Text style={s.link}>{recover ? '← Volver a iniciar sesión' : '¿Olvidaste tu contraseña?'}</Text>
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
  msg: { color: color.success, marginBottom: space.sm, fontFamily: font.regular },
  link: { color: color.tide, textAlign: 'center', marginTop: space.lg, fontFamily: font.semibold, fontSize: type.body },
});
