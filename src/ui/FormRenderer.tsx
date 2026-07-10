// Dynamic form renderer: walks the form-definition, manages answers, applies
// visible_si / validation via the pure engine, supports repeating groups + the
// "Otro → free text" sentinel. On submit → buildPayload → onComplete(payload).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import type { Answers, Campo, FormDefinition, Seccion } from '../forms/types';
import { OTRO } from '../forms/types';
import { campoVisible, seccionVisible, validateAnswer } from '../forms/engine';
import { buildPayload } from '../forms/buildPayload';
import { clearProposals, takeProposals, type Proposal } from '../forms/proposals';
import { Field } from './Field';
import { color, font, radius, space, type } from './theme';

interface Props {
  definition: FormDefinition;
  constantes: Record<string, unknown>;
  formularioId: string;
  formularioVersion: number;
  formatoOrigenId: string;
  deviceId: string;
  createdBy: string;
  prefill?: Record<string, unknown>;   // field key → value (e.g. tecnico_id from the logged-in user)
  hiddenKeys?: string[];               // field keys to not render (prefilled from the account)
  // edit mode: re-open a pending faena. faenaId reuses the outbox row; initialAnswers
  // re-seeds the form; initialPropuestas keeps proposals made in the original capture.
  faenaId?: string;
  initialAnswers?: Answers;
  initialPropuestas?: Proposal[];
  onComplete: (faenaId: string, payload: Record<string, unknown>) => void;
}

type Inst = Record<string, unknown>;

export function FormRenderer(p: Props) {
  // non-repeating sections share one flat scope (faena-level answers, keyed by field.key).
  // Seed it with account-derived prefill (e.g. the técnico's own cat_tecnico id).
  const [scope, setScope] = useState<Inst>(() => {
    if (p.initialAnswers) {   // editing: non-repeating sections all shared one flat scope
      const merged: Inst = {};
      for (const s of p.definition.secciones)
        if (!s.repetible) Object.assign(merged, p.initialAnswers![s.key] as Inst);
      return merged;
    }
    return { ...(p.prefill ?? {}) };
  });
  // repeating sections: key → array of instances
  const [repeats, setRepeats] = useState<Record<string, Inst[]>>(() => {
    const init: Record<string, Inst[]> = {};
    for (const s of p.definition.secciones) if (s.repetible)
      init[s.key] = p.initialAnswers
        ? ((p.initialAnswers[s.key] as Inst[]) ?? [])
        : ((s.min ?? 0) > 0 ? [{}] : []);
    return init;
  });
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState(false);   // last submit blocked by missing fields
  const [minErrors, setMinErrors] = useState<Record<string, string>>({});  // repeating-section "min" violations
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});     // section key → y offset (for scroll-to-error)

  // Fresh faena → discard any proposals buffered from a previous capture.
  useEffect(() => { clearProposals(); }, []);

  // Editing any field clears the "revisa los campos" button state.
  const setField = (k: string, v: unknown) => { setSubmitError(false); setScope((s) => ({ ...s, [k]: v })); };
  const setRepeatField = (sec: string, i: number, k: string, v: unknown) => {
    setSubmitError(false); setMinErrors({});
    setRepeats((r) => {
      const arr = [...(r[sec] ?? [])]; arr[i] = { ...arr[i], [k]: v }; return { ...r, [sec]: arr };
    });
  };

  // Range/format errors show as soon as a field has a value (e.g. "máximo 250" while
  // typing); "required-empty" errors appear only after a submit attempt (so the form
  // isn't all red on load).
  const errorsFor = (campos: Campo[], inst: Inst) => {
    const out: Record<string, string> = {};
    for (const e of validateAnswer(campos, inst)) {
      const v = inst[e.campo];
      const empty = v === undefined || v === null || v === '';
      if (!empty || showErrors) out[e.campo] = e.mensaje;
    }
    return out;
  };

  function visibleCampos(campos: Campo[], inst: Inst): Campo[] {
    return campos.filter((c) => !p.hiddenKeys?.includes(c.key) && campoVisible(c, inst));
  }

  const answers: Answers = useMemo(() => {
    const a: Answers = {};
    for (const s of p.definition.secciones) {
      a[s.key] = s.repetible ? (repeats[s.key] ?? []) : scope;  // faena sections all read flat scope
    }
    return a;
  }, [scope, repeats, p.definition]);

  function submit() {
    // validate every visible field in visible sections; remember the first bad section
    let firstBad: string | null = null;
    const newMin: Record<string, string> = {};
    for (const s of p.definition.secciones) {
      if (!seccionVisible(s, scope)) continue;
      let secBad = false;
      if (s.repetible) {
        const insts = repeats[s.key] ?? [];
        for (const inst of insts)
          if (validateAnswer(s.campos, inst).length) secBad = true;
        const min = s.min ?? 0;
        if (min >= 1 && insts.length < min) {   // backstop; empty-but-present rows are caught by required fields
          newMin[s.key] = `Agrega al menos ${min} registro${min > 1 ? 's' : ''}.`;
          secBad = true;
        }
      } else if (validateAnswer(s.campos, scope).length) secBad = true;
      if (secBad && firstBad === null) firstBad = s.key;
    }
    setMinErrors(newMin);
    if (firstBad !== null) {
      setShowErrors(true);
      setSubmitError(true);
      const y = sectionY.current[firstBad];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      Alert.alert('Faltan campos obligatorios', 'Completa los campos marcados en rojo antes de guardar.');
      return;
    }
    setSubmitError(false);

    const faenaId = p.faenaId ?? uuidv4();
    // keep proposals from the original capture (edit) plus any made this session, de-duped
    const props = new Map<string, Proposal>();
    for (const pr of [...(p.initialPropuestas ?? []), ...takeProposals()]) props.set(pr.id, pr);
    const payload = buildPayload({
      faenaId, formularioId: p.formularioId, formularioVersion: p.formularioVersion,
      formatoOrigenId: p.formatoOrigenId, definition: p.definition, constantes: p.constantes,
      answers, newId: () => uuidv4(), deviceId: p.deviceId, createdBy: p.createdBy,
      propuestas: [...props.values()],
    });
    payload.__answers = answers;   // stashed for re-opening; stripped before the RPC in syncFaena
    p.onComplete(faenaId, payload);
  }

  return (
    <ScrollView ref={scrollRef} style={st.screen} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {p.definition.secciones.map((sec) =>
        seccionVisible(sec, scope) ? (
          <Section key={sec.key} sec={sec}
            scope={scope} repeats={repeats[sec.key] ?? []}
            visibleCampos={visibleCampos} errorsFor={errorsFor}
            onFaenaField={setField}
            onRepeatField={(i, k, v) => setRepeatField(sec.key, i, k, v)}
            onAdd={() => { setMinErrors({}); setRepeats((r) => ({ ...r, [sec.key]: [...(r[sec.key] ?? []), {}] })); }}
            onRemove={(i) => { setMinErrors({}); setRepeats((r) => ({ ...r, [sec.key]: (r[sec.key] ?? []).filter((_, j) => j !== i) })); }}
            onLayoutY={(y) => { sectionY.current[sec.key] = y; }}
            minError={minErrors[sec.key]}
          />
        ) : null,
      )}
      <Pressable
        style={({ pressed }) => [st.submit, submitError && st.submitErr, pressed && st.submitPressed]}
        onPress={submit}>
        <Text style={st.submitText}>{submitError ? '⚠ Revisa los campos en rojo' : 'Guardar faena'}</Text>
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
  onLayoutY?: (y: number) => void;
  minError?: string;
}) {
  const { sec } = props;
  const canRemove = props.repeats.length > (sec.min ?? 0);   // keep at least `min` instances
  return (
    <View style={st.section} onLayout={(e) => props.onLayoutY?.(e.nativeEvent.layout.y)}>
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
            {canRemove && (
              <Pressable onPress={() => props.onRemove(i)}><Text style={st.remove}>Quitar</Text></Pressable>
            )}
          </View>
          {props.visibleCampos(sec.campos, inst).map((c) => (
            <FieldWithOtro key={c.key} campo={c} inst={inst}
              error={props.errorsFor(sec.campos, inst)[c.key]}
              onChange={(v) => props.onRepeatField(i, c.key, v)} />
          ))}
        </View>
      ))}

      {sec.repetible && props.minError ? <Text style={st.minErr}>{props.minError}</Text> : null}

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
  screen: { flex: 1, backgroundColor: color.shell },
  section: { backgroundColor: color.canvas, borderRadius: radius.card, padding: space.lg, marginBottom: space.lg, borderWidth: 1, borderColor: color.fog },
  sectionTitle: { fontSize: 18, fontFamily: font.semibold, color: color.ink, marginBottom: space.md },
  instance: { borderWidth: 1, borderColor: color.fog, borderRadius: radius.input, padding: space.md, marginBottom: space.md, backgroundColor: color.shell },
  instanceHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  instanceLabel: { fontFamily: font.semibold, color: color.stone },
  remove: { color: color.danger, fontFamily: font.medium },
  minErr: { color: color.danger, marginBottom: space.sm, fontFamily: font.semibold },
  add: { borderWidth: 1, borderColor: color.tide, borderStyle: 'dashed', borderRadius: radius.button, padding: space.md, alignItems: 'center' },
  addText: { color: color.tide, fontFamily: font.semibold },
  submit: { backgroundColor: color.tide, borderRadius: radius.button, padding: space.lg, alignItems: 'center', marginTop: space.sm },
  submitErr: { backgroundColor: color.danger },     // blocked by missing fields
  submitPressed: { opacity: 0.85 },                 // tap feedback
  submitText: { color: color.white, fontFamily: font.semibold, fontSize: type.input },
});
