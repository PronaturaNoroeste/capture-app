// Renders one field by type. Pure presentational — state lives in FormRenderer.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Campo } from '../forms/types';
import { OTRO, opLabel, opValor } from '../forms/types';
import { CatalogPicker } from './CatalogPicker';
import { color, font, radius, space, type } from './theme';

// Date field: tap to open the OS calendar dialog (GMS-free). Stores the value as a
// local 'YYYY-MM-DD' string — same format the rest of the pipeline already expects.
function DateField({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [show, setShow] = useState(false);
  const hasValue = typeof value === 'string' && value !== '';
  // parse as local midnight (no 'Z') so the day never shifts by timezone
  const current = hasValue ? new Date(value + 'T00:00:00') : new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <>
      <Pressable style={s.input} onPress={() => setShow(true)}>
        <Text style={hasValue ? s.dateVal : s.placeholder}>
          {hasValue ? (value as string) : 'Seleccionar fecha…'}
        </Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={current}
          mode="date"
          maximumDate={new Date()}
          onChange={(event, d) => {
            setShow(false);                                   // Android dialog is one-shot
            if (event.type === 'set' && d) onChange(fmt(d));
          }}
        />
      )}
    </>
  );
}

// Numeric input keeps the raw text locally so partial entries like "4." survive
// (parsing to Number on every keystroke would strip the trailing dot). Emits a
// number (or undefined) upward; allows one decimal separator.
function NumericInput({ value, ejemplo, decimales, onChange }:
  { value: unknown; ejemplo?: string; decimales?: number; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { if (value == null) setText(''); }, [value]);   // reset on new faena
  return (
    <TextInput
      style={s.input} keyboardType="decimal-pad" placeholder={ejemplo} placeholderTextColor={color.stone}
      value={text}
      onChangeText={(t) => {
        let c = t.replace(',', '.').replace(/[^0-9.]/g, '');       // digits + one dot
        const i = c.indexOf('.');
        if (i >= 0) c = c.slice(0, i + 1) + c.slice(i + 1).replace(/\./g, '');
        // cap digits after the decimal point (e.g. decimales=1 → 35.5, not 35.55)
        if (decimales != null && c.includes('.')) c = c.slice(0, c.indexOf('.') + 1 + decimales);
        setText(c);
        if (c === '' || c === '.') { onChange(undefined); return; }
        const n = Number(c);
        onChange(Number.isNaN(n) ? undefined : n);
      }}
    />
  );
}

interface Props {
  campo: Campo;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}

export function Field({ campo, value, error, onChange }: Props) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>
        {campo.label}{campo.requerido ? <Text style={s.req}>  *</Text> : null}
      </Text>
      {campo.ayuda ? <Text style={s.help}>{campo.ayuda}</Text> : null}
      {renderInput(campo, value, onChange)}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function renderInput(campo: Campo, value: unknown, onChange: (v: unknown) => void) {
  switch (campo.tipo) {
    case 'entero':
    case 'decimal':
      return <NumericInput value={value} ejemplo={campo.ejemplo} decimales={campo.decimales} onChange={onChange} />;
    case 'fecha':
      return <DateField value={value} onChange={onChange} />;
    case 'seleccion_unica':
      return (
        <View style={s.options}>
          {(campo.opciones ?? []).map((op) => {
            const label = opLabel(op), valor = opValor(op);
            return (
              <Pressable key={valor} onPress={() => onChange(valor)}
                style={[s.option, value === valor && s.optionSel]}>
                <Text style={value === valor ? s.optionSelText : s.optionText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    case 'booleano':
      return (
        <Pressable style={[s.option, value === true && s.optionSel]} onPress={() => onChange(!value)}>
          <Text style={value ? s.optionSelText : s.optionText}>{value ? 'Sí' : 'No'}</Text>
        </Pressable>
      );
    case 'catalogo':
      return <CatalogPicker campo={campo} value={value as string | undefined} onChange={onChange} />;
    case 'geo':
      return <Text style={s.todo}>📍 (selector de mapa — pendiente)</Text>;
    case 'foto':
      return <Text style={s.todo}>📷 (foto — pendiente)</Text>;
    case 'texto':
    default:
      return (
        <TextInput style={s.input} value={value == null ? '' : String(value)}
          placeholder={campo.ejemplo} placeholderTextColor={color.stone}
          onChangeText={(t) => onChange(t || undefined)} multiline />
      );
  }
}

export { OTRO };

const s = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { fontFamily: font.semibold, color: color.ink, marginBottom: space.xs, fontSize: 15 },
  req: { color: color.danger, fontFamily: font.semibold },
  help: { color: color.stone, fontSize: type.caption, marginBottom: space.sm, fontFamily: font.regular },
  input: { borderWidth: 1, borderColor: color.fog, borderRadius: radius.input, padding: space.md, backgroundColor: color.canvas, color: color.ink, fontFamily: font.regular, fontSize: type.input },
  placeholder: { color: color.stone, fontFamily: font.regular, fontSize: type.input },
  dateVal: { color: color.ink, fontFamily: font.regular, fontSize: type.input },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { borderWidth: 1, borderColor: color.fog, borderRadius: radius.button, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: color.canvas },
  optionText: { color: color.ink, fontFamily: font.medium },
  optionSel: { backgroundColor: color.tide, borderColor: color.tide },
  optionSelText: { color: color.white, fontFamily: font.medium },
  error: { color: color.danger, fontSize: type.caption, marginTop: space.xs, fontFamily: font.medium },
  todo: { color: color.stone, fontStyle: 'italic', padding: space.md, fontFamily: font.regular },
});
