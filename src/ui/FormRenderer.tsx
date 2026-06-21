// Dynamic form renderer: walks the form-definition, manages answers, applies
// visible_si / validation via the pure engine, supports repeating groups + the
// "Otro → free text" sentinel. On submit → buildPayload → onComplete(payload).
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type { Answers, Campo, FormDefinition, Seccion } from '../forms/types';
import { OTRO } from '../forms/types';
import { campoVisible, seccionVisible, validateAnswer } from '../forms/engine';
import { buildPayload } from '../forms/buildPayload';
import { Field } from './Field';

interface Props {
  definition: FormDefinition;
  constantes: Record<string, unknown>;
  formularioId: string;
  formularioVersion: number;
  formatoOrigenId: string;
  deviceId: string;
  createdBy: string;
  onComplete: (faenaId: string, payload: Record<string, unknown>) => void;
}

type Inst = Record<string, unknown>;

export function FormRenderer(p: Props) {
  // non-repeating sections share one flat scope (faena-level answers, keyed by field.key)
  const [scope, setScope] = useState<Inst>({});
  // repeating sections: key → array of instances
  const [repeats, setRepeats] = useState<Record<string, Inst[]>>(() => {
    const init: Record<string, Inst[]> = {};
    for (const s of p.definition.secciones) if (s.repetible) init[s.key] = (s.min ?? 0) > 0 ? [{}] : [];
    return init;
  });
  const [showErrors, setShowErrors] = useState(false);

  const setField = (k: string, v: unknown) => setScope((s) => ({ ...s, [k]: v }));
  const setRepeatField = (sec: string, i: number, k: string, v: unknown) =>
    setRepeats((r) => {
      const arr = [...(r[sec] ?? [])]; arr[i] = { ...arr[i], [k]: v }; return { ...r, [sec]: arr };
    });

  const errorsFor = (campos: Campo[], inst: Inst) =>
    showErrors ? Object.fromEntries(validateAnswer(campos, inst).map((e) => [e.campo, e.mensaje])) : {};

  function visibleCampos(campos: Campo[], inst: Inst): Campo[] {
    return campos.filter((c) => campoVisible(c, inst));
  }

  const answers: Answers = useMemo(() => {
    const a: Answers = {};
    for (const s of p.definition.secciones) {
      a[s.key] = s.repetible ? (repeats[s.key] ?? []) : scope;  // faena sections all read flat scope
    }
    return a;
  }, [scope, repeats, p.definition]);

  function submit() {
    // validate every visible field in visible sections
    let bad = false;
    for (const s of p.definition.secciones) {
      if (!seccionVisible(s, scope)) continue;
      if (s.repetible) {
        for (const inst of repeats[s.key] ?? [])
          if (validateAnswer(s.campos, inst).length) bad = true;
      } else if (validateAnswer(s.campos, scope).length) bad = true;
    }
    if (bad) { setShowErrors(true); return; }

    const faenaId = uuidv4();
    const payload = buildPayload({
      faenaId, formularioId: p.formularioId, formularioVersion: p.formularioVersion,
      formatoOrigenId: p.formatoOrigenId, definition: p.definition, constantes: p.constantes,
      answers, newId: () => uuidv4(), deviceId: p.deviceId, createdBy: p.createdBy,
    });
    p.onComplete(faenaId, payload);
  }

  return (
    <ScrollView style={st.screen} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {p.definition.secciones.map((sec) =>
        seccionVisible(sec, scope) ? (
          <Section key={sec.key} sec={sec}
            scope={scope} repeats={repeats[sec.key] ?? []}
            visibleCampos={visibleCampos} errorsFor={errorsFor}
            onFaenaField={setField}
            onRepeatField={(i, k, v) => setRepeatField(sec.key, i, k, v)}
            onAdd={() => setRepeats((r) => ({ ...r, [sec.key]: [...(r[sec.key] ?? []), {}] }))}
            onRemove={(i) => setRepeats((r) => ({ ...r, [sec.key]: (r[sec.key] ?? []).filter((_, j) => j !== i) }))}
          />
        ) : null,
      )}
      <Pressable style={st.submit} onPress={submit}>
        <Text style={st.submitText}>Guardar faena</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section(props: {
  sec: Seccion; scope: Inst; repeats: Inst[];
  visibleCampos: (c: Campo[], inst: Inst) => Campo[];
  errorsFor: (c: Campo[], inst: Inst) => Record<string, string>;
  onFaenaField: (k: string, v: unknown) => void;
  onRepeatField: (i: number, k: string, v: unknown) => void;
  onAdd: () => void; onRemove: (i: number) => void;
}) {
  const { sec } = props;
  return (
    <View style={st.section}>
      <Text style={st.sectionTitle}>{sec.titulo}</Text>

      {!sec.repetible &&
        props.visibleCampos(sec.campos, props.scope).map((c) => (
          <FieldWithOtro key={c.key} campo={c} inst={props.scope}
            error={props.errorsFor(sec.campos, props.scope)[c.key]}
            onChange={(v) => props.onFaenaField(c.key, v)} />
        ))}

      {sec.repetible && props.repeats.map((inst, i) => (
        <View key={i} style={st.instance}>
          <View style={st.instanceHead}>
            <Text style={st.instanceLabel}>{sec.titulo} {i + 1}</Text>
            <Pressable onPress={() => props.onRemove(i)}><Text style={st.remove}>Quitar</Text></Pressable>
          </View>
          {props.visibleCampos(sec.campos, inst).map((c) => (
            <FieldWithOtro key={c.key} campo={c} inst={inst}
              error={props.errorsFor(sec.campos, inst)[c.key]}
              onChange={(v) => props.onRepeatField(i, c.key, v)} />
          ))}
        </View>
      ))}

      {sec.repetible && (
        <Pressable style={st.add} onPress={props.onAdd}>
          <Text style={st.addText}>+ {sec.boton_agregar ?? 'Agregar'}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Renders a field; when a catalogo field with permite_otro_texto is set to OTRO,
// also shows the bound free-text input (mirrors the __OTRO__ visible_si in the def).
function FieldWithOtro(props: { campo: Campo; inst: Inst; error?: string; onChange: (v: unknown) => void }) {
  return <Field campo={props.campo} value={props.inst[props.campo.key]} error={props.error} onChange={props.onChange} />;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7f9' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  instance: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 12 },
  instanceHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  instanceLabel: { fontWeight: '600', color: '#555' }, remove: { color: '#c00' },
  add: { borderWidth: 1, borderColor: '#1a73e8', borderStyle: 'dashed', borderRadius: 8, padding: 12, alignItems: 'center' },
  addText: { color: '#1a73e8', fontWeight: '600' },
  submit: { backgroundColor: '#1a73e8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
